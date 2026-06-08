#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORT="${BACKEND_PORT:-8000}"
PYTHON_BIN="${PYTHON_BIN:-python3.11}"
LOG_DIR="storage/logs"
REDIS_PID=""
WORKER_PID=""

mkdir -p "${LOG_DIR}"

cleanup() {
  local status=$?

  echo ""
  echo "Stopping local BE stack..."

  if [[ -n "${WORKER_PID}" ]] && kill -0 "${WORKER_PID}" 2>/dev/null; then
    kill "${WORKER_PID}" 2>/dev/null || true
    wait "${WORKER_PID}" 2>/dev/null || true
  fi

  if [[ -n "${REDIS_PID}" ]] && kill -0 "${REDIS_PID}" 2>/dev/null; then
    kill "${REDIS_PID}" 2>/dev/null || true
    wait "${REDIS_PID}" 2>/dev/null || true
  fi

  exit "${status}"
}

trap cleanup EXIT INT TERM

if [[ -f ".env" ]]; then
  # shellcheck disable=SC1091
  source ".env"
else
  echo "Missing BE/.env. Please create it before running this script."
  exit 1
fi

REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379/0}"
JOB_QUEUE_NAME="${JOB_QUEUE_NAME:-extract_jobs}"

echo "======================================"
echo " Starting local BE stack"
echo " - Redis"
echo " - RQ worker: ${JOB_QUEUE_NAME}"
echo " - FastAPI: http://127.0.0.1:${PORT}"
echo "======================================"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Cannot find ${PYTHON_BIN}. Install Python 3.11 or run with PYTHON_BIN=/path/to/python."
  exit 1
fi

if [[ ! -d ".venv" ]]; then
  echo "Creating Python virtual environment..."
  "${PYTHON_BIN}" -m venv .venv
fi

# shellcheck disable=SC1091
source ".venv/bin/activate"

VENV_PYTHON=".venv/bin/python3"
if [[ ! -x "${VENV_PYTHON}" ]]; then
  VENV_PYTHON=".venv/bin/python"
fi

if [[ ! -x "${VENV_PYTHON}" ]]; then
  echo "Cannot find Python inside .venv. Please remove BE/.venv and rerun this script."
  exit 1
fi

VENV_RQ=".venv/bin/rq"
if [[ ! -x "${VENV_RQ}" ]]; then
  VENV_RQ="rq"
fi

if ! "${VENV_PYTHON}" -c "import fastapi, redis, rq" >/dev/null 2>&1; then
  echo "Installing backend requirements..."
  "${VENV_PYTHON}" -m pip install --upgrade pip
  "${VENV_PYTHON}" -m pip install -r requirements.txt
fi

redis_is_running=false
if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli -u "${REDIS_URL}" ping >/dev/null 2>&1; then
    redis_is_running=true
  fi
fi

if [[ "${redis_is_running}" == "true" ]]; then
  echo "Redis is already running: ${REDIS_URL}"
else
  if ! command -v redis-server >/dev/null 2>&1; then
    echo "Cannot find redis-server. Install Redis first, then rerun this script."
    exit 1
  fi

  echo "Starting Redis on 127.0.0.1:6379..."
  redis-server --bind 127.0.0.1 --port 6379 --save "" --appendonly no > "${LOG_DIR}/redis.log" 2>&1 &
  REDIS_PID=$!

  for _ in {1..40}; do
    if command -v redis-cli >/dev/null 2>&1 && redis-cli -u "${REDIS_URL}" ping >/dev/null 2>&1; then
      redis_is_running=true
      break
    fi
    sleep 0.25
  done

  if [[ "${redis_is_running}" != "true" ]]; then
    echo "Redis did not start. Check ${LOG_DIR}/redis.log"
    exit 1
  fi
fi

echo "Starting RQ worker..."
"${VENV_RQ}" worker "${JOB_QUEUE_NAME}" --url "${REDIS_URL}" > "${LOG_DIR}/worker.log" 2>&1 &
WORKER_PID=$!

echo "Worker log: ${LOG_DIR}/worker.log"
echo "Backend health: http://127.0.0.1:${PORT}/api/health"
echo ""

"${VENV_PYTHON}" -m uvicorn app.main:app --reload --host 127.0.0.1 --port "${PORT}"
