import os
from typing import Any, Dict

from redis import Redis
from rq import Queue
from rq.job import Job


REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
JOB_QUEUE_NAME = os.getenv("JOB_QUEUE_NAME", "extract_jobs")


def get_redis_conn() -> Redis:
    return Redis.from_url(REDIS_URL)


def get_queue() -> Queue:
    return Queue(name=JOB_QUEUE_NAME, connection=get_redis_conn())


def enqueue_batch_job(payload: Dict[str, Any]) -> Job:
    queue = get_queue()
    return queue.enqueue(
        "app.worker_tasks.process_batch_job",
        payload,
        job_timeout="24h",
        result_ttl=7 * 24 * 3600,
        failure_ttl=7 * 24 * 3600,
    )
