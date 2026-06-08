# Hướng dẫn patch bóc tách 22 trường metadata văn bản hành chính Việt Nam

Patch chỉ thay đổi backend. Giao diện FE, endpoint API và luồng upload/export Excel giữ nguyên.

---

## Các file đã sửa

| File | Nội dung thay đổi |
|---|---|
| `BE/app/vn_admin_metadata.py` | Module chuẩn hóa 22 trường; thêm `STRICT_NO_GUESS_MODE`; bộ lọc ký tự rác OCR; bộ sửa lỗi OCR tiếng Việt; siết ngày ban hành; điền `Không thể hiện trong văn bản` khi thiếu bằng chứng |
| `BE/app/extractors.py` | OCR vùng quan trọng thay vì toàn trang; thêm `OCR_LANG` có thể cấu hình; fallback `eng` nếu thiếu gói tiếng Việt |
| `BE/app/main.py` | Mặc định `use_llm=false`; `STRICT_NO_GUESS_MODE=true` tắt LLM dù FE gửi `use_llm=true`; `ENABLE_LLM_BACKFILL_ON_MISSING` mặc định false |
| `BE/app/prompts.py` | Siết prompt Ollama: ưu tiên trích yếu đúng, không lấy căn cứ pháp lý làm subject |
| `BE/app/job_queue.py`, `BE/app/__init__.py` | Không bắt buộc Redis/RQ khi chạy test hoặc endpoint đồng bộ |
| `BE/tests/test_v4_metadata_regression.py` | Thêm regression test: ngày dính chữ, bỏ qua ngày căn cứ pháp lý, missing fields không để blank |
| `deploy/.env`, `deploy/.env.example`, `deploy/docker-compose.yml` | Cấu hình OCR ổn định trong Docker offline |

---

## 22 trường metadata

`docId`, `arcDocCode`, `maintenance`, `typeName`, `codeNumber`, `codeNotation`, `issuedDate`, `organName`, `subject`, `language`, `numberOfPage`, `inforSign`, `keyword`, `mode`, `confidenceLevel`, `autograph`, `format`, `process`, `riskRecovery`, `riskRecoveryStatus`, `description`, `isCan`

Các trường nghiệp vụ không in trên văn bản (`maintenance`, `riskRecovery`, `riskRecoveryStatus`, `isCan`) luôn ghi `Không thể hiện trong văn bản`, không tự bịa giá trị.

---

## Quy tắc bóc tách chính

- **`docId`**: mặc định là stem file (ví dụ `216-tb.signed`). Đổi sang số chính thức bằng `DOC_ID_POLICY=official_code`.
- **`codeNumber`, `codeNotation`**: lấy từ dòng `Số:`. Nếu OCR đọc sai chữ viết tay, dùng số đầu tên file làm fallback.
- **`typeName`**: suy ra từ tiêu đề hoặc ký hiệu như `QĐ-TTg`, `TB-VPCP`, `TT-BCT`.
- **`organName`**: ưu tiên suy ra từ ký hiệu văn bản, sau đó mới đến phần đầu trang.
- **`issuedDate`**: chỉ lấy dòng địa danh + ngày tháng đầu trang (ví dụ `Hà Nội, ngày ... tháng ... năm ...`). Bỏ qua: dấu đến, dòng `ĐẾN`, thông tin ký số, email, ngày trong căn cứ pháp lý/tờ trình. Tự sửa OCR dính chữ: `ngày28`, `tháng4`, `nă2026`.
- **`subject`**: ưu tiên cụm trích yếu ngay dưới dòng loại văn bản, gộp dòng xuống hàng, lọc nhiễu OCR và dấu công văn đến. Không lấy căn cứ pháp lý, Điều 1, Nơi nhận, thông tin ký số.
- **`autograph`, `inforSign`**: lấy từ chức danh/người ký cuối văn bản và thời gian ký số trong text layer. Không nhận nhầm cụm "Quyết định này", "Các Bộ", "Kính gửi" làm tên người ký.
- **`arcDocCode`**: lấy từ dòng `Lưu:` cuối văn bản.
- **`mode`**: chỉ đánh `Mật/Tối mật/Tuyệt mật` khi có dòng phân loại bảo mật rõ ràng. Tránh nhận nhầm chữ "Mặt trận".
- **`subject`, `description`**: tối đa 8.000 ký tự mặc định (`LONG_TEXT_MAX_CHARS`); tối đa 32.000 ký tự theo giới hạn Excel.

---

## Chính sách chế độ không đoán (Strict No-Guess)

| Tình huống | Hành vi |
|---|---|
| Có bằng chứng rõ trong văn bản | Xuất đúng nội dung |
| Thiếu bằng chứng hoặc OCR nghi ngờ | Xuất `Không thể hiện trong văn bản` |
| OCR tạo ký tự rác: `<>|{}[]^~§¤*_` | Loại bỏ hoàn toàn, không xuất ra Excel |
| OCR rác tiếng Việt: `GONG THONG`, `CHINA PHU`, `DIENT`, marker `[OCR_TEXT]` | Loại bỏ |
| LLM trả về subject/date/signer khi strict mode bật | Bỏ qua, không dùng |

Trường `missing_fields` vẫn ghi tên trường chưa có bằng chứng để người dùng rà soát.

---

## Cấu hình khuyến nghị (`.env`)

```env
STRICT_NO_GUESS_MODE=true
ENABLE_LLM_BACKFILL_ON_MISSING=false

OCR_TARGETED_ALWAYS=1
OCR_FULL_PAGE=0
OCR_LANG=vie+eng
OCR_RENDER_ZOOM=2.5
OCR_TARGETED_ZOOM=3.5
OCR_TARGETED_TIMEOUT_SEC=12
OCR_MAX_PAGES_PER_PDF=4
OCR_MULTI_VARIANT=1

LONG_TEXT_MAX_CHARS=8000
MAX_TEXT_CHARS=12000
DOC_ID_POLICY=filename_stem
OMP_THREAD_LIMIT=1
```

> `OMP_THREAD_LIMIT=1` giúp Tesseract ổn định trong Docker/worker offline.
> Khi cần đọc toàn bộ thân văn bản dài, bật `OCR_FULL_PAGE=1` và dùng `pdf_read_mode=full_pdf`, nhưng tốc độ sẽ chậm hơn. Với 22 trường metadata, giữ `OCR_FULL_PAGE=0` là đủ.

---

## Cách áp dụng

```bash
# Giải nén patch đè vào thư mục gốc
unzip offline_doc_extractor_22fields_patch.zip
cp -r offline_doc_extractor_22fields_patch/* /duong-dan-den/offline_doc_extractor_22fields/

# Build lại Docker
cd /duong-dan-den/offline_doc_extractor_22fields/deploy
cp .env.example .env   # chỉnh .env nếu cần
docker compose up -d --build
```

**Chế độ đọc khuyến nghị khi upload PDF:**
- `first_and_last_page` — đủ cho 22 trường: trang đầu có số/ký hiệu, ngày, cơ quan, trích yếu; trang cuối có người ký và dòng `Lưu:`.
- `full_pdf` — dùng khi cần đọc toàn bộ nội dung `description`, nhưng OCR sẽ lâu hơn.

**API endpoints giữ nguyên:**
- `POST /api/extract-excel`
- `POST /api/extract-json`
- `POST /api/export-excel`

---

## Kiểm tra nhanh sau khi deploy

```bash
cd BE
python -m py_compile app/*.py
python -m pytest -q
```

Kết quả kỳ vọng: `5 passed`.
