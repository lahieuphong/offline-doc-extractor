"use client";

import type { CSSProperties, FormEvent } from "react";
import { useState } from "react";
import { BACKEND_URL } from "@/lib/api";

const ui = {
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
  } satisfies CSSProperties,
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  } satisfies CSSProperties,
  label: { fontWeight: 700 } satisfies CSSProperties,
  fileInput: { display: "block", marginTop: "8px" } satisfies CSSProperties,
  checkbox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 700,
  } satisfies CSSProperties,
  button: {
    width: "fit-content",
    border: "none",
    borderRadius: "10px",
    padding: "12px 18px",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  } satisfies CSSProperties,
  buttonDisabled: { opacity: 0.65, cursor: "not-allowed" } satisfies CSSProperties,
  message: { marginTop: "20px", color: "#374151" } satisfies CSSProperties,
};

export default function UploadPanel() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [useLlm, setUseLlm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Chưa xử lý file nào.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!files || files.length === 0) {
      alert("Bạn chưa chọn file.");
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));
    formData.append("use_llm", useLlm ? "true" : "false");

    setLoading(true);
    setMessage(`Đang xử lý ${files.length} file...`);

    try {
      const response = await fetch(`${BACKEND_URL}/api/extract-excel`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Xử lý thất bại.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ket_qua_boc_tach_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMessage("Xử lý xong. File Excel đã được tải về.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Có lỗi không xác định.";
      setMessage(`Lỗi: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={ui.card}>
      <form onSubmit={handleSubmit} style={ui.form}>
        <label style={ui.label}>
          Chọn file PDF/DOCX/TXT/PNG/JPG
          <input
            style={ui.fileInput}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
            onChange={(event) => setFiles(event.target.files)}
          />
        </label>

        <label style={ui.checkbox}>
          <input type="checkbox" checked={useLlm} onChange={(event) => setUseLlm(event.target.checked)} />
          Dùng Ollama local LLM
        </label>

        <button disabled={loading} type="submit" style={{ ...ui.button, ...(loading ? ui.buttonDisabled : null) }}>
          {loading ? "Đang xử lý..." : "Bóc tách và tải Excel"}
        </button>
      </form>

      <p style={ui.message}>{message}</p>
    </div>
  );
}
