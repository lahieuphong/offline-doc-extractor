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
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} giờ ${String(m).padStart(2, "0")} phút`;
  if (m > 0) return `${m} phút ${String(sec).padStart(2, "0")} giây`;
  return `${sec} giây`;
}

type PdfReadMode = "first_page" | "first_and_last_page" | "full_pdf";

type ExtractJsonResponse = {
  batch_id?: string;
  results?: Record<string, unknown>[];
};

type JobSubmitResponse = {
  job_id?: string;
  batch_id?: string;
  status?: string;
  total_files?: number;
};

type JobStatusResponse = {
  job_id?: string;
  status?: string;
  batch_id?: string;
  total_files?: number;
  processed_files?: number;
  failed_files?: number;
  progress_percent?: number;
  error?: string | null;
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
    width: "min(480px, 92vw)",
    background: "#fff",
    borderRadius: "14px",
    border: "1px solid #d7deea",
    padding: "20px",
    boxShadow: "0 18px 30px rgba(2, 6, 23, 0.18)",
  },
  modalTitle: {
    margin: "0 0 16px",
    fontSize: "17px",
    color: "#0f172a",
    fontWeight: 700,
    textAlign: "center" as const,
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
    gap: "8px",
    marginBottom: "16px",
  },
  radioItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#e2e8f0",
    borderRadius: "10px",
    background: "#fff",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
  },
  radioItemActive: {
    borderColor: "#2563eb",
    background: "#eff6ff",
    boxShadow: "0 0 0 1px #2563eb inset",
  },
  radioHint: {
    display: "block",
    marginTop: "2px",
    color: "#94a3b8",
    fontSize: "12px",
  },
  radioCircleWrap: {
    flexShrink: 0,
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    border: "2px solid #cbd5e1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleWrapActive: {
    border: "2px solid #2563eb",
    background: "#2563eb",
  },
  radioCircleDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#fff",
  },
  radioOptionLabel: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#1e293b",
  },
  radioOptionLabelActive: {
    color: "#1d4ed8",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  },
  modalBtn: {
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#64748b",
    borderRadius: "8px",
    padding: "9px 16px",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "pointer",
  },
  modalPrimaryBtn: {
    border: "1px solid #1d4ed8",
    background: "#1d4ed8",
    color: "#fff",
    borderRadius: "8px",
    padding: "9px 18px",
    fontWeight: 700,
    fontSize: "14px",
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
  progressCountRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
    margin: "16px 0 10px",
  },
  progressCountBig: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#2563eb",
  },
  progressCountSep: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#64748b",
  },
  progressCountUnit: {
    fontSize: "15px",
    color: "#64748b",
    flex: 1,
  },
  progressPercentBadge: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#334155",
  },
  progressElapsed: {
    margin: "6px 0 0",
    fontSize: "13px",
    color: "#94a3b8",
    textAlign: "right" as const,
  },
  progressDivider: {
    borderTop: "1px solid #e2e8f0",
    margin: "14px 0",
  },
  progressCurrentLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: "4px",
  },
  progressCurrentName: {
    fontSize: "13px",
    color: "#334155",
    fontWeight: 500,
    wordBreak: "break-all" as const,
    marginBottom: "8px",
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
const JOB_POLL_INTERVAL_MS = 1200;

export default function ReviewWorkspace() {
  const router = useRouter();
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [useLlm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setMessage] = useState("Chưa xử lý file nào.");
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [pdfReadMode, setPdfReadMode] = useState<PdfReadMode>("full_pdf");
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
    if (progress.completedFiles >= progress.totalFiles) return 100;
    const completedRatio = progress.completedFiles / progress.totalFiles;
    // Có progress thật từ backend → dùng ngay
    if (progress.currentFilePercent > 0) {
      return Math.min(100, (completedRatio + progress.currentFilePercent / 100 / progress.totalFiles) * 100);
    }
    // Chưa có progress → ước tính dựa theo thời gian đã trôi qua
    const startedAt = extractionStartedAtRef.current;
    if (!startedAt || !progress.visible) return completedRatio * 100;
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const avgSecPerFile = progress.completedFiles > 0 ? elapsedSec / progress.completedFiles : 90;
    const timeInCurrentFile = elapsedSec - avgSecPerFile * progress.completedFiles;
    const pseudoFraction = Math.min(0.85, timeInCurrentFile / avgSecPerFile);
    return Math.min(100, (completedRatio + pseudoFraction / progress.totalFiles) * 100);
  }, [progress, timeTick]);

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
      totalChunks: 1,
      currentChunkSize: selectedFiles.length,
    });

    const aggregateBatchId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;

    try {
      const formData = new FormData();
      selectedFiles.forEach((selected) => {
        formData.append("files", selected.file);
      });
      formData.append("use_llm", useLlm ? "true" : "false");
      formData.append("pdf_read_mode", pdfReadMode);

      const submitResponse = await fetch(`${BACKEND_URL}/api/jobs/submit`, {
        method: "POST",
        body: formData,
      });
      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        throw new Error(errorText || "Không thể tạo job xử lý.");
      }

      const submitPayload = (await submitResponse.json()) as JobSubmitResponse;
      const jobId = submitPayload.job_id;
      if (!jobId) {
        throw new Error("Backend không trả về job_id.");
      }

      let isFinished = false;
      while (!isFinished) {
        await new Promise((resolve) => window.setTimeout(resolve, JOB_POLL_INTERVAL_MS));
        setTimeTick((prev) => prev + 1);

        const statusResponse = await fetch(`${BACKEND_URL}/api/jobs/${jobId}`);
        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          throw new Error(errorText || "Không lấy được trạng thái job.");
        }

        const statusPayload = (await statusResponse.json()) as JobStatusResponse;
        const totalFiles = Math.max(selectedFiles.length, statusPayload.total_files ?? selectedFiles.length);
        const completedFiles = Math.min(totalFiles, statusPayload.processed_files ?? 0);
        const progressPercent = Math.max(0, Math.min(100, statusPayload.progress_percent ?? 0));
        const processedEquivalent = (progressPercent / 100) * totalFiles;
        const currentFilePercent = Math.max(0, Math.min(100, (processedEquivalent - completedFiles) * 100));
        const currentFileNumber = Math.min(totalFiles, completedFiles + 1);

        setProgress((prev) => ({
          ...prev,
          totalFiles,
          currentFileIndex: completedFiles,
          currentFileName: `Job ${jobId} - file ${currentFileNumber}/${totalFiles}`,
          currentFilePercent: completedFiles >= totalFiles ? 100 : currentFilePercent,
          completedFiles,
          currentChunkIndex: 1,
          totalChunks: 1,
          currentChunkSize: totalFiles,
        }));

        if (statusPayload.status === "failed") {
          throw new Error(statusPayload.error || "Job thất bại.");
        }
        isFinished = statusPayload.status === "finished";
      }

      const resultResponse = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/result`);
      if (!resultResponse.ok) {
        const errorText = await resultResponse.text();
        throw new Error(errorText || "Không tải được kết quả job.");
      }
      const payload = (await resultResponse.json()) as ExtractJsonResponse;

      const reviewResultPayload = {
        batch_id: payload.batch_id ?? aggregateBatchId,
        results: payload.results ?? [],
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
            {/* Tiêu đề */}
            <p style={styles.progressTitle}>Đang bóc tách...</p>

            {/* Số file + % */}
            <div style={styles.progressCountRow}>
              <span style={styles.progressCountBig}>{progress.completedFiles}</span>
              <span style={styles.progressCountSep}>/ {progress.totalFiles}</span>
              <span style={styles.progressCountUnit}>file hoàn thành</span>
              <span style={styles.progressPercentBadge}>{totalPercent.toFixed(0)}%</span>
            </div>

            {/* Thanh tổng (lớn) */}
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${totalPercent}%` }} />
            </div>
            <p style={{ ...styles.progressElapsed, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              <img src="/icons/clock.svg" width={13} height={13} alt="" draggable={false} />
              {totalElapsedText}
            </p>

            {/* Divider */}
            <div style={styles.progressDivider} />

            {/* File hiện tại */}
            <style>{`
              @keyframes progressSlide {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(400%); }
              }
              .progress-indeterminate {
                height: 100%;
                width: 30%;
                border-radius: 999px;
                background: linear-gradient(90deg, #2563eb, #0b3a8e);
                animation: progressSlide 1.4s ease-in-out infinite;
              }
            `}</style>
            <p style={styles.progressCurrentLabel}>Đang xử lý</p>
            <p style={styles.progressCurrentName}>{progress.currentFileName}</p>
            <div style={{ ...styles.progressTrack, height: "6px", marginBottom: "6px" }}>
              {progress.currentFilePercent >= 1 ? (
                <div style={{ ...styles.progressFill, width: `${progress.currentFilePercent}%` }} />
              ) : (
                <div className="progress-indeterminate" />
              )}
            </div>
            <p style={{ ...styles.progressLabel, fontSize: "12px", color: "#94a3b8" }}>
              {progress.currentFilePercent >= 1 ? `${progress.currentFilePercent.toFixed(0)}%` : "Đang xử lý..."}
            </p>
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
            <h3 style={styles.modalTitle}>Phạm vi đọc PDF</h3>

            <div style={styles.radioGroup}>
              {(
                [
                  { value: "first_page",          label: "1 trang đầu",                hint: "Nhanh — lấy metadata cơ bản từ trang bìa." },
                  { value: "first_and_last_page",  label: "1 trang đầu + 1 trang cuối", hint: "Cân bằng — lấy thêm thông tin ký/xác nhận ở cuối." },
                  { value: "full_pdf",             label: "Toàn bộ PDF",                hint: "Đầy đủ nhất — xử lý lâu hơn với tài liệu nhiều trang." },
                ] as const
              ).map(({ value, label, hint }) => {
                const active = pdfReadMode === value;
                return (
                  <div
                    key={value}
                    role="button"
                    tabIndex={0}
                    style={{ ...styles.radioItem, ...(active ? styles.radioItemActive : null) }}
                    onClick={() => setPdfReadMode(value)}
                    onKeyDown={(e) => e.key === "Enter" && setPdfReadMode(value)}
                  >
                    <div style={{ ...styles.radioCircleWrap, ...(active ? styles.radioCircleWrapActive : null) }}>
                      {active && <div style={styles.radioCircleDot} />}
                    </div>
                    <span>
                      <span style={{ ...styles.radioOptionLabel, ...(active ? styles.radioOptionLabelActive : null) }}>
                        {label}
                      </span>
                      <small style={styles.radioHint}>{hint}</small>
                    </span>
                  </div>
                );
              })}
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
