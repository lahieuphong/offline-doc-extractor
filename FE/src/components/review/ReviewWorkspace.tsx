"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/api";
import {
  buildReviewResultIdbMarker,
  loadScannerFilesBatchFromIdb,
  loadScannerTransferItemsFromIdb,
  parseScannerTransferIdbMarker,
  saveReviewResultPayloadToIdb,
  removeScannerFilesBatchFromIdb,
  removeScannerTransferItemsFromIdb,
  shouldFallbackToIdb,
} from "@/lib/scannerTransferStore";
import type { SelectedFile } from "@/types/review";
import SharedBottomBar from "@/components/common/SharedBottomBar";
import SharedTopBar from "@/components/common/SharedTopBar";
import FileDropzone from "./FileDropzone";
import SelectedFilesRail from "./SelectedFilesRail";
import DocumentViewer from "./DocumentViewer";

function buildFileId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function buildUniqueFileId(file: File, existingIds: Set<string>): string {
  const baseId = buildFileId(file);
  if (!existingIds.has(baseId)) return baseId;

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }
  return candidate;
}

function supportsPreview(file: File): boolean {
  const fileName = file.name.toLowerCase();
  return (
    file.type === "application/pdf" ||
    file.type.startsWith("image/") ||
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg")
  );
}

function formatElapsedVi(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${hours} giờ ${String(minutes).padStart(2, "0")} phút ${String(seconds).padStart(2, "0")} giây`;
}

type PdfReadMode = "first_page" | "first_and_last_page" | "full_pdf";

type ExtractJsonResponse = {
  batch_id?: string;
  results?: Record<string, unknown>[];
};

type ProgressState = {
  visible: boolean;
  totalFiles: number;
  currentFileIndex: number;
  currentFileName: string;
  currentFilePercent: number;
  completedFiles: number;
  currentChunkIndex: number;
  totalChunks: number;
  currentChunkSize: number;
};

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f3f4f6",
    color: "#354052",
    display: "grid",
    gridTemplateRows: "auto auto auto auto 1fr auto",
    gap: "14px",
    padding: "0 16px 84px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
  },
  headerFullBleed: {
    marginLeft: "-16px",
    marginRight: "-16px",
  },
  selectionPill: {
    margin: "0 auto",
    background: "#edf3ff",
    color: "#2b56d4",
    borderRadius: "999px",
    padding: "10px 24px",
    fontSize: "16px",
    fontWeight: 700,
    boxShadow: "0 12px 24px rgba(46, 91, 255, 0.16)",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "grid",
    placeItems: "center",
    zIndex: 50,
  },
  modal: {
    width: "min(640px, 92vw)",
    background: "#fff",
    borderRadius: "12px",
    border: "1px solid #d7deea",
    padding: "18px",
    boxShadow: "0 18px 30px rgba(2, 6, 23, 0.18)",
  },
  modalTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#0f172a",
    fontWeight: 700,
  },
  modalNote: {
    marginTop: "8px",
    marginBottom: "12px",
    color: "#475467",
    fontSize: "14px",
    lineHeight: 1.5,
  },
  radioGroup: {
    display: "grid",
    gap: "10px",
    marginBottom: "12px",
  },
  radioItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d7deea",
    borderRadius: "10px",
    background: "#f8fafc",
    cursor: "pointer",
  },
  radioItemActive: {
    borderColor: "#4f76dc",
    boxShadow: "0 0 0 1px #4f76dc inset",
    background: "#edf3fb",
  },
  radioHint: {
    display: "block",
    marginTop: "4px",
    color: "#64748b",
    fontSize: "13px",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
  },
  modalBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#334155",
    borderRadius: "8px",
    padding: "8px 14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  modalPrimaryBtn: {
    border: "1px solid #0b3a8e",
    background: "#0b3a8e",
    color: "#fff",
    borderRadius: "8px",
    padding: "8px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  progressPanel: {
    background: "#ffffff",
    border: "1px solid #d7deea",
    borderRadius: "12px",
    padding: "14px",
  },
  progressModal: {
    width: "min(640px, 92vw)",
    background: "#fff",
    borderRadius: "12px",
    border: "1px solid #d7deea",
    padding: "18px",
    boxShadow: "0 18px 30px rgba(2, 6, 23, 0.18)",
  },
  progressTitle: {
    margin: 0,
    color: "#0f172a",
    fontWeight: 700,
    fontSize: "28px",
    textAlign: "center" as const,
  },
  progressMeta: {
    marginTop: "8px",
    marginBottom: "10px",
    color: "#475467",
    fontSize: "14px",
  },
  progressTrack: {
    height: "12px",
    borderRadius: "999px",
    background: "#e2e8f0",
    overflow: "hidden",
    marginBottom: "10px",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #2563eb, #0b3a8e)",
    transition: "width 0.25s ease",
  },
  progressLabel: {
    fontSize: "14px",
    color: "#475467",
  },
} as const;

const initialProgress: ProgressState = {
  visible: false,
  totalFiles: 0,
  currentFileIndex: 0,
  currentFileName: "",
  currentFilePercent: 0,
  completedFiles: 0,
  currentChunkIndex: 0,
  totalChunks: 0,
  currentChunkSize: 0,
};
const EXTRACT_CHUNK_SIZE = 10;

export default function ReviewWorkspace() {
  const router = useRouter();
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [useLlm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [, setMessage] = useState("Chưa xử lý file nào.");
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [pdfReadMode, setPdfReadMode] = useState<PdfReadMode>("first_page");
  const [progress, setProgress] = useState<ProgressState>(initialProgress);
  const [timeTick, setTimeTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extractionStartedAtRef = useRef<number | null>(null);
  const currentFileStartedAtRef = useRef<number | null>(null);

  const selectedFiles = useMemo(() => files.filter((item) => selectedIds.has(item.id)), [files, selectedIds]);
  const activeFile = useMemo(() => {
    if (activeId && selectedIds.has(activeId)) {
      return files.find((item) => item.id === activeId);
    }
    return selectedFiles[0];
  }, [files, activeId, selectedIds, selectedFiles]);
  const activeIndex = useMemo(() => {
    if (!activeFile) return -1;
    return selectedFiles.findIndex((item) => item.id === activeFile.id);
  }, [selectedFiles, activeFile]);
  const canPrev = activeIndex > 0;
  const canNext = activeIndex >= 0 && activeIndex < selectedFiles.length - 1;

  const totalPercent = useMemo(() => {
    if (!progress.totalFiles) return 0;
    const ratio = (progress.completedFiles + progress.currentFilePercent / 100) / progress.totalFiles;
    return Math.min(100, Math.max(0, ratio * 100));
  }, [progress]);

  const currentFileElapsedText = useMemo(() => {
    const startedAt = currentFileStartedAtRef.current;
    if (!startedAt) return "0 giờ 00 phút 00 giây";
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    return formatElapsedVi(elapsedSec);
  }, [progress.currentFilePercent, progress.currentFileIndex, timeTick]);

  const totalElapsedText = useMemo(() => {
    const startedAt = extractionStartedAtRef.current;
    if (!startedAt) return "0 giờ 00 phút 00 giây";
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    return formatElapsedVi(elapsedSec);
  }, [totalPercent, progress.currentFilePercent, progress.currentFileIndex, timeTick]);

  function addFiles(nextFiles: FileList | File[]) {
    const incoming = Array.from(nextFiles);

    setFiles((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const merged = [...prev];
      const addedIds: string[] = [];

      incoming.forEach((file) => {
        const id = buildUniqueFileId(file, existingIds);
        existingIds.add(id);
        addedIds.push(id);

        merged.push({
          id,
          file,
          previewUrl: supportsPreview(file) ? URL.createObjectURL(file) : undefined,
        });
      });

      if (addedIds.length > 0) {
        setSelectedIds((prevSelected) => {
          const nextSelected = new Set(prevSelected);
          addedIds.forEach((id) => nextSelected.add(id));
          return nextSelected;
        });
      }

      if (!activeId && merged.length > 0) {
        setActiveId(merged[0].id);
      }

      return merged;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrateFilesFromScanner() {
      const rawTransferItems = sessionStorage.getItem("scanner_transfer_items");
      if (rawTransferItems) {
        try {
          const idbRecordId = parseScannerTransferIdbMarker(rawTransferItems);
          if (idbRecordId) {
            const filesBatch = await loadScannerFilesBatchFromIdb(idbRecordId);
            if (!cancelled && filesBatch && filesBatch.length > 0) {
              addFiles(filesBatch);
            } else {
              // Giữ tương thích nếu data cũ vẫn lưu theo base64 payload.
              const parsedLegacy = await loadScannerTransferItemsFromIdb(idbRecordId);
              const filesFromLegacy: File[] = [];
              parsedLegacy?.forEach((item, index) => {
                if (!item?.dataUrl) return;
                const [header, base64Data] = item.dataUrl.split(",", 2);
                if (!header || !base64Data) return;
                const mimeMatch = header.match(/^data:(.*?);base64$/);
                const mimeType = item.type || mimeMatch?.[1] || "application/octet-stream";
                const binary = atob(base64Data);
                const bytes = new Uint8Array(binary.length);
                for (let offset = 0; offset < binary.length; offset += 1) {
                  bytes[offset] = binary.charCodeAt(offset);
                }
                const fallbackExt = mimeType.includes("png")
                  ? "png"
                  : mimeType.includes("jpeg") || mimeType.includes("jpg")
                    ? "jpg"
                    : mimeType.includes("pdf")
                      ? "pdf"
                      : mimeType.includes("wordprocessingml")
                        ? "docx"
                        : mimeType.includes("text")
                          ? "txt"
                          : "bin";
                const name = item.name?.trim() ? item.name : `scanner_item_${Date.now()}_${index}.${fallbackExt}`;
                filesFromLegacy.push(new File([bytes], name, { type: mimeType }));
              });
              if (!cancelled && filesFromLegacy.length > 0) {
                addFiles(filesFromLegacy);
              }
            }
            await removeScannerFilesBatchFromIdb(idbRecordId);
            await removeScannerTransferItemsFromIdb(idbRecordId);
            return;
          }

          const parsed = JSON.parse(rawTransferItems) as Array<{ name?: string; type?: string; dataUrl?: string }>;
          const filesFromScanner: File[] = [];

          parsed?.forEach((item, index) => {
            if (!item?.dataUrl) return;
            const [header, base64Data] = item.dataUrl.split(",", 2);
            if (!header || !base64Data) return;

            const mimeMatch = header.match(/^data:(.*?);base64$/);
            const mimeType = item.type || mimeMatch?.[1] || "application/octet-stream";

            const binary = atob(base64Data);
            const bytes = new Uint8Array(binary.length);
            for (let offset = 0; offset < binary.length; offset += 1) {
              bytes[offset] = binary.charCodeAt(offset);
            }

            const fallbackExt = mimeType.includes("png")
              ? "png"
              : mimeType.includes("jpeg") || mimeType.includes("jpg")
                ? "jpg"
                : mimeType.includes("pdf")
                  ? "pdf"
                  : mimeType.includes("wordprocessingml")
                    ? "docx"
                    : mimeType.includes("text")
                      ? "txt"
                      : "bin";

            const name = item.name?.trim() ? item.name : `scanner_item_${Date.now()}_${index}.${fallbackExt}`;
            filesFromScanner.push(new File([bytes], name, { type: mimeType }));
          });

          if (!cancelled && filesFromScanner.length > 0) {
            addFiles(filesFromScanner);
          }
        } finally {
          sessionStorage.removeItem("scanner_transfer_items");
          sessionStorage.removeItem("scanner_captured_image_data_url");
        }
        return;
      }

      const capturedDataUrl = sessionStorage.getItem("scanner_captured_image_data_url");
      if (!capturedDataUrl) return;

      try {
        const [header, base64Data] = capturedDataUrl.split(",", 2);
        if (!header || !base64Data) return;

        const mimeMatch = header.match(/^data:(.*?);base64$/);
        const mimeType = mimeMatch?.[1] || "image/jpeg";

        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }

        const ext = mimeType.includes("png") ? "png" : "jpg";
        const capturedFile = new File([bytes], `scanner_capture_${Date.now()}.${ext}`, { type: mimeType });
        if (!cancelled) {
          addFiles([capturedFile]);
        }
      } finally {
        sessionStorage.removeItem("scanner_captured_image_data_url");
      }
    }

    void hydrateFilesFromScanner();
    return () => {
      cancelled = true;
    };
  }, []);

  function clearFiles() {
    files.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });

    setFiles([]);
    setSelectedIds(new Set());
    setActiveId(null);
  }

  function handleBackToScanner() {
    clearFiles();
    router.push("/scanner");
  }

  function toggleFileSelection(id: string) {
    const wasSelected = selectedIds.has(id);
    const nextSelected = new Set(selectedIds);

    if (wasSelected) {
      nextSelected.delete(id);
    } else {
      nextSelected.add(id);
    }

    setSelectedIds(nextSelected);

    if (!wasSelected) {
      setActiveId(id);
      return;
    }

    setActiveId((prevActiveId) => {
      if (prevActiveId && nextSelected.has(prevActiveId)) return prevActiveId;
      const fallback = files.find((item) => nextSelected.has(item.id));
      return fallback?.id ?? null;
    });
  }

  function goToNextFile() {
    if (!canNext) return;
    setActiveId(selectedFiles[activeIndex + 1].id);
  }

  function goToPrevFile() {
    if (!canPrev) return;
    setActiveId(selectedFiles[activeIndex - 1].id);
  }

  function openExtractModal() {
    if (selectedFiles.length === 0) {
      setMessage("Bạn chưa chọn file.");
      return;
    }
    setShowExtractModal(true);
  }

  async function handleExtractWithOptions() {
    setShowExtractModal(false);
    setLoading(true);
    extractionStartedAtRef.current = Date.now();
    currentFileStartedAtRef.current = Date.now();
    setMessage(`Đang xử lý ${selectedFiles.length} file...`);
    setProgress({
      visible: true,
      totalFiles: selectedFiles.length,
      currentFileIndex: 0,
      currentFileName: selectedFiles[0]?.file.name ?? "",
      currentFilePercent: 0,
      completedFiles: 0,
      currentChunkIndex: 1,
      totalChunks: Math.max(1, Math.ceil(selectedFiles.length / EXTRACT_CHUNK_SIZE)),
      currentChunkSize: Math.min(EXTRACT_CHUNK_SIZE, selectedFiles.length),
    });

    const aggregatedResults: Record<string, unknown>[] = [];
    const aggregateBatchId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;

    try {
      for (let index = 0; index < selectedFiles.length; index += EXTRACT_CHUNK_SIZE) {
        const chunk = selectedFiles.slice(index, index + EXTRACT_CHUNK_SIZE);
        const chunkLabel =
          chunk.length === 1
            ? chunk[0].file.name
            : `${chunk[0].file.name} ... (+${Math.max(0, chunk.length - 1)} file)`;
        currentFileStartedAtRef.current = Date.now();

        setProgress((prev) => ({
          ...prev,
          currentFileIndex: index,
          currentFileName: chunkLabel,
          currentFilePercent: 1,
          completedFiles: index,
          currentChunkIndex: Math.floor(index / EXTRACT_CHUNK_SIZE) + 1,
          currentChunkSize: chunk.length,
        }));

        const progressTimer = window.setInterval(() => {
          setTimeTick((prev) => prev + 1);
          setProgress((prev) => {
            const p = prev.currentFilePercent;
            let step = 0.03;

            if (p < 55) step = 4.5;
            else if (p < 78) step = 2.1;
            else if (p < 90) step = 1.1;
            else if (p < 96) step = 0.45;
            else if (p < 99.2) step = 0.12;

            const nextPercent = Math.min(99.6, p + step);
            return { ...prev, currentFilePercent: nextPercent };
          });
        }, 280);

        try {
          const formData = new FormData();
          chunk.forEach((selected) => {
            formData.append("files", selected.file);
          });
          formData.append("use_llm", useLlm ? "true" : "false");
          formData.append("pdf_read_mode", pdfReadMode);

          const response = await fetch(`${BACKEND_URL}/api/extract-json`, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Xử lý thất bại tại nhóm file bắt đầu từ ${chunk[0].file.name}.`);
          }

          const payload = (await response.json()) as ExtractJsonResponse;
          const chunkResults = payload.results ?? [];
          if (chunkResults.length !== chunk.length) {
            throw new Error(
              `Backend trả về ${chunkResults.length}/${chunk.length} kết quả trong cùng nhóm file. Vui lòng thử lại.`,
            );
          }
          aggregatedResults.push(...chunkResults);

          setProgress((prev) => ({
            ...prev,
            currentFilePercent: 100,
            completedFiles: Math.min(selectedFiles.length, index + chunk.length),
          }));
        } finally {
          window.clearInterval(progressTimer);
        }
      }

      const reviewResultPayload = {
        batch_id: aggregateBatchId,
        results: aggregatedResults,
      };
      try {
        sessionStorage.setItem("review_result_payload", JSON.stringify(reviewResultPayload));
      } catch (error) {
        if (!shouldFallbackToIdb(error)) throw error;
        const resultId = await saveReviewResultPayloadToIdb(reviewResultPayload);
        sessionStorage.setItem("review_result_payload", buildReviewResultIdbMarker(resultId));
      }
      const totalElapsedMs = extractionStartedAtRef.current ? Date.now() - extractionStartedAtRef.current : 0;
      sessionStorage.setItem(
        "review_extraction_summary",
        JSON.stringify({
          total_elapsed_ms: totalElapsedMs,
          total_files: selectedFiles.length,
        }),
      );

      setMessage("Đã bóc tách xong. Đang chuyển tới trang kết quả...");
      router.push("/results");
    } catch (error) {
      setMessage(`Lỗi: ${error instanceof Error ? error.message : "Không xác định"}`);
    } finally {
      setLoading(false);
      setProgress(initialProgress);
      setTimeTick(0);
      extractionStartedAtRef.current = null;
      currentFileStartedAtRef.current = null;
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerFullBleed}>
        <SharedTopBar title="Scan Giấy tờ / Tài liệu" onBackClick={handleBackToScanner} />
      </div>

      <FileDropzone fileInputRef={fileInputRef} onAddFiles={addFiles} />

      <SelectedFilesRail files={files} selectedIds={selectedIds} onToggle={toggleFileSelection} />

      <div style={styles.selectionPill}>{files.length ? `${selectedFiles.length}/${files.length} được chọn` : "0/0 được chọn"}</div>

      <DocumentViewer
        activeFile={activeFile}
        canPrev={canPrev}
        canNext={canNext}
        onPrevFile={selectedFiles.length > 0 ? goToPrevFile : undefined}
        onNextFile={selectedFiles.length > 0 ? goToNextFile : undefined}
      />

      {progress.visible ? (
        <div style={styles.modalBackdrop}>
          <section style={styles.progressModal}>
          <p style={styles.progressTitle}>Tiến trình bóc tách</p>
          <p style={styles.progressMeta}>
            Nhóm {progress.currentChunkIndex}/{progress.totalChunks} ({progress.currentChunkSize} file):{" "}
            {progress.currentFileName}
          </p>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progress.currentFilePercent}%` }} />
          </div>
          <p style={styles.progressLabel}>
            Tiến trình file hiện tại: {progress.currentFilePercent.toFixed(0)}% ({currentFileElapsedText})
          </p>

          <p style={{ ...styles.progressMeta, marginTop: 12 }}>
            Tổng: {progress.completedFiles}/{progress.totalFiles} file ({totalPercent.toFixed(2)}%)
          </p>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${totalPercent}%` }} />
          </div>
          <p style={styles.progressLabel}>Tiến trình tổng: {totalPercent.toFixed(2)}% ({totalElapsedText})</p>
          </section>
        </div>
      ) : null}

      <SharedBottomBar
        leftLabel="Quay lại"
        leftIcon={<span aria-hidden="true">←</span>}
        onLeftClick={handleBackToScanner}
        rightLabel={loading ? "Đang xử lý..." : "Extract File"}
        rightIcon={<span aria-hidden="true">⇅</span>}
        rightDisabled={loading || selectedFiles.length === 0}
        onRightClick={openExtractModal}
        fixedBottom
        centerContent={null}
      />

      {showExtractModal ? (
        <div style={styles.modalBackdrop}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Chọn chế độ bóc tách PDF</h3>
            <p style={styles.modalNote}>
              Vui lòng chọn phạm vi đọc PDF: 1 trang đầu, 1 trang đầu và 1 trang cuối, hoặc toàn bộ tài liệu. Đối với DOCX/TXT/PNG/JPG, hệ thống vẫn xử lý như hiện tại.
            </p>

            <div style={styles.radioGroup}>
              <label style={{ ...styles.radioItem, ...(pdfReadMode === "first_page" ? styles.radioItemActive : null) }} onClick={() => setPdfReadMode("first_page")}>
                <span>
                  Đọc 1 trang đầu (nhanh hơn)
                  <small style={styles.radioHint}>Phù hợp khi cần lấy nhanh metadata cơ bản.</small>
                </span>
              </label>

              <label style={{ ...styles.radioItem, ...(pdfReadMode === "first_and_last_page" ? styles.radioItemActive : null) }} onClick={() => setPdfReadMode("first_and_last_page")}>
                <span>
                  Đọc 1 trang đầu và 1 trang cuối
                  <small style={styles.radioHint}>Phù hợp khi muốn lấy mở đầu và phần ký/xác nhận ở cuối tài liệu.</small>
                </span>
              </label>

              <label style={{ ...styles.radioItem, ...(pdfReadMode === "full_pdf" ? styles.radioItemActive : null) }} onClick={() => setPdfReadMode("full_pdf")}>
                <span>
                  Đọc toàn bộ PDF
                  <small style={styles.radioHint}>Đầy đủ hơn nhưng có thể mất nhiều thời gian xử lý.</small>
                </span>
              </label>
            </div>

            <div style={styles.modalActions}>
              <button type="button" style={styles.modalBtn} onClick={() => setShowExtractModal(false)}>
                Hủy
              </button>
              <button type="button" style={styles.modalPrimaryBtn} onClick={handleExtractWithOptions}>
                Bắt đầu bóc tách
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
