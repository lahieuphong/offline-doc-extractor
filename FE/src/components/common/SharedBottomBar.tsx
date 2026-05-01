import type { CSSProperties, ReactNode } from "react";

type SharedBottomBarProps = {
  leftLabel: string;
  centerContent?: ReactNode;
  rightLabel: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onLeftClick: () => void;
  onRightClick: () => void;
  rightDisabled?: boolean;
  fixedBottom?: boolean;
  showLeft?: boolean;
  showRight?: boolean;
  rightCompanion?: ReactNode;
  rightCustomButton?: ReactNode;
};

const styles = {
  bottomBar: {
    height: "72px",
    background: "#08337B",
    borderRadius: 0,
    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: "0 16px",
    color: "#fff",
  } satisfies CSSProperties,
  bottomBtn: {
    border: 0,
    background: "transparent",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px",
    fontWeight: 400,
    cursor: "pointer",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    lineHeight: 1,
    padding: 0,
  } satisfies CSSProperties,
  label: {
    fontSize: "14px",
    fontWeight: 400,
    lineHeight: 1,
  } satisfies CSSProperties,
  icon: {
    width: "24px",
    height: "24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies CSSProperties,
  leftBackIcon: {
    width: "20px",
    height: "20px",
    marginBottom: "4px",
  } satisfies CSSProperties,
  rightExtractIcon: {
    width: "24px",
    height: "24px",
    marginBottom: "4px",
  } satisfies CSSProperties,
  bottomBtnRight: {
    color: "#fff",
    transition: "transform 0.2s ease",
  } satisfies CSSProperties,
  bottomBtnLeft: {} satisfies CSSProperties,
  center: { display: "none" } satisfies CSSProperties,
};

export default function SharedBottomBar({
  leftLabel,
  centerContent,
  rightLabel,
  leftIcon,
  rightIcon,
  onLeftClick,
  onRightClick,
  rightDisabled = false,
  fixedBottom = false,
  showLeft = true,
  showRight = true,
  rightCompanion,
  rightCustomButton,
}: SharedBottomBarProps) {
  const barStyle: CSSProperties = fixedBottom
    ? {
        ...styles.bottomBar,
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 0,
        zIndex: 40,
      }
    : styles.bottomBar;

  return (
    <footer style={barStyle}>
      {showLeft ? (
        <button type="button" style={{ ...styles.bottomBtn, ...styles.bottomBtnLeft }} onClick={onLeftClick}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.leftBackIcon} aria-hidden="true">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          <span style={styles.label}>{leftLabel}</span>
        </button>
      ) : null}

      <div style={styles.center}>{centerContent}</div>

      {showRight ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "14px" }}>
          {rightCompanion}
          {rightCustomButton ?? (
            <button
              type="button"
              style={{ ...styles.bottomBtn, ...styles.bottomBtnRight, ...(rightDisabled ? { opacity: 0.35, cursor: "not-allowed" } : { transform: "scale(1)" }) }}
              disabled={rightDisabled}
              onClick={onRightClick}
              onMouseEnter={(event) => {
                if (rightDisabled) return;
                event.currentTarget.style.transform = "scale(1.05)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = "scale(1)";
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.rightExtractIcon} aria-hidden="true">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <path d="M7 8h8" />
                <path d="M7 12h10" />
                <path d="M7 16h6" />
              </svg>
              <span style={styles.label}>{rightLabel}</span>
            </button>
          )}
        </div>
      ) : null}
    </footer>
  );
}
