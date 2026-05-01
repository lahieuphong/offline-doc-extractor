# offline-doc-extractor

Ứng dụng trích xuất thông tin tài liệu chạy local (offline):
- `FE`: Next.js (giao diện)
- `BE`: FastAPI Python (API xử lý tài liệu)

## 1) Yêu cầu cài đặt

- Node.js 20+
- Python 3.10+ (khuyên dùng 3.11/3.12)

## 2) Chạy Backend (BE)

```bash
cd BE
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./run.sh
```

Backend mặc định chạy tại:
- `http://127.0.0.1:8000`
- Health check: `http://127.0.0.1:8000/api/health`

Dừng backend:

```bash
cd BE
./stop.sh
```

## 3) Chạy Frontend (FE)

Mở terminal mới:

```bash
cd FE
yarn install
yarn dev
```

Frontend mặc định chạy tại:
- `http://localhost:3000`

Frontend gọi backend qua biến:
- `NEXT_PUBLIC_BACKEND_URL`
- Nếu không set thì mặc định dùng `http://127.0.0.1:8000`

## 4) Build production (tuỳ chọn)

### Frontend

```bash
cd FE
yarn build
yarn start
```

### Backend

Hiện tại dùng mode dev qua `./run.sh` (uvicorn reload). Có thể bổ sung script production sau.

---

Bản README này đang giữ ở mức tối giản để chạy nhanh. Mình có thể bổ sung tiếp phần Docker, biến môi trường, và troubleshooting ở bước sau.
