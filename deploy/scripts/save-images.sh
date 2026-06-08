#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGES_DIR="${DEPLOY_DIR}/images"

mkdir -p "${IMAGES_DIR}"

cd "${DEPLOY_DIR}"
docker compose build backend frontend

BACKEND_IMAGE="${COMPOSE_PROJECT_NAME:-offline_doc_extractor}-backend:latest"
FRONTEND_IMAGE="${COMPOSE_PROJECT_NAME:-offline_doc_extractor}-frontend:latest"
OLLAMA_IMAGE="ollama/ollama:latest"

if ! docker image inspect "${BACKEND_IMAGE}" >/dev/null 2>&1; then
  BACKEND_IMAGE="$(docker compose config | awk '/image:/ {print $2}' | head -n 1)"
fi

if ! docker image inspect "${FRONTEND_IMAGE}" >/dev/null 2>&1; then
  FRONTEND_IMAGE="$(docker compose config | awk '/image:/ {print $2}' | sed -n '2p')"
fi

docker pull "${OLLAMA_IMAGE}" >/dev/null 2>&1 || true

docker save -o "${IMAGES_DIR}/backend.tar" "${BACKEND_IMAGE}"
docker save -o "${IMAGES_DIR}/frontend.tar" "${FRONTEND_IMAGE}"
docker save -o "${IMAGES_DIR}/ollama.tar" "${OLLAMA_IMAGE}"

echo "Saved images to ${IMAGES_DIR}"
