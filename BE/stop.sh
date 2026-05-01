#!/bin/bash

cd "$(dirname "$0")"

PORT=8000

echo "======================================"
echo " Stopping Offline Document AI Backend "
echo "======================================"

PID=$(lsof -ti tcp:$PORT || true)

if [ -z "$PID" ]; then
  echo "Không có backend nào đang chạy ở port $PORT."
  exit 0
fi

echo "Tìm thấy process đang chạy ở port $PORT: $PID"
echo "Đang dừng..."

kill -9 $PID

echo "Đã dừng backend."