import os
from typing import Any, Dict, Optional

try:  # Redis/RQ are required only for async batch jobs.
    from redis import Redis
    from rq import Queue
    from rq.job import Job
except Exception:  # pragma: no cover - local/offline unit tests may not install these extras.
    Redis = None  # type: ignore[assignment]
    Queue = None  # type: ignore[assignment]
    Job = Any  # type: ignore[misc,assignment]


REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
JOB_QUEUE_NAME = os.getenv("JOB_QUEUE_NAME", "extract_jobs")


def _require_queue_dependencies() -> None:
    if Redis is None or Queue is None:
        raise RuntimeError(
            "Redis/RQ is not installed. Install BE/requirements.txt or use the synchronous extraction endpoints."
        )


def get_redis_conn():
    _require_queue_dependencies()
    return Redis.from_url(REDIS_URL)  # type: ignore[union-attr]


def get_queue():
    _require_queue_dependencies()
    return Queue(name=JOB_QUEUE_NAME, connection=get_redis_conn())  # type: ignore[operator]


def enqueue_batch_job(payload: Dict[str, Any]):
    queue = get_queue()
    return queue.enqueue(
        "app.worker_tasks.process_batch_job",
        payload,
        job_timeout="24h",
        result_ttl=7 * 24 * 3600,
        failure_ttl=7 * 24 * 3600,
    )
