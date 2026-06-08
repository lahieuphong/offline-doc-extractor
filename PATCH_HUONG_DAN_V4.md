# Patch V4 - bóc tách 22 trường văn bản hành chính Việt Nam

Bản V4 kế thừa V3 và tập trung sửa các lỗi thực tế từ bộ PDF scan/ký số:

## Điểm nâng cấp chính

1. **Không cắt cụt trường dài**
   - `subject` / Trích yếu nội dung và `description` / Mô tả được tăng ngưỡng làm sạch lên tối đa 8.000 ký tự mặc định (`LONG_TEXT_MAX_CHARS`, tối đa 32.000 ký tự theo giới hạn Excel).
   - Prompt LLM và bộ hậu xử lý đều yêu cầu giữ nguyên phần cuối câu, đặc biệt các cụm `ngày ... tháng ... năm ...`.

2. **Sửa nhận diện ngày ban hành**
   - Ưu tiên dòng ngày chính thức như `Hà Nội, ngày ... tháng ... năm ...`.
   - Bỏ qua dấu đến, dòng `ĐẾN`, `Giờ`, `Kính chuyển`, thông tin ký số, email.
   - Chuẩn hóa OCR dính chữ: `ngày28`, `tháng4`, `nă2026`, `nă m 2026`.
   - Có thể suy luận năm khi OCR giữ được ngày/tháng nhưng rơi mất chữ `năm`, dựa trên năm hợp lệ trong phần đầu văn bản.
   - Đã sửa profile mẫu `216/TB-VPCP`: ngày ban hành đúng là **26/04/2026** theo dòng ngày trên văn bản.

3. **OCR vùng thông minh hơn**
   - Luôn OCR vùng trọng yếu trang đầu/cuối (`OCR_TARGETED_ALWAYS=1`): số/ký hiệu, dòng ngày, tiêu đề, trích yếu, Điều 1, khối ký/nơi nhận.
   - Tăng zoom OCR vùng và bật nhiều biến thể tiền xử lý ảnh mặc định để giảm lỗi scan/dấu mộc.

4. **Giữ `Mã tài liệu` theo file như Excel cũ**
   - Mặc định `docId` xuất ra Excel là stem file, ví dụ `216-tb.signed`.
   - Số/ký hiệu chính thức vẫn nằm trong `codeNumber`, `codeNotation` và trường tương thích `document_code`.
   - Có thể đổi lại bằng `DOC_ID_POLICY=official_code`.

5. **Excel dễ đọc hơn**
   - Mở rộng cột trích yếu/mô tả/từ khóa, bật wrap text, cố định dòng tiêu đề, bật auto-filter.

## Cấu hình khuyến nghị

```env
OCR_FULL_PAGE=0
OCR_TARGETED_ALWAYS=1
OCR_MULTI_VARIANT=1
OCR_RENDER_ZOOM=2.5
OCR_TARGETED_ZOOM=3.5
OCR_TARGETED_TIMEOUT_SEC=12
OCR_MAX_PAGES_PER_PDF=4
LONG_TEXT_MAX_CHARS=8000
DOC_ID_POLICY=filename_stem
MAX_TEXT_CHARS=12000
```

Khi gặp PDF lạ có thân văn bản dài và cần trích toàn bộ nội dung Điều khoản, có thể bật `OCR_FULL_PAGE=1` và dùng `pdf_read_mode=full_pdf`, nhưng tốc độ sẽ chậm hơn.

## Cách chạy

```bash
cd deploy
cp .env.example .env
# chỉnh .env nếu cần

docker compose up -d --build
```

API giữ nguyên endpoint cũ:

- `POST /api/extract-excel`
- `POST /api/extract-json`
- `POST /api/export-excel`

