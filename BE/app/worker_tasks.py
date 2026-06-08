import json
import time
from pathlib import Path
from typing import Any, Dict, List

from rq import get_current_job

from app.main import EXPORTS_DIR, process_stored_file_with_retry


JOBS_EXPORT_DIR = EXPORTS_DIR / "jobs"
JOBS_EXPORT_DIR.mkdir(parents=True, exist_ok=True)


def _write_result(job_id: str, payload: Dict[str, Any]) -> None:
    output_path = JOBS_EXPORT_DIR / f"{job_id}.json"
    output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _update_meta(job, meta: Dict[str, Any]) -> None:
    job.meta.update(meta)
    job.save_meta()


def process_batch_job(payload: Dict[str, Any]) -> Dict[str, Any]:
    job = get_current_job()
    if job is None:
        raise RuntimeError("Missing current job context")

    batch_id = str(payload["batch_id"])
    use_llm = bool(payload.get("use_llm", False))
    pdf_read_mode = str(payload.get("pdf_read_mode", "first_page"))
    file_entries: List[Dict[str, Any]] = payload.get("file_entries", [])
    total_files = len(file_entries)
    started_at = time.time()

    _update_meta(
        job,
        {
            "status": "processing",
            "batch_id": batch_id,
            "total_files": total_files,
            "processed_files": 0,
            "failed_files": 0,
            "progress_percent": 0.0,
        },
    )

    results: List[Dict[str, Any]] = []
    failed_files = 0

    for idx, entry in enumerate(file_entries, start=1):
        result = process_stored_file_with_retry(
            stored_path=Path(entry["stored_path"]),
            original_filename=str(entry["original_filename"]),
            batch_id=batch_id,
            use_llm=use_llm,
            pdf_read_mode=pdf_read_mode,
        )
        if result.get("mode") == "failed":
            failed_files += 1
        results.append(result)

        _update_meta(
            job,
            {
                "status": "processing",
                "batch_id": batch_id,
                "total_files": total_files,
                "processed_files": idx,
                "failed_files": failed_files,
                "progress_percent": round((idx / total_files) * 100, 2) if total_files else 100.0,
            },
        )

    finished_at = time.time()
    output_payload = {
        "job_id": job.id,
        "batch_id": batch_id,
        "status": "completed",
        "total_files": total_files,
        "processed_files": total_files,
        "failed_files": failed_files,
        "succeeded_files": total_files - failed_files,
        "duration_sec": round(finished_at - started_at, 2),
        "results": results,
    }
    _write_result(job.id, output_payload)
    _update_meta(
        job,
        {
            "status": "completed",
            "batch_id": batch_id,
            "total_files": total_files,
            "processed_files": total_files,
            "failed_files": failed_files,
            "progress_percent": 100.0,
            "result_path": str((JOBS_EXPORT_DIR / f"{job.id}.json").resolve()),
        },
    )
    return output_payload

