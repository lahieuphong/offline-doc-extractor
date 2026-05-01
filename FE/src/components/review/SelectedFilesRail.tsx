"use client";

import { useEffect, useRef, useState } from "react";
import type { SelectedFile } from "@/types/review";

type SelectedFilesRailProps = {
  files: SelectedFile[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
};

const styles = {
  railWrap: {
    position: "relative" as const,
  },
  fileRail: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "12px",
    rowGap: "12px",
    alignItems: "flex-start",
    paddingTop: "8px",
  },
  expandOverlay: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    bottom: 0,
    height: "44px",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: "0px",
    background: "linear-gradient(to bottom, rgba(243, 244, 246, 0), rgba(243, 244, 246, 0.92) 58%, #f3f4f6 100%)",
    pointerEvents: "auto" as const,
    border: 0,
    outline: "none",
    appearance: "none" as const,
  },
  expandBtn: {
    width: "100%",
    height: "100%",
    border: 0,
    background: "transparent",
    color: "#6b7280",
    borderRadius: 0,
    padding: 0,
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "none",
    backdropFilter: "none",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: "4px",
    lineHeight: 1,
  },
  fileCard: {
    position: "relative",
    width: "96px",
    height: "76px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#aebcd0",
    borderRadius: "10px",
    background: "#f8fafc",
    cursor: "pointer",
    padding: "5px 7px",
    textAlign: "left" as const,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "all 0.2s ease",
  },
  fileCardActive: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#4f76dc",
    boxShadow: "0 0 0 2px #4f76dc inset",
    background: "#edf3fb",
  },
  badge: {
    position: "absolute",
    right: "-5px",
    top: "-7px",
    minWidth: "20px",
    height: "20px",
    borderRadius: "999px",
    background: "#2e63d6",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
    boxShadow: "0 3px 8px rgba(46, 99, 214, 0.25)",
  },
  fileIcon: {
    width: "30px",
    height: "30px",
    color: "#ef4444",
  },
  imageThumb: {
    width: "54px",
    height: "40px",
    borderRadius: "6px",
    objectFit: "cover" as const,
    border: "1px solid #d7deea",
    background: "#fff",
  },
  fileName: {
    marginTop: "0px",
    fontSize: "12px",
    fontWeight: 400,
    color: "#445168",
    textAlign: "center" as const,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "68px",
  },
} as const;

export default function SelectedFilesRail({ files, selectedIds, onToggle }: SelectedFilesRailProps) {
  const COLLAPSED_MAX_HEIGHT = 252;
  const RENDER_STEP = 300;
  const railRef = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [visibleCount, setVisibleCount] = useState(RENDER_STEP);

  useEffect(() => {
    setExpanded(false);
    setVisibleCount(RENDER_STEP);
  }, [files.length]);

  useEffect(() => {
    function updateExpandState() {
      if (!railRef.current) return;
      setCanExpand(railRef.current.scrollHeight > COLLAPSED_MAX_HEIGHT + 4);
    }

    updateExpandState();
    window.addEventListener("resize", updateExpandState);
    return () => window.removeEventListener("resize", updateExpandState);
  }, [files.length, selectedIds.size]);

  const selectedOrder = new Map<string, number>();
  let counter = 1;
  files.forEach((item) => {
    if (selectedIds.has(item.id)) {
      selectedOrder.set(item.id, counter);
      counter += 1;
    }
  });
  const visibleFiles = files.slice(0, visibleCount);
  const hasMoreFilesToRender = visibleCount < files.length;

  return (
    <div style={styles.railWrap}>
      <section ref={railRef} style={{ ...styles.fileRail, maxHeight: expanded ? "none" : `${COLLAPSED_MAX_HEIGHT}px`, overflow: expanded ? "visible" : "hidden" }}>
        {visibleFiles.map((item) => {
          const fileName = item.file.name.toLowerCase();
          const isDocx = fileName.endsWith(".docx") || fileName.endsWith(".doc");
          const isImage = fileName.endsWith(".png") || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg");
          const isTextLike =
            fileName.endsWith(".txt") ||
            fileName.endsWith(".md") ||
            fileName.endsWith(".log") ||
            fileName.endsWith(".csv") ||
            fileName.endsWith(".rtf");
          const iconColor = isDocx ? "#2563eb" : isTextLike ? "#6b7280" : isImage ? "#f59e0b" : "#ef4444";
          const selectedIndex = selectedOrder.get(item.id);
          const imageThumbUrl = isImage ? item.previewUrl : undefined;

          return (
          <button
            key={item.id}
            type="button"
            style={{ ...styles.fileCard, ...(selectedIndex ? styles.fileCardActive : null) }}
            onClick={() => onToggle(item.id)}
          >
            {selectedIndex ? <span style={styles.badge}>{selectedIndex}</span> : null}
            {imageThumbUrl ? (
              <img src={imageThumbUrl} alt={item.file.name} style={styles.imageThumb} />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ ...styles.fileIcon, color: iconColor }}
                aria-hidden="true"
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M10 9H8" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
            )}
            <div style={styles.fileName}>{item.file.name}</div>
          </button>
          );
        })}
      </section>
      {hasMoreFilesToRender ? (
        <div style={{ marginTop: "10px", display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => Math.min(files.length, prev + RENDER_STEP))}
            style={{
              border: "1px solid #d7deea",
              borderRadius: "8px",
              background: "#ffffff",
              color: "#334155",
              fontWeight: 700,
              fontSize: "13px",
              padding: "7px 12px",
              cursor: "pointer",
            }}
          >
            Tải thêm file ({files.length - visibleCount} còn lại)
          </button>
        </div>
      ) : null}

      {!expanded && canExpand ? (
        <button type="button" style={styles.expandOverlay} onClick={() => setExpanded(true)} aria-label="Xem thêm file">
          <span style={styles.expandBtn}>Xem thêm...</span>
        </button>
      ) : null}
    </div>
  );
}
