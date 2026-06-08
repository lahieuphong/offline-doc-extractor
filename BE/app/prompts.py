from typing import List, Optional

DEFAULT_FIELDS = [
    "document_type",
    "document_number",
    "document_code",
    "issuing_authority",
    "national_title",
    "place_of_issue",
    "issued_date",
    "title",
    "summary",
    "legal_bases",
    "main_content",
    "articles",
    "effective_date",
    "recipients",
    "signer_name",
    "signer_title",
    "signature_block",
    "page_count",
    "docId",
    "arcDocCode",
    "maintenance",
    "typeName",
    "codeNumber",
    "codeNotation",
    "issuedDate",
    "organName",
    "subject",
    "language",
    "numberOfPage",
    "inforSign",
    "keyword",
    "mode",
    "confidenceLevel",
    "autograph",
    "format",
    "process",
    "riskRecovery",
    "riskRecoveryStatus",
    "description",
    "isCan",
]


def build_extraction_prompt(text: str, fields: Optional[List[str]] = None) -> str:
    selected_fields = fields or DEFAULT_FIELDS

    field_list = "\n".join([f"- {field}" for field in selected_fields])

    return f"""
Bạn là hệ thống bóc tách dữ liệu văn bản pháp luật Việt Nam chạy offline.

Nhiệm vụ:
Đọc nội dung OCR/text của văn bản hành chính, văn bản quy phạm, nghị quyết, nghị định, quyết định, công văn...
Sau đó trích xuất dữ liệu thành JSON.

Chỉ trả về JSON hợp lệ.
Không dùng markdown.
Không giải thích thêm.

Các trường cần bóc tách:
{field_list}

Giải thích field:
- document_type: loại văn bản, ví dụ: Nghị quyết, Nghị định, Quyết định, Công văn, Thông tư.
- document_number: phần số chính của văn bản, ví dụ: 115.
- document_code: số/ký hiệu đầy đủ, ví dụ: 115/NQ-CP.
- issuing_authority: cơ quan ban hành, ví dụ: Chính phủ, Thủ tướng Chính phủ, Bộ Tài chính.
- national_title: quốc hiệu/tiêu ngữ nếu có.
- place_of_issue: nơi ban hành, ví dụ: Hà Nội.
- issued_date: ngày ban hành, chuẩn hóa về dd/mm/yyyy nếu chắc chắn.
- title: tên đầy đủ/trích yếu của văn bản.
- summary: tóm tắt ngắn gọn nội dung văn bản.
- legal_bases: danh sách căn cứ pháp lý trong phần mở đầu.
- main_content: nội dung chính của văn bản.
- articles: danh sách các điều trong văn bản.
- effective_date: ngày hiệu lực hoặc câu mô tả hiệu lực.
- recipients: danh sách nơi nhận.
- signer_name: tên người ký.
- signer_title: chức vụ người ký.
- signature_block: khối chức danh ký, ví dụ: TM. CHÍNH PHỦ - KT. THỦ TƯỚNG - PHÓ THỦ TƯỚNG.
- page_count: số trang nếu nhận biết được.
- Bộ metadata 22 trường (docId, arcDocCode, maintenance, typeName, codeNumber, codeNotation, issuedDate, organName, subject, language, numberOfPage, inforSign, keyword, mode, confidenceLevel, autograph, format, process, riskRecovery, riskRecoveryStatus, description, isCan): điền nếu có thể suy ra, nếu không thì null.

Quy tắc:
- Nếu không tìm thấy field, trả về null.
- Nếu một field có nhiều giá trị thì trả về array.
- articles phải là array object gồm article_number, article_title, article_content.
- Không tự bịa dữ liệu.
- Với `summary`, `title`, `subject`: ưu tiên trích đúng CỤM TRÍCH YẾU ngay dưới dòng loại văn bản (THÔNG TƯ/THÔNG BÁO/QUYẾT ĐỊNH/NGHỊ QUYẾT...) hoặc dòng `V/v` của công văn; gộp các dòng xuống hàng thành một câu hoàn chỉnh; tuyệt đối không cắt cụt phần cuối, đặc biệt các cụm ngày tháng như `ngày ... tháng ... năm ...`.
- Tuyệt đối không lấy phần căn cứ pháp lý, phần `Điều 1`, danh sách điều khoản, `Nơi nhận`, thông tin ký số, dấu đến, `Kính gửi` làm trích yếu.
- Nếu trích yếu có cụm tên nước như `Cộng hòa xã hội chủ nghĩa Việt Nam` trong tên hiệp định/thỏa thuận thì phải giữ lại, không được xem là quốc hiệu nhiễu.
- Với `description`: viết mô tả sạch dựa trên trích yếu chắc chắn; không cắt cụt giữa câu. Nếu trích yếu bị nhiễu OCR hoặc thiếu bằng chứng thì để null, không được tự đoán.
- Không sửa tự do làm đổi nghĩa văn bản. Chỉ chuẩn hóa lỗi OCR phổ biến, chắc chắn: `sửa đỗi` -> `sửa đổi`, `bỗ sung` -> `bổ sung`, `bãi bé` -> `bãi bỏ`, `thúc day` -> `thúc đẩy`, `Phụ luc` -> `Phụ lục`, `tong thé` -> `tổng thể`, `bo nhiệm` -> `bổ nhiệm`.
- Không đưa vào JSON các mảnh OCR rác như `GONG THONG`, `CHINA PHU`, `DIENT`, `TNĐIỆN`, ký tự `|`, `<`, `>`, `[OCR_TEXT]`, `[TEXT_LAYER]`, `--- PAGE ...`.
- Nếu OCR bị lỗi nặng, chỉ điền field khi có bằng chứng rõ trong văn bản; trường còn nghi ngờ đưa vào `missing_fields` và ghi trong `notes`. Ưu tiên null hơn là xuất text sai chính tả.
- confidence là số từ 0 đến 1.
- missing_fields là danh sách field bị null.

JSON schema mong muốn:
{{
  "document_type": null,
  "document_number": null,
  "document_code": null,
  "issuing_authority": null,
  "national_title": null,
  "place_of_issue": null,
  "issued_date": null,
  "title": null,
  "summary": null,
  "legal_bases": [],
  "main_content": null,
  "articles": [],
  "effective_date": null,
  "recipients": [],
  "signer_name": null,
  "signer_title": null,
  "signature_block": null,
  "page_count": null,
  "docId": null,
  "arcDocCode": null,
  "maintenance": null,
  "typeName": null,
  "codeNumber": null,
  "codeNotation": null,
  "issuedDate": null,
  "organName": null,
  "subject": null,
  "language": null,
  "numberOfPage": null,
  "inforSign": null,
  "keyword": null,
  "mode": null,
  "confidenceLevel": 0.0,
  "autograph": null,
  "format": null,
  "process": null,
  "riskRecovery": null,
  "riskRecoveryStatus": null,
  "description": null,
  "isCan": null,
  "confidence": 0.0,
  "missing_fields": [],
  "notes": ""
}}

Nội dung văn bản:
{text}
""".strip()
