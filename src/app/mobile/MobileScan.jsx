import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import { useMobileScan } from "./useMobileScan";
import "../../styles/MobileScan.css";

function MobileScan() {
  const {
    loading,
    scannedVehicle,
    selectedDriver,
    mode,
    setMode,
    selectedSeriesId,
    setSelectedSeriesId,
    activeDrivers,
    availableSeries,
    ticketFee,
    submitting,
    result,
    error,
    handleQrResult,
    handleDriverChange,
    handleSubmit,
    reset,
  } = useMobileScan();

  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const stopScanner = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data) {
      handleQrResult(code.data);
      stopScanner();
      return;
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  }, [handleQrResult, stopScanner]);

  const startScanner = async () => {
    setScanError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScanError(
        "Camera not available. Make sure you're using HTTPS or have enabled the insecure-origins Chrome flag for this URL."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
      }

      setScanning(true);
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      const msg = err.name || err.message || String(err);
      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        setScanError("Camera permission denied. Allow camera access in your browser settings and try again.");
      } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
        setScanError("No camera found on this device.");
      } else if (msg.includes("NotReadableError") || msg.includes("TrackStartError")) {
        setScanError("Camera is in use by another app. Close other camera apps and try again.");
      } else {
        setScanError(`Camera error: ${msg}`);
      }
    }
  };

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  if (loading) {
    return (
      <div className="ms-page">
        <div className="ms-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="ms-page">
      <header className="ms-header">
        <button className="ms-back-btn" onClick={() => navigate(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div>
          <h1 className="ms-title">iTURNO Mobile</h1>
          <p className="ms-subtitle">Scan QR to issue ticket or log roaming</p>
        </div>
      </header>

      {result && (
        <div className="ms-alert ms-alert--success">{result}</div>
      )}
      {error && (
        <div className="ms-alert ms-alert--error">{error}</div>
      )}
      {scanError && (
        <div className="ms-alert ms-alert--error">{scanError}</div>
      )}

      {/* QR Scanner */}
      <div className="ms-card">
        <div className="ms-qr-reader">
          <video
            ref={videoRef}
            style={{
              width: "100%",
              borderRadius: "10px",
              display: scanning ? "block" : "none",
            }}
            muted
            playsInline
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {!scanning && !scannedVehicle && (
            <div className="ms-qr-placeholder">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="3" height="3" />
                <path d="M21 14h-1v3h-3v1h3v3h1v-3h3v-1h-3z" />
              </svg>
              <span>Tap below to start scanning</span>
            </div>
          )}
        </div>
        <div className="ms-scan-actions">
          {!scanning && !scannedVehicle && (
            <button className="ms-btn ms-btn--primary" onClick={startScanner}>
              Start Scanner
            </button>
          )}
          {scanning && (
            <button className="ms-btn ms-btn--outline" onClick={stopScanner}>
              Stop Scanner
            </button>
          )}
          {scannedVehicle && (
            <button
              className="ms-btn ms-btn--outline"
              onClick={() => {
                reset();
                setTimeout(() => startScanner(), 100);
              }}
            >
              Scan Again
            </button>
          )}
        </div>
      </div>

      {/* Vehicle Info */}
      {scannedVehicle && (
        <div className="ms-card">
          <div className="ms-vehicle-info">
            <span className="ms-label">Vehicle</span>
            <span className="ms-plate">{scannedVehicle.plate_number}</span>
            <span className="ms-route">
              {scannedVehicle.route_detail?.full_name || "No route"}
            </span>
            <span className={`ms-status ms-status--${scannedVehicle.status.toLowerCase()}`}>
              {scannedVehicle.status}
            </span>
          </div>

          {/* Mode Selection */}
          <div className="ms-field">
            <span className="ms-label">Action</span>
            <div className="ms-radio-group">
              <label className={`ms-radio ${mode === "QUEUE" ? "ms-radio--active" : ""}`}>
                <input
                  type="radio"
                  name="mode"
                  value="QUEUE"
                  checked={mode === "QUEUE"}
                  onChange={() => setMode("QUEUE")}
                />
                <span className="ms-radio-dot" />
                <span>Queue (Issue Ticket)</span>
              </label>
              <label className={`ms-radio ${mode === "ROAM" ? "ms-radio--active" : ""}`}>
                <input
                  type="radio"
                  name="mode"
                  value="ROAM"
                  checked={mode === "ROAM"}
                  onChange={() => setMode("ROAM")}
                />
                <span className="ms-radio-dot" />
                <span>Roam (Log Only)</span>
              </label>
            </div>
          </div>

          {/* Ticket Series (only for QUEUE mode) */}
          {mode === "QUEUE" && (
            <div className="ms-field">
              <span className="ms-label">Ticket Series</span>
              <select
                className="ms-select"
                value={selectedSeriesId}
                onChange={(e) => setSelectedSeriesId(e.target.value)}
              >
                <option value="">— Select series —</option>
                {availableSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.ticket_form_label || "Unspecified"} — Series {s.series_no} ({s.pcs} pcs)
                  </option>
                ))}
              </select>
              {ticketFee > 0 && (
                <span className="ms-fee">Fee: ₱{ticketFee.toFixed(2)}</span>
              )}
            </div>
          )}

          {/* Driver Select */}
          <div className="ms-field">
            <span className="ms-label">Driver</span>
            {selectedDriver && (
              <div className="ms-driver-badge">
                <span className="ms-driver-avatar">
                  {selectedDriver.name.charAt(0)}
                </span>
                <span>{selectedDriver.name}</span>
              </div>
            )}
            <select
              className="ms-select"
              value={selectedDriver?.id || ""}
              onChange={(e) => handleDriverChange(e.target.value)}
            >
              <option value="">— Select driver —</option>
              {activeDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <button
            className={`ms-btn ms-btn--primary ms-btn--lg ${mode === "ROAM" ? "ms-btn--roam" : ""}`}
            onClick={handleSubmit}
            disabled={submitting || !selectedDriver || (mode === "QUEUE" && !selectedSeriesId)}
          >
            {submitting
              ? "Submitting..."
              : mode === "QUEUE"
                ? "Issue Ticket"
                : "Log Roaming"}
          </button>
        </div>
      )}
    </div>
  );
}

export default MobileScan;
