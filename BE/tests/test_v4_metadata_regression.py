"""Small regression tests for V4 metadata normalizer.

Run inside backend container:
    PYTHONPATH=/app pytest -q tests/test_v4_metadata_regression.py
"""

from app.vn_admin_metadata import _extract_issued_date, enrich_vn_admin_metadata_22


def test_issue_date_joined_words():
    text = "Hà Nội, ngày28 tháng4 năm2026"
    assert _extract_issued_date(text) == "28/04/2026"


def test_issue_date_ignores_arrival_stamp():
    text = "CỔNG THÔNG TIN ĐIỆN TỬ CHÍNH PHỦ ĐẾN Giờ 9 Ngày 29/4/2026\nHà Nội, ngày 28 tháng 4 năm 2026"
    assert _extract_issued_date(text) == "28/04/2026"


def test_profile_216_full_subject_and_date():
    result = enrich_vn_admin_metadata_22({}, "", "rule_based", 6, ".pdf", "216-tb.signed.pdf")
    assert result["docId"] == "216-tb.signed"
    assert result["document_code"] == "216/TB-VPCP"
    assert result["issuedDate"] == "26/04/2026"
    assert result["subject"].endswith("ngày 02 tháng 4 năm 2026")


def test_v5_issue_date_does_not_use_legal_basis_as_promulgation_date():
    text = (
        "Căn cứ Luật Tổ chức Chính phủ ngày 18 tháng 02 năm 2025;\n"
        "Căn cứ Nghị định số 39/2022/NĐ-CP ngày 18 tháng 6 năm 2022;\n"
        "QUYẾT ĐỊNH:"
    )
    assert _extract_issued_date(text) is None


def test_v5_missing_fields_are_visible_not_blank_and_not_guessed():
    result = enrich_vn_admin_metadata_22(
        {"subject": "Về việc AI đoán nhưng văn bản không có"},
        "Hà Nội, ngày 01 tháng 6 năm 2026\nSố: 1/QĐ-TTg\nQUYẾT ĐỊNH\nTHỦ TƯỚNG CHÍNH PHỦ\nQUYẾT ĐỊNH:",
        "ollama_local_llm",
        1,
        ".pdf",
        "unknown.pdf",
    )
    assert result["subject"] == "Không thể hiện trong văn bản"
    assert "subject" in result["missing_fields"]
    assert result["quality_flags"]["strict_no_guess_mode"] is True
