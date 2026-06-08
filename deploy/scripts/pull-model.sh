#!/usr/bin/env bash
# Chạy script này 1 lần trên máy master (có internet) để pull model LLM vào volume.
# Sau đó chạy save-images.sh để export cả model ra file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODEL="${OLLAMA_MODEL:-llama3.2:3b}"

cd "${DEPLOY_DIR}"

echo "==> Khởi động Ollama container..."
docker compose up -d ollama

echo "==> Đợi Ollama sẵn sàng..."
for i in $(seq 1 30); do
  if docker compose exec ollama ollama list >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Pulling model: ${MODEL}"
docker compose exec ollama ollama pull "${MODEL}"

echo ""
echo "Done! Model '${MODEL}' đã được lưu vào Docker volume."
echo "Tiếp theo: ./scripts/save-images.sh  (để export cả model ra file .tar)"
