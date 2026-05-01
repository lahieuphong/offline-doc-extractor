import { RefObject, useState } from "react";

type FileDropzoneProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAddFiles: (files: FileList | File[]) => void;
};

const styles = {
  dropzone: {
    borderWidth: "2px",
    borderStyle: "dashed",
    borderColor: "#d1d5db",
    borderRadius: "12px",
    padding: "32px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    background: "#ffffff",
  },
  dropzoneHover: {
    borderColor: "#60a5fa",
    background: "rgba(239, 246, 255, 0.4)",
  },
  dropIcon: {
    width: "40px",
    height: "40px",
    color: "#60a5fa",
  },
  dropTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#4b5563",
  },
  dropHint: {
    fontSize: "12px",
    color: "#9ca3af",
  },
  hiddenInput: { display: "none" },
} as const;

export default function FileDropzone({ fileInputRef, onAddFiles }: FileDropzoneProps) {
  const [isHovering, setIsHovering] = useState(false);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsHovering(false);
    if (event.dataTransfer.files?.length) {
      onAddFiles(event.dataTransfer.files);
    }
  }

  return (
    <section
      style={{ ...styles.dropzone, ...(isHovering ? styles.dropzoneHover : null) }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsHovering(true);
      }}
      onDragLeave={() => setIsHovering(false)}
      onDrop={handleDrop}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={() => fileInputRef.current?.click()}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.dropIcon} aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" x2="12" y1="3" y2="15" />
      </svg>
      <div style={styles.dropTitle}>Kéo thả hoặc click để chọn file</div>
      <div style={styles.dropHint}>Hỗ trợ: PDF, DOCX, TXT, PNG, JPG (có thể chọn nhiều file)</div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
        style={styles.hiddenInput}
        onChange={(event) => {
          if (event.target.files?.length) {
            onAddFiles(event.target.files);
          }
        }}
      />
    </section>
  );
}
