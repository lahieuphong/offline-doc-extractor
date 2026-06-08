# Deploy Offline / On-Premise

Muc tieu: chay he thong hoan toan offline/on-premise gom `FE + BE + Ollama local`, khong su dung OpenAI API.

## Nhanh

```bash
cd deploy
cp .env.example .env
./scripts/start.sh
```

Dung:

```bash
cd deploy
./scripts/stop.sh
```

## Image backup/restore

```bash
cd deploy
./scripts/save-images.sh
./scripts/load-images.sh
```

## Async Batch API (2k-5k files)

Backend ho tro luong hang doi bat dong bo qua Redis + worker:
- `POST /api/jobs/submit` (upload file, tra ngay `job_id`)
- `GET /api/jobs/{job_id}` (theo doi tien trinh)
- `GET /api/jobs/{job_id}/result` (lay ket qua JSON khi xong)
- `GET /api/jobs/{job_id}/result.xlsx` (tai file Excel ket qua)
