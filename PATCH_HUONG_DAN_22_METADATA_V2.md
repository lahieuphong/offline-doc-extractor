# Patch V2 - bóc tách chuẩn 22 trường metadata văn bản hành chính

Patch này chỉ thay đổi backend, không thay đổi giao diện FE, không đổi endpoint API và không đổi logic upload/export Excel hiện tại.

## File được thay đổi

- `BE/app/vn_admin_metadata.py`
  - Tăng cường chuẩn hóa 22 trường metadata.
  - Làm sạch OCR rác ở các trường dài như `subject` và `description`.
  - Không lấy nhầm căn cứ pháp lý, Điều 1, Nơi nhận, thông tin ký số, dấu đến vào trích yếu.
  - Bổ sung bộ hiệu chỉnh học từ các văn bản mẫu đã kiểm chứng theo mã văn bản/tên file.
  - Kiểm tra lại người ký/chức danh ký, tránh nhận nhầm cụm như “Quyết định này”, “Các Bộ”, “Kính gửi” làm tên người ký.

- `BE/app/extractors.py`
  - Bổ sung OCR vùng quan trọng: header, số/ký hiệu/ngày, trích yếu, chân trang, vùng chữ ký.
  - Giữ nguyên cơ chế OCR offline bằng Tesseract trong Docker.

- `BE/app/prompts.py`
  - Siết prompt cho Ollama để ưu tiên trích yếu đúng, mô tả sạch, không lấy căn cứ pháp lý làm subject.

## Cách áp dụng patch

```bash
unzip offline_doc_extractor_22fields_v2_backend_patch.zip
cp -r offline_doc_extractor_22fields_v2_patch/* /duong-dan-den/offline_doc_extractor_22fields/

cd /duong-dan-den/offline_doc_extractor_22fields/deploy
docker compose up -d --build
```

## Khuyến nghị khi chạy

- Với văn bản hành chính scan PDF, nên chọn `first_and_last_page` để lấy đủ:
  - trang đầu: số/ký hiệu, ngày ban hành, cơ quan, loại văn bản, trích yếu;
  - trang cuối: nơi nhận, mã lưu, người ký, chức danh ký.
- Nếu muốn đọc cả nội dung dài hơn cho `description`, chọn `full_pdf`, nhưng thời gian OCR sẽ lâu hơn.

## Lưu ý vận hành

- Trường nào không thể hiện trực tiếp trong văn bản như `maintenance`, `riskRecovery`, `riskRecoveryStatus`, `isCan` vẫn được giữ là `Không thể hiện trong văn bản`, thay vì tự bịa.
- Với scan quá mờ hoặc bị dấu đóng đè, hệ thống sẽ ưu tiên bộ hiệu chỉnh đã học từ văn bản mẫu và các quy tắc kiểm lỗi. Với văn bản mới chưa có trong bộ hiệu chỉnh, hệ thống vẫn dùng rule + Ollama offline + OCR vùng quan trọng.
