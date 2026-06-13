import shutil
import uuid
import os
import time
import re
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.excel_exporter import export_results_to_excel
from app.extractors import extract_text
from app.job_queue import enqueue_batch_job, get_redis_conn
from app.llm_client import extract_with_ollama
from app.metadata_enricher import enrich_for_22_fields
from app.rule_based import extract_by_rules


BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
EXPORTS_DIR = STORAGE_DIR / "exports"
MAX_WORKERS = max(1, int(os.getenv("EXTRACT_MAX_WORKERS", "1")))
FILE_PROCESS_RETRIES = max(0, int(os.getenv("FILE_PROCESS_RETRIES", "1")))
MAX_TEXT_CHARS = max(1000, int(os.getenv("MAX_TEXT_CHARS", "12000")))
LLM_DISABLE_FOR_FULL_PDF = os.getenv("LLM_DISABLE_FOR_FULL_PDF", "true").lower() in {"1", "true", "yes", "on"}
STRICT_NO_GUESS_MODE = os.getenv("STRICT_NO_GUESS_MODE", "true").lower() in {"1", "true", "yes", "on"}
ENABLE_LLM_BACKFILL_ON_MISSING = (
    os.getenv("ENABLE_LLM_BACKFILL_ON_MISSING", "false").lower() in {"1", "true", "yes", "on"}
    and not STRICT_NO_GUESS_MODE
)
LLM_BACKFILL_MIN_MISSING = max(1, int(os.getenv("LLM_BACKFILL_MIN_MISSING", "3")))
JOBS_EXPORT_DIR = EXPORTS_DIR / "jobs"


def _cleanup_batch(batch_id: str, *extra_paths: Path) -> None:
    upload_dir = UPLOADS_DIR / batch_id
    if upload_dir.exists():
        shutil.rmtree(upload_dir, ignore_errors=True)
    for path in extra_paths:
        try:
            path.unlink(missing_ok=True)
        except Exception:
            pass


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


EXTRACTION_ARTIFACT_PATTERNS = [
    r"^\s*---\s*PAGE\s+\d+\s*/\s*\d+\s*---\s*$",
    r"^\s*---\s*PAGE\s+\d+\s+OCR\s*---\s*$",
    r"^\s*\[\s*TEXT_LAYER\s*\]\s*$",
    r"^\s*\[\s*OCR_TEXT\s*\]\s*$",
]
EXTRACTION_ARTIFACT_INLINE_PATTERNS = [
    r"\s*---\s*PAGE\s+\d+\s*/\s*\d+\s*---\s*",
    r"\s*---\s*PAGE\s+\d+\s+OCR\s*---\s*",
    r"\s*\[\s*TEXT_LAYER\s*\]\s*",
    r"\s*\[\s*OCR_TEXT\s*\]\s*",
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
    JOBS_EXPORT_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "message": "Offline Document AI Backend is running.",
        "strict_no_guess_mode": STRICT_NO_GUESS_MODE,
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


def build_subject_for_export(result: Dict[str, Any]) -> Optional[str]:
    def complete_truncated_date(text: str, issued_date: Optional[str]) -> str:
        fixed = text
        match = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$", issued_date or "")
        year_hint = match.group(3) if match else None
        fixed = re.sub(
            r"(ngày\s+\d{1,2}\s+tháng\s+\d{1,2})\s+nă\b(?!m)",
            r"\1 năm",
            fixed,
            flags=re.IGNORECASE,
        )
        if year_hint:
            fixed = re.sub(
                r"(ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm)\s*$",
                rf"\1 {year_hint}",
                fixed,
                flags=re.IGNORECASE,
            )
        return fixed

    def apply_vn_ocr_fixes(text: str) -> str:
        fixed = text
        replacements = [
            (r"\bkhodn\b", "khoản"),
            (r"\bkhoan\b", "khoản"),
            (r"\bbỗ\s+sung\b", "bổ sung"),
            (r"\bbỗsung\b", "bổ sung"),
            (r"\bsửa\s+đỗi\b", "sửa đổi"),
            (r"\bbãi\s+bé\b", "bãi bỏ"),
            (r"\bbãi\s+bồ\b", "bãi bỏ"),
            (r"\btai\s+cuộc\s+họp\b", "tại cuộc họp"),
        ]
        for pattern, replacement in replacements:
            fixed = re.sub(pattern, replacement, fixed, flags=re.IGNORECASE)

        # Hoàn tất cụm ngày tháng khi OCR cắt cụt đuôi.
        return fixed

    def normalize_subject_text(value: str, issued_date: Optional[str]) -> str:
        cleaned = strip_extraction_artifacts(value)
        if re.search(r"(TH[OÔ]NG|THONG)\s+TIN.*CH[ÍI]NH\s+PH", cleaned, flags=re.IGNORECASE):
            ket_luan_match = re.search(r"Kết\s*luận", cleaned, flags=re.IGNORECASE)
            if ket_luan_match:
                cleaned = cleaned[ket_luan_match.start() :]
        cleaned = re.sub(
            r"\b(C[OÔ]NG|GONG)\s+TH[OÔ]NG\s+TIN\s+(ĐI[ỆE]N?\s*)?(T[UƯ]|BIEN TU)\s+CH[ÍI]NH\s+PH[UƯ]\b",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\baan\s+của\s+Thủ tướng Chính phủ\b", "của Thủ tướng Chính phủ", cleaned, flags=re.IGNORECASE)
        cleaned = apply_vn_ocr_fixes(cleaned)
        cleaned = complete_truncated_date(cleaned, issued_date)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" .;:-")
        return cleaned

    summary = result.get("summary")
    if isinstance(summary, str) and summary.strip():
        normalized = normalize_subject_text(summary, result.get("issued_date") if isinstance(result.get("issued_date"), str) else None)
        if normalized:
            return normalized

    title = result.get("title")
    if isinstance(title, str) and title.strip():
        normalized = normalize_subject_text(title, result.get("issued_date") if isinstance(result.get("issued_date"), str) else None)
        if normalized:
            return normalized

    articles = result.get("articles")
    if isinstance(articles, list) and articles:
        lines: List[str] = []
        for idx, article in enumerate(articles[:6], start=1):
            if not isinstance(article, dict):
                continue
            article_title = article.get("article_title")
            article_content = article.get("article_content")
            candidate = article_title if isinstance(article_title, str) and article_title.strip() else article_content
            if not isinstance(candidate, str):
                continue
            normalized = re.sub(r"\s+", " ", candidate).strip(" .;:-")
            if normalized:
                lines.append(f"{idx}. {normalized[:220]}")
        if lines:
            return "\n".join(lines)

    main_content = result.get("main_content")
    if isinstance(main_content, str) and main_content.strip():
        return re.sub(r"\s+", " ", main_content).strip()[:700]

    return None


def normalize_result(
    source_filename: str,
    extraction_method: str,
    page_count: Optional[int],
    data: Dict[str, Any],
    batch_id: Optional[str] = None,
    extension: Optional[str] = None,
    error_message: Optional[str] = None,
) -> Dict[str, Any]:
    sanitized_data = sanitize_result_data(data)
    issued_date_hint = sanitized_data.get("issued_date") if isinstance(sanitized_data.get("issued_date"), str) else None
    if isinstance(sanitized_data.get("summary"), str):
        sanitized_data["summary"] = (
            build_subject_for_export({"summary": sanitized_data["summary"], "issued_date": issued_date_hint})
            or sanitized_data["summary"]
        )
    if isinstance(sanitized_data.get("subject"), str):
        sanitized_data["subject"] = (
            build_subject_for_export({"summary": sanitized_data["subject"], "issued_date": issued_date_hint})
            or sanitized_data["subject"]
        )
    result = {
        "source_filename": source_filename,
        "extraction_method": extraction_method,
        "error_message": error_message,
        **sanitized_data,
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
        "docId": result.get("docId") or Path(source_filename).stem,
        "arcDocCode": result.get("arcDocCode") or result.get("document_code"),
        "maintenance": result.get("maintenance"),
        "typeName": result.get("typeName") or result.get("document_type"),
        "codeNumber": result.get("codeNumber") or result.get("document_number"),
        "codeNotation": code_notation,
        "issuedDate": result.get("issuedDate") or result.get("issued_date"),
        "organName": result.get("organName") or result.get("issuing_authority"),
        "subject": result.get("subject") or build_subject_for_export(result),
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


def strip_extraction_artifacts(text: str) -> str:
    cleaned = text
    for pattern in EXTRACTION_ARTIFACT_INLINE_PATTERNS:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)

    for pattern in EXTRACTION_ARTIFACT_PATTERNS:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE | re.MULTILINE)

    # Xoa marker OCR timeout trong noi dung hien thi, tranh leak text ky thuat.
    cleaned = re.sub(r"\[\s*OCR_TIMEOUT\s*\]", "", cleaned, flags=re.IGNORECASE)

    # Thu gon khoang trang/newline sau khi loc marker.
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def sanitize_value(value: Any) -> Any:
    if isinstance(value, str):
        return strip_extraction_artifacts(value)
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_value(item) for key, item in value.items()}
    return value


def sanitize_result_data(data: Dict[str, Any]) -> Dict[str, Any]:
    return {key: sanitize_value(value) for key, value in data.items()}


def should_trigger_llm_backfill(data: Dict[str, Any]) -> bool:
    critical_fields = ["document_type", "document_code", "issued_date", "summary", "title"]
    missing = 0
    for key in critical_fields:
        value = data.get(key)
        if value is None:
            missing += 1
            continue
        if isinstance(value, str) and not value.strip():
            missing += 1
            continue
    return missing >= LLM_BACKFILL_MIN_MISSING


def merge_backfill_data(base_data: Dict[str, Any], llm_data: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base_data)
    merge_keys = [
        "document_type",
        "document_number",
        "document_code",
        "issuing_authority",
        "place_of_issue",
        "issued_date",
        "title",
        "summary",
        "effective_date",
        "signer_name",
        "signer_title",
        "signature_block",
        "keyword",
    ]
    for key in merge_keys:
        current = merged.get(key)
        candidate = llm_data.get(key)
        if isinstance(candidate, str):
            candidate = candidate.strip()
        if candidate in (None, "", []):
            continue
        if current in (None, "", []):
            merged[key] = candidate
            continue
        if key == "summary" and isinstance(current, str) and isinstance(candidate, str) and len(current.strip()) < 100:
            merged[key] = candidate
    return merged


def process_one_file(
    upload_file: UploadFile,
    batch_id: str,
    use_llm: bool,
    pdf_read_mode: str = "first_and_last_page",
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
    pdf_read_mode: str = "first_and_last_page",
) -> Dict[str, Any]:
    try:
        print(f"[extract:start] file={original_filename} path={stored_path.name} mode={pdf_read_mode}", flush=True)
        started_at = time.time()
        raw_document_text, page_count = extract_text(stored_path, pdf_read_mode=pdf_read_mode)
        document_text = strip_extraction_artifacts(raw_document_text)

        if not document_text.strip():
            raise ValueError("No text found after extraction/OCR.")

        use_llm_effective = bool(use_llm) and not STRICT_NO_GUESS_MODE
        if pdf_read_mode == "full_pdf" and LLM_DISABLE_FOR_FULL_PDF:
            use_llm_effective = False

        if use_llm_effective:
            try:
                data = extract_with_ollama(document_text[:MAX_TEXT_CHARS])
                extraction_method = "ollama_local_llm"
            except Exception as error:
                data = extract_by_rules(document_text, page_count=page_count)
                data["llm_error"] = str(error)
                extraction_method = "rule_based_fallback_after_llm_error"
        else:
            data = extract_by_rules(document_text, page_count=page_count)
            extraction_method = "rule_based_strict_no_guess" if STRICT_NO_GUESS_MODE else "rule_based"

        if not use_llm_effective and ENABLE_LLM_BACKFILL_ON_MISSING and should_trigger_llm_backfill(data):
            try:
                llm_backfill = extract_with_ollama(document_text[:MAX_TEXT_CHARS])
                data = merge_backfill_data(data, llm_backfill)
                extraction_method = f"{extraction_method}_with_llm_backfill"
            except Exception as backfill_error:
                data["llm_backfill_error"] = str(backfill_error)

        data = enrich_for_22_fields(
            data=data,
            document_text=raw_document_text,
            extraction_method=extraction_method,
            page_count=page_count,
            extension=stored_path.suffix.lower(),
            source_filename=original_filename,
        )

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
    pdf_read_mode: str = "first_and_last_page",
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
    use_llm: bool = Form(False),
    pdf_read_mode: str = Form("first_and_last_page"),
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
        background=BackgroundTask(_cleanup_batch, batch_id, output_path),
    )


@app.post("/api/extract-json")
async def extract_json(
    files: List[UploadFile] = File(...),
    use_llm: bool = Form(False),
    pdf_read_mode: str = Form("first_and_last_page"),
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

    _cleanup_batch(batch_id)

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
    job_id = payload.get("job_id", "")
    job_result_path = JOBS_EXPORT_DIR / f"{job_id}.json" if job_id else None
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


@app.post("/api/jobs/submit")
async def submit_extract_job(
    files: List[UploadFile] = File(...),
    use_llm: bool = Form(False),
    pdf_read_mode: str = Form("full_pdf"),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    batch_id = str(uuid.uuid4())
    file_entries: List[Dict[str, Any]] = []

    for file in files:
        original_filename = file.filename or "uploaded_file"
        stored_path = save_upload_file(file, batch_id)
        file_entries.append(
            {
                "original_filename": original_filename,
                "stored_path": str(stored_path),
            }
        )

    payload = {
        "batch_id": batch_id,
        "use_llm": use_llm,
        "pdf_read_mode": pdf_read_mode,
        "file_entries": file_entries,
    }
    job = enqueue_batch_job(payload)

    return {
        "job_id": job.id,
        "batch_id": batch_id,
        "status": "queued",
        "total_files": len(file_entries),
    }


@app.get("/api/jobs")
async def list_jobs():
    jobs = []
    for json_file in sorted(JOBS_EXPORT_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
            job_id = data.get("job_id") or json_file.stem
            source_filenames = [r.get("source_filename", "") for r in data.get("results", [])]
            jobs.append({
                "job_id": job_id,
                "batch_id": data.get("batch_id"),
                "total_files": data.get("total_files", 0),
                "duration_sec": data.get("duration_sec", 0),
                "source_filenames": source_filenames,
                "created_at": json_file.stat().st_mtime,
            })
        except Exception:
            pass
    return jobs


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    result_path = JOBS_EXPORT_DIR / f"{job_id}.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Job not found.")
    try:
        batch_id = json.loads(result_path.read_text(encoding="utf-8")).get("batch_id")
    except Exception:
        batch_id = None
    result_path.unlink(missing_ok=True)
    if batch_id:
        upload_dir = UPLOADS_DIR / batch_id
        if upload_dir.exists():
            shutil.rmtree(upload_dir, ignore_errors=True)
    return {"deleted": job_id}


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    from rq.job import Job
    from rq.exceptions import NoSuchJobError

    redis_conn = get_redis_conn()
    try:
        job = Job.fetch(job_id, connection=redis_conn)
    except NoSuchJobError as error:
        raise HTTPException(status_code=404, detail="Job not found.") from error

    status = job.get_status(refresh=True)
    meta = dict(job.meta or {})

    return {
        "job_id": job.id,
        "status": status,
        "batch_id": meta.get("batch_id"),
        "total_files": meta.get("total_files", 0),
        "processed_files": meta.get("processed_files", 0),
        "failed_files": meta.get("failed_files", 0),
        "progress_percent": meta.get("progress_percent", 0.0),
        "error": str(job.exc_info).splitlines()[-1] if status == "failed" and job.exc_info else None,
    }


@app.get("/api/jobs/{job_id}/result")
async def get_job_result(job_id: str):
    result_path = JOBS_EXPORT_DIR / f"{job_id}.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Result not ready or job not found.")
    return json.loads(result_path.read_text(encoding="utf-8"))


@app.get("/api/jobs/{job_id}/result.xlsx")
async def get_job_result_excel(job_id: str):
    result_path = JOBS_EXPORT_DIR / f"{job_id}.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Result not ready or job not found.")

    payload = json.loads(result_path.read_text(encoding="utf-8"))
    results = payload.get("results", [])
    if not isinstance(results, list) or not results:
        raise HTTPException(status_code=400, detail="No extraction results in job output.")

    batch_id = str(payload.get("batch_id", ""))
    output_path = EXPORTS_DIR / f"extraction_result_{job_id}.xlsx"
    export_results_to_excel(results=results, output_path=output_path)

    return FileResponse(
        path=output_path,
        filename=f"extraction_result_{job_id}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(_cleanup_batch, batch_id, output_path, result_path),
    )
