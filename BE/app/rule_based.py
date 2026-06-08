import re
from typing import Any, Dict, List, Optional


def _strip_accents(text: str) -> str:
    table = str.maketrans(
        "àáạảãăằắặẳẵâầấậẩẫèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ",
        "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd",
    )
    return text.lower().translate(table)


def clean_text(text: str) -> str:
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def find_document_code(text: str) -> Optional[str]:
    patterns = [
        r"Số\s*[:：]?\s*([0-9]+)\s*/\s*([A-ZĐ\-]+)",
        r"Số\s*[:：]?\s*([0-9]+/[A-ZĐ\-]+)",
        r"\b([0-9]{1,6}\s*/\s*[A-ZĐ]{1,}(?:-[A-ZĐ0-9]{1,}){1,5})\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)

        if match:
            if len(match.groups()) == 2:
                return f"{match.group(1)}/{match.group(2)}".replace(" ", "")
            return re.sub(r"\s+", "", match.group(1))

    return None


def find_document_number(document_code: Optional[str]) -> Optional[str]:
    if not document_code:
        return None

    match = re.match(r"(\d+)", document_code)

    if match:
        return match.group(1)

    return None


def find_document_type(text: str) -> Optional[str]:
    upper_text = text.upper()

    document_types = [
        "NGHỊ QUYẾT",
        "NGHỊ ĐỊNH",
        "QUYẾT ĐỊNH",
        "THÔNG TƯ",
        "CÔNG VĂN",
        "CHỈ THỊ",
    ]

    for document_type in document_types:
        if document_type in upper_text:
            return document_type.title()

    code = find_document_code(text)
    if code:
        code_upper = code.upper()
        if any(token in code_upper for token in ["QĐ", "QD-"]):
            return "Quyết Định"
        if "NQ" in code_upper:
            return "Nghị Quyết"
        if any(token in code_upper for token in ["CV", "VPCP-CN", "VPCP-KTTH"]):
            return "Công Văn"
        if "TT" in code_upper:
            return "Thông Tư"

    return None


def find_issuing_authority(text: str) -> Optional[str]:
    candidates = [
        "CHÍNH PHỦ",
        "THỦ TƯỚNG CHÍNH PHỦ",
        "BỘ TÀI CHÍNH",
        "BỘ NỘI VỤ",
        "BỘ TƯ PHÁP",
        "BỘ NÔNG NGHIỆP VÀ MÔI TRƯỜNG",
    ]

    upper_text = text.upper()

    for candidate in candidates:
        if candidate in upper_text:
            return candidate.title()

    return None


def normalize_vietnamese_date(day: str, month: str, year: str) -> str:
    return f"{int(day):02d}/{int(month):02d}/{year}"


def find_issue_info(text: str) -> Dict[str, Optional[str]]:
    pattern = (
        r"([A-ZÀ-Ỹa-zà-ỹ\s]+),?\s*ngày\s+([0-9]{1,2})\s+"
        r"tháng\s+([0-9]{1,2})\s+năm\s+([0-9]{4})"
    )

    match = re.search(pattern, text, flags=re.IGNORECASE)

    if not match:
        return {
            "place_of_issue": None,
            "issued_date": None,
        }

    place = match.group(1).strip()
    day = match.group(2)
    month = match.group(3)
    year = match.group(4)

    return {
        "place_of_issue": place,
        "issued_date": normalize_vietnamese_date(day, month, year),
    }


def find_title(text: str, document_type: Optional[str]) -> Optional[str]:
    if not document_type:
        return None

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    upper_type = document_type.upper()

    for index, line in enumerate(lines):
        if line.upper() == upper_type:
            title_lines = []

            for next_line in lines[index + 1 : index + 5]:
                upper_next_line = next_line.upper()

                if upper_next_line in ["CHÍNH PHỦ", "QUYẾT NGHỊ:", "QUYẾT ĐỊNH:"]:
                    break

                if next_line.startswith("---"):
                    continue

                title_lines.append(next_line)

            if title_lines:
                return " ".join(title_lines).strip()

    return None


def find_legal_bases(text: str) -> List[str]:
    bases = []

    patterns = [
        r"Căn cứ\s+(.+?);",
        r"Theo đề nghị\s+(.+?);",
        r"Trên cơ sở\s+(.+?);",
    ]

    for pattern in patterns:
        matches = re.findall(pattern, text, flags=re.IGNORECASE | re.DOTALL)

        for match in matches:
            item = " ".join(match.split())

            if item and item not in bases:
                if pattern.startswith("Căn cứ"):
                    item = "Căn cứ " + item

                bases.append(item)

    return bases


def find_effective_date(text: str) -> Optional[str]:
    patterns = [
        r"có hiệu lực thi hành kể từ ngày ký ban hành",
        r"có hiệu lực kể từ ngày ký",
        r"có hiệu lực từ ngày\s+(.+?)[\.\n]",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)

        if match:
            return match.group(0).strip().rstrip(".")

    return None


def find_articles(text: str) -> List[Dict[str, Any]]:
    article_pattern = r"(Điều\s+\d+\s*\.?.*?)(?=Điều\s+\d+\s*\.?|Nơi nhận|TM\.|KT\.|$)"
    matches = re.findall(article_pattern, text, flags=re.IGNORECASE | re.DOTALL)

    articles = []

    for match in matches:
        content = " ".join(match.split())

        number_match = re.search(r"Điều\s+\d+", content, flags=re.IGNORECASE)
        article_number = number_match.group(0) if number_match else None

        article_title = None

        title_match = re.match(r"(Điều\s+\d+)\s*\.?\s*([^\.]{5,120})", content, flags=re.IGNORECASE)

        if title_match:
            possible_title = title_match.group(2).strip()

            if len(possible_title) < 120:
                article_title = possible_title

        articles.append(
            {
                "article_number": article_number,
                "article_title": article_title,
                "article_content": content,
            }
        )

    return articles


def find_recipients(text: str) -> List[str]:
    recipients = []

    match = re.search(
        r"Nơi nhận\s*[:：]?(.*?)(?=TM\.|KT\.|PHÓ THỦ TƯỚNG|THỦ TƯỚNG|$)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )

    if not match:
        return recipients

    block = match.group(1)

    for line in block.splitlines():
        line = line.strip(" -•\t")

        if not line:
            continue

        if len(line) < 3:
            continue

        recipients.append(line.rstrip(";,"))

    return recipients


def find_signature_block(text: str) -> Optional[str]:
    patterns = [
        r"(TM\.\s*.+?)(?=\n[A-ZÀ-Ỹ][a-zà-ỹ]+\s+[A-ZÀ-Ỹ][a-zà-ỹ]+|$)",
        r"(KT\.\s*.+?)(?=\n[A-ZÀ-Ỹ][a-zà-ỹ]+\s+[A-ZÀ-Ỹ][a-zà-ỹ]+|$)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)

        if match:
            return " ".join(match.group(1).split())

    return None


def find_signer_title(text: str) -> Optional[str]:
    upper_text = text.upper()

    if "PHÓ THỦ TƯỚNG" in upper_text:
        return "Phó Thủ tướng"

    if "THỦ TƯỚNG" in upper_text:
        return "Thủ tướng"

    if "BỘ TRƯỞNG" in upper_text:
        return "Bộ trưởng"

    return None


def find_signer_name(text: str) -> Optional[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for line in reversed(lines):
        if re.match(r"^[A-ZÀ-Ỹ][a-zà-ỹ]+\s+[A-ZÀ-Ỹ][a-zà-ỹ]+", line):
            if len(line.split()) <= 5:
                if not any(keyword in line.upper() for keyword in ["CHÍNH PHỦ", "THỦ TƯỚNG", "NƠI NHẬN"]):
                    return line

    return None


def detect_page_count(text: str) -> Optional[int]:
    matches = re.findall(r"--- PAGE\s+(\d+)", text, flags=re.IGNORECASE)

    if not matches:
        return None

    return max(int(page) for page in matches)


def build_summary(text: str, title: Optional[str], articles: List[Dict[str, Any]]) -> Optional[str]:
    if title:
        return title

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    skip_markers = (
        "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        "Độc lập - Tự do - Hạnh phúc".upper(),
        "Số:",
        "Căn cứ",
        "Nơi nhận",
        "TM.",
        "KT.",
        "NGƯỜI KÝ",
        "CÔNG THÔNG TIN ĐIỆN TỬ",
        "VĂN PHÒNG CHÍNH PHỦ",
        "THỜI GIAN KÝ",
        "EMAIL:",
    )

    summary_start_patterns = (
        "ve viec",
        "quy dinh",
        "ban hanh",
        "sua doi",
        "bo sung",
        "huong dan",
        "cong bo",
        "phe duyet",
        "bai bo",
        "ket luan",
    )

    def is_heading_signal(line: str) -> bool:
        normalized = _strip_accents(re.sub(r"\s+", " ", line).strip(" .;:-"))
        return any(normalized.startswith(pat) for pat in summary_start_patterns)

    def is_stop_line(line: str) -> bool:
        compact = re.sub(r"^[^A-Za-zÀ-Ỹà-ỹĐđ0-9]+", "", line.strip())
        return bool(
            re.match(r"^(Căn cứ|Điều\s+\d+|Nơi nhận)\b", compact, flags=re.IGNORECASE)
            or re.match(r"^Ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}", compact, flags=re.IGNORECASE)
            or re.match(r"^\d+\.\s*", compact)
        )

    def clean_heading_piece(line: str) -> str:
        piece = re.sub(r"\s+", " ", line).strip(" .;:-")
        piece = re.sub(r"^[^A-Za-zÀ-Ỹà-ỹĐđ]+", "", piece)
        piece = re.sub(
            r"\b(C[OÔ]NG|GONG)\s+TH[OÔ]NG\s+TIN\s+ĐI[ỆE]N?\s*T[UƯ]\s+CH[ÍI]NH\s+PH[UƯ]\b",
            "",
            piece,
            flags=re.IGNORECASE,
        )
        piece = re.sub(r"^[A-Za-z]{1,3}\s*,\s*(?=của\s+Thủ tướng Chính phủ)", "", piece, flags=re.IGNORECASE)
        if "của Thủ tướng Chính phủ" in piece and not piece.lower().startswith("kết luận"):
            piece = f"Kết luận {piece}"
        piece = re.split(r"\bCăn cứ\b", piece, maxsplit=1, flags=re.IGNORECASE)[0].strip(" .;:-")
        return piece.strip(" .;:-")

    # Với thông báo/công văn: lấy trích yếu ngay sau dòng Số:/ký hiệu.
    for idx, line in enumerate(lines[:50]):
        if not re.search(r"/(?:TB|CV|VPCP)-[A-ZĐ0-9\-]+", line.upper()):
            continue
        buffer: List[str] = []
        for next_line in lines[idx + 1 : idx + 9]:
            candidate = next_line.strip()
            candidate_upper = candidate.upper()
            if not candidate:
                if buffer:
                    break
                continue
            if any(marker in candidate_upper for marker in skip_markers):
                continue
            if is_stop_line(candidate):
                break
            cleaned_piece = clean_heading_piece(candidate)
            if len(cleaned_piece) < 6:
                continue
            buffer.append(cleaned_piece)
        merged = re.sub(r"\s+", " ", " ".join(buffer)).strip(" .;:-")
        if merged and len(merged) >= 25:
            return merged[:700]

    # Ưu tiên lấy block trích yếu ở phần đầu trang (nhiều dòng liên tiếp).
    top_lines = lines[:45]
    for idx, line in enumerate(top_lines):
        upper_line = line.upper()
        if any(marker in upper_line for marker in skip_markers):
            continue
        if re.match(r"^(NGƯỜI KÝ|KÝ BỞI|SIGNER)\s*[:：]", upper_line):
            continue
        if not is_heading_signal(line):
            continue

        buffer: List[str] = [clean_heading_piece(line)]
        for next_line in top_lines[idx + 1 : idx + 10]:
            candidate = next_line.strip()
            candidate_upper = candidate.upper()
            if not candidate:
                if len(buffer) > 1:
                    break
                continue
            if any(marker in candidate_upper for marker in skip_markers):
                continue
            if is_stop_line(candidate):
                break
            cleaned_piece = clean_heading_piece(candidate)
            if len(cleaned_piece) < 4:
                continue
            buffer.append(cleaned_piece)

        merged = re.sub(r"\s+", " ", " ".join(item for item in buffer if item)).strip(" .;:-")
        if merged and len(merged) >= 30:
            return merged[:700]

    # Ưu tiên tìm câu trích yếu theo mẫu văn bản pháp lý Việt Nam.
    for line in lines:
        upper_line = line.upper()
        normalized_line = re.sub(r"\s+", " ", line).strip(" .;:-")
        if len(normalized_line) < 12:
            continue
        if any(marker in upper_line for marker in skip_markers):
            continue
        if re.match(r"^(NGƯỜI KÝ|KÝ BỞI|SIGNER)\s*[:：]", upper_line):
            continue
        if is_heading_signal(line):
            return normalized_line[:300]

    # Ưu tiên đoạn sau tiêu đề nếu tiêu đề chưa đúng chuẩn.
    joined_text = " ".join(lines)
    pattern_after_type = (
        r"(?:NGHỊ QUYẾT|NGHỊ ĐỊNH|QUYẾT ĐỊNH|THÔNG TƯ|CÔNG VĂN|CHỈ THỊ)"
        r".{0,120}?"
        r"(Về việc|Quy định|Ban hành|Sửa đổi|Bổ sung)\s+(.+?)(?:\.|;|Điều\s+1|Căn cứ)"
    )
    match_after_type = re.search(pattern_after_type, joined_text, flags=re.IGNORECASE | re.DOTALL)
    if match_after_type:
        verb = match_after_type.group(1).strip()
        content = re.sub(r"\s+", " ", match_after_type.group(2)).strip(" .;:-")
        if content:
            return f"{verb} {content}"[:300]

    for line in lines:
        upper_line = line.upper()
        if any(marker in upper_line for marker in skip_markers):
            continue
        if re.match(r"^(NGƯỜI KÝ|KÝ BỞI|SIGNER)\s*[:：]", upper_line):
            continue
        if len(line) < 20:
            continue
        # Ưu tiên câu/đoạn mở đầu có ý nghĩa nghiệp vụ làm trích yếu.
        candidate = re.sub(r"\s+", " ", line).strip(" .;:-")
        if candidate:
            return candidate[:300]

    if articles:
        first_content = articles[0].get("article_content")

        if first_content:
            return first_content[:300]

    return None


def extract_by_rules(text: str, page_count: Optional[int] = None) -> Dict[str, Any]:
    text = clean_text(text)

    document_code = find_document_code(text)
    document_number = find_document_number(document_code)
    document_type = find_document_type(text)
    issuing_authority = find_issuing_authority(text)
    issue_info = find_issue_info(text)
    title = find_title(text, document_type)
    legal_bases = find_legal_bases(text)
    articles = find_articles(text)
    effective_date = find_effective_date(text)
    recipients = find_recipients(text)
    signer_title = find_signer_title(text)
    signer_name = find_signer_name(text)
    signature_block = find_signature_block(text)

    detected_page_count = detect_page_count(text)

    if page_count is None:
        page_count = detected_page_count

    result = {
        "document_type": document_type,
        "document_number": document_number,
        "document_code": document_code,
        "issuing_authority": issuing_authority,
        "national_title": "Cộng hòa Xã hội Chủ nghĩa Việt Nam - Độc lập - Tự do - Hạnh phúc"
        if "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" in text.upper()
        else None,
        "place_of_issue": issue_info["place_of_issue"],
        "issued_date": issue_info["issued_date"],
        "title": title,
        "summary": build_summary(text, title, articles),
        "legal_bases": legal_bases,
        "main_content": articles[0]["article_content"] if articles else None,
        "articles": articles,
        "effective_date": effective_date,
        "recipients": recipients,
        "signer_name": signer_name,
        "signer_title": signer_title,
        "signature_block": signature_block,
        "page_count": page_count,
        "confidence": 0.55,
        "missing_fields": [],
        "notes": "Extracted by local rule-based fallback for Vietnamese legal/administrative documents.",
    }

    for key, value in result.items():
        if key in ["confidence", "missing_fields", "notes"]:
            continue

        if value is None or value == [] or value == "":
            result["missing_fields"].append(key)

    return result
