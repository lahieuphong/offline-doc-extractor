# Patch V5 - Backend bóc tách văn bản hành chính 22 trường, chế độ không đoán

## Mục tiêu

Bản V5 tập trung vào các lỗi thực tế của văn bản hành chính scan/PDF ký số:

1. Không xuất chữ sai chính tả hoặc OCR rác vào Excel.
2. Không để trống ô Excel: trường không đủ bằng chứng sẽ ghi `Không thể hiện trong văn bản`.
3. Không đoán nội dung nhà nước: mặc định tắt LLM/backfill và chỉ dùng text/OCR/filename/profiles đã kiểm chứng.
4. Không để ký tự đặc biệt/rác OCR như `<>|{}[]^~§¤�*_` lọt vào các trường hiển thị.
5. Bắt lỗi ngày tháng bị dính chữ/số: `ngày28`, `tháng4`, `năm2026`, thiếu năm nhưng có năm gợi ý trên trang đầu.
6. Không lấy nhầm ngày trong dòng căn cứ pháp lý, tờ trình, báo cáo, công văn làm ngày ban hành.

## File BE đã sửa chính

- `BE/app/vn_admin_metadata.py`
  - Thêm `STRICT_NO_GUESS_MODE=true` mặc định.
  - Thêm cơ chế điền công khai `Không thể hiện trong văn bản` cho 22 trường nếu thiếu/không chắc.
  - Thêm bộ lọc ký tự rác và bộ sửa OCR tiếng Việt thường gặp.
  - Siết ngày ban hành: ưu tiên dòng địa danh + ngày tháng, bỏ qua ngày của căn cứ pháp lý.
  - Không dùng lại subject/type/organ/date/signer do LLM trả về trong strict mode nếu không tìm thấy bằng chứng trong văn bản.

- `BE/app/main.py`
  - Mặc định `use_llm=false` cho `/api/extract-excel` và `/api/extract-json`.
  - `STRICT_NO_GUESS_MODE=true` sẽ tắt LLM dù FE gửi `use_llm=true`.
  - `ENABLE_LLM_BACKFILL_ON_MISSING` mặc định false.

- `BE/app/extractors.py`
  - Thêm `OCR_LANG` có thể cấu hình.
  - Nếu máy thiếu gói OCR tiếng Việt, BE không crash; thử fallback `eng`, sau đó quality guard sẽ chặn text xấu.

- `BE/app/job_queue.py`, `BE/app/__init__.py`
  - Không bắt buộc Redis/RQ khi chạy test hoặc endpoint đồng bộ.

- `BE/tests/test_v4_metadata_regression.py`
  - Bổ sung regression test V5 cho ngày dính chữ, bỏ qua ngày căn cứ pháp lý, missing fields không để blank, không dùng subject đoán.

## Cấu hình đề xuất khi chạy thật

Trong `.env` hoặc docker-compose:

```env
STRICT_NO_GUESS_MODE=true
ENABLE_LLM_BACKFILL_ON_MISSING=false
OCR_TARGETED_ALWAYS=1
OCR_FULL_PAGE=0
OCR_LANG=vie+eng
LONG_TEXT_MAX_CHARS=8000
```

Nếu cần bóc thân văn bản dài toàn bộ PDF, bật:

```env
OCR_FULL_PAGE=1
```

Nhưng với 22 trường metadata, nên giữ `OCR_FULL_PAGE=0` để nhanh hơn và ít nhiễu hơn.

## Cách test nhanh

```bash
cd BE
python -m py_compile app/*.py
python -m pytest -q
```

Kết quả kỳ vọng của bản bàn giao: `5 passed`.

## Nguyên tắc xuất Excel V5

- Có bằng chứng rõ: xuất đúng nội dung.
- Không có bằng chứng hoặc OCR nghi ngờ: xuất `Không thể hiện trong văn bản`.
- `missing_fields` vẫn ghi tên trường cần rà soát để người dùng biết trường nào chưa có bằng chứng.
- Không sinh/hallucinate nội dung văn bản hành chính.
