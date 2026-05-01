#!/bin/bash

set -e

cd "$(dirname "$0")"

PORT=8000

echo "======================================"
echo " Starting Offline Document AI Backend "
echo "======================================"

if [ ! -d ".venv" ]; then
  echo "Không tìm thấy .venv."
  echo "Vui lòng tạo virtual environment trước:"
  echo "python3 -m venv .venv"
  echo "source .venv/bin/activate"
  echo "python -m pip install -r requirements.txt"
  exit 1
fi

source .venv/bin/activate

echo "Python đang dùng:"
which python

echo ""
echo "Kiểm tra package..."
python -m pip show fastapi > /dev/null 2>&1 || {
  echo "Chưa cài requirements. Đang cài..."
  python -m pip install -r requirements.txt
}

echo ""
echo "Kiểm tra port $PORT..."

PID=$(lsof -ti tcp:$PORT || true)

if [ -n "$PID" ]; then
  echo "Port $PORT đang được dùng bởi process: $PID"
  echo "Dừng process cũ..."
  kill -9 $PID
fi

echo ""
echo "Backend sẽ chạy tại:"
echo "http://127.0.0.1:$PORT/api/health"
echo ""

python -m uvicorn app.main:app --reload --host 127.0.0.1 --port $PORT