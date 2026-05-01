from pathlib import Path
from typing import Literal, Optional, Tuple

import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from docx import Document


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"}


def ocr_pdf_page(page, page_index: int) -> str:
    zoom = 2
    matrix = fitz.Matrix(zoom, zoom)

    pix = page.get_pixmap(matrix=matrix, alpha=False)

    image = Image.frombytes(
        "RGB",
        [pix.width, pix.height],
        pix.samples,
    )

    text = pytesseract.image_to_string(
        image,
        lang="vie+eng",
        config="--psm 6",
    )

    return f"\n--- PAGE {page_index} OCR ---\n{text.strip()}"


PdfReadMode = Literal["first_page", "first_and_last_page", "full_pdf"]


def extract_text_from_pdf(file_path: Path, pdf_read_mode: PdfReadMode = "first_page") -> Tuple[str, int]:
    pages = []

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

            should_ocr = len(text_layer) < 500
            ocr_text = ocr_pdf_page(page, page_index) if should_ocr else ""

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
        text = pytesseract.image_to_string(
            normalized,
            lang="vie+eng",
            config="--psm 6",
        )

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
