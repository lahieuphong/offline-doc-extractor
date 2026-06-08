# OFFLINE_DOC_EXTRACTOR

He thong trich xuat tai lieu chay offline/on-premise voi:
- `FE` (Next.js)
- `BE` (FastAPI)
- `Ollama` local

Muc tieu trien khai: chay hoan toan noi bo, khong su dung OpenAI API.

## Cau truc chinh

- `FE/`: giao dien nguoi dung
- `BE/`: API trich xuat va export
- `deploy/`: docker-compose + script deploy offline
- `storage/`: du lieu runtime (`uploads/`, `exports/`)

## Chay bang Docker (offline stack)

```bash
cd deploy
cp .env.example .env
./scripts/start.sh
```

Dung stack:

```bash
cd deploy
./scripts/stop.sh
```
