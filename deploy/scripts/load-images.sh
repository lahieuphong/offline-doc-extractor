#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGES_DIR="${DEPLOY_DIR}/images"

echo "==> Loading Docker images from ${IMAGES_DIR}..."
for archive in backend.tar frontend.tar ollama.tar redis.tar; do
  path="${IMAGES_DIR}/${archive}"
  if [[ ! -f "${path}" ]]; then
    echo "Missing: ${path}"
    exit 1
  fi
  docker load -i "${path}"
done

echo ""
echo "==> Importing Ollama model data (nếu có)..."
MODEL_BACKUP="${IMAGES_DIR}/ollama_model_data.tar.gz"
if [[ -f "${MODEL_BACKUP}" ]]; then
  PROJECT="${COMPOSE_PROJECT_NAME:-offline_doc_extractor}"
  VOLUME_NAME="${PROJECT}_ollama_data"
  docker volume create "${VOLUME_NAME}" 2>/dev/null || true
  docker run --rm \
    -v "${VOLUME_NAME}:/data" \
    -v "${IMAGES_DIR}:/backup" \
    alpine tar xzf /backup/ollama_model_data.tar.gz -C /data
  echo "   Model data imported vào volume: ${VOLUME_NAME}"
else
  echo "   Không tìm thấy ollama_model_data.tar.gz — LLM sẽ không hoạt động nếu USE_LLM_DEFAULT=true"
fi

echo ""
echo "Done! Chạy tiếp: cd deploy && ./scripts/start.sh"
