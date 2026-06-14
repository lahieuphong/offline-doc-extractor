"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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

type SortOption = "newest" | "oldest" | "most_files" | "least_files";

const PAGE_SIZE = 12;
const ACCENT = "#08337B";
const ACCENT_BG = "#EEF4FF";
const CHECK_COLOR = "#5B7FDB";

function formatViDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} tháng ${d.getMonth() + 1}, ${d.getFullYear()} lúc ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.round(Math.max(0, sec) % 60);
  if (m > 0) return `${m}p ${s}s`;
  return `${s}s`;
}

function getPaginationPages(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

// ── Checkbox ──────────────────────────────────────────────
function Checkbox({ checked, onChange }: { checked: boolean; onChange: (e: React.MouseEvent) => void }) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 16, height: 16, borderRadius: 4,
        border: `2px solid ${checked ? CHECK_COLOR : "#CBD5E1"}`,
        background: checked ? CHECK_COLOR : "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", flexShrink: 0,
        transition: "border-color 0.15s, background 0.15s",
        boxShadow: checked ? `0 0 0 2px rgba(91,127,219,0.18)` : "none",
      } satisfies CSSProperties}
    >
      {checked && <img src="/icons/check.svg" width={9} height={7} alt="" draggable={false} />}
    </div>
  );
}

// ── Info Popover ──────────────────────────────────────────
function InfoButton({ job }: { job: JobEntry }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const right = window.innerWidth - rect.right;
      const estimatedHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      if (spaceBelow >= estimatedHeight) {
        setPos({ top: rect.bottom + 8, bottom: undefined, right });
      } else {
        setPos({ top: undefined, bottom: window.innerHeight - rect.top + 8, right });
      }
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
        title="Chi tiết"
      >
        <img src="/icons/info.svg" width={17} height={17} alt="info" draggable={false} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            ...(pos.top !== undefined ? { top: pos.top } : {}),
            ...(pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
            right: pos.right, zIndex: 9999,
            background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.13)", padding: "12px 14px",
            width: "max-content", minWidth: 150, maxWidth: 230,
          } satisfies CSSProperties}
        >
          <p style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", margin: "0 0 6px 0", textTransform: "uppercase", letterSpacing: "0.07em" }}>Chi tiết</p>
          <p style={{ fontSize: 12, color: "#374151", margin: "0 0 3px 0" }}><span style={{ color: "#9CA3AF" }}>Số file: </span>{job.total_files}</p>
          {job.duration_sec > 0 && (
            <p style={{ fontSize: 12, color: "#374151", margin: "0 0 3px 0" }}><span style={{ color: "#9CA3AF" }}>Thời gian: </span>{formatDuration(job.duration_sec)}</p>
          )}
          {job.source_filenames.length > 0 && (
            <div style={{ marginTop: 8, borderTop: "1px solid #F3F4F6", paddingTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", margin: "0 0 4px 0", textTransform: "uppercase", letterSpacing: "0.07em" }}>Danh sách file:</p>
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {job.source_filenames.map((name, i) => (
                  <p key={i} style={{ fontSize: 11, color: "#374151", lineHeight: 2, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
                ))}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Hover-aware button ────────────────────────────────────
function HoverBtn({ style, hoverStyle, disabled, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { hoverStyle?: CSSProperties }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ ...style, ...(hov && !disabled ? hoverStyle : {}), transition: "all 0.15s" }}
    >
      {children}
    </button>
  );
}

// ── Card three-dot menu ───────────────────────────────────
function CardMenu({ onExport, onDelete, exporting, deleting }: {
  onExport: () => Promise<void>;
  onDelete: () => Promise<void>;
  exporting: boolean;
  deleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hovBtn, setHovBtn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const itemBase: CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
    fontSize: 13, fontWeight: 500, border: "none", background: "transparent",
    width: "100%", cursor: "pointer", textAlign: "left",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <a
        href="#"
        onMouseEnter={() => setHovBtn(true)}
        onMouseLeave={() => setHovBtn(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          width: 17, height: 17, borderRadius: "50%",
          border: `1px solid ${hovBtn ? "#9CA3AF" : "#D9D9D9"}`,
          background: hovBtn ? "#F3F4F6" : "#fff",
          boxShadow: "0 4px 30px rgba(0,0,0,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none", flexShrink: 0, transition: "all 0.15s",
        } satisfies CSSProperties}
      >
        <img src="/icons/ellipsis.svg" width={10} height={10} alt="menu" draggable={false} />
      </a>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 400,
            background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.13)", minWidth: 152, overflow: "hidden",
          } satisfies CSSProperties}
        >
          <button
            style={{ ...itemBase, color: exporting ? "#9CA3AF" : "#1E293B", opacity: exporting ? 0.6 : 1 }}
            onClick={async () => { setOpen(false); await onExport(); }}
            disabled={exporting}
          >
            <img src="/icons/excel.svg" width={14} height={14} alt="" draggable={false} />
            {exporting ? "Đang xuất..." : "Xuất Excel"}
          </button>
          <div style={{ height: 1, background: "#F3F4F6" }} />
          <button
            style={{ ...itemBase, color: deleting ? "#9CA3AF" : "#EF4444", opacity: deleting ? 0.6 : 1 }}
            onClick={async () => { setOpen(false); await onDelete(); }}
            disabled={deleting}
          >
            <img src="/icons/trash.svg" width={14} height={14} alt="" draggable={false} />
            {deleting ? "Đang xoá..." : "Xoá"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────
function JobCard({ job, selected, onToggle, onDelete }: {
  job: JobEntry;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const title = job.total_files === 1
    ? (job.source_filenames[0]?.replace(/\.[^.]+$/, "") || "1 file")
    : `${job.total_files} files`;

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs/${job.job_id}/result`);
      if (!res.ok) return;
      const payload = await res.json();
      const exp = await fetch(`${BACKEND_URL}/api/export-excel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!exp.ok) return;
      const blob = await exp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ket_qua_boc_tach_${job.job_id}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`${BACKEND_URL}/api/jobs/${job.job_id}`, { method: "DELETE" });
      onDelete();
    } finally { setDeleting(false); }
  };

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: selected ? ACCENT_BG : "#fff",
        border: `${selected ? 2 : 1}px solid ${selected ? CHECK_COLOR : (hovered ? "#CBD5E1" : "#E5E7EB")}`,
        borderRadius: 12, display: "flex", flexDirection: "column",
        minHeight: 250, maxHeight: 250, cursor: "pointer",
        transition: "box-shadow 0.18s ease, transform 0.18s ease, border-color 0.15s ease, background 0.15s ease",
        opacity: deleting ? 0.45 : 1,
        boxShadow: hovered ? "0 6px 20px rgba(0,0,0,0.10)" : "0 1px 4px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        userSelect: "none",
      } satisfies CSSProperties}
    >
      {/* Top area */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1 }}>
          <Checkbox checked={selected} onChange={(e) => { e.stopPropagation(); onToggle(); }} />
        </div>
        <img src="/icons/folder.svg" alt="" width={80} draggable={false} style={{ height: "auto", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 11, bottom: 8 }} onClick={(e) => e.stopPropagation()}>
          <InfoButton job={job} />
        </div>
      </div>

      <div style={{ height: 1, background: "#D9D9D9", flexShrink: 0 }} />

      {/* Bottom area */}
      <div style={{ padding: "8px 10px 10px 12px", minHeight: 70, maxHeight: 85, position: "relative", boxSizing: "border-box" } satisfies CSSProperties}>
        <p
          title={title}
          style={{ fontSize: 13, fontWeight: 600, color: "#1F1F1F", marginBottom: 4, paddingRight: 34, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties}
        >
          {title}
        </p>
        <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>{formatViDate(job.created_at)}</p>
        <div style={{ position: "absolute", top: 8, right: 10 }} onClick={(e) => e.stopPropagation()}>
          <CardMenu onExport={handleExport} onDelete={handleDelete} exporting={exporting} deleting={deleting} />
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────
export default function MediaWorkspace() {
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/jobs`);
      if (res.ok) setJobs(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);
  useEffect(() => { setPage(1); }, [search, sortBy]);

  const filtered = jobs.filter((j) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return j.source_filenames.some((f) => f.toLowerCase().includes(q)) || j.job_id.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "oldest") return a.created_at - b.created_at;
    if (sortBy === "most_files") return b.total_files - a.total_files;
    if (sortBy === "least_files") return a.total_files - b.total_files;
    return b.created_at - a.created_at;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pagedIds = paged.map((j) => j.job_id);
  const hasSelection = selectedIds.size > 0;

  function toggleJob(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function selectAllPage() {
    setSelectedIds((prev) => { const n = new Set(prev); pagedIds.forEach((id) => n.add(id)); return n; });
  }

  function deselectAll() { setSelectedIds(new Set()); }

  function removeJob(jobId: string) {
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
  }

  async function handleBulkExport() {
    setBulkExporting(true);
    for (const jobId of Array.from(selectedIds)) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/result`);
        if (!res.ok) continue;
        const payload = await res.json();
        const exp = await fetch(`${BACKEND_URL}/api/export-excel`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        if (!exp.ok) continue;
        const blob = await exp.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `ket_qua_boc_tach_${jobId}.xlsx`;
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 200));
      } catch { /* silent */ }
    }
    setBulkExporting(false);
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    await Promise.all(Array.from(selectedIds).map(async (id) => {
      try { await fetch(`${BACKEND_URL}/api/jobs/${id}`, { method: "DELETE" }); } catch { /* silent */ }
      removeJob(id);
    }));
    setSelectedIds(new Set());
    setBulkDeleting(false);
  }

  const btnOutline: CSSProperties = {
    height: 32, borderRadius: 7, border: "1px solid #D9D9D9", background: "#fff",
    padding: "0 12px", fontSize: 13, fontWeight: 500, color: "#374151",
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  };

  const pgBtn = (active: boolean, disabled = false): CSSProperties => ({
    width: 32, height: 32, borderRadius: 7, border: `1px solid ${active ? CHECK_COLOR : "#E5E7EB"}`,
    background: active ? CHECK_COLOR : "#fff", color: active ? "#fff" : "#374151",
    fontSize: 13, fontWeight: active ? 600 : 400, cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.38 : 1,
    transition: "all 0.15s", flexShrink: 0,
  });

  return (
    <main style={{ height: "100vh", background: "#f3f4f6", color: "#0f172a", paddingTop: 96, boxSizing: "border-box", overflowX: "hidden", overflowY: "hidden" } satisfies CSSProperties}>

      {/* Fixed header */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 48, height: 96, padding: "0 clamp(12px,3vw,48px)", boxSizing: "border-box", background: "#fff", borderBottom: "1px solid rgba(33,33,33,1)", display: "flex", alignItems: "center" } satisfies CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", width: "100%", justifyContent: "space-between" }}>
          <img style={{ width: "clamp(110px,12vw,149px)", height: "clamp(30px,3.2vw,40px)", objectFit: "contain" } satisfies CSSProperties} src="/images/logo.svg" alt="AutoField" />
          <img style={{ width: "clamp(34px,3vw,40px)", height: "clamp(34px,3vw,40px)", borderRadius: 999, border: "1px solid #e5e7eb", objectFit: "cover", background: "#d1d5db", flexShrink: 0 } satisfies CSSProperties} src="/images/default-avartar.svg" alt="Avatar" />
        </div>
      </header>

      {/* Body */}
      <section style={{ width: "calc(100% - 2 * clamp(12px,3vw,48px))", height: "calc(100vh - 112px)", margin: "8px auto", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 14, boxSizing: "border-box", overflow: "hidden", display: "flex", flexDirection: "column" } satisfies CSSProperties}>

        {/* Top bar: "Gần đây" title + Scan AI */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 24px", flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>Gần đây</h2>
          <Link
            href="/scanner"
            style={{ textDecoration: "none", height: 34, borderRadius: 8, background: ACCENT, color: "#fff", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, padding: "0 16px", flexShrink: 0 } satisfies CSSProperties}
          >
            <img src="/icons/scan-ai.svg" width={20} height={20} alt="" draggable={false} />
            Scan AI
          </Link>
        </div>

        <div style={{ height: 1, background: "#E5E7EB", flexShrink: 0 }} />

        {/* Secondary bar: Search + Sort + Filter + Select actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", flexShrink: 0, gap: 10, flexWrap: "wrap" }}>
          {/* Left: search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ height: 32, minWidth: 220, flex: "1 1 220px", maxWidth: 340, borderRadius: 7, border: "1px solid #D9D9D9", background: "#fff", display: "flex", alignItems: "center", padding: "0 10px", gap: 7 } satisfies CSSProperties}>
              <img src="/icons/search.svg" width={15} height={15} alt="" draggable={false} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm..."
                style={{ border: 0, outline: "none", width: "100%", fontSize: 13, color: "#1f2937", background: "transparent" }}
              />
            </label>
          </div>

          {/* Right: selection actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {hasSelection ? (
              <>
                <span style={{ fontSize: 13, color: "#6B7280", whiteSpace: "nowrap" }}>Đã chọn: <strong>{selectedIds.size}</strong></span>
                <HoverBtn onClick={deselectAll} style={btnOutline} hoverStyle={{ background: "#F3F4F6", border: "1px solid #9CA3AF" }}>Bỏ chọn</HoverBtn>
                <HoverBtn
                  onClick={handleBulkExport}
                  disabled={bulkExporting}
                  style={{ ...btnOutline, color: bulkExporting ? "#9CA3AF" : ACCENT, border: `1px solid ${ACCENT}`, opacity: bulkExporting ? 0.6 : 1 }}
                  hoverStyle={{ background: ACCENT_BG }}
                >
                  <img src="/icons/download.svg" width={13} height={13} alt="" draggable={false} />
                  {bulkExporting ? "Đang tải..." : "Tải xuống"}
                </HoverBtn>
                <HoverBtn
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  style={{ ...btnOutline, color: bulkDeleting ? "#9CA3AF" : "#EF4444", border: "1px solid #FECACA", opacity: bulkDeleting ? 0.6 : 1 }}
                  hoverStyle={{ background: "#FFF1F1", border: "1px solid #FCA5A5" }}
                >
                  <img src="/icons/trash.svg" width={13} height={13} alt="" draggable={false} />
                  {bulkDeleting ? "Đang xoá..." : "Xoá"}
                </HoverBtn>
              </>
            ) : (
              <HoverBtn onClick={selectAllPage} disabled={paged.length === 0} style={{ ...btnOutline, opacity: paged.length === 0 ? 0.4 : 1 }} hoverStyle={{ background: "#F3F4F6", border: "1px solid #9CA3AF" }}>
                Chọn tất cả
              </HoverBtn>
            )}
          </div>
        </div>

        <div style={{ height: 1, background: "#E5E7EB", flexShrink: 0 }} />

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 16px" }}>
          {sorted.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 52, gap: 12, color: "#9CA3AF" }}>
              <img src="/icons/folder.svg" width={64} alt="" draggable={false} style={{ opacity: 0.35 }} />
              <span style={{ fontSize: 14 }}>
                {search ? "Không tìm thấy kết quả phù hợp." : "Chưa có phiên bóc tách nào."}
              </span>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 16 }}>
              {paged.map((job) => (
                <JobCard
                  key={job.job_id}
                  job={job}
                  selected={selectedIds.has(job.job_id)}
                  onToggle={() => toggleJob(job.job_id)}
                  onDelete={() => removeJob(job.job_id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination — always visible */}
        <div style={{ flexShrink: 0, borderTop: "1px solid #E5E7EB", padding: "10px 24px", display: "flex", justifyContent: "center", alignItems: "center", gap: 6, background: "#f8fafc" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            style={{ ...pgBtn(false, safePage === 1), width: "auto", padding: "0 12px" }}
          >
            ← Trước
          </button>
          {getPaginationPages(safePage, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`e${i}`} style={{ width: 32, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>…</span>
            ) : (
              <button key={p} onClick={() => setPage(p as number)} style={pgBtn(p === safePage)}>
                {p}
              </button>
            )
          )}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            style={{ ...pgBtn(false, safePage === totalPages), width: "auto", padding: "0 12px" }}
          >
            Sau →
          </button>
        </div>
      </section>
    </main>
  );
}
