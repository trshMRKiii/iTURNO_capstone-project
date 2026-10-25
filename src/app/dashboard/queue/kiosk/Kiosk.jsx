import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQrScanner, SCANNER_STATUS_LABEL } from "../useQrScanner";
import { useKiosk, operatorsOf } from "./useKiosk";
import { ModePanel, DriverPanel, ResultPanel, ExpiredList } from "./KioskPanels";
import sfcLogo from "../../../../pictures/sfc-nobg-logo.png";
import "../../../../styles/Kiosk.css";

const ERROR_STATES = ["EXPIRED", "BLOCKED", "ERROR", "UNKNOWN"];

// A lone registered operator is named on the card; otherwise the name is picked after the tap.
const operatorName = (drivers) => {
  const operators = operatorsOf(drivers);
  return operators.length === 1 ? operators[0].name : "Choose on the next step";
};

// Left-card look and caption for each screen: blue = ready to scan, green = go ahead, red = stop.
function cardOf(screen) {
  switch (screen.type) {
    case "idle":
      return { tone: "idle", caption: "Scan your vehicle QR — hold it inside the frame" };
    case "mode":
      return screen.swap
        ? { tone: "go", caption: screen.swapDriver?.error || "Hold your driver QR inside the frame" }
        : { tone: "go", caption: "Now tap Queue or Roaming →" };
    case "driver":
      return { tone: "go", caption: "Now find your name →" };
    case "result":
      return ERROR_STATES.includes(screen.state)
        ? { tone: "error", caption: screen.state === "EXPIRED" ? null : "Next vehicle can scan now" }
        : { tone: "idle", caption: "Next vehicle can scan now" };
    default:
      return { tone: "idle", caption: "Please wait…" };
  }
}

// Self-service terminal for the driver-facing screen. The camera runs the whole time
// (a different QR always restarts the flow): the left card is always the camera, the
// right card is the current step. Landscape sits them side by side, portrait stacks them.
function KioskScreen() {
  const kiosk = useKiosk();
  const { screen } = kiosk;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { videoRef, canvasRef, status } = useQrScanner(kiosk.scan);
  const { tone, caption } = cardOf(screen);
  const seconds = kiosk.secondsLeft;
  const expired = screen.type === "result" && screen.state === "EXPIRED";
  // scan = camera fills the screen (idle, or scanning a swap driver), panel = the transaction fills it
  // (camera keeps scanning off-screen); the camera shares the screen only with the expired list.
  const swapping = screen.type === "mode" && screen.swap;
  const layout = screen.type === "idle" || swapping ? "scan" : expired ? null : "panel";

  return (
    <div className="kiosk">
      <header className="kiosk-top">
        <div className="kiosk-brand">
          <img src={sfcLogo} alt="SFC Logo" />
          <span>North Central Terminal</span>
        </div>
        <div className="kiosk-clock">
          <strong>{now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong>
          <small>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</small>
        </div>
      </header>

      <main className={`kiosk-stage${layout ? ` kiosk-stage--${layout}` : ""}`}>
        <section className={`kiosk-card kiosk-card--${tone}`}>
          <video ref={videoRef} className="kiosk-video" muted playsInline />
          <canvas ref={canvasRef} className="kiosk-canvas" />
          {status !== "on" && <div className="kiosk-hint">{SCANNER_STATUS_LABEL[status]}</div>}
          {expired ? (
            <ExpiredList items={screen.expired} />
          ) : (
            <div className="kiosk-frame">
              <i /><i /><i /><i />
              {tone === "idle" && <span className="kiosk-scanline" />}
            </div>
          )}
          {caption && <div className="kiosk-caption">{caption}</div>}
        </section>

        {swapping && (
          <button type="button" className="kiosk-ghost kiosk-swap-cancel" onClick={kiosk.cancelSwap}>Cancel</button>
        )}

        {screen.type !== "idle" && !swapping && <section className="kiosk-side">
          {screen.type === "busy" && <div className="kiosk-panel kiosk-busy">Please wait…</div>}
          {screen.type === "mode" && (
            <ModePanel
              vehicle={screen.vehicle}
              driverName={operatorName(screen.drivers)}
              swapDriver={screen.swapDriver}
              heading="Tap one to check in"
              onPick={kiosk.chooseMode}
              onSwap={kiosk.startSwap}
              onCancel={kiosk.reset}
              seconds={seconds}
            />
          )}
          {screen.type === "driver" && (
            <DriverPanel
              vehicle={screen.vehicle}
              mode={screen.mode}
              drivers={operatorsOf(screen.drivers)}
              onPick={kiosk.checkIn}
              onBack={kiosk.backToMode}
              onActivity={kiosk.touch}
              seconds={seconds}
            />
          )}
          {expired && (
            <ModePanel
              blocked
              vehicle={screen.vehicle}
              driverName={screen.driver || "No registered driver"}
              heading={`Expired ${screen.expired.map((e) => e.label).join(" / ")}`}
              onCancel={kiosk.reset}
              seconds={seconds}
            />
          )}
          {screen.type === "result" && !expired && <ResultPanel result={screen} onDone={kiosk.reset} onAction={kiosk.switchToRoam} seconds={seconds} />}
        </section>}
      </main>
    </div>
  );
}

// The kiosk calls the API, so it needs the staff session — it is opened from the
// dashboard (window.open without noopener, so the tab inherits sessionStorage).
export default function Kiosk() {
  return sessionStorage.getItem("accessToken") ? <KioskScreen /> : <Navigate to="/" replace />;
}
