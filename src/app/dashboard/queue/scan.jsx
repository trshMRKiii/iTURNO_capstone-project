import { useEffect, useState } from "react";
import { useQrScanner, SCANNER_STATUS_LABEL } from "./useQrScanner";
import { useScanChannel } from "../../../lib/useScanChannel";
import sfcLogo from "../../../pictures/sfc-nobg-logo.png";
import "../../../styles/Scan.css";

const PENDING_MS = 40000; // waiting for check-in on the Queue page before giving up
const RESULT_MS = 6000; // how long a finished check-in / error stays up

const formatStamp = (iso) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// Camera-only tab for a second monitor. Queue vs Roaming and the check-in itself
// happen on the Queue page; this tab just scans and shows the outcome.
function Scan() {
  // null -> plain feed | { pending, plate } | successful check-in
  const [result, setResult] = useState(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const postToQueue = useScanChannel((msg) => {
    if (msg.type === "pending")
      setResult({ pending: true, plate: msg.plate, iwpExpired: !!msg.iwpExpired, franchiseExpired: !!msg.franchiseExpired });
    else if (msg.type === "result") setResult({ ...msg, at: msg.at || new Date().toISOString() });
  });

  // Pending waits longer than a finished result; either way it falls back to the feed.
  useEffect(() => {
    if (!result) return undefined;
    const timer = setTimeout(() => setResult(null), result.pending ? PENDING_MS : RESULT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  // The overlay never pauses scanning — a new QR replaces it right away.
  const { videoRef, canvasRef, status } = useQrScanner((text) =>
    postToQueue({ type: "scan", text }),
  );

  return (
    <div className="scan-page">
      <header className="scan-top">
        <div className="scan-clock">
          {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
        <div className="scan-brand">
          <img src={sfcLogo} alt="SFC Logo" />
          <span>North Central Terminal</span>
        </div>
      </header>

      <div className="scan-stage">
        <video ref={videoRef} className="scan-video" muted playsInline />
        <canvas ref={canvasRef} className="queue-scanner-hidden" />
        <div className="scan-frame" />
        {status !== "on" && <div className="scan-hint">{SCANNER_STATUS_LABEL[status]}</div>}

        {result?.pending && (
          <div className="scan-result scan-result--pending">
            <div className="scan-result-plate">{result.plate}</div>
            {result.iwpExpired && (
              <div className="scan-result-warning">✕ Individual Working Permit expired</div>
            )}
            {result.franchiseExpired && (
              <div className="scan-result-warning">✕ Vehicle franchise expired</div>
            )}
            <div className="scan-result-error">Waiting for check-in…</div>
            
          </div>
        )}

        {result && !result.pending && (
          <div className="scan-result">
            {result.mode === "QUEUE" ? (
              <>
                <div className="scan-result-label">Queue Number</div>
                <div className="scan-result-big">{result.queueCode || "—"}</div>
              </>
            ) : (
              <div className="scan-result-big">Roaming</div>
            )}
            <div className="scan-result-plate">{result.plate}</div>
            <div className="scan-result-meta">{formatStamp(result.at)}</div>
            <div className="scan-result-note">Scan the next QR any time</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Scan;
