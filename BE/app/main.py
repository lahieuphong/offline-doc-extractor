import shutil
import uuid
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.excel_exporter import export_results_to_excel
from app.extractors import extract_text
from app.llm_client import extract_with_ollama
from app.rule_based import extract_by_rules


BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
EXPORTS_DIR = STORAGE_DIR / "exports"
MAX_WORKERS = max(1, int(os.getenv("EXTRACT_MAX_WORKERS", "1")))
FILE_PROCESS_RETRIES = max(0, int(os.getenv("FILE_PROCESS_RETRIES", "1")))

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"}
METADATA_22_KEYS = [
    "docId",
    "arcDocCode",
    "maintenance",
    "typeName",
    "codeNumber",
    "codeNotation",
    "issuedDate",
    "organName",
    "subject",
    "language",
    "numberOfPage",
    "inforSign",
    "keyword",
    "mode",
    "confidenceLevel",
    "autograph",
    "format",
    "process",
    "riskRecovery",
    "riskRecoveryStatus",
    "description",
    "isCan",
]

app = FastAPI(title="Offline Document AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "message": "Offline Document AI Backend is running.",
    }


def save_upload_file(upload_file: UploadFile, batch_id: str) -> Path:
    original_filename = upload_file.filename or "uploaded_file"
    ext = Path(original_filename).suffix.lower()

    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}")

    safe_filename = f"{uuid.uuid4()}{ext}"
    batch_upload_dir = UPLOADS_DIR / batch_id
    batch_upload_dir.mkdir(parents=True, exist_ok=True)

    stored_path = batch_upload_dir / safe_filename

    with stored_path.open("wb") as buffer:
        shutil.copyfileobj(upload_file.file, buffer)

    return stored_path


def normalize_result(
    source_filename: str,
    extraction_method: str,
    page_count: Optional[int],
    data: Dict[str, Any],
    batch_id: Optional[str] = None,
    extension: Optional[str] = None,
    error_message: Optional[str] = None,
) -> Dict[str, Any]:
    result = {
        "source_filename": source_filename,
        "extraction_method": extraction_method,
        "error_message": error_message,
        **data,
    }

    if result.get("page_count") is None:
        result["page_count"] = page_count

    if result.get("confidenceLevel") is None:
        result["confidenceLevel"] = result.get("confidence")

    code_notation = result.get("codeNotation")
    document_code = result.get("document_code")
    if code_notation is None and isinstance(document_code, str) and "/" in document_code:
        code_notation = document_code.split("/", 1)[1] or None

    infor_sign = None
    signer_title = result.get("signer_title")
    signer_name = result.get("signer_name")
    if signer_title and signer_name:
        infor_sign = f"{signer_title} - {signer_name}"
    elif signer_title:
        infor_sign = signer_title
    elif signer_name:
        infor_sign = signer_name

    # Giữ nguyên schema hiện tại, chỉ bổ sung thêm 22 trường metadata để tương thích.
    metadata_values = {
        "docId": result.get("docId") or (f"{batch_id}:{source_filename}" if batch_id else source_filename),
        "arcDocCode": result.get("arcDocCode") or result.get("document_code"),
        "maintenance": result.get("maintenance"),
        "typeName": result.get("typeName") or result.get("document_type"),
        "codeNumber": result.get("codeNumber") or result.get("document_number"),
        "codeNotation": code_notation,
        "issuedDate": result.get("issuedDate") or result.get("issued_date"),
        "organName": result.get("organName") or result.get("issuing_authority"),
        "subject": result.get("subject") or result.get("title") or result.get("summary"),
        "language": result.get("language") or ("vi" if result.get("title") else None),
        "numberOfPage": result.get("numberOfPage") or result.get("page_count"),
        "inforSign": result.get("inforSign") or infor_sign,
        "keyword": result.get("keyword"),
        "mode": result.get("mode") or extraction_method,
        "confidenceLevel": result.get("confidenceLevel"),
        "autograph": result.get("autograph") or result.get("signature_block"),
        "format": result.get("format") or ((extension or Path(source_filename).suffix).lower().lstrip(".") or None),
        "process": result.get("process"),
        "riskRecovery": result.get("riskRecovery"),
        "riskRecoveryStatus": result.get("riskRecoveryStatus"),
        "description": result.get("description") or result.get("notes"),
        "isCan": result.get("isCan"),
    }

    for key in METADATA_22_KEYS:
        result[key] = metadata_values.get(key)

    return result


def process_one_file(
    upload_file: UploadFile,
    batch_id: str,
    use_llm: bool,
    pdf_read_mode: str = "first_page",
) -> Dict[str, Any]:
    original_filename = upload_file.filename or "uploaded_file"

    try:
        stored_path = save_upload_file(upload_file, batch_id)
        return process_stored_file(
            stored_path=stored_path,
            original_filename=original_filename,
            batch_id=batch_id,
            use_llm=use_llm,
            pdf_read_mode=pdf_read_mode,
        )
    except Exception as error:
        return normalize_result(
            source_filename=original_filename,
            extraction_method="failed",
            page_count=None,
            data={
                "document_type": None,
                "document_number": None,
                "document_code": None,
                "issuing_authority": None,
                "national_title": None,
                "place_of_issue": None,
                "issued_date": None,
                "title": None,
                "summary": None,
                "legal_bases": [],
                "main_content": None,
                "articles": [],
                "effective_date": None,
                "recipients": [],
                "signer_name": None,
                "signer_title": None,
                "signature_block": None,
                "page_count": None,
                "confidence": 0,
                "missing_fields": [],
                "notes": "",
            },
            batch_id=batch_id,
            extension=Path(original_filename).suffix.lower(),
            error_message=str(error),
        )


def process_stored_file(
    stored_path: Path,
    original_filename: str,
    batch_id: str,
    use_llm: bool,
    pdf_read_mode: str = "first_page",
) -> Dict[str, Any]:
    try:
        print(f"[extract:start] file={original_filename} path={stored_path.name} mode={pdf_read_mode}", flush=True)
        started_at = time.time()
        document_text, page_count = extract_text(stored_path, pdf_read_mode=pdf_read_mode)

        if not document_text.strip():
            raise ValueError("No text found after extraction/OCR.")

        if use_llm:
            try:
                data = extract_with_ollama(document_text[:12000])
                extraction_method = "ollama_local_llm"
            except Exception as error:
                data = extract_by_rules(document_text, page_count=page_count)
                data["llm_error"] = str(error)
                extraction_method = "rule_based_fallback_after_llm_error"
        else:
            data = extract_by_rules(document_text, page_count=page_count)
            extraction_method = "rule_based"

        result = normalize_result(
            source_filename=original_filename,
            extraction_method=extraction_method,
            page_count=page_count,
            data=data,
            batch_id=batch_id,
            extension=stored_path.suffix.lower(),
        )
        elapsed = round(time.time() - started_at, 2)
        print(f"[extract:done] file={original_filename} elapsed={elapsed}s mode={result.get('mode')}", flush=True)
        return result

    except Exception as error:
        print(f"[extract:error] file={original_filename} err={error}", flush=True)
        return normalize_result(
            source_filename=original_filename,
            extraction_method="failed",
            page_count=None,
            data={
                "document_type": None,
                "document_number": None,
                "document_code": None,
                "issuing_authority": None,
                "national_title": None,
                "place_of_issue": None,
                "issued_date": None,
                "title": None,
                "summary": None,
                "legal_bases": [],
                "main_content": None,
                "articles": [],
                "effective_date": None,
                "recipients": [],
                "signer_name": None,
                "signer_title": None,
                "signature_block": None,
                "page_count": None,
                "confidence": 0,
                "missing_fields": [],
                "notes": "",
            },
            batch_id=batch_id,
            extension=Path(original_filename).suffix.lower(),
            error_message=str(error),
        )


def process_stored_file_with_retry(
    stored_path: Path,
    original_filename: str,
    batch_id: str,
    use_llm: bool,
    pdf_read_mode: str = "first_page",
) -> Dict[str, Any]:
    last_result: Optional[Dict[str, Any]] = None
    for attempt in range(FILE_PROCESS_RETRIES + 1):
        result = process_stored_file(
            stored_path=stored_path,
            original_filename=original_filename,
            batch_id=batch_id,
            use_llm=use_llm,
            pdf_read_mode=pdf_read_mode,
        )
        last_result = result
        if result.get("mode") != "failed":
            return result
        if attempt < FILE_PROCESS_RETRIES:
            print(
                f"[extract:retry] file={original_filename} attempt={attempt + 1}/{FILE_PROCESS_RETRIES}",
                flush=True,
            )
    return last_result or normalize_result(
        source_filename=original_filename,
        extraction_method="failed",
        page_count=None,
        data={},
        batch_id=batch_id,
        extension=stored_path.suffix.lower(),
        error_message="unknown_error",
    )


def process_files_parallel(
    file_entries: List[Dict[str, Any]],
    batch_id: str,
    use_llm: bool,
    pdf_read_mode: str,
) -> List[Dict[str, Any]]:
    if not file_entries:
        return []

    results_by_index: Dict[int, Dict[str, Any]] = {}
    worker_count = min(MAX_WORKERS, len(file_entries))

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_to_index = {
            executor.submit(
                process_stored_file_with_retry,
                stored_path=entry["stored_path"],
                original_filename=entry["original_filename"],
                batch_id=batch_id,
                use_llm=use_llm,
                pdf_read_mode=pdf_read_mode,
            ): entry["index"]
            for entry in file_entries
        }

        for future in as_completed(future_to_index):
            index = future_to_index[future]
            try:
                results_by_index[index] = future.result()
            except Exception as error:
                entry = file_entries[index]
                original_filename = str(entry["original_filename"])
                extension = Path(original_filename).suffix.lower()
                results_by_index[index] = normalize_result(
                    source_filename=original_filename,
                    extraction_method="failed",
                    page_count=None,
                    data={},
                    batch_id=batch_id,
                    extension=extension,
                    error_message=str(error),
                )

    return [results_by_index[idx] for idx in range(len(file_entries))]


@app.post("/api/extract-excel")
async def extract_excel(
    files: List[UploadFile] = File(...),
    use_llm: bool = Form(True),
    pdf_read_mode: str = Form("first_page"),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    batch_id = str(uuid.uuid4())
    file_entries: List[Dict[str, Any]] = []

    for index, file in enumerate(files):
        original_filename = file.filename or "uploaded_file"
        stored_path = save_upload_file(file, batch_id)
        file_entries.append(
            {
                "index": index,
                "original_filename": original_filename,
                "stored_path": stored_path,
            }
        )

    results = process_files_parallel(
        file_entries=file_entries,
        batch_id=batch_id,
        use_llm=use_llm,
        pdf_read_mode=pdf_read_mode,
    )

    output_path = EXPORTS_DIR / f"extraction_result_{batch_id}.xlsx"

    export_results_to_excel(
        results=results,
        output_path=output_path,
    )

    return FileResponse(
        path=output_path,
        filename=f"extraction_result_{batch_id}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.post("/api/extract-json")
async def extract_json(
    files: List[UploadFile] = File(...),
    use_llm: bool = Form(True),
    pdf_read_mode: str = Form("first_page"),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    batch_id = str(uuid.uuid4())
    file_entries: List[Dict[str, Any]] = []

    for index, file in enumerate(files):
        original_filename = file.filename or "uploaded_file"
        stored_path = save_upload_file(file, batch_id)
        file_entries.append(
            {
                "index": index,
                "original_filename": original_filename,
                "stored_path": stored_path,
            }
        )

    results = process_files_parallel(
        file_entries=file_entries,
        batch_id=batch_id,
        use_llm=use_llm,
        pdf_read_mode=pdf_read_mode,
    )

    return {
        "batch_id": batch_id,
        "results": results,
    }


@app.post("/api/export-excel")
async def export_excel_from_json(
    payload: Dict[str, Any] = Body(...),
):
    results = payload.get("results")

    if not isinstance(results, list) or not results:
        raise HTTPException(status_code=400, detail="`results` must be a non-empty array.")

    batch_id = payload.get("batch_id") or str(uuid.uuid4())
    output_path = EXPORTS_DIR / f"extraction_result_{batch_id}.xlsx"

    export_results_to_excel(
        results=results,
        output_path=output_path,
    )

    return FileResponse(
        path=output_path,
        filename=f"extraction_result_{batch_id}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
