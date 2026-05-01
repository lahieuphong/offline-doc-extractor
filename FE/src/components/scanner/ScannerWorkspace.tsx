"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SharedBottomBar from "@/components/common/SharedBottomBar";

const HEADER_HEIGHT = 49;

const styles = {
  page: {
    height: "100vh",
    background: "#f3f4f6",
    color: "#334155",
    position: "relative" as const,
    overflow: "hidden",
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif',
  },
  topBar: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    padding: "12px 16px",
    background: "#fff",
    borderBottom: "1px solid #dde2eb",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
    display: "flex",
    alignItems: "center",
  },
  backBtn: {
    border: 0,
    background: "transparent",
    color: "#4b5563",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "14px",
    fontWeight: 600,
    padding: 0,
  },
  body: {
    position: "absolute" as const,
    inset: 0,
  },
  card: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
    border: 0,
    background: "#000000",
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
    display: "grid",
    alignContent: "start",
    padding: "106px 24px 96px",
  },
  cameraVideo: {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    zIndex: 0,
  },
  cameraVideoHidden: {
    opacity: 0,
    pointerEvents: "none" as const,
  },
  cameraFallback: {
    position: "absolute" as const,
    inset: 0,
    background:
      "linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.42)), radial-gradient(circle at 15% 30%, rgba(255, 255, 255, 0.08), transparent 40%), #000000",
    zIndex: 0,
  },
  cameraDimLayer: {
    position: "absolute" as const,
    inset: 0,
    background: "rgba(2, 6, 23, 0.26)",
    zIndex: 1,
  },
  cameraStatus: {
    position: "absolute" as const,
    left: "50%",
    bottom: "118px",
    transform: "translateX(-50%)",
    zIndex: 12,
    borderRadius: "999px",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 600,
    background: "rgba(15, 23, 42, 0.66)",
    color: "#e2e8f0",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  },
  cameraRetryBtn: {
    border: 0,
    borderRadius: "999px",
    padding: "4px 10px",
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 700,
  },
  startupOverlay: {
    position: "absolute" as const,
    inset: 0,
    zIndex: 16,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(160deg, rgba(2, 6, 23, 0.78), rgba(15, 23, 42, 0.72))",
    backdropFilter: "blur(4px)",
  },
  startupCard: {
    minWidth: "220px",
    borderRadius: "16px",
    border: "1px solid rgba(148, 163, 184, 0.35)",
    background: "rgba(15, 23, 42, 0.66)",
    padding: "18px 20px",
    boxShadow: "0 14px 34px rgba(2, 6, 23, 0.45)",
    display: "grid",
    gap: "10px",
    justifyItems: "center",
  },
  startupSpinner: {
    width: "34px",
    height: "34px",
    color: "#93c5fd",
  },
  startupTitle: {
    margin: 0,
    color: "#f8fafc",
    fontSize: "15px",
    fontWeight: 700,
  },
  startupSub: {
    margin: 0,
    color: "#cbd5e1",
    fontSize: "12px",
    fontWeight: 500,
  },
  categoryWrap: {
    position: "absolute" as const,
    top: `${12 + HEADER_HEIGHT}px`,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    width: "100%",
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none" as const,
  },
  categoryShell: {
    display: "flex",
    alignItems: "center",
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.15)",
    border: "1px solid rgba(255, 255, 255, 0.25)",
    padding: "4px",
    width: "min(92vw, 520px)",
  },
  scanFrame: {
    position: "absolute" as const,
    top: "24%",
    left: 0,
    right: 0,
    width: "100%",
    height: "min(58vh, 620px)",
    borderRadius: "18px",
    overflow: "hidden" as const,
    zIndex: 6,
    pointerEvents: "none" as const,
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "14%",
    height: "5px",
    background: "linear-gradient(90deg, transparent, #10b981 18%, #34d399 50%, #10b981 82%, transparent)",
    boxShadow: "0 0 20px rgba(16, 185, 129, 0.9)",
    willChange: "top",
  },
  categoryPill: {
    width: "100%",
    borderRadius: "999px",
    border: 0,
    background: "#ffffff",
    color: "#1d4ed8",
    textAlign: "center" as const,
    fontSize: "16px",
    fontWeight: 600,
    padding: "10px 16px",
    boxShadow: "0 3px 10px rgba(2, 6, 23, 0.18)",
  },
  cameraErrorPillWrap: {
    position: "absolute" as const,
    top: `${12 + HEADER_HEIGHT + 74}px`,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 11,
    width: "100%",
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none" as const,
  },
  cameraErrorPill: {
    background: "rgba(255, 255, 255, 0.08)",
    color: "#b91c1c",
    borderRadius: "999px",
    padding: "10px 24px",
    fontSize: "14px",
    fontWeight: 700,
    boxShadow: "0 12px 24px rgba(15, 23, 42, 0.22)",
    border: "1px solid rgba(254, 202, 202, 0.78)",
    backdropFilter: "blur(2px)",
    maxWidth: "min(92vw, 760px)",
    textAlign: "center" as const,
  },
  captureBtn: {
    border: 0,
    background: "transparent",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    position: "relative" as const,
  },
  captureOuter: {
    width: "56px",
    height: "56px",
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.9)",
    display: "grid",
    placeItems: "center",
  },
  captureInner: {
    width: "48px",
    height: "48px",
    borderRadius: "999px",
    background: "#ffffff",
  },
  pickerBtn: {
    width: "48px",
    height: "40px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "8px",
    background: "rgba(255, 255, 255, 0.1)",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    transition: "background 0.2s ease",
  },
  pickerIcon: {
    width: "20px",
    height: "20px",
  },
  hiddenInput: {
    display: "none",
  },
  scannerNextBtn: {
    border: 0,
    borderRadius: "8px",
    padding: "8px 12px",
    background: "rgba(229, 231, 235, 0.5)",
    color: "rgba(255, 255, 255, 0.7)",
    cursor: "not-allowed",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    transition: "all 0.2s ease",
    position: "relative" as const,
  },
  scannerNextBtnActive: {
    background: "#10b981",
    color: "#ffffff",
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(16, 185, 129, 0.35)",
  },
  scannerNextBtnBadge: {
    width: "24px",
    height: "24px",
    borderRadius: "999px",
    background: "rgba(239, 68, 68, 0.8)",
    color: "#ffffff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: 700,
    lineHeight: "24px",
    padding: 0,
    position: "absolute" as const,
    top: "-6px",
    right: "-6px",
    boxShadow: "0 6px 14px rgba(239, 68, 68, 0.35)",
  },
  scannerNextIcon: {
    width: "24px",
    height: "24px",
  },
  captureFlash: {
    position: "absolute" as const,
    inset: 0,
    zIndex: 17,
    pointerEvents: "none" as const,
    background: "rgba(255, 255, 255, 0.85)",
    animation: "captureFlash 220ms ease-out forwards",
  },
} as const;

type ScannerTransferItem = {
  name: string;
  type: string;
  dataUrl: string;
};

export default function ScannerWorkspace() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanLineRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [transferItems, setTransferItems] = useState<ScannerTransferItem[]>([]);
  const [flashVisible, setFlashVisible] = useState(false);

  const totalReadyItems = transferItems.length;

  async function openCamera() {
    setCameraLoading(true);
    setCameraError(null);
    setCameraReady(false);

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Trình duyệt chưa hỗ trợ camera ở ngữ cảnh hiện tại. Vui lòng dùng localhost hoặc HTTPS.");
      setCameraLoading(false);
      return;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const constraintsQueue: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: "environment" } }, audio: false },
      { video: true, audio: false },
    ];

    let stream: MediaStream | null = null;
    let lastError: unknown = null;

    for (const constraints of constraintsQueue) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!stream) {
      setCameraError("Không thể mở camera. Vui lòng cấp quyền camera trong trình duyệt.");
      setCameraLoading(false);
      return;
    }

    streamRef.current = stream;

    try {
      if (!videoRef.current) {
        throw new Error("video_element_not_ready");
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
      setCameraReady(true);
      setCameraError(null);
    } catch {
      setCameraError("Camera đã được cấp quyền nhưng chưa thể phát video.");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    } finally {
      setCameraLoading(false);
    }
  }

  useEffect(() => {
    openCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const line = scanLineRef.current;
    if (!line || typeof line.animate !== "function") return;

    const animation = line.animate(
      [{ top: "14%" }, { top: "82%" }],
      {
        duration: 1700,
        easing: "ease-in-out",
        iterations: Infinity,
        direction: "alternate",
      },
    );

    return () => animation.cancel();
  }, []);

  function enterReviewDoc() {
    if (totalReadyItems <= 0) return;
    sessionStorage.setItem("scanner_entry_ok", "1");
    sessionStorage.setItem("scanner_transfer_items", JSON.stringify(transferItems));
    const firstImage = transferItems.find((item) => item.type.startsWith("image/"));
    if (firstImage) {
      // Giữ key cũ để tương thích ngược với luồng trước đó.
      sessionStorage.setItem("scanner_captured_image_data_url", firstImage.dataUrl);
    }
    router.push("/review-doc");
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error(`Không thể đọc file ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function handlePickFiles(files: FileList | null) {
    if (!files?.length) return;
    const incoming = Array.from(files);

    try {
      const nextItems = await Promise.all(
        incoming.map(async (file) => ({
          name: file.name,
          type: file.type || "application/octet-stream",
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      setTransferItems((prev) => [...prev, ...nextItems]);
    } catch {
      setCameraError("Không thể thêm file lúc này. Vui lòng thử lại.");
    }
  }

  function captureImage() {
    if (!cameraReady || !videoRef.current) return;

    const video = videoRef.current;
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const frameWidth = video.clientWidth;
    const frameHeight = video.clientHeight;

    if (!sourceWidth || !sourceHeight || !frameWidth || !frameHeight) {
      setCameraError("Không thể chụp ảnh lúc này. Vui lòng thử lại.");
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;

    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Không thể khởi tạo bộ nhớ ảnh. Vui lòng thử lại.");
      return;
    }

    // Crop theo đúng vùng đang nhìn thấy trên khung scanner (object-fit: cover),
    // tránh lấy full góc rộng từ cảm biến camera.
    const sourceAspect = sourceWidth / sourceHeight;
    const frameAspect = frameWidth / frameHeight;

    let sx = 0;
    let sy = 0;
    let sWidth = sourceWidth;
    let sHeight = sourceHeight;

    if (sourceAspect > frameAspect) {
      sWidth = sourceHeight * frameAspect;
      sx = (sourceWidth - sWidth) / 2;
    } else if (sourceAspect < frameAspect) {
      sHeight = sourceWidth / frameAspect;
      sy = (sourceHeight - sHeight) / 2;
    }

    canvas.width = Math.max(1, Math.round(sWidth));
    canvas.height = Math.max(1, Math.round(sHeight));
    context.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setTransferItems((prev) => [
      ...prev,
      {
        name: `scanner_capture_${Date.now()}.jpg`,
        type: "image/jpeg",
        dataUrl,
      },
    ]);
    setFlashVisible(true);
    window.setTimeout(() => setFlashVisible(false), 230);
  }

  return (
    <div style={styles.page}>
      <style jsx global>{`
        @keyframes captureFlash {
          0% {
            opacity: 0.9;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
      <main style={styles.body}>
        <section style={styles.card}>
          <video ref={videoRef} autoPlay playsInline muted style={{ ...styles.cameraVideo, ...(cameraReady ? null : styles.cameraVideoHidden) }} />
          {!cameraReady || cameraError ? <div style={styles.cameraFallback} /> : null}
          <div style={styles.cameraDimLayer} />
          {cameraLoading && !cameraReady ? (
            <div style={styles.startupOverlay}>
              <div style={styles.startupCard}>
                <svg viewBox="0 0 24 24" style={styles.startupSpinner} aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.25" />
                  <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="2.5" fill="none">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
                  </path>
                </svg>
                <p style={styles.startupTitle}>Đang khởi tạo camera</p>
                <p style={styles.startupSub}>Vui lòng chờ trong giây lát...</p>
              </div>
            </div>
          ) : null}
          {flashVisible ? <div style={styles.captureFlash} /> : null}

          <div style={styles.categoryWrap}>
            <div style={styles.categoryShell}>
              <div style={styles.categoryPill}>Giấy tờ / Tài liệu</div>
            </div>
          </div>
          {!cameraReady && !cameraLoading && cameraError ? (
            <div style={styles.cameraErrorPillWrap}>
              <div style={styles.cameraErrorPill}>Không có kết nối camera. Vui lòng kiểm tra quyền truy cập camera hoặc thiết bị camera.</div>
            </div>
          ) : null}
          <div style={styles.scanFrame}>
          <div ref={scanLineRef} style={styles.scanLine} />
          </div>

          {!cameraReady ? (
            <div style={styles.cameraStatus}>
              <span>{cameraLoading ? "Đang bật camera..." : cameraError ?? "Đang chuẩn bị camera..."}</span>
              {!cameraLoading ? (
                <button type="button" style={styles.cameraRetryBtn} onClick={openCamera}>
                  Bật camera
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>

      <header style={styles.topBar}>
        <button type="button" style={styles.backBtn} onClick={() => history.back()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }} aria-hidden="true">
            <path d="m12 19-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19 12H5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Quay lại</span>
        </button>
      </header>

      <SharedBottomBar
        leftLabel="Quay lại"
        leftIcon={<span aria-hidden="true">←</span>}
        onLeftClick={() => history.back()}
        rightLabel="Bắt đầu quét"
        rightIcon={<span aria-hidden="true">→</span>}
        rightDisabled={totalReadyItems <= 0}
        onRightClick={enterReviewDoc}
        fixedBottom
        centerContent={null}
        showLeft={false}
        rightCompanion={
          <div style={{ display: "inline-flex", alignItems: "center", gap: "26px", marginRight: "12px" }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
              style={styles.hiddenInput}
              onChange={async (event) => {
                const input = event.currentTarget;
                const files = input.files;
                await handlePickFiles(files);
                input.value = "";
              }}
            />
            <button
              type="button"
              style={styles.pickerBtn}
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.pickerIcon} aria-hidden="true">
                <path d="M18 22H4a2 2 0 0 1-2-2V6" />
                <path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18" />
                <circle cx="12" cy="8" r="2" />
                <rect width="16" height="16" x="6" y="2" rx="2" />
              </svg>
            </button>
            <button type="button" aria-label="Nút chụp" style={styles.captureBtn} onClick={captureImage}>
              <span style={styles.captureOuter}>
                <span style={styles.captureInner} />
              </span>
            </button>
          </div>
        }
        rightCustomButton={
          <button
            type="button"
            disabled={totalReadyItems <= 0}
            style={{ ...styles.scannerNextBtn, ...(totalReadyItems > 0 ? styles.scannerNextBtnActive : null) }}
            title="Tiếp tục"
            onClick={enterReviewDoc}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.scannerNextIcon} aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
            {totalReadyItems > 0 ? <span style={styles.scannerNextBtnBadge}>{totalReadyItems}</span> : null}
          </button>
        }
      />
    </div>
  );
}
