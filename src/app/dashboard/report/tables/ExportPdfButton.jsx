import { useState } from "react";

const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Export button that shows progress: a year-wide export fetches every row and then builds the
// PDF in the browser, which takes long enough that a silent button looks broken. `onExport`
// receives a callback taking 0–1; exports that never call it get an indeterminate spinning ring.
export default function ExportPdfButton({ onExport, label = "Export PDF", title, disabled }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);

  const handleClick = async () => {
    setBusy(true);
    // Let the spinner paint before the (blocking) PDF build starts.
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await onExport((p) => setProgress(Math.min(p, 1)));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <button
      className="rpt-btn-export rpt-btn-export--navy"
      title={title}
      disabled={disabled || busy}
      onClick={handleClick}
    >
      {busy ? (
        <svg className={`rpt-ring${progress == null ? " rpt-ring--indeterminate" : ""}`} width="18" height="18" viewBox="0 0 18 18">
          <circle className="rpt-ring-track" cx="9" cy="9" r={RADIUS} />
          <circle
            className="rpt-ring-fill"
            cx="9"
            cy="9"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - (progress ?? 0.25))}
          />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )}
      {busy ? `Preparing PDF…${progress == null ? "" : ` ${Math.round(progress * 100)}%`}` : label}
    </button>
  );
}
