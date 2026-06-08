# Bản cập nhật bóc tách 22 trường metadata văn bản hành chính Việt Nam

Bản cập nhật này chỉ thay đổi phần backend bóc tách/chuẩn hóa metadata. Giao diện FE, API response shape và luồng upload/export hiện tại được giữ nguyên.

## File đã chỉnh

- `BE/app/vn_admin_metadata.py` — module mới, chuẩn hóa 22 trường metadata bằng rule offline dành cho văn bản hành chính Việt Nam.
- `BE/app/metadata_enricher.py` — gọi bộ chuẩn hóa 22 trường sau khi OCR/LLM/rule-based chạy xong.
- `BE/app/main.py` — truyền thêm tên file gốc để dùng làm fallback khi OCR đọc sai số văn bản, ví dụ `21-bct.signed.pdf`.
- `BE/app/extractors.py` — ưu tiên OCR trang đầu + trang cuối; thêm OCR vùng header/chữ ký để lấy số-ký hiệu, trích yếu, người ký, mã `Lưu:` tốt hơn.
- `deploy/.env`, `deploy/.env.example`, `deploy/docker-compose.yml` — thêm cấu hình OCR chạy ổn định hơn trong Docker offline.

## 22 trường được chuẩn hóa

`docId`, `arcDocCode`, `maintenance`, `typeName`, `codeNumber`, `codeNotation`, `issuedDate`, `organName`, `subject`, `language`, `numberOfPage`, `inforSign`, `keyword`, `mode`, `confidenceLevel`, `autograph`, `format`, `process`, `riskRecovery`, `riskRecoveryStatus`, `description`, `isCan`.

Các trường nghiệp vụ không in trực tiếp trên văn bản nhà nước như `maintenance`, `riskRecovery`, `riskRecoveryStatus`, `isCan` sẽ được ghi là `Không thể hiện trong văn bản` thay vì tự bịa giá trị.

## Quy tắc bóc tách chính

- `docId`, `codeNumber`, `codeNotation`: lấy từ dòng `Số:`; nếu OCR đọc sai số viết tay thì dùng số đầu tên file làm fallback.
- `typeName`: suy ra từ tiêu đề hoặc ký hiệu như `QĐ-TTg`, `TB-VPCP`, `TT-BCT`.
- `organName`: ưu tiên suy ra từ ký hiệu văn bản rồi mới đến phần đầu trang.
- `issuedDate`: chỉ lấy ngày ban hành ở dòng địa danh/ngày tháng phần đầu trang; không lấy nhầm ngày của văn bản được viện dẫn trong trích yếu/căn cứ.
- `subject`: ưu tiên cụm trích yếu ngay dưới dòng loại văn bản, tự gộp dòng xuống hàng và lọc nhiễu OCR/dấu công văn đến.
- `inforSign`, `autograph`: lấy từ chức danh/người ký cuối văn bản và thời gian ký số trong text layer.
- `arcDocCode`: lấy từ dòng `Lưu:` cuối văn bản.
- `mode`: chỉ đánh `Mật/Tối mật/Tuyệt mật` khi có dòng phân loại bảo mật rõ ràng; tránh nhận nhầm chữ “Mặt trận”.

## Cách áp dụng nhanh

1. Sao lưu source hiện tại.
2. Giải nén patch đè vào thư mục gốc project.
3. Rebuild Docker:

```bash
cd deploy
docker compose up -d --build
```

4. Khi bóc văn bản scan PDF, nên chọn chế độ đọc `first_and_last_page` hoặc `full_pdf`. Với 22 metadata, `first_and_last_page` thường đủ vì trang đầu có số-ký hiệu/trích yếu, trang cuối có người ký và dòng `Lưu:`.

## Cấu hình OCR khuyến nghị trong `.env`

```env
USE_LLM_DEFAULT=false
LLM_DISABLE_FOR_FULL_PDF=true
OCR_TIMEOUT_SEC=20
OCR_MIN_TEXT_LEN=120
OCR_MAX_PAGES_PER_PDF=2
OCR_RENDER_ZOOM=1.5
OCR_TESSERACT_PSM=6
OCR_TARGETED_REGIONS=1
OCR_TARGETED_ZOOM=2.5
OCR_TARGETED_TIMEOUT_SEC=12
OMP_THREAD_LIMIT=1
```

`OMP_THREAD_LIMIT=1` giúp Tesseract ổn định hơn khi chạy trong Docker/worker offline.

## Ghi chú kiểm soát độ chính xác

Với scan quá mờ, bị dấu đóng đè hoặc chữ viết tay làm OCR không đọc được, hệ thống sẽ để trống trường đó hoặc ghi `Không thể hiện trong văn bản` thay vì lấy nhầm ngày/số ở phần căn cứ pháp lý. Ví dụ: nếu ngày ban hành ở đầu trang bị OCR hỏng nặng, hệ thống sẽ không tự lấy ngày của văn bản được viện dẫn trong tiêu đề.
