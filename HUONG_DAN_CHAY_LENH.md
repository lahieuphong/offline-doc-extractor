# Hướng dẫn chạy lệnh

---

## 1. Máy Master (Máy hiện tại)

### Bước 1 — Rebuild (vì vừa sửa code)

```bash
cd /Users/lahieuphong/Downloads/Phong_Nho_IT/offline_doc_extractor_22fields/deploy

docker compose build
```

> Mất khoảng 3–5 phút. Frontend cần build lại vì đã sửa `next.config.ts` và `api.ts`.

### Bước 2 — Khởi động

```bash
docker compose up -d
```

### Bước 3 — Kiểm tra tất cả đang chạy

```bash
docker compose ps
```

> Phải thấy **5 container** running.

### Bước 4 — Mở browser

```
http://localhost:3000
```

### Dừng khi xong

```bash
docker compose down
```

---

## 2. Cách nén để chuyển sang máy target

### Bước 1 — Save tất cả images ra file `.tar`

```bash
cd /Users/lahieuphong/Downloads/Phong_Nho_IT/offline_doc_extractor_22fields/deploy

./scripts/save-images.sh
```

> Đợi khoảng 5–10 phút (đang ghi ~2GB ra đĩa).

### Bước 2 — Nén thành file ZIP

```bash
cd /Users/lahieuphong/Downloads/Phong_Nho_IT/offline_doc_extractor_22fields

zip -r offline_package.zip deploy/ storage/
```

### Bước 3 — Copy file ZIP sang máy target

Copy file `offline_package.zip` qua USB hoặc ổ cứng ngoài.

---

## 3. Cách chạy trên máy Target

### Bước 1 — Save images (chạy lệnh này ở máy hiện tại)

```bash
cd /Users/lahieuphong/Downloads/Phong_Nho_IT/offline_doc_extractor_22fields/deploy

./scripts/save-images.sh
```

Đợi xong (5–10 phút), kiểm tra:

```bash
ls -lh images/
```

> Phải thấy đủ **4 file**: `backend.tar`, `frontend.tar`, `ollama.tar`, `redis.tar`

### Bước 2 — Nén ZIP

```bash
cd /Users/lahieuphong/Downloads/Phong_Nho_IT/offline_doc_extractor_22fields

zip -r offline_package.zip deploy/ storage/
```

### Bước 3 — Copy sang máy target (USB / ổ cứng)

Copy file `offline_package.zip` sang máy target.

### Bước 4 — Trên máy TARGET: Giải nén

**Windows:** Chuột phải → Extract All

**Mac/Linux:**

```bash
unzip offline_package.zip
```

### Bước 5 — Trên máy TARGET: Load images vào Docker

```bash
cd offline_doc_extractor_22fields/deploy

./scripts/load-images.sh
```

### Bước 6 — Trên máy TARGET: Khởi động

```bash
./scripts/start.sh
```

### Bước 7 — Mở browser

```
http://localhost:3000
```
