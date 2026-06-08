# OFFLINE_DOC_EXTRACTOR

He thong trich xuat tai lieu chay offline/on-premise voi:
- `FE` (Next.js)
- `BE` (FastAPI)
- `Ollama` local

Muc tieu trien khai: chay hoan toan noi bo, khong su dung OpenAI API.

## Cau truc chinh

- `FE/`: giao dien nguoi dung
- `BE/`: API trich xuat va export
- `deploy/`: docker-compose + script deploy offline
- `storage/`: du lieu runtime (`uploads/`, `exports/`)

## Chay bang Docker (offline stack)

```bash
cd deploy
cp .env.example .env
./scripts/start.sh
```

Dung stack:

```bash
cd deploy
./scripts/stop.sh
```


## Ban V4

Ban V4 bo sung bo chuan hoa ngay ban hanh, truong trich yeu/mo ta dai, OCR vung thong minh hon va export Excel 22 truong de doc hon. Xem `PATCH_HUONG_DAN_V4.md` de biet chi tiet.


## V5 - BE strict no-guess

Bản V5 đã bổ sung chế độ `STRICT_NO_GUESS_MODE=true` mặc định cho văn bản hành chính: tắt LLM/backfill mặc định, làm sạch ký tự rác OCR, không lấy nhầm ngày căn cứ pháp lý làm ngày ban hành, và không để trống 22 trường Excel. Trường không đủ bằng chứng sẽ ghi `Không thể hiện trong văn bản` và vẫn được liệt kê trong `missing_fields` để rà soát. Xem chi tiết trong `PATCH_HUONG_DAN_V5_STRICT_NO_GUESS.md`.
