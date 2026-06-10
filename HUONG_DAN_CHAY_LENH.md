# Hướng dẫn chạy lệnh

---

## 1. Máy Master (Máy hiện tại)

### Setup Docker

```bash
docker pull redis:7-alpine && docker pull ollama/ollama:latest && docker compose up -d --pull never
```

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

## 3. Cách chạy trên máy Target (chỉ cần Docker Desktop + file ZIP)

### Bước 1 — Giải nén file ZIP

**Windows:** Chuột phải vào `offline_package.zip` → Extract All → OK

**Mac/Linux:**

```bash
unzip offline_package.zip
```

### Bước 2 — Mở Terminal vào đúng thư mục

**Windows (PowerShell):**

```powershell
cd offline_doc_extractor_22fields\deploy
```

**Mac/Linux:**

```bash
cd offline_doc_extractor_22fields/deploy
```

### Bước 3 — Load images vào Docker (không cần internet)

```bash
./scripts/load-images.sh
```

> Đợi 3–5 phút. Script đọc các file `.tar` và nạp vào Docker local.

### Bước 4 — Khởi động app

```bash
./scripts/start.sh
```

> Đợi 15–30 giây.

### Bước 5 — Kiểm tra

```bash
docker compose ps
```

Phải thấy **5 dòng** running:

```
offline_doc_extractor_redis      running
offline_doc_extractor_backend    running
offline_doc_extractor_worker     running
offline_doc_extractor_frontend   running
offline_doc_extractor_ollama     running
```

### Bước 6 — Mở browser

**Trên chính máy target:**

```
http://localhost:3000
```

**Từ máy khác cùng mạng LAN:**

```
http://<IP_MÁY_TARGET>:3000
```

> Lấy IP: Windows → `ipconfig`, Mac → `ifconfig`

---

> **Note 1:** Chỉ cần Docker + 1 lệnh:
>
> ```bash
> docker compose up -d --pull never
> ```
>
> Là BE, FE, Worker, Redis, Ollama tất cả tự lên hết.

> **Note 2:** Sau khi sửa code, chỉ rebuild service bị thay đổi, không cần rebuild toàn bộ.
>
> ```bash
> cd /Users/lahieuphong/Downloads/Phong_Nho_IT/offline_doc_extractor_22fields/deploy
> ```
>
> **Rebuild cả BE và FE** (sửa cả hai):
>
> ```bash
> docker compose build backend worker frontend && docker compose up -d
> ```
>
> - `backend` + `worker` — sửa `main.py` (BE)
> - `frontend` — sửa các file `.tsx` (FE)
>
> **Chỉ rebuild BE:**
>
> ```bash
> docker compose build backend worker && docker compose up -d
> ```
>
> **Chỉ rebuild FE:**
>
> ```bash
> docker compose build frontend && docker compose up -d
> ```
>
> `up -d` sẽ tự restart chỉ những container vừa được rebuild; các container còn lại (Redis, Ollama) giữ nguyên, không bị ảnh hưởng.
