#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGES_DIR="${DEPLOY_DIR}/images"

for archive in backend.tar frontend.tar ollama.tar; do
  path="${IMAGES_DIR}/${archive}"
  if [[ ! -f "${path}" ]]; then
    echo "Missing ${path}"
    exit 1
  fi
  docker load -i "${path}"
done

echo "Loaded Docker images from ${IMAGES_DIR}"
