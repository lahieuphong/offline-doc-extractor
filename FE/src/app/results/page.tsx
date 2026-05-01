"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/api";
import {
  loadReviewResultPayloadFromIdb,
  parseReviewResultIdbMarker,
  removeReviewResultPayloadFromIdb,
} from "@/lib/scannerTransferStore";
import SharedBottomBar from "@/components/common/SharedBottomBar";

type ResultItem = Record<string, unknown>;

type ResultPayload = {
  batch_id?: string;
  results?: ResultItem[];
};
const RESULT_PAGE_SIZE = 25;

const METADATA_FIELDS: Array<{ key: string; label: string }> = [
  { key: "docId", label: "Mã tài liệu" },
  { key: "arcDocCode", label: "Mã hồ sơ tài liệu" },
  { key: "maintenance", label: "Chế độ bảo trì/lưu trữ" },
  { key: "typeName", label: "Loại văn bản" },
  { key: "codeNumber", label: "Số văn bản" },
  { key: "codeNotation", label: "Ký hiệu văn bản" },
  { key: "issuedDate", label: "Ngày ban hành" },
  { key: "organName", label: "Cơ quan ban hành" },
  { key: "subject", label: "Trích yếu nội dung" },
  { key: "language", label: "Ngôn ngữ" },
  { key: "numberOfPage", label: "Số trang" },
  { key: "inforSign", label: "Thông tin ký" },
  { key: "keyword", label: "Từ khóa" },
  { key: "mode", label: "Chế độ xử lý" },
  { key: "confidenceLevel", label: "Mức độ tin cậy" },
  { key: "autograph", label: "Chữ ký/khối ký" },
  { key: "format", label: "Định dạng tệp" },
  { key: "process", label: "Quy trình xử lý" },
  { key: "riskRecovery", label: "Rủi ro khôi phục" },
  { key: "riskRecoveryStatus", label: "Trạng thái rủi ro khôi phục" },
  { key: "description", label: "Mô tả" },
  { key: "isCan", label: "Cờ kiểm tra" },
];

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stripTrailingArtifacts(text: string): string {
  return text
    .replace(/\s*[_-]{1,}\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatLongVietnameseText(text: string): string {
  if (!text) return "";

  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/;\s+/g, ";\n")
    .replace(/\.\s+(?=[A-ZÀ-Ỹa-zà-ỹ0-9])/g, ".\n")
    .replace(/\s+-\s+/g, "\n- ")
    .replace(/\s+([a-z]\))/g, "\n$1");

  // Giữ nguyên các cụm đánh số/mục lục trên cùng dòng với nội dung theo dạng tổng quát:
  // 1. ..., 10. ..., 1.1 ..., 1) ..., a) ..., I. ...
  const mergedMarkers = normalized
    .replace(/(\b\d+(?:\.\d+)*)\.\n(?=\S)/g, "$1. ")
    .replace(/(\b\d+)\)\n(?=\S)/g, "$1) ")
    .replace(/\b([A-Za-zÀ-Ỹà-ỹ])\)\n(?=\S)/g, "$1) ")
    .replace(/\b([IVXLCDM]+)\.\n(?=\S)/g, "$1. ");

  // Tách các đầu mục ra dòng riêng theo kiểu văn bản hành chính:
  // ...: 1. ... -> ...:\n1. ...
  // ...; 2. ... -> ...;\n2. ...
  // hỗ trợ cả 1., 1.1, 2), a), I.
  return mergedMarkers
    .replace(/([:;])\s+((?:\d+(?:\.\d+)*\.|\d+\)|[A-Za-zÀ-Ỹà-ỹ]\)|[IVXLCDM]+\.))\s+/g, "$1\n$2 ")
    .replace(/([^\n])\s+((?:\d+(?:\.\d+)*\.|\d+\)|[A-Za-zÀ-Ỹà-ỹ]\)|[IVXLCDM]+\.))\s+(?=[A-ZÀ-Ỹa-zà-ỹ])/g, "$1\n$2 ")
    .replace(/(^|[\s(])(Điều|Khoản|Mục|Chương)\s*\n\s*(\d+(?:\.\d+)*[\.\)]?)/gim, "$1$2 $3")
    .trim();
}

function formatSignatureText(text: string): string {
  if (!text) return "";

  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*/g, ";\n")
    .replace(/\s+-\s+/g, "\n- ")
    .replace(/\b(TM\.|KT\.|PHÓ THỦ TƯỚNG|THỦ TƯỚNG|BỘ TRƯỞNG|CHỦ TỊCH)\b/g, "\n$1")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const signatureKeywords = [
    "TM.",
    "KT.",
    "THỦ TƯỚNG",
    "PHÓ THỦ TƯỚNG",
    "BỘ TRƯỞNG",
    "CHỦ TỊCH",
    "PHÓ CHỦ TỊCH",
    "THỨ TRƯỞNG",
    "GIÁM ĐỐC",
  ];

  function looksLikeGarbage(line: string): boolean {
    const noSpace = line.replace(/\s/g, "");
    if (noSpace.length <= 2) return true;
    if (/[_=*<>~`|]/.test(line)) return true;
    const alpha = (line.match(/[A-Za-zÀ-Ỹà-ỹ]/g) ?? []).length;
    const digitsAndSymbols = (line.match(/[^A-Za-zÀ-Ỹà-ỹ\s]/g) ?? []).length;
    return alpha > 0 && digitsAndSymbols > alpha;
  }

  const meaningful = lines.filter((line) => {
    const upper = line.toUpperCase();
    const hasKeyword = signatureKeywords.some((keyword) => upper.includes(keyword));
    if (hasKeyword) return true;
    if (line.startsWith("-")) return false;
    return !looksLikeGarbage(line) && line.length <= 60;
  });

  const deduped = meaningful.filter((line, idx) => meaningful.indexOf(line) === idx);

  const preferred = deduped.filter((line) =>
    signatureKeywords.some((keyword) => line.toUpperCase().includes(keyword)),
  );

  const finalLines = (preferred.length ? preferred : deduped).slice(0, 4);
  if (finalLines.length > 0) return finalLines.join("\n");

  return lines.filter((line) => !looksLikeGarbage(line)).slice(0, 2).join("\n");
}

function getDisplayValue(item: ResultItem, key: string): string {
  if (key === "docId") {
    const sourceFilename = formatCellValue(item.source_filename);
    if (sourceFilename) return stripTrailingArtifacts(sourceFilename);

    const raw = formatCellValue(item.docId);
    if (!raw) return "";
    const parts = raw.split(":");
    return stripTrailingArtifacts(parts.length > 1 ? parts[parts.length - 1] : raw);
  }

  if (key === "mode") {
    const rawMode = formatCellValue(item.mode);
    const modeMap: Record<string, string> = {
      ollama_local_llm: "Bóc tách bằng AI nội bộ (Ollama)",
      rule_based: "Bóc tách theo luật (rule-based)",
      rule_based_fallback_after_llm_error: "AI lỗi, chuyển sang bóc tách theo luật",
      failed: "Xử lý thất bại",
    };
    return stripTrailingArtifacts(modeMap[rawMode] ?? rawMode);
  }

  if (key === "description") {
    const rawDescription = formatCellValue(item.description);
    const descriptionMap: Record<string, string> = {
      "Extracted by local rule-based fallback for Vietnamese legal/administrative documents.":
        "Dữ liệu được bóc tách bằng phương pháp dự phòng theo luật cho văn bản pháp lý/hành chính tiếng Việt.",
    };
    return stripTrailingArtifacts(descriptionMap[rawDescription] ?? rawDescription);
  }

  const plainText = stripTrailingArtifacts(formatCellValue(item[key]));
  if (key === "subject" || key === "description") {
    return formatLongVietnameseText(plainText);
  }
  if (key === "inforSign" || key === "autograph") {
    return formatSignatureText(plainText);
  }

  return plainText;
}

const styles = {
  page: {
    height: "100vh",
    background: "#f3f4f6",
    color: "#354052",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: "16px",
    padding: "20px 16px 84px",
    overflow: "hidden",
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
  },
  title: {
    margin: 0,
    fontSize: "28px",
    fontWeight: 700,
    color: "#1f2937",
    background: "transparent",
    borderRadius: 0,
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    textAlign: "center",
  },
  titlePath: {
    fontSize: "15px",
    fontWeight: 500,
    opacity: 0.8,
  },
  pathIcon: {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#111827",
  },
  panel: {
    background: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    padding: "12px",
    overflowY: "auto",
    overflowX: "hidden",
    minHeight: 0,
  },
  fileTitle: {
    margin: "0 0 10px",
    fontSize: "16px",
    fontWeight: 700,
    color: "#ffffff",
    background: "#0b3a8e",
    borderRadius: 0,
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    textAlign: "center",
  },
  fileTitlePath: {
    opacity: 0.95,
    fontWeight: 500,
    fontSize: "14px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "48vw",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#fff",
    tableLayout: "fixed",
  },
  colMeta: {
    width: "33.33%",
  },
  colValue: {
    width: "66.67%",
  },
  th: {
    border: "1px solid #d7deea",
    background: "#f8fafc",
    color: "#334155",
    textAlign: "left",
    padding: "10px 12px",
    fontSize: "14px",
  },
  td: {
    border: "1px solid #d7deea",
    color: "#1f2937",
    padding: "10px 12px",
    fontSize: "14px",
    verticalAlign: "top",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  noData: {
    fontSize: "15px",
    color: "#64748b",
    padding: "10px",
  },
  toast: {
    position: "fixed",
    right: "16px",
    top: "16px",
    zIndex: 60,
    background: "#edf3ff",
    color: "#2b56d4",
    borderRadius: "999px",
    padding: "12px 22px",
    fontSize: "18px",
    fontWeight: 700,
    boxShadow: "0 12px 24px rgba(46, 91, 255, 0.16)",
  },
} as const;

export default function ResultsPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [hasLoadedPayload, setHasLoadedPayload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFullSignatureByFile, setShowFullSignatureByFile] = useState<Record<number, boolean>>({});
  const [summaryToast, setSummaryToast] = useState<string | null>(null);
  const [resultPage, setResultPage] = useState(1);

  const results = useMemo(() => payload?.results ?? [], [payload]);
  const [editedResults, setEditedResults] = useState<Record<string, string>[]>([]);
  const totalPages = Math.max(1, Math.ceil(results.length / RESULT_PAGE_SIZE));
  const safePage = Math.min(resultPage, totalPages);
  const pageStartIndex = (safePage - 1) * RESULT_PAGE_SIZE;
  const pagedResults = results.slice(pageStartIndex, pageStartIndex + RESULT_PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;

    async function hydrateResultPayload() {
      const raw = sessionStorage.getItem("review_result_payload");
      let parsed: ResultPayload | null = null;

      if (raw) {
        const idbResultId = parseReviewResultIdbMarker(raw);
        if (idbResultId) {
          parsed = await loadReviewResultPayloadFromIdb<ResultPayload>(idbResultId);
          await removeReviewResultPayloadFromIdb(idbResultId);
        } else {
          try {
            parsed = JSON.parse(raw) as ResultPayload;
          } catch {
            parsed = null;
          }
        }
      }

      const nextEdited = (parsed?.results ?? []).map((item) => {
        const editableRow: Record<string, string> = {};
        METADATA_FIELDS.forEach((field) => {
          editableRow[field.key] = getDisplayValue(item, field.key);
        });
        return editableRow;
      });

      if (!cancelled) {
        setPayload(parsed);
        setEditedResults(nextEdited);
        setHasLoadedPayload(true);
      }

      const rawSummary = sessionStorage.getItem("review_extraction_summary");
      if (rawSummary) {
        try {
          const summary = JSON.parse(rawSummary) as { total_elapsed_ms?: number; total_files?: number };
          const totalSec = Math.max(0, Math.ceil((summary.total_elapsed_ms ?? 0) / 1000));
          const totalFiles = summary.total_files ?? 0;
          if (!cancelled) {
            setSummaryToast(`Đã bóc tách ${totalFiles} file. Tổng thời gian: ${totalSec}s.`);
          }
        } catch {
          if (!cancelled) {
            setSummaryToast("Đã hoàn tất bóc tách.");
          }
        } finally {
          sessionStorage.removeItem("review_extraction_summary");
        }
      }
    }

    void hydrateResultPayload();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!summaryToast) return;
    const timer = window.setTimeout(() => setSummaryToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [summaryToast]);

  function handleValueChange(resultIndex: number, key: string, value: string) {
    setEditedResults((prev) => {
      const next = [...prev];
      next[resultIndex] = {
        ...(next[resultIndex] ?? {}),
        [key]: value,
      };
      return next;
    });
  }

  function toggleFullSignature(resultIndex: number) {
    setShowFullSignatureByFile((prev) => ({
      ...prev,
      [resultIndex]: !prev[resultIndex],
    }));
  }

  function autoResizeTextArea(target: HTMLTextAreaElement) {
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
  }

  useEffect(() => {
    const elements = document.querySelectorAll("textarea[data-auto-grow='true']");
    elements.forEach((element) => autoResizeTextArea(element as HTMLTextAreaElement));
  }, [editedResults]);

  async function handleExportExcel() {
    if (!payload?.results || payload.results.length === 0) {
      return;
    }

    const exportResults = payload.results.map((item, index) => {
      const edited = editedResults[index] ?? {};
      const merged: ResultItem = { ...item };

      METADATA_FIELDS.forEach((field) => {
        merged[field.key] = edited[field.key] ?? "";
      });

      return merged;
    });

    const exportPayload: ResultPayload = {
      ...payload,
      results: exportResults,
    };

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/export-excel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(exportPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Xuất Excel thất bại.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `ket_qua_boc_tach_${Date.now()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>
        <span aria-hidden="true" style={styles.pathIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 24, height: 24 }}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
            />
          </svg>
        </span>
        <span>Kết quả bóc tách (22 trường metadata)</span>
      </h1>

      <section style={styles.panel}>
        {!hasLoadedPayload ? (
          <div style={styles.noData}>Đang tải dữ liệu kết quả...</div>
        ) : results.length === 0 ? (
          <div style={styles.noData}>Chưa có dữ liệu kết quả.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ fontSize: "13px", color: "#475467", fontWeight: 600 }}>
                Trang {safePage}/{totalPages} - hiển thị {pagedResults.length}/{results.length} file
              </div>
              <div style={{ display: "inline-flex", gap: "8px" }}>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setResultPage((prev) => Math.max(1, prev - 1))}
                  style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "6px", padding: "4px 10px", cursor: safePage <= 1 ? "not-allowed" : "pointer" }}
                >
                  Trước
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setResultPage((prev) => Math.min(totalPages, prev + 1))}
                  style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: "6px", padding: "4px 10px", cursor: safePage >= totalPages ? "not-allowed" : "pointer" }}
                >
                  Sau
                </button>
              </div>
            </div>
          {pagedResults.map((item, pageIndex) => {
            const index = pageStartIndex + pageIndex;
            return (
            <div key={`result-${index}`} style={{ marginBottom: pageIndex === pagedResults.length - 1 ? 0 : 16 }}>
              <p style={styles.fileTitle}>
                <span aria-hidden="true" style={{ ...styles.pathIcon, color: "#ffffff" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 24, height: 24 }}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
                    />
                  </svg>
                </span>
                <span>Kết quả bóc tách File {index + 1}</span>
                <span style={styles.fileTitlePath}>/ {formatCellValue(item.source_filename)}</span>
              </p>
              <table style={styles.table}>
                <colgroup>
                  <col style={styles.colMeta} />
                  <col style={styles.colValue} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={styles.th}>Trường metadata</th>
                    <th style={styles.th}>Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {METADATA_FIELDS.map((field) => (
                    <tr key={`${index}-${field.key}`}>
                      <td style={styles.td}>{field.label}</td>
                      <td style={styles.td}>
                        {field.key === "autograph" && formatCellValue(item[field.key]).trim() ? (
                          <div style={{ marginBottom: 6 }}>
                            <button
                              type="button"
                              onClick={() => toggleFullSignature(index)}
                              style={{
                                border: "1px solid #cbd5e1",
                                background: "#f8fafc",
                                color: "#334155",
                                borderRadius: 6,
                                padding: "4px 8px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {showFullSignatureByFile[index] ? "Ẩn OCR đầy đủ" : "Xem đầy đủ OCR"}
                            </button>
                          </div>
                        ) : null}
                        <textarea
                          data-auto-grow="true"
                          value={
                            field.key === "autograph" && showFullSignatureByFile[index]
                              ? formatCellValue(item[field.key])
                              : (editedResults[index]?.[field.key] ?? "")
                          }
                          readOnly={field.key === "autograph" && showFullSignatureByFile[index]}
                          onChange={(event) => handleValueChange(index, field.key, event.target.value)}
                          onInput={(event) => autoResizeTextArea(event.currentTarget)}
                          rows={field.key === "subject" || field.key === "description" ? 6 : 2}
                          style={{
                            width: "100%",
                            border: 0,
                            borderRadius: 0,
                            padding: 0,
                            fontSize: "14px",
                            lineHeight: 1.45,
                            fontFamily:
                              '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
                            resize: "none",
                            background: "transparent",
                            color: "#1f2937",
                            whiteSpace: "pre-wrap",
                            outline: "none",
                            overflow: "hidden",
                            minHeight: field.key === "subject" || field.key === "description" ? "132px" : "46px",
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            );
          })}
          </>
        )}
      </section>

      <SharedBottomBar
        leftLabel="Quay lại"
        leftIcon={<span aria-hidden="true">←</span>}
        onLeftClick={() => router.push("/review-doc")}
        rightLabel={loading ? "Đang xuất..." : "Xuất Excel"}
        rightIcon={<span aria-hidden="true">⇅</span>}
        rightDisabled={loading}
        onRightClick={handleExportExcel}
        fixedBottom
        centerContent={null}
      />
      {summaryToast ? <div style={styles.toast}>{summaryToast}</div> : null}
    </div>
  );
}
