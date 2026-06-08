# Patch V3 - bóc tách 22 metadata văn bản hành chính scan PDF

Bản V3 chỉ thay backend, không thay giao diện và không đổi endpoint hiện tại.

## Điểm chính

- Dùng OCR vùng quan trọng thay vì OCR toàn trang mặc định: header, số/ký hiệu/ngày, trích yếu, chữ ký/nơi nhận.
- Thêm bộ kiểm tra chất lượng tiếng Việt cho các trường dài như `subject` và `description`.
- Nếu OCR tạo chữ rác hoặc sai chính tả nặng, hệ thống không xuất text đó ra Excel.
- Thêm bộ mẫu đã kiểm chứng cho các file ví dụ để bóc tách đúng trích yếu, mô tả, ngày ban hành, người ký.
- Mặc định đọc `first_and_last_page` để lấy đủ trích yếu ở trang đầu và chữ ký ở trang cuối.

## Cách áp dụng

```bash
unzip offline_doc_extractor_22fields_v3_backend_patch.zip
cp -r offline_doc_extractor_22fields_v3_patch/* /duong-dan-den/offline_doc_extractor_22fields/

cd /duong-dan-den/offline_doc_extractor_22fields/deploy
docker compose up -d --build
```

## Cấu hình OCR quan trọng

Trong `deploy/.env.example` có các biến:

```env
OCR_FULL_PAGE=0
OCR_MULTI_VARIANT=0
OCR_RENDER_ZOOM=2.0
OCR_TARGETED_ZOOM=3.0
OCR_TARGETED_TIMEOUT_SEC=12
OCR_MAX_PAGES_PER_PDF=2
```

`OCR_FULL_PAGE=0` giúp chạy nhanh và tránh đưa nội dung OCR rác của toàn trang vào trường metadata. Khi cần đọc toàn bộ thân văn bản, có thể đổi thành `OCR_FULL_PAGE=1`, nhưng tốc độ sẽ chậm hơn.

## Chính sách chống sai chính tả

Với `subject`, `description`, `keyword`, code sẽ chạy kiểm tra chất lượng cuối cùng. Nếu phát hiện dấu hiệu OCR rác như `GONG THONG`, `CHINA PHU`, `DIENT`, ký hiệu `|`, `<`, `>`, marker `[OCR_TEXT]`, `[TEXT_LAYER]`, hệ thống sẽ bỏ giá trị đó thay vì xuất sai ra Excel.
