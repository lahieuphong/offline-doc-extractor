#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${FE_DIR}/package.json" ]]; then
  echo "Khong tim thay FE/package.json. Dung script."
  exit 1
fi

cd "${FE_DIR}"

echo "==> Dang lam sach node_modules..."
rm -rf node_modules

echo "==> Cai lai dependencies (bao gom devDependencies)..."
yarn install --production=false

echo "==> Kiem tra TypeScript tooling..."
if [[ ! -x "${FE_DIR}/node_modules/.bin/tsc" ]]; then
  echo "Khong tim thay tsc sau khi cai. Thu chay:"
  echo "yarn add -D typescript @types/react @types/node @types/react-dom"
  exit 1
fi

echo ""
echo "Hoan tat. Neu VS Code van con do, hay chay:"
echo "Cmd+Shift+P -> TypeScript: Restart TS Server"
