import re
from typing import Any, Dict, List, Optional


SUBJECT_MAX_CHARS = 1400
SUBJECT_MIN_CHARS = 40
NOISE_MARKERS = (
    "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    "ĐỘC LẬP - TỰ DO - HẠNH PHÚC",
    "NGƯỜI KÝ",
    "THỜI GIAN KÝ",
    "NƠI NHẬN",
    "TM.",
    "KT.",
    "EMAIL:",
)


def _clean_spaces(text: str) -> str:
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _normalize_subject_text(text: str) -> str:
    cleaned = _clean_spaces(text)
    cleaned = re.sub(r"\s*[_=~]{2,}\s*", " ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned.strip(" .;:-")


def _is_low_quality_summary(text: Any) -> bool:
    if not isinstance(text, str):
        return True
    normalized = _normalize_subject_text(text)
    if len(normalized) < SUBJECT_MIN_CHARS:
        return True
    if re.search(r"(?:^|\s)[0-9]{1,2}\.\s*Điều\s+[0-9]+", normalized, flags=re.IGNORECASE):
        return True
    if len(re.findall(r"(?:^|\s)[0-9]{1,2}\.", normalized)) >= 2:
        return True
    if re.search(r"[<>|]{2,}|[�]{1,}", normalized):
        return True
    return False


def _is_noise_line(line: str) -> bool:
    upper_line = line.upper()
    stripped = line.strip()
    if not stripped:
        return True
    if stripped.startswith("---"):
        return True
    if upper_line in {"[TEXT_LAYER]", "[OCR_TEXT]"}:
        return True
    if upper_line.startswith(("NGƯỜI KÝ", "THỜI GIAN KÝ", "EMAIL:", "CƠ QUAN:")):
        return True
    return upper_line in NOISE_MARKERS


def _extract_subject_after_code_line(lines: List[str]) -> Optional[str]:
    code_pattern = re.compile(r"\bS(?:Ố|O)\s*[:：].{0,40}/[A-ZĐ0-9\-]{2,}\b", flags=re.IGNORECASE)
    for idx, line in enumerate(lines[:120]):
        if not code_pattern.search(line):
            continue
        buffer: List[str] = []
        for next_line in lines[idx + 1 : idx + 16]:
            candidate = next_line.strip()
            if not candidate:
                if buffer:
                    break
                continue
            if _is_noise_line(candidate):
                continue
            if re.match(r"^(Căn cứ|Điều\s+\d+|Nơi nhận)\b", candidate, flags=re.IGNORECASE):
                break
            if re.match(r"^Ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}", candidate, flags=re.IGNORECASE):
                break
            if re.match(r"^\d+\.\s*", candidate):
                break
            if re.fullmatch(r"[-_–—=]{3,}", candidate):
                continue
            if len(candidate) < 8:
                continue
            buffer.append(candidate)
            if len(" ".join(buffer)) >= SUBJECT_MAX_CHARS:
                break
        if buffer:
            merged = _normalize_subject_text(" ".join(buffer))
            if merged and not _is_low_quality_summary(merged):
                return merged[:SUBJECT_MAX_CHARS]
    return None


def _extract_subject_by_heading(lines: List[str]) -> Optional[str]:
    keywords = ("VỀ VIỆC", "QUY ĐỊNH", "BAN HÀNH", "SỬA ĐỔI", "BỔ SUNG", "HƯỚNG DẪN")
    for idx, line in enumerate(lines[:140]):
        upper_line = line.upper()
        normalized_line = re.sub(r"\s+", " ", line).strip(" .;:-")
        if normalized_line[:1].islower() or normalized_line.lower().startswith(("và ", "nhưng ", "trong ", "theo ", "tại ")):
            continue
        if any(upper_line.startswith(key) for key in keywords):
            buffer: List[str] = [line.strip()]
            for next_line in lines[idx + 1 : idx + 8]:
                candidate = next_line.strip()
                if _is_noise_line(candidate):
                    continue
                if re.match(r"^(Điều\s+\d+|Căn cứ)\b", candidate, flags=re.IGNORECASE):
                    break
                if len(candidate) < 3:
                    continue
                buffer.append(candidate)
                if len(" ".join(buffer)) >= SUBJECT_MAX_CHARS:
                    break
            merged = _clean_spaces(" ".join(buffer))
            if merged:
                return merged[:SUBJECT_MAX_CHARS]
    return None


def _extract_first_page_lines(document_text: str) -> List[str]:
    marker = re.search(r"--- PAGE\s+2\s*/\s*\d+\s*---", document_text, flags=re.IGNORECASE)
    first_page_text = document_text[: marker.start()] if marker else document_text
    return [line.strip() for line in first_page_text.splitlines() if line.strip()]


def _extract_subject_from_intro(lines: List[str]) -> Optional[str]:
    buffer: List[str] = []
    collecting = False
    for line in lines[:90]:
        up = line.upper()
        if _is_noise_line(line):
            continue
        if any(up.startswith(k) for k in ("VỀ VIỆC", "QUY ĐỊNH", "BAN HÀNH", "SỬA ĐỔI", "BỔ SUNG")):
            collecting = True
        if not collecting:
            continue
        if re.match(r"^(Căn cứ|Điều\s+\d+|Nơi nhận)\b", line, flags=re.IGNORECASE):
            break
        if re.match(r"^Ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}", line, flags=re.IGNORECASE):
            break
        if line.lower().startswith(("người ký", "thời gian ký", "email")):
            break
        if line[:1].islower() and not buffer:
            continue
        buffer.append(line)
        if len(" ".join(buffer)) >= SUBJECT_MAX_CHARS:
            break
    if not buffer:
        return None
    return _clean_spaces(" ".join(buffer))[:SUBJECT_MAX_CHARS]


def _extract_subject_after_doc_type_heading(lines: List[str]) -> Optional[str]:
    doc_type_headings = {
        "THÔNG TƯ",
        "THÔNG BÁO",
        "NGHỊ ĐỊNH",
        "NGHỊ QUYẾT",
        "QUYẾT ĐỊNH",
        "CHỈ THỊ",
        "CÔNG VĂN",
    }
    for idx, line in enumerate(lines[:120]):
        upper_line = re.sub(r"\s+", " ", line.upper()).strip()
        if upper_line not in doc_type_headings:
            continue

        buffer: List[str] = []
        for next_line in lines[idx + 1 : idx + 14]:
            candidate = next_line.strip()
            if not candidate:
                if buffer:
                    break
                continue
            up = candidate.upper()
            if _is_noise_line(candidate):
                if buffer:
                    break
                continue
            if re.match(r"^(Căn cứ|Điều\s+\d+|Nơi nhận)\b", candidate, flags=re.IGNORECASE):
                break
            if re.match(r"^\d+\.\s*", candidate):
                break
            if up in doc_type_headings:
                break
            if re.fullmatch(r"[-_–—=]{3,}", candidate):
                break
            if re.match(r"^[ivxlcdm]+\s*[>)\].-]\s*", candidate, flags=re.IGNORECASE):
                continue
            if re.match(r"^(Giờ|Kính chuyển)\b", candidate, flags=re.IGNORECASE):
                continue
            if len(candidate) < 8:
                continue
            buffer.append(candidate)
            if len(" ".join(buffer)) >= SUBJECT_MAX_CHARS:
                break

        if buffer:
            merged = _normalize_subject_text(" ".join(buffer))
            if merged and not _is_low_quality_summary(merged):
                return merged[:SUBJECT_MAX_CHARS]
    return None


def _extract_subject_from_articles(articles: Any) -> Optional[str]:
    if not isinstance(articles, list) or not articles:
        return None
    lines: List[str] = []
    for idx, article in enumerate(articles[:8], start=1):
        if not isinstance(article, dict):
            continue
        title = article.get("article_title")
        content = article.get("article_content")
        source = title if isinstance(title, str) and title.strip() else content
        if not isinstance(source, str):
            continue
        normalized = _clean_spaces(source).strip(" .;:-")
        if not normalized:
            continue
        lines.append(f"{idx}. {normalized[:220]}")
    if not lines:
        return None
    return "\n".join(lines)[:SUBJECT_MAX_CHARS]


def _detect_language(text: str) -> str:
    vi_signals = ["đ", "ă", "â", "ê", "ô", "ơ", "ư", "ị", "ệ", "ộ"]
    lower = text.lower()
    return "vi" if any(ch in lower for ch in vi_signals) else "en"


def _build_keywords(data: Dict[str, Any], text: str) -> str:
    def _normalize_keyword_token(token: str) -> str:
        token = token.strip(" ,.;:-_/\\|")
        token = re.sub(r"\s+", " ", token)
        fixes = {
            "khodn": "khoản",
            "khoan": "khoản",
            "bỗ": "bổ",
            "đỗi": "đổi",
            "bé": "bỏ",
            "thong": "",
            "gong": "",
            "bien": "",
            "tu": "",
        }
        lower = token.lower()
        if lower in fixes:
            return fixes[lower]
        return token

    def _is_bad_keyword(token: str) -> bool:
        t = token.strip().lower()
        if not t:
            return True
        if t.isdigit():
            return True
        if len(t) < 3:
            return True
        if re.search(r"[^a-zà-ỹ0-9\- ]", t):
            return True
        stopwords = {
            "gong",
            "thong",
            "bien",
            "chinh",
            "phu",
            "ngay",
            "thang",
            "nam",
            "dieu",
            "phan",
            "so",
            "tai",
            "cuoc",
            "hop",
            "voi",
            "cua",
            "luan",
            "tuong",
            "thao",
            "lich",
            "truong",
            "cong",
        }
        return t in stopwords

    candidates: List[str] = []
    for key in ("document_type", "document_code", "issuing_authority", "effective_date"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            candidates.append(value.strip())

    subject = data.get("summary") or data.get("title")
    if isinstance(subject, str):
        phrase_patterns = [
            r"(Kết luận số\s+[0-9]+-[A-Z]{2,}/[A-Z]{2,})",
            r"(Thông tư số\s+[0-9]+/[0-9]{4}/[A-Z\-]+)",
            r"(Nghị quyết số\s+[0-9]+-[A-Z]{2,}/[A-Z]{2,})",
            r"(Thủ tướng Chính phủ)",
            r"(Bộ Công Thương)",
            r"(Bộ Văn hóa,\s*Thể thao và Du lịch)",
            r"(kinh doanh xăng dầu)",
            r"(thủ tục hành chính)",
            r"(điều kiện kinh doanh)",
        ]
        for pattern in phrase_patterns:
            match = re.search(pattern, subject, flags=re.IGNORECASE)
            if match:
                candidates.append(match.group(1))

        # Chỉ fallback token rời khi chưa có đủ từ khóa nghiệp vụ.
        if len(candidates) < 5:
            tokens = re.findall(r"[A-Za-zÀ-Ỹà-ỹ0-9]{4,}", subject)
            for token in tokens[:10]:
                if token.lower() not in {"cộng", "hòa", "xã", "hội", "nghĩa", "việt", "nam"}:
                    candidates.append(token)

    unique: List[str] = []
    seen = set()
    for item in candidates:
        normalized = _normalize_keyword_token(item)
        if _is_bad_keyword(normalized):
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(normalized)
    return ", ".join(unique[:10])


def enrich_for_22_fields(
    data: Dict[str, Any],
    document_text: str,
    extraction_method: str,
    page_count: Optional[int],
    extension: str,
) -> Dict[str, Any]:
    enriched = dict(data)
    text = _clean_spaces(document_text)
    first_page_lines = _extract_first_page_lines(document_text)
    filtered_lines = [line for line in first_page_lines if not _is_noise_line(line)]

    current_summary = enriched.get("summary")

    if _is_low_quality_summary(current_summary):
        summary_after_code_line = _extract_subject_after_code_line(filtered_lines)
        if summary_after_code_line:
            enriched["summary"] = summary_after_code_line

    if _is_low_quality_summary(enriched.get("summary")):
        summary_after_heading = _extract_subject_after_doc_type_heading(filtered_lines)
        if summary_after_heading:
            enriched["summary"] = summary_after_heading

    if _is_low_quality_summary(enriched.get("summary")):
        summary_from_intro = _extract_subject_from_intro(filtered_lines)
        if summary_from_intro:
            enriched["summary"] = summary_from_intro

    if _is_low_quality_summary(enriched.get("summary")):
        subject_from_heading = _extract_subject_by_heading(filtered_lines)
        if subject_from_heading:
            enriched["summary"] = subject_from_heading

    if _is_low_quality_summary(enriched.get("summary")):
        subject_from_articles = _extract_subject_from_articles(enriched.get("articles"))
        if subject_from_articles:
            enriched["summary"] = subject_from_articles

    if isinstance(enriched.get("summary"), str):
        enriched["summary"] = _normalize_subject_text(enriched["summary"])[:SUBJECT_MAX_CHARS]

    if not isinstance(enriched.get("language"), str) or not enriched.get("language"):
        enriched["language"] = _detect_language(text)

    if page_count is not None and not enriched.get("numberOfPage"):
        enriched["numberOfPage"] = page_count

    if not enriched.get("keyword"):
        enriched["keyword"] = _build_keywords(enriched, text)

    if not enriched.get("maintenance"):
        doc_type = str(enriched.get("document_type") or "").lower()
        enriched["maintenance"] = "Lưu trữ vĩnh viễn" if doc_type in {"nghị định", "nghị quyết", "thông tư"} else "Lưu trữ theo quy định"

    if not enriched.get("process"):
        enriched["process"] = extraction_method

    if not enriched.get("riskRecovery"):
        enriched["riskRecovery"] = "Kiểm tra thủ công các trường còn thiếu"

    if not enriched.get("riskRecoveryStatus"):
        missing_count = len(enriched.get("missing_fields", [])) if isinstance(enriched.get("missing_fields"), list) else 0
        enriched["riskRecoveryStatus"] = "Cần rà soát" if missing_count >= 4 else "Tạm ổn"

    if not enriched.get("description"):
        enriched["description"] = "Trích xuất tự động từ văn bản hành chính (offline)."

    if enriched.get("isCan") is None:
        confidence = float(enriched.get("confidence") or 0)
        enriched["isCan"] = "1" if confidence >= 0.6 else "0"

    if not enriched.get("format"):
        enriched["format"] = extension.lower().lstrip(".")

    return enriched
