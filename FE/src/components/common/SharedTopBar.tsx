import type { CSSProperties } from "react";

type SharedTopBarProps = {
  title: string;
  backLabel?: string;
  onBackClick: () => void;
};

const styles = {
  topBar: {
    padding: "12px 16px",
    background: "#fff",
    borderBottom: "1px solid #dde2eb",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  topTitle: {
    margin: 0,
    textAlign: "center",
    fontSize: "16px",
    fontWeight: 600,
    color: "#374151",
  } satisfies CSSProperties,
  backBtn: {
    border: 0,
    background: "transparent",
    color: "#4b5563",
    cursor: "pointer",
    justifySelf: "start",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: 1,
    padding: 0,
  } satisfies CSSProperties,
  backIcon: {
    width: "20px",
    height: "20px",
  } satisfies CSSProperties,
  backLabel: {
    fontSize: "14px",
    fontWeight: 600,
  } satisfies CSSProperties,
  topSpacer: { width: "44px" } satisfies CSSProperties,
};

export default function SharedTopBar({ title, backLabel = "Quay lại", onBackClick }: SharedTopBarProps) {
  return (
    <header style={styles.topBar}>
      <button style={styles.backBtn} type="button" onClick={onBackClick}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.backIcon} aria-hidden="true">
          <path d="m12 19-7-7 7-7" />
          <path d="M19 12H5" />
        </svg>
        <span style={styles.backLabel}>{backLabel}</span>
      </button>
      <h1 style={styles.topTitle}>{title}</h1>
      <div style={styles.topSpacer} />
    </header>
  );
}
