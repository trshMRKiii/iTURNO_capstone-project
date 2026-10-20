import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQrScanner, SCANNER_STATUS_LABEL } from "../useQrScanner";
import { useKiosk } from "./useKiosk";
import { ModePanel, DriverPanel, ResultPanel } from "./KioskPanels";
import sfcLogo from "../../../../pictures/sfc-nobg-logo.png";
import "../../../../styles/Kiosk.css";

const STEPS = ["Scan your QR", "Queue or Roaming", "Pick your name", "Pay at the cashier", "Scan again to leave"];

// Self-service terminal for the driver-facing screen. The camera runs the whole time
// (a different QR always restarts the flow); idle shows it full screen, every other
// step shrinks it to a corner preview and puts the step on top.
function KioskScreen() {
  const kiosk = useKiosk();
  const { screen } = kiosk;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { videoRef, canvasRef, status } = useQrScanner(kiosk.scan);
  const idle = screen.type === "idle";

  return (
    <div className={`kiosk kiosk--${idle ? "idle" : "active"}`}>
      <header className="kiosk-top">
        <div className="kiosk-brand">
          <img src={sfcLogo} alt="SFC Logo" />
          <span>North Central Terminal</span>
        </div>
        <div className="kiosk-clock">
          {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      </header>

      <div className="kiosk-stage">
        <video ref={videoRef} className="kiosk-video" muted playsInline />
        <canvas ref={canvasRef} className="kiosk-canvas" />
        {status !== "on" && <div className="kiosk-hint">{SCANNER_STATUS_LABEL[status]}</div>}

        {idle && (
          <>
            <div className="kiosk-frame" />
            <div className="kiosk-prompt">
              <div className="kiosk-prompt-title">Scan your QR code</div>
              <ol className="kiosk-steps">
                {STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </>
        )}

        {screen.type === "busy" && <div className="kiosk-panel kiosk-busy">Please wait…</div>}
        {screen.type === "mode" && (
          <ModePanel vehicle={screen.vehicle} onPick={kiosk.chooseMode} onCancel={kiosk.reset} />
        )}
        {screen.type === "driver" && (
          <DriverPanel
            vehicle={screen.vehicle}
            mode={screen.mode}
            drivers={screen.drivers}
            onPick={kiosk.checkIn}
            onBack={kiosk.backToMode}
            onActivity={kiosk.touch}
          />
        )}
        {screen.type === "result" && <ResultPanel result={screen} onDone={kiosk.reset} />}
      </div>
    </div>
  );
}

// The kiosk calls the API, so it needs the staff session — it is opened from the
// dashboard (window.open without noopener, so the tab inherits sessionStorage).
export default function Kiosk() {
  return sessionStorage.getItem("accessToken") ? <KioskScreen /> : <Navigate to="/" replace />;
}
