#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGES_DIR="${DEPLOY_DIR}/images"

mkdir -p "${IMAGES_DIR}"

cd "${DEPLOY_DIR}"

echo "==> Building backend and frontend images..."
docker compose build backend frontend

PROJECT="${COMPOSE_PROJECT_NAME:-offline_doc_extractor}"
BACKEND_IMAGE="${PROJECT}-backend:latest"
FRONTEND_IMAGE="${PROJECT}-frontend:latest"
OLLAMA_IMAGE="ollama/ollama:latest"
REDIS_IMAGE="redis:7-alpine"

if ! docker image inspect "${BACKEND_IMAGE}" >/dev/null 2>&1; then
  BACKEND_IMAGE="$(docker compose config | awk '/image:/ {print $2}' | head -n 1)"
fi

if ! docker image inspect "${FRONTEND_IMAGE}" >/dev/null 2>&1; then
  FRONTEND_IMAGE="$(docker compose config | awk '/image:/ {print $2}' | sed -n '2p')"
fi

echo "==> Pulling Ollama and Redis images..."
docker pull "${OLLAMA_IMAGE}" || true
docker pull "${REDIS_IMAGE}" || true

echo "==> Saving Docker images to ${IMAGES_DIR}..."
docker save -o "${IMAGES_DIR}/backend.tar"  "${BACKEND_IMAGE}"
docker save -o "${IMAGES_DIR}/frontend.tar" "${FRONTEND_IMAGE}"
docker save -o "${IMAGES_DIR}/ollama.tar"   "${OLLAMA_IMAGE}"
docker save -o "${IMAGES_DIR}/redis.tar"    "${REDIS_IMAGE}"

echo "==> Exporting Ollama model data (nếu đã pull model)..."
VOLUME_NAME="${PROJECT}_ollama_data"
if docker volume inspect "${VOLUME_NAME}" >/dev/null 2>&1; then
  docker run --rm \
    -v "${VOLUME_NAME}:/data" \
    -v "${IMAGES_DIR}:/backup" \
    alpine tar czf /backup/ollama_model_data.tar.gz -C /data . 2>/dev/null \
    && echo "   Saved: ${IMAGES_DIR}/ollama_model_data.tar.gz" \
    || echo "   (volume rỗng, bỏ qua model export)"
else
  echo "   Volume ${VOLUME_NAME} chưa tồn tại — chạy pull-model.sh trước nếu cần LLM offline."
fi

echo ""
echo "Done! Các file trong ${IMAGES_DIR}:"
ls -lh "${IMAGES_DIR}/"
