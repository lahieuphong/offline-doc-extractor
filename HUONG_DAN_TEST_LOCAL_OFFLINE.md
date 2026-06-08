# Hướng dẫn: Test offline ngay trên máy hiện tại (tắt WiFi)

Mục tiêu: Kiểm tra app chạy được hoàn toàn không cần internet, ngay trên máy đang dùng.

---

## Yêu cầu

- Docker Desktop đang chạy
- Đang ở trong thư mục dự án

---

## Bước 1 — Trong khi còn WiFi: Build và pull images

Mở Terminal, chạy:

```bash
cd offline_doc_extractor_22fields/deploy

# Build image Backend và Frontend từ source code
docker compose build

# Pull 2 image có sẵn từ Docker Hub
docker pull redis:7-alpine
docker pull ollama/ollama:latest
```

> Lần đầu tải khoảng 2–3 GB, mất 10–20 phút tuỳ mạng.  
> Lần sau đã có cache, chỉ mất vài giây.

Kiểm tra đã có đủ 4 images chưa:

```bash
docker images | grep -E "backend|frontend|redis|ollama"
```

Phải thấy đủ 4 dòng mới tiếp tục.

---

## Bước 2 — Tắt WiFi

Tắt WiFi (hoặc ngắt cáp mạng) trên máy.

---

## Bước 3 — Khởi động app

```bash
cd offline_doc_extractor_22fields/deploy

docker compose up -d
```

Đợi khoảng 15–30 giây để tất cả container khởi động.

Kiểm tra tất cả đang chạy:

```bash
docker compose ps
```

Kết quả phải thấy tất cả `running`:

```
NAME                                  STATUS
offline_doc_extractor_redis           running
offline_doc_extractor_backend         running
offline_doc_extractor_worker          running
offline_doc_extractor_frontend        running
offline_doc_extractor_ollama          running
```

---

## Bước 4 — Mở app trên browser

```
http://localhost:3000
```

---

## Bước 5 — Test thử

1. Upload 1 file PDF hoặc DOCX
2. Bấm Extract
3. Kiểm tra kết quả trả về đúng không
4. Thử tải file Excel kết quả

Nếu tất cả hoạt động → **app chạy offline thành công**.

---

## Dừng app

```bash
cd offline_doc_extractor_22fields/deploy

docker compose down
```

---

## Ghi chú

- LLM (Ollama) mặc định **tắt** (`USE_LLM_DEFAULT=false` trong `deploy/.env`)  
  → App dùng rule-based OCR, không cần kết nối internet hay model LLM
- Nếu muốn bật LLM: đổi `USE_LLM_DEFAULT=true` trong `deploy/.env` và phải có model (xem `pull-model.sh`)
