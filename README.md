# Offline Doc Extractor — 22 trường metadata văn bản hành chính Việt Nam

Hệ thống bóc tách 22 trường metadata từ PDF/DOCX scan, chạy hoàn toàn offline/on-premise, không dùng OpenAI API.

## Stack

| Service | Công nghệ |
|---|---|
| Frontend | Next.js |
| Backend | FastAPI |
| Worker | RQ (Redis Queue) |
| Cache/Queue | Redis |
| LLM local | Ollama (tắt mặc định) |

## Khởi động nhanh

```bash
cd deploy
cp .env.example .env   # chỉ cần lần đầu, hoặc bỏ qua nếu .env đã có
./scripts/start.sh     # build + khởi động 5 container
```

Sau ~30 giây, mở `http://localhost:3000`.

> Dừng: `./scripts/stop.sh`

## API

| Endpoint | Mô tả |
|---|---|
| `POST /api/extract-excel` | Upload PDF/DOCX, trả về Excel 22 trường |
| `POST /api/extract-json` | Upload PDF/DOCX, trả về JSON |
| `POST /api/export-excel` | Export lại từ kết quả đã có |
| `GET /api/health` | Kiểm tra trạng thái BE |

## Cấu trúc thư mục

```
BE/          FastAPI + OCR + 22-field normalizer
FE/          Next.js UI
deploy/      docker-compose, .env, scripts (start/stop/save/load images)
storage/     uploads/ và exports/ (runtime, cần backup định kỳ)
```

---

## Tài liệu

- [22 trường metadata — quy tắc bóc tách & cấu hình](PATCH_HUONG_DAN_22_METADATA_FINAL.md)
- [Hướng dẫn chạy lệnh — master & target](HUONG_DAN_CHAY_LENH.md)
