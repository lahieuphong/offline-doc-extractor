# Hướng dẫn dọn Docker

---

## Dọn nhanh (dùng thường xuyên sau rebuild)

```bash
docker image prune -f && docker builder prune -f
```

Xóa: dangling images (`<none>`) + build cache.

---

## Dọn toàn bộ (trừ volumes)

```bash
docker system prune -f
```

Xóa: dangling images + build cache + stopped containers + unused networks.

> **Không** xóa volumes — an toàn để chạy bất cứ lúc nào.

---

## Kiểm tra volume rác

```bash
docker volume ls -f dangling=true
```

Nếu có kết quả thì xóa:

```bash
docker volume prune -f
```

> **Lưu ý:** Đừng xóa `offline_doc_extractor_ollama_data` — Ollama lưu model ở đây, xóa là phải tải lại từ đầu.
