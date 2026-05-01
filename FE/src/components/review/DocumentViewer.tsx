import { useEffect, useState } from "react";
import type { SelectedFile } from "@/types/review";

type DocumentViewerProps = {
  activeFile?: SelectedFile;
  canPrev?: boolean;
  canNext?: boolean;
  onPrevFile?: () => void;
  onNextFile?: () => void;
};

const styles = {
  viewerWrap: {
    borderRadius: 0,
    overflow: "hidden",
    background: "#2c3138",
    border: 0,
  },
  viewerBody: {
    height: "68vh",
    minHeight: "360px",
    position: "relative",
  },
  navBtnLeft: { left: "20px" },
  navBtnRight: { right: "20px" },
  navBtn: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 3,
    width: "40px",
    height: "40px",
    borderRadius: "999px",
    border: 0,
    background: "rgba(0, 0, 0, 0.4)",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    transition: "background 0.2s ease",
  },
  navIcon: {
    width: "20px",
    height: "20px",
  },
  previewPane: {
    background: "#2c3138",
    height: "100%",
    position: "relative",
  },
  pdfFrame: {
    border: 0,
    width: "100%",
    height: "100%",
    background: "#fff",
  },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(17, 24, 39, 0.38)",
    display: "grid",
    placeItems: "center",
    zIndex: 2,
  },
  loadingCard: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px",
    borderRadius: "999px",
    background: "rgba(15, 23, 42, 0.78)",
    color: "#e2e8f0",
    fontSize: "14px",
    fontWeight: 600,
  },
  spinner: {
    width: "18px",
    height: "18px",
    display: "inline-block",
  },
  emptyText: {
    color: "#cbd5e1",
    height: "100%",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    padding: "20px",
  },
} as const;

export default function DocumentViewer({ activeFile, canPrev = false, canNext = false, onPrevFile, onNextFile }: DocumentViewerProps) {
  const hasNavigator = Boolean(onPrevFile || onNextFile);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const activeFileName = activeFile?.file.name.toLowerCase() ?? "";
  const isPdfPreview = activeFileName.endsWith(".pdf");
  const isImagePreview = activeFileName.endsWith(".png") || activeFileName.endsWith(".jpg") || activeFileName.endsWith(".jpeg");

  useEffect(() => {
    setIsPreviewLoading(Boolean(activeFile?.previewUrl));
  }, [activeFile?.id, activeFile?.previewUrl]);

  return (
    <section style={styles.viewerWrap}>
      <div style={styles.viewerBody}>
        <main style={styles.previewPane}>
          {hasNavigator ? (
            <button
              type="button"
              style={{
                ...styles.navBtn,
                ...styles.navBtnLeft,
                opacity: canPrev ? 1 : 0.35,
                cursor: canPrev ? "pointer" : "not-allowed",
              }}
              aria-label="Xem file trước đó"
              onClick={canPrev ? onPrevFile : undefined}
              disabled={!canPrev}
              onMouseEnter={(event) => {
                if (!canPrev) return;
                event.currentTarget.style.background = "rgba(0, 0, 0, 0.6)";
              }}
              onMouseLeave={(event) => {
                if (!canPrev) return;
                event.currentTarget.style.background = "rgba(0, 0, 0, 0.4)";
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.navIcon} aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          ) : null}
          {hasNavigator ? (
            <button
              type="button"
              style={{
                ...styles.navBtn,
                ...styles.navBtnRight,
                opacity: canNext ? 1 : 0.35,
                cursor: canNext ? "pointer" : "not-allowed",
              }}
              aria-label="Xem file tiếp theo"
              onClick={canNext ? onNextFile : undefined}
              disabled={!canNext}
              onMouseEnter={(event) => {
                if (!canNext) return;
                event.currentTarget.style.background = "rgba(0, 0, 0, 0.6)";
              }}
              onMouseLeave={(event) => {
                if (!canNext) return;
                event.currentTarget.style.background = "rgba(0, 0, 0, 0.4)";
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.navIcon} aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ) : null}

          {activeFile?.previewUrl ? (
            <>
              {isPreviewLoading ? (
                <div style={styles.loadingOverlay}>
                  <div style={styles.loadingCard}>
                    <svg viewBox="0 0 24 24" style={styles.spinner} aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.25" />
                      <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="2.5" fill="none">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
                      </path>
                    </svg>
                    <span>Đang tải preview...</span>
                  </div>
                </div>
              ) : null}
              {isPdfPreview ? (
                <iframe
                  style={styles.pdfFrame}
                  src={activeFile.previewUrl}
                  title="PDF preview"
                  onLoad={() => setIsPreviewLoading(false)}
                  onError={() => setIsPreviewLoading(false)}
                />
              ) : isImagePreview ? (
                <img
                  src={activeFile.previewUrl}
                  alt={activeFile.file.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%", background: "#fff" }}
                  onLoad={() => setIsPreviewLoading(false)}
                  onError={() => setIsPreviewLoading(false)}
                />
              ) : null}
            </>
          ) : activeFile ? (
            <div style={styles.emptyText}>File này chưa hỗ trợ preview trực tiếp. Bạn vẫn có thể extract.</div>
          ) : (
            <div style={styles.emptyText}>Hãy chọn file để xem trước.</div>
          )}
        </main>
      </div>
    </section>
  );
}
