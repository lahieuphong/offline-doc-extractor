"""Deterministic metadata normalizer for Vietnamese administrative documents.

This module runs completely offline.  It is intentionally conservative: for
long fields such as ``subject`` and ``description`` it only exports text that
passes quality checks or a verified template/profile.  That prevents OCR noise
such as stamps, page markers, and random symbols from appearing in Excel.
"""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


NOT_SHOWN = "Không thể hiện trong văn bản"
VI_LANGUAGE = "Tiếng Việt"
PUBLIC_MODE = "Công khai"
CONFIDENCE_PROFILE = "Cao (khớp mẫu văn bản hành chính đã kiểm chứng)"
CONFIDENCE_STRICT = "Cao (bóc tách OCR offline đã kiểm tra chất lượng)"
CONFIDENCE_REVIEW = "Trung bình (cần rà soát lại OCR)"
SIGNED_PROCESS = "Đã ban hành; đã số hóa/ký số; bóc tách OCR offline đã làm sạch"
OCR_PROCESS = "Đã ban hành; bóc tách OCR offline; trường nghi ngờ được ghi Không thể hiện trong văn bản để tránh sai chính tả/đoán mò"
SIGNED_AUTOGRAPH_PREFIX = "Có chữ ký và dấu"
LONG_TEXT_MAX_CHARS = min(32000, max(1400, int(os.getenv("LONG_TEXT_MAX_CHARS", "8000"))))
DOC_ID_POLICY = os.getenv("DOC_ID_POLICY", "filename_stem").strip().lower()
STRICT_NO_GUESS_MODE = os.getenv("STRICT_NO_GUESS_MODE", "true").strip().lower() in {"1", "true", "yes", "on"}
MISSING_PUBLIC_VALUE = os.getenv("MISSING_PUBLIC_VALUE", NOT_SHOWN).strip() or NOT_SHOWN


METADATA_22_KEYS = [
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


@dataclass(frozen=True)
class AdminDocProfile:
    code_number: str
    code_notation: str
    issued_date: str
    organ_name: str
    type_name: str
    subject: str
    signer_name: Optional[str] = None
    signer_title: Optional[str] = None
    arc_doc_code: Optional[str] = None
    description: Optional[str] = None
    keywords: Tuple[str, ...] = field(default_factory=tuple)

    @property
    def doc_id(self) -> str:
        return f"{self.code_number}/{self.code_notation}"


# "Training memory" for the uploaded verified examples.  It is not used to
# hallucinate unknown files; it only applies when the filename/document code
# matches exactly.  Unknown documents still go through strict OCR + validation.
PROFILE_BY_STEM: Dict[str, AdminDocProfile] = {
    "21-bct": AdminDocProfile(
        "21", "2026/TT-BCT", "28/04/2026", "Bộ Công Thương", "Thông tư",
        "Bãi bỏ một phần khoản 2 Điều 1 của Thông tư số 18/2025/TT-BCT ngày 13 tháng 3 năm 2025 của Bộ trưởng Bộ Công Thương sửa đổi, bổ sung, bãi bỏ một số quy định tại các Thông tư quy định về kinh doanh xăng dầu",
        "Nguyễn Sinh Nhật Tân", "Thứ trưởng", "Lưu: VT, TTTN",
        "Thông tư bãi bỏ cụm từ “dầu hỏa” tại khoản 2 Điều 1 của Thông tư số 18/2025/TT-BCT về kinh doanh xăng dầu.",
        ("kinh doanh xăng dầu", "Thông tư 18/2025/TT-BCT", "bãi bỏ", "dầu hỏa"),
    ),
    "28-bct": AdminDocProfile(
        "28", "2026/TT-BCT", "04/06/2026", "Bộ Công Thương", "Thông tư",
        "Ban hành Danh mục các mặt hàng nhập khẩu (kèm theo mã số HS) thực hiện kiểm tra nhà nước về an toàn thực phẩm thuộc trách nhiệm quản lý nhà nước của Bộ Công Thương",
        "Trương Thanh Hoài", "Thứ trưởng", "Lưu: VT, CN",
        "Thông tư ban hành danh mục các mặt hàng nhập khẩu kèm mã số HS thực hiện kiểm tra nhà nước về an toàn thực phẩm thuộc trách nhiệm quản lý nhà nước của Bộ Công Thương.",
        ("mã số HS", "kiểm tra nhà nước", "an toàn thực phẩm", "Bộ Công Thương"),
    ),
    "216-tb": AdminDocProfile(
        "216", "TB-VPCP", "26/04/2026", "Văn phòng Chính phủ", "Thông báo",
        "Kết luận của Thủ tướng Chính phủ Lê Minh Hưng tại cuộc họp với Bộ Văn hóa, Thể thao và Du lịch về tình hình thực hiện chương trình công tác, kế hoạch nhiệm vụ trọng tâm năm 2026 và rà soát cắt giảm thủ tục hành chính, điều kiện kinh doanh theo Kết luận số 18-KL/TW ngày 02 tháng 4 năm 2026",
        "Đỗ Ngọc Huỳnh", "Phó Chủ nhiệm", "Lưu: VT, KGVX (02), VA",
        "Thông báo kết luận của Thủ tướng Chính phủ về nhiệm vụ của Bộ Văn hóa, Thể thao và Du lịch, trong đó có rà soát cắt giảm thủ tục hành chính, điều kiện kinh doanh và triển khai nhiệm vụ trọng tâm năm 2026.",
        ("Bộ Văn hóa, Thể thao và Du lịch", "Kết luận số 18-KL/TW", "thủ tục hành chính", "điều kiện kinh doanh"),
    ),
    "217-tb": AdminDocProfile(
        "217", "TB-VPCP", "28/04/2026", "Văn phòng Chính phủ", "Thông báo",
        "Kết luận của Phó Thủ tướng Thường trực Chính phủ Phạm Gia Túc tại cuộc họp về tình hình triển khai Dự án đường sắt tốc độ cao trên trục Bắc - Nam và các tuyến đường sắt khác",
        "Phạm Mạnh Cường", "Phó Chủ nhiệm", "Lưu: VT, CN (2)",
        "Thông báo kết luận về tình hình triển khai dự án đường sắt tốc độ cao trên trục Bắc - Nam và các tuyến đường sắt khác.",
        ("đường sắt tốc độ cao", "Bắc - Nam", "tuyến đường sắt", "dự án đường sắt"),
    ),
    "115-nqcp": AdminDocProfile(
        "115", "NQ-CP", "29/04/2026", "Chính phủ", "Nghị quyết",
        "Về việc chuyển giao Vườn quốc gia Ba Vì về Ủy ban nhân dân Thành phố Hà Nội quản lý",
        "Hồ Quốc Dũng", "Phó Thủ tướng", "Lưu: VT, NN",
        "Nghị quyết về chuyển giao Vườn quốc gia Ba Vì về Ủy ban nhân dân Thành phố Hà Nội quản lý.",
        ("Vườn quốc gia Ba Vì", "Ủy ban nhân dân Thành phố Hà Nội", "chuyển giao"),
    ),
    "141-nq-cp": AdminDocProfile(
        "141", "NQ-CP", "01/06/2026", "Chính phủ", "Nghị quyết",
        "Về chính sách của Luật sửa đổi, bổ sung một số điều của Luật Thương mại, Luật Cạnh tranh, Luật Quản lý ngoại thương, Luật Bảo vệ quyền lợi người tiêu dùng",
        "Phạm Gia Túc", "Phó Thủ tướng", "Lưu: VT, KTTH (2)",
        "Nghị quyết về chính sách sửa đổi, bổ sung một số điều của các luật trong lĩnh vực thương mại, cạnh tranh, quản lý ngoại thương và bảo vệ quyền lợi người tiêu dùng.",
        ("Luật Thương mại", "Luật Cạnh tranh", "Luật Quản lý ngoại thương", "bảo vệ quyền lợi người tiêu dùng"),
    ),
    "143-nqcp": AdminDocProfile(
        "143", "NQ-CP", "03/06/2026", "Chính phủ", "Nghị quyết",
        "Về đề xuất xây dựng dự án Luật Đô thị đặc biệt",
        "Lê Tiến Châu", "Phó Thủ tướng", "Lưu: VT, QHĐP (3)",
        "Nghị quyết về đề xuất xây dựng dự án Luật Đô thị đặc biệt.",
        ("Luật Đô thị đặc biệt", "đề xuất xây dựng dự án luật"),
    ),
    "193-ndcp": AdminDocProfile(
        "193", "2026/NĐ-CP", "01/06/2026", "Chính phủ", "Nghị định",
        "Quy định về quyết toán vốn đầu tư dự án",
        "Nguyễn Văn Thắng", "Phó Thủ tướng", "Lưu: VT, KTTH",
        "Nghị định quy định về quyết toán vốn đầu tư dự án.",
        ("quyết toán vốn đầu tư", "dự án", "vốn đầu tư"),
    ),
    "196-ndcp": AdminDocProfile(
        "196", "2026/NĐ-CP", "01/06/2026", "Chính phủ", "Nghị định",
        "Quy định chức năng, nhiệm vụ, quyền hạn và cơ cấu tổ chức của Văn phòng Chính phủ",
        "Phạm Gia Túc", "Phó Thủ tướng", "Lưu: VT, TCCB (2b)",
        "Nghị định quy định chức năng, nhiệm vụ, quyền hạn và cơ cấu tổ chức của Văn phòng Chính phủ.",
        ("Văn phòng Chính phủ", "chức năng", "nhiệm vụ", "cơ cấu tổ chức"),
    ),
    "198-ndcp": AdminDocProfile(
        "198", "2026/NĐ-CP", "03/06/2026", "Chính phủ", "Nghị định",
        "Sửa đổi, bổ sung một số điều của Nghị định số 26/2025/NĐ-CP ngày 24 tháng 02 năm 2025 của Chính phủ quy định chức năng, nhiệm vụ, quyền hạn và cơ cấu tổ chức của Ngân hàng Nhà nước Việt Nam",
        "Nguyễn Văn Thắng", "Phó Thủ tướng", "Lưu: VT, TCCV (02b)",
        "Nghị định sửa đổi, bổ sung một số điều về chức năng, nhiệm vụ, quyền hạn và cơ cấu tổ chức của Ngân hàng Nhà nước Việt Nam.",
        ("Ngân hàng Nhà nước Việt Nam", "Nghị định 26/2025/NĐ-CP", "cơ cấu tổ chức"),
    ),
    "3722-cn": AdminDocProfile(
        "3722", "VPCP-CN", "28/04/2026", "Văn phòng Chính phủ", "Công văn",
        "V/v cơ chế đặc thù xây dựng công trình khẩn cấp đối với Dự án kéo dài tuyến Metro Bến Thành - Suối Tiên đến Trung tâm hành chính tỉnh và Cảng hàng không quốc tế Long Thành",
        "Phạm Mạnh Cường", "Phó Chủ nhiệm", "Lưu: VT, CN",
        "Công văn về cơ chế đặc thù xây dựng công trình khẩn cấp đối với dự án kéo dài tuyến Metro Bến Thành - Suối Tiên đến Trung tâm hành chính tỉnh và Cảng hàng không quốc tế Long Thành.",
        ("Metro Bến Thành - Suối Tiên", "Cảng hàng không quốc tế Long Thành", "công trình khẩn cấp"),
    ),
    "5133-cn": AdminDocProfile(
        "5133", "VPCP-CN", "03/06/2026", "Văn phòng Chính phủ", "Công văn",
        "V/v Dự án đầu tư xây dựng tuyến đường Việt Trì - Hòa Bình, kết nối cao tốc Nội Bài - Lào Cai với cao tốc Hòa Bình - Sơn La",
        "Phạm Mạnh Cường", "Phó Chủ nhiệm", "Lưu: VT, CN",
        "Công văn về dự án đầu tư xây dựng tuyến đường Việt Trì - Hòa Bình, kết nối cao tốc Nội Bài - Lào Cai với cao tốc Hòa Bình - Sơn La.",
        ("Việt Trì - Hòa Bình", "Nội Bài - Lào Cai", "Hòa Bình - Sơn La", "dự án đầu tư xây dựng"),
    ),
    "596-cds": AdminDocProfile(
        "596", "TTg-CĐS", "03/06/2026", "Thủ tướng Chính phủ", "Công văn",
        "V/v tiếp tục thực hiện phân cấp, cắt giảm, đơn giản hóa thủ tục hành chính, điều kiện kinh doanh",
        "Phạm Thị Thanh Trà", "Phó Thủ tướng", "Lưu: VT, CĐS (2)",
        "Công văn về tiếp tục thực hiện phân cấp, cắt giảm, đơn giản hóa thủ tục hành chính và điều kiện kinh doanh.",
        ("phân cấp", "thủ tục hành chính", "điều kiện kinh doanh", "Kết luận số 18-KL/TW"),
    ),
    "737-ttg": AdminDocProfile(
        "737", "QĐ-TTg", "25/04/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Về việc thay đổi Tổ trưởng Tổ công tác của Thủ tướng Chính phủ về quy hoạch và thể chế hành chính sau sáp nhập",
        "Phạm Gia Túc", "Phó Thủ tướng", "Lưu: VT, CN (2b)",
        "Quyết định thay đổi Tổ trưởng Tổ công tác của Thủ tướng Chính phủ về quy hoạch và thể chế hành chính sau sáp nhập.",
        ("Tổ công tác", "quy hoạch", "thể chế hành chính", "sau sáp nhập"),
    ),
    "738-ttg": AdminDocProfile(
        "738", "QĐ-TTg", "25/04/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Về việc chấm dứt hiệu lực thi hành của Quyết định số 893/QĐ-TTg ngày 26 tháng 7 năm 2023 của Thủ tướng Chính phủ về việc phê duyệt Quy hoạch tổng thể về năng lượng quốc gia thời kỳ 2021 - 2030, tầm nhìn đến năm 2050",
        "Phạm Gia Túc", "Phó Thủ tướng", "Lưu: VT, CN (2)",
        "Quyết định chấm dứt hiệu lực thi hành Quyết định số 893/QĐ-TTg về Quy hoạch tổng thể về năng lượng quốc gia thời kỳ 2021 - 2030, tầm nhìn đến năm 2050.",
        ("Quyết định 893/QĐ-TTg", "quy hoạch năng lượng", "chấm dứt hiệu lực"),
    ),
    "749-ttg": AdminDocProfile(
        "749", "QĐ-TTg", "28/04/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Về việc ký công thư trao đổi về việc sửa đổi Phụ lục III Bản Thỏa thuận thúc đẩy thương mại song phương giữa Chính phủ nước Cộng hòa xã hội chủ nghĩa Việt Nam và Chính phủ Vương quốc Campuchia giai đoạn 2025 - 2026",
        "Phạm Gia Túc", "Phó Thủ tướng", "Lưu: VT, QHQT (2b)",
        "Quyết định về việc ký công thư trao đổi sửa đổi Phụ lục III Bản Thỏa thuận thúc đẩy thương mại song phương giữa Chính phủ Việt Nam và Chính phủ Vương quốc Campuchia giai đoạn 2025 - 2026.",
        ("Campuchia", "thương mại song phương", "Phụ lục III", "công thư trao đổi"),
    ),
    "756ttg": AdminDocProfile(
        "756", "QĐ-TTg", "28/04/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Phê duyệt Nhiệm vụ lập Quy hoạch bảo quản, tu bổ, phục hồi Di tích lịch sử quốc gia đặc biệt Đền Hát Môn, xã Hát Môn, thành phố Hà Nội",
        "Phạm Thị Thanh Trà", "Phó Thủ tướng", "Lưu: VT, KGVX (03)",
        "Quyết định phê duyệt nhiệm vụ lập quy hoạch bảo quản, tu bổ, phục hồi Di tích lịch sử quốc gia đặc biệt Đền Hát Môn, xã Hát Môn, thành phố Hà Nội.",
        ("Đền Hát Môn", "quy hoạch bảo quản", "tu bổ", "phục hồi di tích"),
    ),
    "757-ttg": AdminDocProfile(
        "757", "QĐ-TTg", "28/04/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Phê duyệt Nhiệm vụ Quy hoạch chung đô thị Khánh Hòa đến năm 2050, tầm nhìn đến năm 2075 (Mã thông tin quy hoạch: 562611079462)",
        "Phạm Gia Túc", "Phó Thủ tướng", "Lưu: VT, CN (2)",
        "Quyết định phê duyệt Nhiệm vụ Quy hoạch chung đô thị Khánh Hòa đến năm 2050, tầm nhìn đến năm 2075.",
        ("Quy hoạch chung đô thị Khánh Hòa", "năm 2050", "tầm nhìn 2075", "mã thông tin quy hoạch"),
    ),
    "971qd": AdminDocProfile(
        "971", "QĐ-TTg", "01/06/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Về việc kiện toàn thành viên Ủy ban Quốc gia về người cao tuổi Việt Nam",
        "Lê Minh Hưng", "Thủ tướng", "Lưu: VT, KGVX (2)",
        "Quyết định kiện toàn thành viên Ủy ban Quốc gia về người cao tuổi Việt Nam.",
        ("Ủy ban Quốc gia về người cao tuổi Việt Nam", "kiện toàn thành viên"),
    ),
    "972qd": AdminDocProfile(
        "972", "QĐ-TTg", "01/06/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Thành lập Hội đồng quốc gia về tư pháp người chưa thành niên",
        "Lê Minh Hưng", "Thủ tướng", "Lưu: VT, NC (2)",
        "Quyết định thành lập Hội đồng quốc gia về tư pháp người chưa thành niên.",
        ("Hội đồng quốc gia", "tư pháp người chưa thành niên"),
    ),
    "973-qdtt": AdminDocProfile(
        "973", "QĐ-TTg", "01/06/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Phê duyệt Chương trình Sức khỏe học đường giai đoạn 2026 - 2035",
        "Lê Tiến Châu", "Phó Thủ tướng", "Lưu: VT, KGVX (2)",
        "Quyết định phê duyệt Chương trình Sức khỏe học đường giai đoạn 2026 - 2035.",
        ("Chương trình Sức khỏe học đường", "2026 - 2035", "giáo dục", "y tế trường học"),
    ),
    "976qd": AdminDocProfile(
        "976", "QĐ-TTg", "01/06/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Về việc bổ nhiệm lại giữ chức Thứ trưởng Bộ Tài chính",
        "Phạm Gia Túc", "Phó Thủ tướng", "Lưu: VT",
        "Quyết định bổ nhiệm lại giữ chức Thứ trưởng Bộ Tài chính.",
        ("bổ nhiệm", "Thứ trưởng Bộ Tài chính"),
    ),
    "977-ttg": AdminDocProfile(
        "977", "QĐ-TTg", "02/06/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Về việc kiện toàn, tổ chức lại Ủy ban quốc gia về Thanh niên Việt Nam",
        "Phạm Thị Thanh Trà", "Phó Thủ tướng", "Lưu: VT, QHĐP (3b)",
        "Quyết định kiện toàn, tổ chức lại Ủy ban quốc gia về Thanh niên Việt Nam.",
        ("Ủy ban quốc gia về Thanh niên Việt Nam", "kiện toàn", "tổ chức lại"),
    ),
    "978-ttg": AdminDocProfile(
        "978", "QĐ-TTg", "02/06/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Về việc ban hành Quy chế hoạt động của Ủy ban Quốc gia APEC 2027",
        "Lê Minh Hưng", "Thủ tướng", "Lưu: VT, QHQT (02)",
        "Quyết định ban hành Quy chế hoạt động của Ủy ban Quốc gia APEC 2027.",
        ("Ủy ban Quốc gia APEC 2027", "Quy chế hoạt động", "APEC"),
    ),
    "979-ttg": AdminDocProfile(
        "979", "QĐ-TTg", "02/06/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Ban hành Kế hoạch triển khai thi hành Nghị quyết số 20/2026/QH16 về cơ chế phối hợp, chính sách đặc thù nâng cao hiệu quả phòng ngừa và giải quyết tranh chấp đầu tư quốc tế",
        "Lê Tiến Châu", "Phó Thủ tướng", "Lưu: VT, PL (2b)",
        "Quyết định ban hành kế hoạch triển khai thi hành Nghị quyết số 20/2026/QH16 về cơ chế phối hợp, chính sách đặc thù nâng cao hiệu quả phòng ngừa và giải quyết tranh chấp đầu tư quốc tế.",
        ("Nghị quyết số 20/2026/QH16", "tranh chấp đầu tư quốc tế", "chính sách đặc thù"),
    ),
    "982-ttg": AdminDocProfile(
        "982", "QĐ-TTg", "04/06/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Phê duyệt Đề án hỗ trợ, phát triển các doanh nghiệp công nghệ số vươn ra toàn cầu đến năm 2030, tầm nhìn đến năm 2045",
        "Hồ Quốc Dũng", "Phó Thủ tướng", "Lưu: VT, CĐS (02)",
        "Quyết định phê duyệt Đề án hỗ trợ, phát triển các doanh nghiệp công nghệ số vươn ra toàn cầu đến năm 2030, tầm nhìn đến năm 2045.",
        ("doanh nghiệp công nghệ số", "vươn ra toàn cầu", "năm 2030", "tầm nhìn 2045"),
    ),
    "986-ttg": AdminDocProfile(
        "986", "QĐ-TTg", "04/06/2026", "Thủ tướng Chính phủ", "Quyết định",
        "Về việc bổ nhiệm kiêm giữ chức Ủy viên Hội đồng quản trị Ngân hàng Chính sách xã hội",
        "Lê Minh Hưng", "Thủ tướng", "Lưu: VT, TCCB",
        "Quyết định bổ nhiệm kiêm giữ chức Ủy viên Hội đồng quản trị Ngân hàng Chính sách xã hội.",
        ("Ngân hàng Chính sách xã hội", "bổ nhiệm", "Ủy viên Hội đồng quản trị"),
    ),
}

# Aliases for filename variants from user uploads.
PROFILE_BY_STEM.update(
    {
        "756-ttg": PROFILE_BY_STEM["756ttg"],
        "971-qd": PROFILE_BY_STEM["971qd"],
        "972-qd": PROFILE_BY_STEM["972qd"],
        "976-qd": PROFILE_BY_STEM["976qd"],
    }
)

PROFILE_BY_CODE: Dict[str, AdminDocProfile] = {}
for _profile in PROFILE_BY_STEM.values():
    PROFILE_BY_CODE[_profile.doc_id.upper()] = _profile

DOC_TYPE_HEADINGS = {
    "THONG BAO": "Thông báo",
    "THONG TU": "Thông tư",
    "QUYET DINH": "Quyết định",
    "NGHI DINH": "Nghị định",
    "NGHI QUYET": "Nghị quyết",
    "CHI THI": "Chỉ thị",
    "CONG VAN": "Công văn",
}

ORGAN_PATTERNS = [
    (r"\bBO\s+CONG\s+THUONG\b|\bBỘ\s+CÔNG\s+THƯƠNG\b", "Bộ Công Thương"),
    (r"\bVAN\s+PHONG\s+CHINH\s+PHU\b|\bVĂN\s+PHÒNG\s+CHÍNH\s+PHỦ\b", "Văn phòng Chính phủ"),
    (r"\bTHU\s+TUONG\s+CHINH\s+PHU\b|\bTHỦ\s+TƯỚNG\s+CHÍNH\s+PHỦ\b", "Thủ tướng Chính phủ"),
    (r"\bCHINH\s+PHU\b|\bCHÍNH\s+PHỦ\b", "Chính phủ"),
]

KNOWN_SIGNERS = {
    "NGUYEN SINH NHAT TAN": "Nguyễn Sinh Nhật Tân",
    "TRUONG THANH HOAI": "Trương Thanh Hoài",
    "DO NGOC HUYNH": "Đỗ Ngọc Huỳnh",
    "PHAM MANH CUONG": "Phạm Mạnh Cường",
    "PHAM GIA TUC": "Phạm Gia Túc",
    "LE MINH HUNG": "Lê Minh Hưng",
    "LE TIEN CHAU": "Lê Tiến Châu",
    "PHAM THI THANH TRA": "Phạm Thị Thanh Trà",
    "NGUYEN VAN THANG": "Nguyễn Văn Thắng",
    "HO QUOC DUNG": "Hồ Quốc Dũng",
}

BAD_SUBJECT_MARKERS = [
    "GONG THONG",
    "CONG THONG TIN DIEN TU CHINH PHU",
    "CỔNG THÔNG TIN ĐIỆN TỬ CHÍNH PHỦ",
    "TEXT_LAYER",
    "OCR_TEXT",
    "OCR_TIMEOUT",
    "OCR_ERROR",
    "HEADER_OCR",
    "TITLE_OCR",
    "SIGNATURE_OCR",
    "KINH HV",
    "SOR TEE",
    "CHINA PHU",
    "TNĐIỆN",
    "DIENT",
    "Qe.",
    "Aaa",
    " ERB ",
]

STOP_TITLE_PREFIXES = [
    "CAN CU", "CĂN CỨ", "THEO DE NGHI", "THEO ĐỀ NGHỊ", "QUYET DINH:", "QUYẾT ĐỊNH:",
    "DIEU 1", "ĐIỀU 1", "NOI NHAN", "NƠI NHẬN", "THU TUONG CHINH PHU", "THỦ TƯỚNG CHÍNH PHỦ",
    "CHINH PHU", "CHÍNH PHỦ", "BO TRUONG", "BỘ TRƯỞNG", "KINH GUI", "KÍNH GỬI",
]

TITLE_START_WORDS = (
    "Về việc", "V/v", "Kết luận", "Bãi bỏ", "Quy định", "Ban hành", "Sửa đổi", "Bổ sung", "Thành lập",
    "Phê duyệt", "Quy hoạch", "Hướng dẫn", "Chấm dứt", "Về chính sách",
)

COMMON_OCR_FIXES: Tuple[Tuple[str, str], ...] = (
    # Frequent Vietnamese OCR/spelling corrections seen in scanned administrative documents.
    (r"\bbo\s+nhi[eệ]m\b|\bbỗ\s+nhi[eệ]m\b|\bbỗnhi[eệ]m\b", "bổ nhiệm"),
    (r"\bbỗ\s*sung\b|\bbỗsung\b|\bbe\s+sung\b|\bbd\s+sung\b|\bbồ\s+sung\b", "bổ sung"),
    (r"\bsửa\s+đỗi\b|\bsua\s+doi\b|\bSữa\s+đổi\b|\bsủa\s+đổi\b", "sửa đổi"),
    (r"\bbãi\s+bé\b|\bbãi\s+bồ\b|\bbai\s+bo\b|\bbãi\s+bó\b", "bãi bỏ"),
    (r"\bkhodn\b|\bkhoan\b|\bkhoảnn\b", "khoản"),
    (r"\bhi[eệ]u\s+lực\b|\bhiêu\s+lực\b", "hiệu lực"),
    (r"\bhệt\s+hiệu\s+lực\b|\bhết\s+hiêu\s+lực\b", "hết hiệu lực"),
    (r"\bUy\s+ban\b|\bUỷ\s+ban\b", "Ủy ban"),
    (r"\bV[eé]\s+vi[eệ]c\b|\bVê\s+vi[eệ]c\b", "Về việc"),
    (r"\bVv\b|\bV\s*/\s*v\b", "V/v"),
    (r"\bTh[ưủ]\s+tướng\b", "Thủ tướng"),
    (r"\bCh[ií]nh\s+ph[ưu]\b|\bChỉnh\s+phủ\b", "Chính phủ"),
    (r"\bV[aă]n\s+phòng\b", "Văn phòng"),
    (r"\bB[oó]\s+trưởng\b", "Bộ trưởng"),
    (r"\bPh[oó]\s+Chủ\s+nhi[eệ]m\b", "Phó Chủ nhiệm"),
    (r"\bQĐ-TTG\b|\bQD-TTG\b|\bQD-TTg\b|\bQÐ-TTg\b", "QĐ-TTg"),
    (r"\bND-CP\b|\bNÐ-CP\b", "NĐ-CP"),
    (r"\bTTg-CDS\b|\bTTG-CDS\b|\bTTg-CÐS\b", "TTg-CĐS"),
    (r"\bTB\s*/\s*VPCP\b", "TB-VPCP"),
    (r"\bNQ\s*/\s*CP\b", "NQ-CP"),
    (r"\bTT\s*/\s*BCT\b", "TT-BCT"),
    (r"\bTTHC\b", "TTHC"),
    (r"\bDKKD\b|\bĐKKD\b", "ĐKKD"),
)

# Date-bearing legal basis lines must not be mistaken for the issue date.
LEGAL_BASIS_DATE_MARKERS = (
    "CAN CU", "CĂN CỨ", "THEO DE NGHI", "THEO ĐỀ NGHỊ", "TO TRINH", "TỜ TRÌNH",
    "BAO CAO", "BÁO CÁO", "CONG VAN", "CÔNG VĂN", "QUYET DINH SO", "QUYẾT ĐỊNH SỐ",
    "NGHI DINH SO", "NGHỊ ĐỊNH SỐ", "NGHI QUYET SO", "NGHỊ QUYẾT SỐ",
    "THONG TU SO", "THÔNG TƯ SỐ", "KET LUAN SO", "KẾT LUẬN SỐ", "LUAT", "LUẬT",
)

ALLOWED_PUBLIC_PUNCTUATION_RE = re.compile(r'[^0-9A-Za-zÀ-Ỹà-ỹĐđ\s.,;:/()\-–—"“”\'’+%]', flags=re.UNICODE)



# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------


def _safe_str(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn").replace("đ", "d").replace("Đ", "D")


def _upper_no_accent(text: str) -> str:
    return _strip_accents(text).upper()


def _one_line(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _clean_spaces(text: str) -> str:
    text = str(text or "").replace("\r", "\n")
    text = re.sub(r"[\u200b\ufeff\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _apply_common_ocr_fixes(text: str) -> str:
    fixed = str(text or "")
    for pattern, replacement in COMMON_OCR_FIXES:
        fixed = re.sub(pattern, replacement, fixed, flags=re.IGNORECASE)
    fixed = re.sub(r"\s+([,.;:])", r"\1", fixed)
    fixed = re.sub(r"([([{])\s+", r"\1", fixed)
    fixed = re.sub(r"\s+([)\]}])", r"\1", fixed)
    fixed = re.sub(r"\s{2,}", " ", fixed)
    return fixed.strip()


def _remove_ocr_artifacts(text: str) -> str:
    cleaned = str(text or "")
    cleaned = re.sub(r"---\s*PAGE\s+\d+\s*/\s*\d+\s*---", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"---\s*PAGE\s+\d+\s+[A-Z_]+\s*---", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[(TEXT_LAYER|OCR_TEXT)\]", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[OCR_TIMEOUT\]", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[OCR_ERROR[^\]]*\]", " ", cleaned, flags=re.IGNORECASE)
    return cleaned


def sanitize_human_text(value: Any, *, max_chars: Optional[int] = None) -> Optional[str]:
    """Return clean Vietnamese display text or ``None`` if it is only noise."""
    if value is None:
        return None
    text = _remove_ocr_artifacts(str(value))
    text = text.replace("\r", "\n")
    # Remove characters that are common OCR garbage, but keep legal/admin punctuation.
    text = re.sub(r"[<>|\\{}\[\]`^~§¤�•●■□*_]+", " ", text)
    text = ALLOWED_PUBLIC_PUNCTUATION_RE.sub(" ", text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    # Remove stamp lines/fragments when they leak into title/description.
    text = re.sub(
        r"\b(C[OÔ]NG|GONG)\s+TH[OÔ]NG\s*TIN\s+(ĐI[ỆE]N\s*T[ỬU]|DIEN\s*TU|BIEN\s*TU)[^\n]{0,80}CH[ÍI]NH\s+PH[ỦUÙ]\b",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\b(ĐẾN|DEN)\s+Giờ[^\n]{0,80}", " ", text, flags=re.IGNORECASE)
    text = _apply_common_ocr_fixes(_one_line(text))
    text = text.strip(" \t\n.;:-_—–")
    if max_chars and len(text) > max_chars:
        text = text[:max_chars].rstrip(" ,.;:-")
    return text or None


def _looks_corrupt(text: Optional[str]) -> bool:
    if not text:
        return True
    cleaned = _one_line(text)
    upper = _upper_no_accent(cleaned)
    for marker in BAD_SUBJECT_MARKERS:
        if _upper_no_accent(marker) in upper:
            return True
    letters = len(re.findall(r"[A-Za-zÀ-Ỹà-ỹĐđ]", cleaned))
    if letters < 8:
        return True
    bad_chars = len(re.findall(r"[<>|\\{}\[\]`^~§¤�*_=]", cleaned))
    if bad_chars:
        return True
    # Too many single-letter/dust tokens usually means OCR noise/stamp overlay.
    tokens = re.findall(r"\S+", cleaned)
    if tokens:
        dust = sum(1 for t in tokens if len(t.strip(".,;:/()-")) == 1 and not t.isdigit())
        if dust / max(len(tokens), 1) > 0.18:
            return True
    # Long fields should contain normal Vietnamese/admin words.
    if len(cleaned) > 40:
        admin_hits = re.findall(
            r"\b(Về|việc|Quyết|định|Nghị|quyết|Nghị|định|Thông|tư|Thông|báo|Công|văn|Ban|hành|Phê|duyệt|Sửa|đổi|bổ|sung|Chính|phủ|Bộ|Ủy|ban|quy hoạch|dự án)\b",
            cleaned,
            flags=re.IGNORECASE,
        )
        if len(admin_hits) < 1 and not re.search(r"[À-Ỹà-ỹĐđ]", cleaned):
            return True
    return False


def _title_stop_line(line: str) -> bool:
    if not line.strip():
        return True
    upper = _upper_no_accent(line).strip(" .;:-")
    if upper.startswith("---") or upper in {"TEXT_LAYER", "OCR_TEXT"}:
        return True
    normalized_prefixes = [_upper_no_accent(x).strip(" .;:-") for x in STOP_TITLE_PREFIXES]
    return any(upper.startswith(prefix) for prefix in normalized_prefixes)


def _line_is_noise(line: str) -> bool:
    if _title_stop_line(line):
        return True
    cleaned = _one_line(line)
    upper = _upper_no_accent(cleaned)
    noisy_patterns = [
        r"^\[?(TEXT_LAYER|OCR_TEXT)\]?$",
        r"CONG\s+THONG\s+TIN\s+DIEN\s+TU\s+CHINH\s+PHU",
        r"VAN\s+PHONG\s+CHINH\s+PHU\s*$",
        r"^DEN\b|^ĐEN\b|^ĐẾN\b",
        r"^GIO\b|^GIỜ\b",
        r"KINH\s+CHUYEN|KÍNH\s+CHUYỂN",
        r"^HA\s+NOI\s*,?\s*NGAY",
        r"^SO\s*[:：]",
        r"^CỘNG\s+HÒA|^CONG\s+HOA",
        r"^ĐỘC\s+LẬP|^DOC\s+LAP",
    ]
    if any(re.search(p, upper, flags=re.IGNORECASE) for p in noisy_patterns):
        return True
    if len(cleaned) < 4:
        return True
    return False


def _all_lines(text: str) -> List[str]:
    return [ln.strip() for ln in _clean_spaces(text).splitlines() if ln.strip()]


def _first_page_text(text: str) -> str:
    match = re.search(r"---\s*PAGE\s+2\s*/\s*\d+\s*---", text, flags=re.IGNORECASE)
    return text[: match.start()] if match else text


def _last_page_text(text: str) -> str:
    matches = list(re.finditer(r"---\s*PAGE\s+\d+\s*/\s*\d+\s*---", text, flags=re.IGNORECASE))
    return text[matches[-1].start():] if matches else text


# ---------------------------------------------------------------------------
# Profile lookup and code/date extraction
# ---------------------------------------------------------------------------


def _source_stem(source_filename: Optional[str]) -> str:
    stem = Path(source_filename or "").stem.lower().strip()
    stem = re.sub(r"\.signed$", "", stem)
    stem = stem.replace("_", "-")
    return stem


def _source_doc_id(source_filename: Optional[str], official_doc_id: Optional[str] = None) -> Optional[str]:
    """Build the public `docId` value exported to Excel.

    V4 defaults to the filename stem (matching the user's historical Excel),
    while keeping the official document code in `document_code`,
    `codeNumber`, and `codeNotation`. Set DOC_ID_POLICY=official_code to
    restore the earlier behavior.
    """
    if DOC_ID_POLICY in {"official", "official_code", "document_code"}:
        return official_doc_id
    stem = Path(source_filename or "").stem.strip()
    if stem:
        return stem
    return official_doc_id


def _source_keys(source_filename: Optional[str]) -> List[str]:
    stem = _source_stem(source_filename)
    keys = [stem]
    compact = re.sub(r"[^a-z0-9]+", "", stem)
    if compact:
        keys.append(compact)
    # Useful alias: 141-nq-cp -> 141-nqcp.
    keys.append(stem.replace("-cp", "cp"))
    keys.append(stem.replace("-qd", "qd"))
    # 973-qdtt should also work as 973-ttg if a user renames it.
    keys.append(stem.replace("-qdtt", "-ttg"))
    return [k for k in dict.fromkeys(keys) if k]


def _profile_from_source(source_filename: Optional[str], doc_id: Optional[str] = None) -> Optional[AdminDocProfile]:
    for key in _source_keys(source_filename):
        if key in PROFILE_BY_STEM:
            return PROFILE_BY_STEM[key]
    if doc_id:
        return PROFILE_BY_CODE.get(doc_id.upper())
    return None


def _filename_number(source_filename: Optional[str]) -> Optional[str]:
    stem = _source_stem(source_filename)
    match = re.match(r"(\d{1,6})", stem)
    return match.group(1) if match else None


def _notation_from_filename(source_filename: Optional[str], number: Optional[str]) -> Optional[str]:
    stem = _source_stem(source_filename)
    compact = re.sub(r"[^a-z0-9]+", "", stem)
    if not number:
        return None
    if "nqcp" in compact or "nq-cp" in stem:
        return "NQ-CP"
    if "ndcp" in compact or "nd-cp" in stem:
        return "2026/NĐ-CP"
    if "bct" in compact:
        return "2026/TT-BCT"
    if "tb" in stem or "tbvpcp" in compact:
        return "TB-VPCP"
    if "vpcpcn" in compact or stem.endswith("-cn"):
        return "VPCP-CN"
    if "cds" in compact or "cđs" in stem:
        return "TTg-CĐS"
    if "ttg" in compact or "qd" in compact:
        return "QĐ-TTg"
    return None


def _normalize_code_number(raw: str, filename_number: Optional[str] = None) -> Optional[str]:
    raw = str(raw or "")
    raw = raw.translate(str.maketrans({"I": "1", "l": "1", "|": "1", "†": "1", "O": "0"}))
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return filename_number
    if filename_number and filename_number != digits and len(digits) <= 4:
        return filename_number
    return digits


def _normalize_notation(raw: str) -> str:
    notation = _one_line(raw)
    notation = notation.strip(" .;:,/\\|()[]{}")
    notation = re.sub(r"\s+", "", notation)
    notation = notation.replace("–", "-").replace("—", "-").replace("Ð", "Đ")
    notation = notation.replace("QD", "QĐ").replace("QÐ", "QĐ")
    notation = notation.replace("ND", "NĐ").replace("NÐ", "NĐ")
    notation = re.sub(r"TTG$", "TTg", notation, flags=re.IGNORECASE)
    notation = re.sub(r"-TTG$", "-TTg", notation, flags=re.IGNORECASE)
    notation = re.sub(r"VPCP[-/]CN", "VPCP-CN", notation, flags=re.IGNORECASE)
    notation = re.sub(r"TTG[-/]C(?:Đ|D)S", "TTg-CĐS", notation, flags=re.IGNORECASE)
    notation = re.sub(r"TB[-/]VPCP", "TB-VPCP", notation, flags=re.IGNORECASE)
    notation = re.sub(r"NQ[-/]CP", "NQ-CP", notation, flags=re.IGNORECASE)
    notation = re.sub(r"NĐ[-/]CP", "NĐ-CP", notation, flags=re.IGNORECASE)
    notation = re.sub(r"QĐ[-/]TTg", "QĐ-TTg", notation, flags=re.IGNORECASE)
    notation = re.sub(r"TT[-/]BCT", "TT-BCT", notation, flags=re.IGNORECASE)
    return notation


def _looks_like_notation(notation: str) -> bool:
    up = _upper_no_accent(notation)
    return bool(
        re.match(r"^\d{4}/(TT|ND|NĐ)-[A-Z0-9]+$", up)
        or re.match(r"^(QD|QĐ|TB|NQ|ND|NĐ|CV|TTG)-[A-Z0-9ĐD]+$", up)
        or re.match(r"^VPCP-[A-Z0-9]+$", up)
    )


def _extract_document_code(text: str, source_filename: Optional[str], existing_data: Optional[Dict[str, Any]] = None) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    filename_number = _filename_number(source_filename)
    flat = _one_line(_remove_ocr_artifacts(text))
    patterns = [
        r"S(?:ố|o)\s*[:：]?\s*([0-9Il|†\s]{1,12})\s*/\s*([0-9]{4}\s*/\s*[A-Za-zĐđ0-9\-]{2,}|[A-Za-zĐđ0-9\-]{2,})",
        r"\b([0-9]{1,6})\s*/\s*([0-9]{4}\s*/\s*[A-Za-zĐđ0-9\-]{2,}|(?:Q[ĐD]|N[ĐD]|NQ|TB|TTg|TTG|VPCP|TTg-CĐS)[A-Za-zĐđ0-9\-]*)\b",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, flat, flags=re.IGNORECASE):
            number = _normalize_code_number(match.group(1), filename_number)
            notation = _normalize_notation(match.group(2))
            if number and _looks_like_notation(notation):
                return f"{number}/{notation}", number, notation

    # Existing upstream data can be useful only outside strict mode.  In strict
    # mode values must come from the current document text or source filename.
    if existing_data and not STRICT_NO_GUESS_MODE:
        for key in ("document_code", "docId"):
            doc_code = _safe_str(existing_data.get(key)).strip()
            if "/" in doc_code:
                left, right = doc_code.split("/", 1)
                number = _normalize_code_number(left, filename_number)
                notation = _normalize_notation(right)
                if number and _looks_like_notation(notation):
                    return f"{number}/{notation}", number, notation
        number = _safe_str(existing_data.get("document_number") or existing_data.get("codeNumber")).strip() or filename_number
        notation = _safe_str(existing_data.get("codeNotation")).strip() or _notation_from_filename(source_filename, number)
        if number and notation:
            notation = _normalize_notation(notation)
            return f"{number}/{notation}", number, notation

    notation = _notation_from_filename(source_filename, filename_number)
    if filename_number and notation:
        return f"{filename_number}/{notation}", filename_number, notation
    return None, filename_number, notation


def _doc_type_from_notation(notation: Optional[str], text: str) -> Optional[str]:
    up = _upper_no_accent(notation or "")
    if "TB" in up and "VPCP" in up:
        return "Thông báo"
    if "QD" in up or "QĐ" in (notation or ""):
        return "Quyết định"
    if "NQ" in up:
        return "Nghị quyết"
    if "ND" in up or "NĐ" in (notation or ""):
        return "Nghị định"
    if re.search(r"(^|/)\d{4}/TT", up) or "TT-BCT" in up:
        return "Thông tư"
    if "VPCP" in up or "TTG-CDS" in up or "TTG-CĐS" in (notation or ""):
        return "Công văn"
    for line in _all_lines(_first_page_text(text))[:80]:
        normalized = re.sub(r"[^A-Z ]", " ", _upper_no_accent(line))
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if normalized in DOC_TYPE_HEADINGS:
            return DOC_TYPE_HEADINGS[normalized]
    return None


def _organ_from_notation_and_header(notation: Optional[str], text: str) -> Optional[str]:
    up = _upper_no_accent(notation or "")
    if "VPCP" in up:
        return "Văn phòng Chính phủ"
    if "TTG" in up or "QD-TTG" in up or "TTG-CDS" in up:
        return "Thủ tướng Chính phủ"
    if "BCT" in up:
        return "Bộ Công Thương"
    if "CP" in up:
        return "Chính phủ"
    first_norm = _upper_no_accent("\n".join(_all_lines(_first_page_text(text))[:35]))
    for pattern, label in ORGAN_PATTERNS:
        if re.search(pattern, first_norm, flags=re.IGNORECASE):
            return label
    return None


def _date_line_is_legal_context(line: str) -> bool:
    upper = _upper_no_accent(line)
    return any(_upper_no_accent(marker) in upper for marker in LEGAL_BASIS_DATE_MARKERS)


def _date_line_is_noise(line: str) -> bool:
    upper = _upper_no_accent(line)
    return any(
        marker in upper
        for marker in (
            "CONG THONG TIN DIEN TU",
            "DEN GIO",
            "DEN NGAY",
            "KINH CHUYEN",
            "NGUOI KY",
            "THOI GIAN KY",
            "EMAIL",
            "OCR_TEXT",
            "TEXT_LAYER",
        )
    )


def _normalize_date_text(text: str) -> str:
    normalized = _apply_common_ocr_fixes(_one_line(text))
    normalized = re.sub(r"(ng[aà]y)\s*(\d)", r"\1 \2", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(th[aá]ng)\s*(\d)", r"\1 \2", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(n[aă]m)\s*(\d{4})", r"\1 \2", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"n\s*[aă]\s*m", "năm", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"n[aă]\s*(?=\d{4})", "năm ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(th[aá]ng\s+\d{1,2})\s*(n[aă]m)", r"\1 \2", normalized, flags=re.IGNORECASE)
    return normalized


def _date_from_parts(day: int, month: int, year: int) -> Optional[str]:
    if 1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100:
        return f"{day:02d}/{month:02d}/{year:04d}"
    return None


def _year_hint_from_existing(existing_value: Any) -> Optional[int]:
    if isinstance(existing_value, str):
        match = re.match(r"^\s*\d{1,2}[./-]\d{1,2}[./-](\d{4})\s*$", existing_value)
        if match:
            year = int(match.group(1))
            if 1900 <= year <= 2100:
                return year
    return None


def _year_hint_from_first_page(text: str) -> Optional[int]:
    first = _first_page_text(text)
    years = []
    for line in _all_lines(first)[:80]:
        if _date_line_is_noise(line):
            continue
        for match in re.finditer(r"\b(19\d{2}|20\d{2})\b", line):
            years.append(int(match.group(1)))
    # Prefer the most frequent plausible year in the header/top page. This
    # rescues cases where OCR keeps "ngày 28 tháng 4" but loses "năm 2026".
    if not years:
        return None
    counts = {year: years.count(year) for year in set(years)}
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]


def _extract_issued_date(text: str, existing_value: Any = None) -> Optional[str]:
    """Extract the promulgation date, preferring the official place/date line.

    V4 fixes cases where OCR joins words/digits ("ngày28", "tháng4", "nă2026"),
    ignores arrival stamps/digital-signature timestamps, and can infer a missing
    year from a validated existing value or the dominant first-page year.
    """
    first_lines = _all_lines(_first_page_text(text))[:120]
    if not first_lines:
        first_lines = _all_lines(text)[:120]

    candidates: List[Tuple[int, str]] = []
    place_pattern = re.compile(
        r"\b(H[aà]\s*N[ộo]i|TP\.?\s*H[ồo]\s*Ch[ií]\s*Minh|Th[aà]nh\s*ph[ốo]\s*H[ồo]\s*Ch[ií]\s*Minh|Đ[aà]\s*N[ẵa]ng|C[aầ]n\s*Th[ơo]|H[uư][ếe])\b",
        flags=re.IGNORECASE,
    )

    for idx, raw_line in enumerate(first_lines):
        if not raw_line or _date_line_is_noise(raw_line):
            continue
        line = _normalize_date_text(raw_line)
        if _date_line_is_legal_context(line):
            continue
        if not re.search(r"ng[aà]y|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}", line, flags=re.IGNORECASE):
            continue
        # Prefer the official place/date line.  Lines without a place are accepted
        # only very near the header, otherwise they are likely legal-basis dates.
        has_place = bool(place_pattern.search(line))
        if not has_place and idx > 28:
            continue
        priority = idx + (0 if has_place else 75)
        candidates.append((priority, line))

    flat = _normalize_date_text(_remove_ocr_artifacts(_first_page_text(text)))
    if flat and not _date_line_is_noise(flat):
        # Flat fallback is intentionally low priority and must still contain a
        # place/date phrase; otherwise legal basis dates can be picked by mistake.
        place_match = place_pattern.search(flat)
        if place_match:
            start = max(0, place_match.start() - 20)
            end = min(len(flat), place_match.end() + 90)
            candidates.append((999, flat[start:end]))

    year_hint = _year_hint_from_existing(existing_value) or _year_hint_from_first_page(text)
    date_patterns = [
        r"ng[aà]y\s+(\d{1,2})\s+th[aá]ng\s+(\d{1,2})\s+n[aă]m\s+(\d{4})",
        r"ng[aà]y\s+(\d{1,2})\s+th[aá]ng\s+(\d{1,2})(?!\s+n[aă]m)",
        r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b",
    ]
    for _priority, candidate in sorted(candidates, key=lambda item: item[0]):
        for pattern in date_patterns:
            match = re.search(pattern, candidate, flags=re.IGNORECASE)
            if not match:
                continue
            groups = match.groups()
            if len(groups) == 3:
                day, month, year = map(int, groups)
            else:
                if not year_hint:
                    continue
                day, month = map(int, groups)
                year = year_hint
            parsed = _date_from_parts(day, month, year)
            if parsed:
                return parsed

    # Last-resort: accept a validated existing date only after OCR candidates fail.
    if isinstance(existing_value, str) and re.match(r"^\d{2}/\d{2}/\d{4}$", existing_value.strip()):
        return existing_value.strip()
    return None

# ---------------------------------------------------------------------------
# Subject/description extraction
# ---------------------------------------------------------------------------


def _clean_title_piece(line: str) -> Optional[str]:
    if _line_is_noise(line):
        return None
    piece = sanitize_human_text(line, max_chars=LONG_TEXT_MAX_CHARS)
    if not piece:
        return None
    # Cut garbage before the first meaningful title anchor if present.
    lowered = piece.lower()
    anchor_positions = [lowered.find(anchor.lower()) for anchor in TITLE_START_WORDS if anchor.lower() in lowered]
    anchor_positions = [p for p in anchor_positions if p >= 0]
    if anchor_positions:
        start = min(anchor_positions)
        prefix = piece[:start]
        if start > 0 and (len(prefix) < 30 or re.search(r"[<>|\\{}\[\]`^~§¤�*_=]", prefix)):
            piece = piece[start:]
    if _looks_corrupt(piece):
        return None
    return piece


def _line_is_doc_heading(line: str, doc_type: Optional[str]) -> bool:
    normalized = re.sub(r"[^A-Z ]", " ", _upper_no_accent(line))
    normalized = re.sub(r"\s+", " ", normalized).strip()
    expected = _upper_no_accent(doc_type or "")
    if expected and normalized == expected:
        return True
    return normalized in DOC_TYPE_HEADINGS


def _normalize_subject(subject: Optional[str]) -> Optional[str]:
    subject = sanitize_human_text(subject, max_chars=LONG_TEXT_MAX_CHARS)
    if not subject:
        return None
    subject = re.sub(r"\s+([,.;:])", r"\1", subject)
    subject = re.sub(r"\s{2,}", " ", subject)
    # Fix repeated prefix after generic description/LLM merge.
    subject = re.sub(r"^(Quyết định|Nghị định|Nghị quyết|Thông tư|Thông báo|Công văn)\s+về\s+", "", subject, flags=re.IGNORECASE)
    subject = subject.strip(" .;:-")
    if _looks_corrupt(subject):
        return None
    if len(subject) > 15:
        return subject[0].upper() + subject[1:]
    return subject


def _extract_subject_after_heading(lines: List[str], doc_type: Optional[str]) -> Optional[str]:
    for idx, line in enumerate(lines[:120]):
        if not _line_is_doc_heading(line, doc_type):
            continue
        buffer: List[str] = []
        for candidate in lines[idx + 1 : idx + 12]:
            if _title_stop_line(candidate):
                break
            # Avoid taking the issuing authority line after the document type.
            upper = _upper_no_accent(candidate).strip()
            if upper in {"THU TUONG CHINH PHU", "CHINH PHU", "BO CONG THUONG", "VAN PHONG CHINH PHU"}:
                break
            piece = _clean_title_piece(candidate)
            if not piece:
                continue
            buffer.append(piece)
            if len(" ".join(buffer)) > LONG_TEXT_MAX_CHARS:
                break
        subject = _normalize_subject(" ".join(buffer))
        if subject:
            return subject
    return None


def _extract_subject_from_vv(lines: List[str]) -> Optional[str]:
    for idx, line in enumerate(lines[:60]):
        if not re.search(r"\bV\s*/\s*v\b|\bV/v\b", line, flags=re.IGNORECASE):
            continue
        buffer: List[str] = []
        for offset, candidate in enumerate(lines[idx : idx + 8]):
            if offset > 0 and _title_stop_line(candidate):
                break
            upper = _upper_no_accent(candidate)
            if "KINH GUI" in upper or "KÍNH GỬI" in candidate.upper():
                break
            piece = _clean_title_piece(candidate)
            if piece:
                buffer.append(piece)
        subject = _normalize_subject(" ".join(buffer))
        if subject:
            return subject
    return None


def _extract_subject_by_start(lines: List[str]) -> Optional[str]:
    starts = tuple(_upper_no_accent(x) for x in TITLE_START_WORDS)
    for idx, line in enumerate(lines[:140]):
        piece = _clean_title_piece(line)
        if not piece:
            continue
        upper = _upper_no_accent(piece)
        if not upper.startswith(starts):
            continue
        buffer = [piece]
        for candidate in lines[idx + 1 : idx + 8]:
            if _title_stop_line(candidate):
                break
            next_piece = _clean_title_piece(candidate)
            if next_piece:
                buffer.append(next_piece)
        subject = _normalize_subject(" ".join(buffer))
        if subject:
            return subject
    return None


def _extract_subject_from_article1(lines: List[str]) -> Optional[str]:
    for idx, line in enumerate(lines[:180]):
        if not re.match(r"^\s*(Điều|Dieu)\s+1\s*[\.:]", line, flags=re.IGNORECASE):
            continue
        first = re.sub(r"^\s*(Điều|Dieu)\s+1\s*[\.:]?\s*", "", line, flags=re.IGNORECASE)
        buffer = []
        for candidate in [first] + lines[idx + 1 : idx + 4]:
            if _title_stop_line(candidate) or re.match(r"^\s*(Ông|Bà|Căn cứ|Theo đề nghị)\b", candidate, flags=re.IGNORECASE):
                break
            piece = _clean_title_piece(candidate)
            if piece:
                buffer.append(piece)
        subject = _normalize_subject(" ".join(buffer))
        if subject:
            if subject.lower().startswith(("phê duyệt", "ban hành", "thành lập", "bổ nhiệm", "kiện toàn", "thay đổi")):
                return subject
        return None
    return None


def _extract_subject(text: str, doc_type: Optional[str], existing: Any = None) -> Optional[str]:
    first_lines = [ln for ln in _all_lines(_first_page_text(text)) if not _line_is_noise(ln)]
    for extractor in (_extract_subject_from_vv, lambda lines: _extract_subject_after_heading(lines, doc_type), _extract_subject_by_start, _extract_subject_from_article1):
        subject = extractor(first_lines)
        if subject:
            return subject
    # In strict mode, do not reuse an upstream/LLM subject unless it was found
    # again in the document text by one of the deterministic extractors above.
    if not STRICT_NO_GUESS_MODE and isinstance(existing, str):
        subject = _normalize_subject(existing)
        if subject:
            return subject
    return None


def _extract_effective_date(text: str) -> Optional[str]:
    clean = _apply_common_ocr_fixes(_one_line(_remove_ocr_artifacts(text)))
    match = re.search(r"có hiệu lực(?: thi hành)?\s+kể\s+từ\s+ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})", clean, flags=re.IGNORECASE)
    if match:
        d, m, y = map(int, match.groups())
        return f"{d:02d}/{m:02d}/{y:04d}"
    if re.search(r"có hiệu lực(?: thi hành)?\s+kể\s+từ\s+ngày\s+ký", clean, flags=re.IGNORECASE):
        return "ngày ký"
    match = re.search(r"hết hiệu lực\s+kể\s+từ\s+ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})", clean, flags=re.IGNORECASE)
    if match:
        d, m, y = map(int, match.groups())
        return f"{d:02d}/{m:02d}/{y:04d}"
    return None


def _build_description(doc_type: Optional[str], subject: Optional[str], text: str, profile: Optional[AdminDocProfile] = None) -> Optional[str]:
    if profile and profile.description:
        return profile.description
    subject = _normalize_subject(subject)
    if not subject:
        return None
    doc_type = doc_type or "Văn bản"
    lower = subject[:1].lower() + subject[1:]
    # Avoid awkward "về về việc".
    if lower.startswith("về ") or lower.startswith("v/v"):
        desc = f"{doc_type} {lower}."
    elif lower.startswith(("ban hành", "phê duyệt", "sửa đổi", "bổ sung", "quy định", "thành lập", "bãi bỏ", "kết luận", "chấm dứt")):
        desc = f"{doc_type} {lower}."
    else:
        desc = f"{doc_type} về {lower}."
    effective = _extract_effective_date(text)
    if effective and effective not in desc:
        desc = desc.rstrip(".") + f"; hiệu lực từ {effective}."
    return sanitize_human_text(desc, max_chars=700)


# ---------------------------------------------------------------------------
# Signature / keyword / final metadata
# ---------------------------------------------------------------------------


def _extract_signer_name(text: str, existing: Any = None) -> Optional[str]:
    if isinstance(existing, str):
        existing_clean = _normalize_signer_name(existing)
        if existing_clean:
            return existing_clean
    last_norm = _upper_no_accent(_last_page_text(text))
    for no_accent, name in KNOWN_SIGNERS.items():
        if no_accent in last_norm:
            return name
    # Last resort: find Vietnamese-name-like line near the signature block.
    lines = list(reversed(_all_lines(_last_page_text(text))))[:80]
    for line in lines:
        if _line_is_noise(line):
            continue
        candidate = sanitize_human_text(line, max_chars=80)
        if not candidate:
            continue
        if any(x in _upper_no_accent(candidate) for x in ["CHINH PHU", "THU TUONG", "BO TRUONG", "NOI NHAN", "LUU:"]):
            continue
        match = re.search(r"([A-ZĐÀ-Ỹ][a-zà-ỹđ]+(?:\s+[A-ZĐÀ-Ỹ][a-zà-ỹđ]+){1,4})", candidate)
        if match:
            name = _normalize_signer_name(match.group(1))
            if name:
                return name
    return None


def _normalize_signer_name(name: str) -> Optional[str]:
    cleaned = sanitize_human_text(name, max_chars=80)
    if not cleaned:
        return None
    upper = _upper_no_accent(cleaned)
    for no_accent, fixed in KNOWN_SIGNERS.items():
        if no_accent in upper:
            return fixed
    if any(token in upper for token in ["CHINH PHU", "VAN PHONG", "BO TRUONG", "NOI NHAN", "CONG THONG TIN", "VIET NAM"]):
        return None
    words = cleaned.split()
    if 2 <= len(words) <= 5:
        return cleaned
    return None


def _extract_signer_title(text: str, organ_name: Optional[str], signer_name: Optional[str], existing: Any = None) -> Optional[str]:
    existing_clean = sanitize_human_text(existing, max_chars=100) if isinstance(existing, str) else None
    if existing_clean and existing_clean not in {"Thủ tướng", "Bộ trưởng"}:
        return existing_clean
    if signer_name in {"Nguyễn Sinh Nhật Tân", "Trương Thanh Hoài"}:
        return "Thứ trưởng"
    if signer_name in {"Đỗ Ngọc Huỳnh", "Phạm Mạnh Cường"}:
        return "Phó Chủ nhiệm"
    if signer_name in {"Phạm Gia Túc", "Lê Tiến Châu", "Phạm Thị Thanh Trà", "Nguyễn Văn Thắng", "Hồ Quốc Dũng"}:
        return "Phó Thủ tướng"
    if signer_name == "Lê Minh Hưng":
        return "Thủ tướng"
    last = _upper_no_accent(_last_page_text(text))
    if "PHO THU TUONG" in last or "KT. THU TUONG" in last:
        return "Phó Thủ tướng"
    if "THU TUONG" in last and "PHO THU TUONG" not in last:
        return "Thủ tướng"
    if "PHO CHU NHIEM" in last:
        return "Phó Chủ nhiệm"
    if "THU TRUONG" in last:
        return "Thứ trưởng"
    if "BO TRUONG" in last and "CHU NHIEM" in last:
        return "Bộ trưởng, Chủ nhiệm"
    if "BO TRUONG" in last:
        return "Bộ trưởng"
    return existing_clean


def _build_infor_sign(signer_title: Optional[str], signer_name: Optional[str], digital_time: Optional[str] = None) -> Optional[str]:
    parts: List[str] = []
    if signer_title == "Phó Thủ tướng":
        prefix = "Ký thay Thủ tướng"
        parts.append(f"{prefix}: {signer_title} {signer_name}" if signer_name else f"{prefix}: {signer_title}")
    elif signer_title == "Thứ trưởng":
        prefix = "Ký thay Bộ trưởng"
        parts.append(f"{prefix}: {signer_title} {signer_name}" if signer_name else f"{prefix}: {signer_title}")
    elif signer_title == "Phó Chủ nhiệm":
        prefix = "Ký thay Bộ trưởng, Chủ nhiệm"
        parts.append(f"{prefix}: {signer_title} {signer_name}" if signer_name else f"{prefix}: {signer_title}")
    elif signer_title and signer_name:
        parts.append(f"{signer_title} {signer_name}")
    elif signer_name:
        parts.append(signer_name)
    if digital_time:
        parts.append(f"chữ ký số lúc {digital_time}")
    return "; ".join(parts) if parts else None


def _build_autograph(signer_name: Optional[str], has_signature: bool = True) -> Optional[str]:
    if signer_name:
        return f"{SIGNED_AUTOGRAPH_PREFIX}: {signer_name}"
    if has_signature:
        return SIGNED_AUTOGRAPH_PREFIX
    return None


def _extract_arc_doc_code(text: str, existing: Any = None) -> Optional[str]:
    if isinstance(existing, str) and existing.strip() and existing.strip() != NOT_SHOWN:
        value = sanitize_human_text(existing, max_chars=120)
        if value and not _looks_corrupt(value):
            return value if value.lower().startswith("lưu:") else f"Lưu: {value}"
    for line in reversed(_all_lines(_last_page_text(text))):
        if not re.search(r"\bL(?:ưu|uu|uru)\s*:", line, flags=re.IGNORECASE):
            continue
        value = re.split(r"L(?:ưu|uu|uru)\s*:", line, maxsplit=1, flags=re.IGNORECASE)
        tail = value[1] if len(value) > 1 else line
        tail = re.sub(r"\s+(\d{1,3})\s*$", "", tail)
        tail = sanitize_human_text(tail, max_chars=120)
        if tail and not _looks_corrupt(tail):
            return f"Lưu: {tail}"
    return None


def _extract_digital_signature_time(text: str) -> Optional[str]:
    match = re.search(
        r"Thời\s*gian\s*ký\s*[:：]\s*(\d{1,2})[./](\d{1,2})[./](\d{4})\s+(\d{1,2}:\d{2}:\d{2})\s*([+\-]\d{2}:?\d{2})?",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    d, m, y, t, tz = match.groups()
    timezone = tz or ""
    if timezone and re.match(r"[+\-]\d{4}$", timezone):
        timezone = timezone[:3] + ":" + timezone[3:]
    return f"{int(d):02d}/{int(m):02d}/{y} {t}{(' ' + timezone) if timezone else ''}".strip()


def _has_signature_signal(text: str, signer_name: Optional[str]) -> bool:
    upper = _upper_no_accent(text)
    return bool(signer_name or "THOI GIAN KY" in upper or "KT. THU TUONG" in upper or "TM. CHINH PHU" in upper or "CONG THONG TIN" in upper)


def _build_keywords(doc_type: Optional[str], organ_name: Optional[str], subject: Optional[str], profile: Optional[AdminDocProfile] = None) -> Optional[str]:
    candidates: List[str] = []
    if doc_type:
        candidates.append(doc_type)
    if organ_name:
        candidates.append(organ_name)
    if profile:
        candidates.extend(profile.keywords)
    if subject:
        important_phrases = [
            r"Luật [A-ZĐÀ-Ỹa-zà-ỹđ\s]+",
            r"Nghị quyết số \d+/\d+/QH\d+",
            r"Quyết định số \d+/QĐ-TTg",
            r"Nghị định số \d+/\d+/NĐ-CP",
            r"Thông tư số \d+/\d+/TT-[A-ZĐ]+",
            r"Ủy ban [A-ZĐÀ-Ỹa-zà-ỹđ\s]+",
            r"Vườn quốc gia [A-ZĐÀ-Ỹa-zà-ỹđ\s]+",
            r"Ngân hàng [A-ZĐÀ-Ỹa-zà-ỹđ\s]+",
        ]
        for pattern in important_phrases:
            for match in re.finditer(pattern, subject):
                candidates.append(match.group(0))
        for token in re.findall(r"[A-Za-zÀ-Ỹà-ỹĐđ0-9/\-]{4,}", subject):
            if _upper_no_accent(token) in {"CONG", "CHINH", "PHU", "NGAY", "THANG", "NAM", "VIEC", "CUA", "THEO", "QUYET", "DINH", "NGHI", "LUAT"}:
                continue
            candidates.append(token)
            if len(candidates) >= 12:
                break
    unique: List[str] = []
    seen = set()
    for item in candidates:
        item = sanitize_human_text(item, max_chars=120)
        if not item or _looks_corrupt(item):
            continue
        key = _upper_no_accent(item)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return "; ".join(unique[:12]) if unique else None


def _format_from_extension(extension: str) -> str:
    ext = (extension or "").lower().lstrip(".")
    return ext.upper() if ext else "PDF"


def _value_or_none(value: Any) -> Optional[Any]:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        return cleaned
    if value == []:
        return None
    return value


def _final_scrub(value: Any, key: str) -> Any:
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    # Dates/codes use exact formats.
    if key in {"issuedDate", "codeNumber", "numberOfPage"}:
        return value.strip()
    if key in {"subject", "description"}:
        max_len = LONG_TEXT_MAX_CHARS
    elif key == "keyword":
        max_len = 1200
    else:
        max_len = 300
    cleaned = sanitize_human_text(value, max_chars=max_len)
    if cleaned is None:
        return None
    if key in {"subject", "description", "keyword"} and _looks_corrupt(cleaned):
        return None
    if key == "description" and cleaned and not cleaned.endswith((".", "!", "?")):
        cleaned += "."
    return cleaned


def _apply_profile_to_values(profile: AdminDocProfile, values: Dict[str, Any]) -> Dict[str, Any]:
    values.update(
        {
            # docId is set by _source_doc_id in V4; the official code is kept in document_code.
            "typeName": profile.type_name,
            "codeNumber": profile.code_number,
            "codeNotation": profile.code_notation,
            "issuedDate": profile.issued_date,
            "organName": profile.organ_name,
            "subject": profile.subject,
            "arcDocCode": profile.arc_doc_code,
        }
    )
    if profile.signer_name:
        values["signer_name"] = profile.signer_name
    if profile.signer_title:
        values["signer_title"] = profile.signer_title
    return values


def _missing_public_keys(values: Dict[str, Any]) -> List[str]:
    missing: List[str] = []
    for key in METADATA_22_KEYS:
        value = values.get(key)
        if value in (None, "", []):
            missing.append(key)
    return missing


def _fill_missing_public_values(values: Dict[str, Any], missing: Iterable[str]) -> None:
    for key in missing:
        # Keep docId as filename/source id if possible; all other empty public
        # fields are explicit, not blank and not guessed.
        if key == "docId" and values.get("docId"):
            continue
        values[key] = MISSING_PUBLIC_VALUE


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def enrich_vn_admin_metadata_22(
    data: Dict[str, Any],
    document_text: str,
    extraction_method: str,
    page_count: Optional[int],
    extension: str,
    source_filename: Optional[str] = None,
) -> Dict[str, Any]:
    enriched = dict(data or {})

    extracted_doc_id, code_number, code_notation = _extract_document_code(document_text, source_filename, enriched)
    profile = _profile_from_source(source_filename, extracted_doc_id)

    if profile:
        code_number = profile.code_number
        code_notation = profile.code_notation
        extracted_doc_id = profile.doc_id

    existing_doc_type = None if STRICT_NO_GUESS_MODE else (_value_or_none(enriched.get("document_type")) or _value_or_none(enriched.get("typeName")))
    existing_organ_name = None if STRICT_NO_GUESS_MODE else (_value_or_none(enriched.get("issuing_authority")) or _value_or_none(enriched.get("organName")))
    doc_type = (profile.type_name if profile else None) or _doc_type_from_notation(code_notation, document_text) or existing_doc_type
    organ_name = (profile.organ_name if profile else None) or _organ_from_notation_and_header(code_notation, document_text) or existing_organ_name
    existing_date_hint = None if STRICT_NO_GUESS_MODE else (enriched.get("issued_date") or enriched.get("issuedDate"))
    issued_date = (profile.issued_date if profile else None) or _extract_issued_date(document_text, existing_date_hint)
    subject = (profile.subject if profile else None) or _extract_subject(document_text, doc_type, enriched.get("subject") or enriched.get("summary") or enriched.get("title"))
    subject = _normalize_subject(subject)

    existing_signer_name = None if STRICT_NO_GUESS_MODE else enriched.get("signer_name")
    existing_signer_title = None if STRICT_NO_GUESS_MODE else enriched.get("signer_title")
    signer_name = (profile.signer_name if profile else None) or _extract_signer_name(document_text, existing_signer_name)
    signer_title = (profile.signer_title if profile else None) or _extract_signer_title(document_text, organ_name, signer_name, existing_signer_title)
    digital_time = _extract_digital_signature_time(document_text)
    infor_sign = _build_infor_sign(signer_title, signer_name, digital_time)
    autograph = _build_autograph(signer_name, _has_signature_signal(document_text, signer_name))
    existing_arc_doc_code = None if STRICT_NO_GUESS_MODE else enriched.get("arcDocCode")
    arc_doc_code = (profile.arc_doc_code if profile else None) or _extract_arc_doc_code(document_text, existing_arc_doc_code)
    description = _build_description(doc_type, subject, document_text, profile)
    keyword = _build_keywords(doc_type, organ_name, subject, profile)

    values: Dict[str, Any] = {
        "docId": _source_doc_id(source_filename, extracted_doc_id) or _value_or_none(enriched.get("docId")) or source_filename,
        "arcDocCode": arc_doc_code or NOT_SHOWN,
        "maintenance": NOT_SHOWN,
        "typeName": doc_type,
        "codeNumber": code_number or _value_or_none(enriched.get("codeNumber")),
        "codeNotation": code_notation or _value_or_none(enriched.get("codeNotation")),
        "issuedDate": issued_date,
        "organName": organ_name,
        "subject": subject,
        "language": VI_LANGUAGE,
        "numberOfPage": page_count or _value_or_none(enriched.get("numberOfPage")) or _value_or_none(enriched.get("page_count")),
        "inforSign": infor_sign,
        "keyword": keyword,
        "mode": PUBLIC_MODE,
        "confidenceLevel": CONFIDENCE_PROFILE if profile else (CONFIDENCE_STRICT if subject and extracted_doc_id and issued_date else CONFIDENCE_REVIEW),
        "autograph": autograph,
        "format": _format_from_extension(extension),
        "process": SIGNED_PROCESS if _has_signature_signal(document_text, signer_name) else OCR_PROCESS,
        "riskRecovery": NOT_SHOWN,
        "riskRecoveryStatus": NOT_SHOWN,
        "description": description,
        "isCan": NOT_SHOWN,
    }

    if profile:
        values = _apply_profile_to_values(profile, values)
        values["description"] = profile.description or values.get("description")
        values["keyword"] = _build_keywords(profile.type_name, profile.organ_name, profile.subject, profile)
        values["inforSign"] = _build_infor_sign(profile.signer_title, profile.signer_name, digital_time)
        values["autograph"] = _build_autograph(profile.signer_name, True)
        values["docId"] = _source_doc_id(source_filename, profile.doc_id) or values.get("docId")

    values["document_code"] = extracted_doc_id

    # Scrub every public display field one last time so OCR artifacts cannot leak
    # into Excel.  This intentionally blanks low-quality long text instead of
    # showing misspelled/noisy text.
    for key in list(values.keys()):
        values[key] = _final_scrub(values[key], key)

    # Public Excel fields must be visibly complete but never guessed.  If a
    # field is not clearly present, export a standard phrase and keep the field
    # name in missing_fields/quality_flags for review.
    strict_missing = _missing_public_keys(values)
    _fill_missing_public_values(values, strict_missing)

    enriched.update(values)

    # Keep backward-compatible generic fields.
    enriched["document_type"] = enriched.get("typeName")
    enriched["document_number"] = enriched.get("codeNumber")
    enriched["document_code"] = extracted_doc_id or enriched.get("document_code") or enriched.get("docId")
    enriched["codeNotation"] = enriched.get("codeNotation")
    enriched["issuing_authority"] = enriched.get("organName")
    enriched["issued_date"] = enriched.get("issuedDate")
    enriched["summary"] = enriched.get("subject")
    enriched["title"] = enriched.get("subject")
    enriched["signer_name"] = signer_name
    enriched["signer_title"] = signer_title
    enriched["page_count"] = page_count or enriched.get("page_count")

    missing = strict_missing
    enriched["missing_fields"] = missing
    enriched["quality_flags"] = {
        "used_verified_profile": bool(profile),
        "strict_no_guess_mode": STRICT_NO_GUESS_MODE,
        "missing_value_text": MISSING_PUBLIC_VALUE,
        "long_text_policy": "Không xuất subject/description nếu OCR không đạt ngưỡng sạch tiếng Việt; trường nghi ngờ được ghi Không thể hiện trong văn bản.",
        "missing_fields": missing,
    }
    try:
        enriched["confidence"] = 0.97 if profile else (0.86 if not missing else 0.65)
    except Exception:
        enriched["confidence"] = 0.65

    return enriched
