import os
from pathlib import Path
from typing import Literal, Optional, Tuple

import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from docx import Document


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"}
OCR_TIMEOUT_SEC = int(os.getenv("OCR_TIMEOUT_SEC", "45"))
OCR_MIN_TEXT_LEN = max(0, int(os.getenv("OCR_MIN_TEXT_LEN", "120")))
OCR_MAX_PAGES_PER_PDF = max(0, int(os.getenv("OCR_MAX_PAGES_PER_PDF", "2")))
OCR_RENDER_ZOOM = float(os.getenv("OCR_RENDER_ZOOM", "1.5"))
TEXT_LAYER_NOISE_MARKERS = (
    "người ký:",
    "email:",
    "cơ quan:",
    "thời gian ký:",
    "cổng thông tin điện tử chính phủ",
)


def is_text_layer_noise(text_layer: str) -> bool:
    normalized = " ".join(text_layer.lower().split())
    if not normalized:
        return True
    marker_hits = sum(1 for marker in TEXT_LAYER_NOISE_MARKERS if marker in normalized)
    # Nếu text layer chủ yếu là block chữ ký số/meta thì xem là nhiễu và cần OCR.
    if marker_hits >= 2 and len(normalized) < 400:
        return True
    # Text layer quá ngắn, thiếu nội dung thân bài.
    if len(normalized) < OCR_MIN_TEXT_LEN:
        return True
    return False


def ocr_pdf_page(page, page_index: int) -> str:
    matrix = fitz.Matrix(OCR_RENDER_ZOOM, OCR_RENDER_ZOOM)

    pix = page.get_pixmap(matrix=matrix, alpha=False)

    image = Image.frombytes(
        "RGB",
        [pix.width, pix.height],
        pix.samples,
    )

    try:
        text = pytesseract.image_to_string(
            image,
            lang="vie+eng",
            config="--psm 6",
            timeout=OCR_TIMEOUT_SEC,
        )
    except RuntimeError:
        text = "[OCR_TIMEOUT]"

    return f"\n--- PAGE {page_index} OCR ---\n{text.strip()}"


PdfReadMode = Literal["first_page", "first_and_last_page", "full_pdf"]


def extract_text_from_pdf(file_path: Path, pdf_read_mode: PdfReadMode = "first_page") -> Tuple[str, int]:
    pages = []
    ocr_used_pages = 0

    with fitz.open(file_path) as pdf:
        page_count = len(pdf)

        if page_count == 0:
            return "", 0

        if pdf_read_mode == "full_pdf":
            page_indices = range(page_count)
        elif pdf_read_mode == "first_and_last_page":
            page_indices = [0] if page_count == 1 else [0, page_count - 1]
        else:
            page_indices = [0]

        for page_zero_index in page_indices:
            page_index = page_zero_index + 1
            page = pdf[page_zero_index]
            text_layer = page.get_text("text").strip()

            should_ocr = is_text_layer_noise(text_layer)
            if should_ocr and OCR_MAX_PAGES_PER_PDF > 0 and ocr_used_pages >= OCR_MAX_PAGES_PER_PDF:
                should_ocr = False

            ocr_text = ""
            if should_ocr:
                ocr_text = ocr_pdf_page(page, page_index)
                ocr_used_pages += 1

            page_text = f"""
--- PAGE {page_index} / {page_count} ---

[TEXT_LAYER]
{text_layer}

[OCR_TEXT]
{ocr_text}
""".strip()
            pages.append(page_text)

    return "\n\n".join(pages).strip(), page_count


def extract_text_from_docx(file_path: Path) -> Tuple[str, Optional[int]]:
    document = Document(file_path)

    parts = []

    for paragraph in document.paragraphs:
        text = paragraph.text.strip()

        if text:
            parts.append(text)

    for table_index, table in enumerate(document.tables, start=1):
        parts.append(f"\n--- TABLE {table_index} ---")

        for row in table.rows:
            cells = []

            for cell in row.cells:
                cell_text = cell.text.strip().replace("\n", " ")
                cells.append(cell_text)

            row_text = " | ".join(cells)

            if row_text.strip():
                parts.append(row_text)

    return "\n".join(parts).strip(), None


def extract_text_from_txt(file_path: Path) -> Tuple[str, Optional[int]]:
    return file_path.read_text(encoding="utf-8", errors="ignore").strip(), None


def extract_text_from_image(file_path: Path) -> Tuple[str, Optional[int]]:
    with Image.open(file_path) as image:
        normalized = image.convert("RGB")
        try:
            text = pytesseract.image_to_string(
                normalized,
                lang="vie+eng",
                config="--psm 6",
                timeout=OCR_TIMEOUT_SEC,
            )
        except RuntimeError:
            text = "[OCR_TIMEOUT]"

    return text.strip(), 1


def extract_text(file_path: Path, pdf_read_mode: PdfReadMode = "first_page") -> Tuple[str, Optional[int]]:
    ext = file_path.suffix.lower()

    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}")

    if ext == ".pdf":
        return extract_text_from_pdf(file_path, pdf_read_mode=pdf_read_mode)

    if ext == ".docx":
        return extract_text_from_docx(file_path)

    if ext == ".txt":
        return extract_text_from_txt(file_path)

    if ext in {".png", ".jpg", ".jpeg"}:
        return extract_text_from_image(file_path)

    raise ValueError(f"Unsupported file type: {ext}")
