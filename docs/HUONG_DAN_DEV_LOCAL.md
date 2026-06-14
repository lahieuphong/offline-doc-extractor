# Hướng dẫn chạy BE và FE (Dev mode)

---

## Terminal 1 — Chạy BE

```bash
cd /Users/lahieuphong/Downloads/Phong_Nho_IT/offline_doc_extractor_22fields/BE
./run-local.sh
```

Script tự động khởi động Redis + RQ Worker + FastAPI với `--reload` (tự restart khi sửa file Python).

---

## Terminal 2 — Chạy FE

```bash
cd /Users/lahieuphong/Downloads/Phong_Nho_IT/offline_doc_extractor_22fields/FE
yarn dev
```

FE sẽ chạy tại `http://localhost:3000` với **Hot Reload** — sửa file `.tsx` là thấy ngay, không cần rebuild.