import { useMemo, useState } from "react";
import { mixText } from "../../../../lib/mixText";

const MODES = [
  { type: "QUEUE", title: "Queue", sub: "Turno" },
  { type: "ROAM", title: "Roaming", sub: "Payasyas" },
];

const peso = (amount) => (amount ? `₱${Number(amount).toFixed(2)}` : null);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// Which paper the desk hands over, only worth a line when the fare is mixed.
const mixLine = (r) => (mixText(r.breakdown) ? [`Your tickets: ${mixText(r.breakdown)}`] : []);

function VehicleHead({ vehicle }) {
  return (
    <div className="kiosk-vehicle">
      <span className="kiosk-plate">{vehicle.plate}</span>
      {vehicle.route && <span className="kiosk-route">{vehicle.route}</span>}
    </div>
  );
}

function Footer({ seconds, onCancel, cancelLabel = "Cancel" }) {
  return (
    <div className="kiosk-foot">
      <button type="button" className="kiosk-ghost" onClick={onCancel}>{cancelLabel}</button>
      <span className="kiosk-countdown">Returning to scan in {seconds}s</span>
    </div>
  );
}

// Plate, route and the registered operator, then the two big tiles. `blocked` greys the
// tiles out for a vehicle that can't check in (expired papers).
export function ModePanel({ vehicle, driverName, swap, swapDriver, blocked, heading, onPick, onSwap, onCancel, seconds }) {
  return (
    <div className="kiosk-panel kiosk-panel--left">
      <VehicleHead vehicle={vehicle} />
      <div className={`kiosk-driver${blocked ? " kiosk-driver--blocked" : ""}${swap ? " kiosk-driver--swap" : ""}${swapDriver?.error ? " kiosk-driver--blocked" : ""}`}>
        <div className="kiosk-driver-text">
          <small>{swap ? (swapDriver?.id ? "Driver QR scanned ✓" : swapDriver ? "QR not accepted" : "Swapping driver") : "Driver · registered operator"}</small>
          <strong>{swap ? (swapDriver?.id ? swapDriver.name : "Show your own driver QR") : driverName}</strong>
          {swap && <span>{swapDriver?.id ? "Now tap Queue or Roaming below." : swapDriver?.error || "Hold your QR to the camera, then pick Queue or Roaming."}</span>}
        </div>
        {!blocked && (
          <button type="button" className={`kiosk-ghost kiosk-ghost--sm${swap ? " kiosk-ghost--on" : ""}`} onClick={onSwap}>
            {swap ? "Keep this driver" : "Swap driver"}
          </button>
        )}
      </div>
      <p className={`kiosk-prompt${blocked ? " kiosk-prompt--error" : ""}`}>{swap && !swapDriver?.id ? "Scan first, then tap one" : heading}</p>
      <div className="kiosk-modes">
        {MODES.map((m) => (
          <button
            key={m.type}
            type="button"
            disabled={blocked}
            className={`kiosk-mode kiosk-mode--${m.type.toLowerCase()}`}
            onClick={() => onPick(m.type)}
          >
            <span className="kiosk-mode-title">{m.title}</span>
            <em>{m.sub}</em>
          </button>
        ))}
      </div>
      <Footer seconds={seconds} onCancel={onCancel} />
    </div>
  );
}

export function SwapPanel({ vehicle, mode, onBack, seconds }) {
  return (
    <div className="kiosk-panel kiosk-panel--left">
      <VehicleHead vehicle={vehicle} />
      <h2 className="kiosk-title">Show your driver QR</h2>
      <p className="kiosk-sub">
        Hold your own QR code up to the camera to take over this vehicle for {mode === "QUEUE" ? "the queue" : "roaming"}.
      </p>
      <Footer seconds={seconds} onCancel={onBack} cancelLabel="← Back" />
    </div>
  );
}

export function DriverPanel({ vehicle, mode, drivers, onPick, onBack, onActivity, seconds }) {
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  const [picked, setPicked] = useState(null);

  const letters = useMemo(() => [...new Set(drivers.map((d) => d.name[0]?.toUpperCase()).filter(Boolean))].sort(), [drivers]);
  const shown = drivers.filter(
    (d) => d.name.toLowerCase().includes(query.trim().toLowerCase()) && (!letter || d.name[0]?.toUpperCase() === letter),
  );

  if (picked) {
    return (
      <div className="kiosk-panel kiosk-panel--left">
        <VehicleHead vehicle={vehicle} />
        <h2 className="kiosk-title">Is this you?</h2>
        <div className="kiosk-confirm-name">{picked.name}</div>
        <div className="kiosk-actions">
          <button type="button" className="kiosk-ghost" onClick={() => setPicked(null)}>No, go back</button>
          <button type="button" className="kiosk-btn" onClick={() => onPick(picked)}>
            Yes, {mode === "QUEUE" ? "join the queue" : "continue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kiosk-panel kiosk-panel--left">
      <h2 className="kiosk-title">
        Find your name <span className="kiosk-tag">{mode === "QUEUE" ? "Queue" : "Roaming"}</span>
      </h2>
      <input
        className="kiosk-search"
        placeholder="Type your last name…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onActivity();
        }}
      />
      <div className="kiosk-letters">
        <button type="button" className={`kiosk-letter${letter ? "" : " kiosk-letter--on"}`} onClick={() => { setLetter(""); onActivity(); }}>All</button>
        {letters.map((l) => (
          <button key={l} type="button" className={`kiosk-letter${letter === l ? " kiosk-letter--on" : ""}`} onClick={() => { setLetter(l); onActivity(); }}>
            {l}
          </button>
        ))}
      </div>
      <div className="kiosk-names" onScroll={onActivity}>
        {shown.length === 0 ? (
          <div className="kiosk-empty">No matching names — ask the dispatcher for help.</div>
        ) : (
          shown.map((d) => (
            <button key={d.id} type="button" className="kiosk-name" onClick={() => setPicked(d)}>
              {d.name}
              {d.suggested && <span className="kiosk-tag">This vehicle</span>}
            </button>
          ))
        )}
      </div>
      <Footer seconds={seconds} onCancel={onBack} cancelLabel="← Back" />
    </div>
  );
}

// Everything the server can answer with once a visit exists, reduced to one screen.
const RESULTS = {
  CHECKED_IN: (r) =>
    r.mode === "QUEUE"
      ? {
          tone: "ok",
          title: "You're in the queue",
          big: r.queue_code,
          lines: [r.position > 1 ? `${plural(r.position - 1, "vehicle")} ahead of you` : "You're next in line", `Pay ${peso(r.vehicle.amount) || "the terminal fee"} at the check-out desk when you leave`, ...mixLine(r)],
        }
      : {
          tone: "roam",
          title: "You're checked in to roam",
          big: "ROAMING",
          lines: [`Pay ${peso(r.vehicle.amount) || "the terminal fee"} to ${r.checked_in_by} to get your ticket`, ...mixLine(r), "Scan your QR again when you leave"],
        },
  WAIT_TURN: (r) => ({
    tone: "info",
    title: "Wait for your turn",
    big: `#${r.position}`,
    lines: ["Scan your QR again when you reach the front of the line."],
    action: { label: "Roam instead", hint: "Cut the line: pay at the check-out desk and leave right away" },
  }),
  DEPARTED: () => ({ tone: "info", title: "Check out recorded", pill: "Safe trip! The next vehicle can scan now." }),
  BLOCKED: (r) => ({ tone: "error", title: "Can't check in", lines: [r.message] }),
  ERROR: (r) => ({ tone: "error", title: "Something went wrong", lines: [r.message] }),
  UNKNOWN: () => ({ tone: "error", title: "QR code not recognized", lines: ["Please try again or see the dispatcher."] }),
};

export function ResultPanel({ result, onDone, onAction, seconds }) {
  const view = (RESULTS[result.state] || RESULTS.ERROR)(result);
  return (
    <div className={`kiosk-panel kiosk-result kiosk-result--${view.tone}`}>
      {result.vehicle && <VehicleHead vehicle={result.vehicle} />}
      <h2 className="kiosk-title">{view.title}</h2>
      {view.big && <div className="kiosk-big">{view.big}</div>}
      {view.lines?.map((line) => (
        <p key={line} className="kiosk-line">{line}</p>
      ))}
      {view.pill && <div className="kiosk-pill">{view.pill}</div>}
      {view.action && (
        <button type="button" className="kiosk-switch" onClick={onAction} title={view.action.hint}>
          {view.action.label}
        </button>
      )}
      <Footer seconds={seconds} onCancel={onDone} cancelLabel="Done" />
    </div>
  );
}

const longDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Left-card list for the expired screen: each lapsed paper with its date.
export function ExpiredList({ items }) {
  return (
    <div className="kiosk-expired">
      <span className="kiosk-expired-badge">⚠ EXPIRED</span>
      {items.map((item) => (
        <div key={item.label} className="kiosk-expired-row">
          <strong>{item.label}</strong>
          <span>
            <small>EXPIRED</small>
            <b>{longDate(item.date)}</b>
            <em>{plural(item.days_ago, "day")} ago</em>
          </span>
        </div>
      ))}
    </div>
  );
}
