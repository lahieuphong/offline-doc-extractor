# Hướng dẫn: Test offline trên máy target (máy khác)

Mục tiêu: Mang app sang máy mới hoàn toàn không có internet, cài và chạy được ngay.

---

## Yêu cầu

| Máy | Cần gì |
|-----|--------|
| Máy MASTER (máy của bạn) | Docker Desktop, có internet |
| Máy TARGET (máy mới) | Docker Desktop đã cài sẵn, **không cần internet** |

---

## PHẦN 1 — Trên máy MASTER: Đóng gói

### Bước 1.1 — Build và save tất cả images ra file

```bash
cd offline_doc_extractor_22fields/deploy

./scripts/save-images.sh
```

Script này tự động:
- Build image backend và frontend
- Pull redis, ollama từ Docker Hub
- Save tất cả ra file `.tar` trong thư mục `deploy/images/`

Sau khi xong, kiểm tra:

```bash
ls -lh deploy/images/
```

Phải thấy đủ 4 file:

```
backend.tar       (khoảng 300 MB)
frontend.tar      (khoảng 200 MB)
ollama.tar        (khoảng 1.5 GB)
redis.tar         (khoảng 15 MB)
```

### Bước 1.2 — Nén lại để copy

```bash
cd offline_doc_extractor_22fields

tar czf offline_package.tar.gz deploy/ storage/
```

File `offline_package.tar.gz` (~2 GB) là tất cả những gì cần mang sang máy target.

---

## PHẦN 2 — Copy sang máy target

Copy file `offline_package.tar.gz` sang máy target bằng:
- USB
- Ổ cứng ngoài
- Mạng nội bộ (LAN/share folder)

---

## PHẦN 3 — Trên máy TARGET: Setup và chạy

> Từ bước này không cần internet nữa. Tắt WiFi cũng được.

### Bước 3.1 — Giải nén

```bash
tar xzf offline_package.tar.gz
cd offline_doc_extractor_22fields/deploy
```

Cấu trúc thư mục sau khi giải nén:

```
offline_doc_extractor_22fields/
├── deploy/
│   ├── .env
│   ├── docker-compose.yml
│   ├── scripts/
│   │   ├── load-images.sh
│   │   ├── start.sh
│   │   └── stop.sh
│   └── images/
│       ├── backend.tar
│       ├── frontend.tar
│       ├── ollama.tar
│       └── redis.tar
└── storage/
```

### Bước 3.2 — Load images vào Docker

```bash
./scripts/load-images.sh
```

Script này đọc các file `.tar` và nạp vào Docker local. Không cần internet.

Kiểm tra đã load xong:

```bash
docker images | grep -E "backend|frontend|redis|ollama"
```

### Bước 3.3 — Khởi động app

```bash
./scripts/start.sh
```

Đợi 15–30 giây.

Kiểm tra tất cả container đang chạy:

```bash
docker compose ps
```

Kết quả mong đợi:

```
NAME                                  STATUS
offline_doc_extractor_redis           running
offline_doc_extractor_backend         running
offline_doc_extractor_worker          running
offline_doc_extractor_frontend        running
offline_doc_extractor_ollama          running
```

---

## PHẦN 4 — Test

Mở browser trên **chính máy target**:

```
http://localhost:3000
```

Mở browser từ **máy khác trong cùng mạng LAN** (ví dụ máy target có IP `192.168.1.100`):

```
http://192.168.1.100:3000
```

> Lấy IP máy target: chạy `ipconfig` (Windows) hoặc `ifconfig` (Mac/Linux)

---

## PHẦN 5 — Test thử chức năng

1. Upload 1 file PDF hoặc DOCX
2. Bấm Extract
3. Kiểm tra 22 trường metadata trả về
4. Thử tải file Excel kết quả

Nếu tất cả hoạt động → **deploy offline thành công**.

---

## Dừng app

```bash
cd offline_doc_extractor_22fields/deploy

./scripts/stop.sh
```

---

## Lần sau setup máy mới

Quy trình giống hệt từ **Bước 3.1** trở đi.  
Không cần quay lại máy master, không cần internet.

---

## Ghi chú quan trọng

- Máy master **không cần chạy** sau khi đã đóng gói xong
- Mỗi máy target chạy **hoàn toàn độc lập**, không phụ thuộc nhau
- LLM mặc định tắt → không cần model Ollama để chạy OCR bình thường
- Nếu muốn LLM trên target: cần thêm file `ollama_model_data.tar.gz` trong `deploy/images/`  
  (tạo bằng cách chạy `pull-model.sh` trên máy master trước khi `save-images.sh`)
