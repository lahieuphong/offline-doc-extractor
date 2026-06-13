"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import { BACKEND_URL } from "@/lib/api";

interface JobEntry {
  job_id: string;
  batch_id: string | null;
  total_files: number;
  duration_sec: number;
  source_filenames: string[];
  created_at: number;
}

function formatViDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  return `${day} tháng ${month}, ${year} lúc ${h}:${m}`;
}

function FolderIcon({ color = "#08337B" }: { color?: string }) {
  return (
    <svg width="72" height="60" viewBox="0 0 72 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="12" width="72" height="48" rx="7" fill={color} fillOpacity="0.13" />
      <rect x="0" y="12" width="72" height="48" rx="7" fill="url(#folderGrad)" />
      <path d="M0 19C0 15.134 3.134 12 7 12H28L34 20H65C68.866 20 72 23.134 72 27V53C72 56.866 68.866 60 65 60H7C3.134 60 0 56.866 0 53V19Z" fill={color} fillOpacity="0.18" />
      <path d="M2 21C2 17.686 4.686 15 8 15H27L33 23H64C67.314 23 70 25.686 70 29V53C70 56.314 67.314 59 64 59H8C4.686 59 2 56.314 2 53V21Z" fill={color} fillOpacity="0.85" />
      <rect x="18" y="30" width="36" height="4" rx="2" fill="white" fillOpacity="0.55" />
      <rect x="18" y="38" width="28" height="4" rx="2" fill="white" fillOpacity="0.4" />
      <rect x="18" y="46" width="20" height="4" rx="2" fill="white" fillOpacity="0.28" />
      <defs>
        <linearGradient id="folderGrad" x1="0" y1="12" x2="72" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor={color} stopOpacity="0.06" />
          <stop offset="1" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ThreeDotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="4" r="1.5" fill="#6b7280" />
      <circle cx="9" cy="9" r="1.5" fill="#6b7280" />
      <circle cx="9" cy="14" r="1.5" fill="#6b7280" />
    </svg>
  );
}

const styles = {
  page: {
    height: "100vh",
    background: "#f3f4f6",
    color: "#0f172a",
    paddingTop: "96px",
    boxSizing: "border-box",
    overflowX: "hidden",
    overflowY: "hidden",
  } satisfies CSSProperties,
  header: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 48,
    height: "96px",
    minHeight: "96px",
    maxHeight: "96px",
    padding: "0 clamp(12px, 3vw, 48px)",
    boxSizing: "border-box",
    background: "#fff",
    borderBottom: "1px solid rgba(33, 33, 33, 1)",
    display: "flex",
    alignItems: "center",
  } satisfies CSSProperties,
  headerInner: {
    display: "flex",
    alignItems: "center",
    width: "100%",
    minWidth: 0,
    justifyContent: "space-between",
  } satisfies CSSProperties,
  logoWrap: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  logoImg: {
    width: "clamp(110px, 12vw, 149px)",
    height: "clamp(30px, 3.2vw, 40px)",
    display: "block",
    objectFit: "contain",
  } satisfies CSSProperties,
  avatar: {
    width: "clamp(34px, 3vw, 40px)",
    height: "clamp(34px, 3vw, 40px)",
    borderRadius: "999px",
    border: "1px solid #e5e7eb",
    transition: "opacity 0.2s ease",
    objectFit: "cover",
    background: "#d1d5db",
    flexShrink: 0,
  } satisfies CSSProperties,
  body: {
    width: "calc(100% - (2 * clamp(12px, 3vw, 48px)))",
    height: "calc(100vh - 112px)",
    margin: "8px auto 8px",
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: "14px",
    boxSizing: "border-box",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    padding: "20px 24px",
    flexShrink: 0,
  } satisfies CSSProperties,
  searchWrap: {
    width: "300px",
    height: "34px",
    borderRadius: "8px",
    border: "1px solid #D9D9D9",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: "8px",
  } satisfies CSSProperties,
  searchInput: {
    border: 0,
    outline: "none",
    width: "100%",
    fontSize: "14px",
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: "normal",
    color: "#1f2937",
    background: "transparent",
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  } satisfies CSSProperties,
  primaryAction: {
    textDecoration: "none",
    height: "34px",
    minWidth: "auto",
    borderRadius: "8px",
    background: "#08337B",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: "normal",
    padding: "0 16px",
  } satisfies CSSProperties,
  divider: {
    height: "1px",
    background: "#e5e7eb",
    flexShrink: 0,
  } satisfies CSSProperties,
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
  } satisfies CSSProperties,
  sectionLabel: {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: "16px",
  } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
    gap: "20px",
  } satisfies CSSProperties,
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: "60px",
    gap: "12px",
    color: "#9ca3af",
  } satisfies CSSProperties,
  emptyText: {
    fontSize: "14px",
    fontWeight: 400,
  } satisfies CSSProperties,
};

function JobCard({ job, onDelete, onExport }: { job: JobEntry; onDelete: () => void; onExport: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const title = job.total_files === 1
    ? (job.source_filenames[0]?.replace(/\.[^.]+$/, "") || "1 file")
    : `${job.total_files} files`;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  async function handleExport() {
    setMenuOpen(false);
    setExporting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/${job.job_id}/result`);
      if (!res.ok) throw new Error("Không tải được kết quả.");
      const payload = await res.json();
      const exportRes = await fetch(`${BACKEND_URL}/api/export-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!exportRes.ok) throw new Error("Xuất Excel thất bại.");
      const blob = await exportRes.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ket_qua_boc_tach_${job.job_id}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setMenuOpen(false);
    setDeleting(true);
    try {
      await fetch(`${BACKEND_URL}/api/jobs/${job.job_id}`, { method: "DELETE" });
      onDelete();
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  }

  const cardStyle: CSSProperties = {
    position: "relative",
    background: "#fff",
    borderRadius: "14px",
    border: "1px solid #e5e7eb",
    padding: "16px 14px 14px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    cursor: "default",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    transition: "box-shadow 0.15s",
    opacity: deleting ? 0.4 : 1,
  };

  const menuBtnStyle: CSSProperties = {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    border: "none",
    background: menuOpen ? "#f3f4f6" : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 0.15s",
  };

  const dropdownStyle: CSSProperties = {
    position: "absolute",
    top: "38px",
    right: "8px",
    zIndex: 100,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    minWidth: "148px",
    overflow: "hidden",
  };

  const menuItemBase: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    width: "100%",
    textAlign: "left",
  };

  const titleStyle: CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    color: "#1e293b",
    textAlign: "center",
    lineHeight: 1.35,
    maxWidth: "120px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const dateStyle: CSSProperties = {
    fontSize: "10px",
    fontWeight: 400,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 1.4,
  };

  const fileCountBadge: CSSProperties = {
    position: "absolute",
    bottom: "6px",
    right: "6px",
    background: "#08337B",
    color: "#fff",
    fontSize: "9px",
    fontWeight: 700,
    borderRadius: "4px",
    padding: "1px 5px",
    lineHeight: 1.6,
    display: job.total_files > 1 ? "block" : "none",
  };

  return (
    <div style={cardStyle} ref={menuRef}>
      <button
        style={menuBtnStyle}
        onClick={() => setMenuOpen((v) => !v)}
        disabled={exporting || deleting}
        title="Tùy chọn"
      >
        <ThreeDotsIcon />
      </button>

      {menuOpen && (
        <div style={dropdownStyle}>
          <button
            style={{ ...menuItemBase, color: exporting ? "#9ca3af" : "#1e293b" }}
            onClick={handleExport}
            disabled={exporting}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3" stroke="#08337B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 10v1.5A.5.5 0 0 0 2.5 12h9a.5.5 0 0 0 .5-.5V10" stroke="#08337B" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {exporting ? "Đang xuất..." : "Xuất Excel"}
          </button>
          <div style={{ height: "1px", background: "#f3f4f6" }} />
          <button
            style={{ ...menuItemBase, color: "#ef4444" }}
            onClick={handleDelete}
            disabled={deleting}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M5 3.5l.5 8M7 3.5v8M9 3.5l-.5 8" stroke="#ef4444" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {deleting ? "Đang xoá..." : "Xoá"}
          </button>
        </div>
      )}

      <div style={{ position: "relative", marginTop: "4px" }}>
        <FolderIcon color="#08337B" />
        <span style={fileCountBadge}>{job.total_files} files</span>
      </div>

      <div style={titleStyle} title={title}>{title}</div>
      <div style={dateStyle}>{formatViDate(job.created_at)}</div>
    </div>
  );
}

export default function MediaWorkspace() {
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [search, setSearch] = useState("");

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs`);
      if (res.ok) setJobs(await res.json());
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const filtered = search.trim()
    ? jobs.filter((j) =>
        j.source_filenames.some((f) => f.toLowerCase().includes(search.toLowerCase())) ||
        j.job_id.toLowerCase().includes(search.toLowerCase())
      )
    : jobs;

  function removeJob(jobId: string) {
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logoWrap}>
            <img style={styles.logoImg} src="/logo.svg" alt="AutoField" />
          </div>
          <img style={styles.avatar} src="/default-avartar.svg" alt="Avatar" />
        </div>
      </header>

      <section style={styles.body}>
        <div style={styles.toolbar}>
          <label style={styles.searchWrap}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#9ca3af" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              style={styles.searchInput}
              placeholder="Tìm kiếm biểu mẫu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div style={styles.actions}>
            <Link href="/scanner" style={styles.primaryAction}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 16.6765C10 17.1313 9.55228 17.5 9 17.5C8.44772 17.5 8 17.1313 8 16.6765V4.32353C8 3.86871 8.44772 3.5 9 3.5C9.55228 3.5 10 3.86871 10 4.32353V16.6765Z" fill="white" />
                <path d="M7.68789 16.5C7.21094 16.5 6.80018 16.5001 6.46345 16.4726C6.11651 16.4442 5.77086 16.3819 5.4388 16.2128C4.94325 15.9602 4.53977 15.5567 4.28725 15.0612C4.11812 14.7291 4.0558 14.3835 4.02744 14.0365C3.99995 13.6998 4 13.2891 4 12.8121V8.18789C4 7.71078 3.99994 7.29941 4.02744 6.9626C4.0558 6.61568 4.11814 6.26998 4.28725 5.93794C4.53973 5.4425 4.94338 5.03977 5.4388 4.78725C5.77088 4.61808 6.11649 4.55495 6.46345 4.52658C6.80017 4.4991 7.21096 4.5 7.68789 4.5H9.8538V6.25606H7.68789C7.18188 6.25606 6.8545 6.25717 6.60579 6.27749C6.36777 6.29699 6.27874 6.32999 6.23537 6.35209C6.07055 6.43628 5.93614 6.57046 5.85209 6.73537C5.82997 6.7789 5.79693 6.86793 5.77749 7.10579C5.75719 7.35453 5.75606 7.68187 5.75606 8.18789V12.8121C5.75606 13.3181 5.75717 13.6455 5.77749 13.8942C5.79699 14.1323 5.82999 14.2213 5.85209 14.2646C5.93621 14.4295 6.0705 14.5638 6.23537 14.6479C6.27875 14.67 6.36772 14.703 6.60579 14.7225C6.8545 14.7428 7.18188 14.7439 7.68789 14.7439H9.8538V16.5H7.68789ZM16 12.8121C16 13.289 16.0009 13.6998 15.9734 14.0366C15.945 14.3835 15.8819 14.7291 15.7128 15.0612C15.4602 15.5566 15.0575 15.9603 14.5621 16.2128C14.23 16.3819 13.8843 16.4442 13.5374 16.4726C13.2006 16.5001 12.7892 16.5 12.3121 16.5H11.6099V14.7439H12.3121C12.8181 14.7439 13.1455 14.7428 13.3942 14.7225C13.6321 14.7031 13.7211 14.67 13.7646 14.6479C13.9295 14.5639 14.0637 14.4295 14.1479 14.2646C14.17 14.2213 14.203 14.1322 14.2225 13.8942C14.2428 13.6455 14.2439 13.3181 14.2439 12.8121V8.18789C14.2439 7.68184 14.2428 7.35454 14.2225 7.10579C14.203 6.86753 14.17 6.77882 14.1479 6.73537C14.0638 6.57033 13.9297 6.43624 13.7646 6.35209C13.7212 6.32998 13.6325 6.29697 13.3942 6.2775C13.1455 6.25719 12.8182 6.25606 12.3121 6.25606H11.6099V4.5H12.3121C12.7892 4.5 13.2006 4.49908 13.5374 4.52658C13.8844 4.55495 14.2299 4.61805 14.5621 4.78725C15.0575 5.03975 15.4603 5.44254 15.7128 5.93795C15.882 6.27007 15.945 6.61559 15.9734 6.9626C16.0009 7.29942 16 7.71076 16 8.18789V12.8121Z" fill="white" />
                <path d="M13.5 0L13.9052 1.09487L15 1.5L13.9052 1.90514L13.5 3L13.0949 1.90514L12 1.5L13.0949 1.09487L13.5 0Z" fill="white" />
                <path d="M17.5 3L17.9052 4.09486L19 4.5L17.9052 4.90514L17.5 6L17.0949 4.90514L16 4.5L17.0949 4.09486L17.5 3Z" fill="white" />
                <path d="M17 0L17.27 0.7299L18 1L17.27 1.2701L17 2L16.7298 1.2701L16 1L16.7298 0.7299L17 0Z" fill="white" />
              </svg>
              Scan AI
            </Link>
          </div>
        </div>

        <div style={styles.divider} />

        <div style={styles.scrollArea}>
          {filtered.length === 0 ? (
            <div style={styles.emptyState}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="4" y="14" width="40" height="30" rx="5" fill="#e5e7eb" />
                <path d="M4 20C4 16.686 6.686 14 10 14H20L26 22H38C41.314 22 44 24.686 44 28V39C44 42.314 41.314 45 38 45H10C6.686 45 4 42.314 4 39V20Z" fill="#d1d5db" />
              </svg>
              <span style={styles.emptyText}>
                {search ? "Không tìm thấy kết quả phù hợp." : "Chưa có phiên bóc tách nào."}
              </span>
            </div>
          ) : (
            <>
              <div style={styles.sectionLabel}>Gần đây</div>
              <div style={styles.grid}>
                {filtered.map((job) => (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    onDelete={() => removeJob(job.job_id)}
                    onExport={() => {}}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
