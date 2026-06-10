# Deploy Offline / On-Premise

Mục tiêu: chạy hệ thống hoàn toàn offline/on-premise gồm `FE + BE + Ollama local`, không sử dụng OpenAI API.

## Khởi động nhanh

```bash
cd deploy
cp .env.example .env
./scripts/start.sh
```

Dừng:

```bash
cd deploy
./scripts/stop.sh
```

## Backup / Restore images

```bash
cd deploy
./scripts/save-images.sh   # lưu tất cả image ra file .tar
./scripts/load-images.sh   # nạp lại image từ file .tar (máy target)
```

## Async Batch API (2.000–5.000 file)

Backend hỗ trợ hàng đợi bất đồng bộ qua Redis + worker:

| Endpoint | Mô tả |
|---|---|
| `POST /api/jobs/submit` | Upload file, trả ngay `job_id` |
| `GET /api/jobs/{job_id}` | Theo dõi tiến trình |
| `GET /api/jobs/{job_id}/result` | Lấy kết quả JSON khi xong |
| `GET /api/jobs/{job_id}/result.xlsx` | Tải file Excel kết quả |
