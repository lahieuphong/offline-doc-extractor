# Hướng Dẫn Bàn Giao & Triển Khai OFFLINE_DOC_EXTRACTOR (Offline/On-Premise)

Tài liệu này giúp bạn:
- Biết cần bàn giao gì cho khách.
- Biết cách cài đặt hệ thống tại máy khách theo từng bước dễ hiểu.

## 1) Mục tiêu hệ thống

Hệ thống chạy hoàn toàn nội bộ (offline/on-premise):
- Frontend: Next.js
- Backend: FastAPI
- LLM local: Ollama

Không dùng OpenAI API.

## 2) Bạn cần bàn giao cho khách những gì

## 2.1 Mã nguồn dự án

Bàn giao toàn bộ thư mục dự án, tối thiểu gồm:
- `BE/`
- `FE/`
- `deploy/`
- `storage/`
- `README.md`

## 2.2 File cấu hình và script deploy

Đảm bảo khách có các file sau:
- `deploy/docker-compose.yml`
- `deploy/.env` (đã điền thông số phù hợp môi trường khách)
- `deploy/.env.example`
- `deploy/scripts/start.sh`
- `deploy/scripts/stop.sh`
- `deploy/scripts/save-images.sh`
- `deploy/scripts/load-images.sh`

## 2.3 Docker images (để cài offline không cần Internet)

Nên bàn giao thêm thư mục image đã export:
- `deploy/images/backend.tar`
- `deploy/images/frontend.tar`
- `deploy/images/ollama.tar`

Nếu khách không có Internet, đây là phần rất quan trọng.

## 2.4 Tài liệu vận hành ngắn

Nên gửi kèm cho khách:
- Thông tin truy cập FE/BE.
- Cách start/stop.
- Cách backup dữ liệu `storage/`.
- Danh sách lỗi thường gặp.

## 3) Chuẩn bị trước khi qua máy khách

Checklist nhanh:
1. Máy khách đã cài Docker và Docker Compose.
2. Ổ đĩa còn đủ dung lượng (Ollama model + dữ liệu upload/export).
3. Đã chốt port sử dụng (mặc định FE 3000, BE 8000).
4. Đã thống nhất model Ollama (ví dụ `llama3.2:3b`).

## 4) Các bước setup tại máy khách

## Bước 1: Copy source vào máy khách

Ví dụ thư mục đích:
- `/opt/OFFLINE_DOC_EXTRACTOR` (Linux)
- Hoặc thư mục tương đương trên Windows/macOS.

## Bước 2: Kiểm tra file môi trường

Vào thư mục `deploy/`, kiểm tra `deploy/.env` có các biến chính:
- `COMPOSE_PROJECT_NAME`
- `BACKEND_PORT`
- `FRONTEND_PORT`
- `NEXT_PUBLIC_BACKEND_URL`
- `OLLAMA_URL`
- `OLLAMA_MODEL`
- `MAX_TEXT_CHARS`
- `USE_LLM_DEFAULT`
- `CORS_ORIGINS`
- `STORAGE_DIR=storage`

Gợi ý giá trị thường dùng:
- `NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000`
- `OLLAMA_URL=http://ollama:11434/api/generate`

## Bước 3: Nạp Docker image (khi triển khai offline)

Chạy:

```bash
cd deploy
./scripts/load-images.sh
```

Nếu chưa có image `.tar`, bạn cần tạo ở máy có Internet bằng:

```bash
cd deploy
./scripts/save-images.sh
```

sau đó copy thư mục `deploy/images/` qua máy khách.

## Bước 4: Khởi động hệ thống

```bash
cd deploy
./scripts/start.sh
```

## Bước 5: Kiểm tra trạng thái

```bash
cd deploy
docker compose ps
```

Kiểm tra nhanh:
- FE: `http://<IP-máy-khách>:3000`
- BE health: `http://<IP-máy-khách>:8000/api/health`

## Bước 6: Tải model Ollama (nếu cần)

Nếu model chưa có trong máy:

```bash
docker exec -it <ten_container_ollama> ollama pull llama3.2:3b
```

Gợi ý tên container mặc định thường là:
- `<COMPOSE_PROJECT_NAME>_ollama`

## 5) Cách vận hành hằng ngày

Start hệ thống:

```bash
cd deploy
./scripts/start.sh
```

Stop hệ thống:

```bash
cd deploy
./scripts/stop.sh
```

Xem log nhanh:

```bash
cd deploy
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f ollama
```

## 6) Backup và phục hồi dữ liệu

Dữ liệu nghiệp vụ nằm trong:
- `storage/uploads/`
- `storage/exports/`

Cần backup định kỳ toàn bộ thư mục `storage/`.

Phục hồi: chỉ cần copy ngược thư mục `storage/` vào đúng vị trí project root.

## 7) Nghiệm thu với khách (khuyến nghị)

Checklist nghiệm thu:
1. Upload thử 1 file tài liệu.
2. Trích xuất thành công và có kết quả hiển thị trên FE.
3. Export file thành công vào `storage/exports/`.
4. Tắt/mở lại dịch vụ vẫn hoạt động.
5. Không cần kết nối Internet để chạy nghiệp vụ chính.

## 8) Lỗi thường gặp và cách xử lý nhanh

1. FE không truy cập được BE.
- Kiểm tra `NEXT_PUBLIC_BACKEND_URL` trong `deploy/.env`.
- Kiểm tra BE đã chạy chưa: `docker compose ps`.

2. Gọi LLM lỗi timeout.
- Kiểm tra `OLLAMA_URL`.
- Kiểm tra model đã pull chưa.
- Xem log `ollama` và `backend`.

3. Không ghi được file upload/export.
- Kiểm tra quyền ghi thư mục `storage/`.
- Kiểm tra mapping volume trong `deploy/docker-compose.yml`.

## 9) Gợi ý bàn giao chính thức cho khách

Bạn có thể bàn giao theo gói:
1. Gói mã nguồn + tài liệu.
2. Gói Docker images offline (`deploy/images/*.tar`).
3. Biên bản cấu hình cuối cùng (`deploy/.env`) đã chốt port/model.
4. Biên bản nghiệm thu theo checklist mục 7.

---

Nếu bạn muốn, mình có thể viết thêm một bản "Runbook 1 trang" siêu ngắn cho đội vận hành của khách (chỉ gồm lệnh cần chạy và các lỗi xử lý nhanh).
