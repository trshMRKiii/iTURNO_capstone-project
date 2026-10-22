import { useMemo, useState } from "react";

const MODES = [
  { type: "QUEUE", title: "Queue", sub: "Turno", note: "Wait for your turn in line" },
  { type: "ROAM", title: "Roaming", sub: "Payasyas", note: "Pay and go, no waiting in line" },
];

const peso = (amount) => (amount ? `₱${Number(amount).toFixed(2)}` : null);

function VehicleHead({ vehicle }) {
  return (
    <div className="kiosk-vehicle">
      <span className="kiosk-plate">{vehicle.plate}</span>
      {vehicle.route && <span className="kiosk-route">{vehicle.route}</span>}
    </div>
  );
}

export function ModePanel({ vehicle, onPick, onCancel }) {
  return (
    <div className="kiosk-panel">
      <VehicleHead vehicle={vehicle} />
      <h2 className="kiosk-title">How are you using the terminal today?</h2>
      <div className="kiosk-modes">
        {MODES.map((m) => (
          <button key={m.type} type="button" className={`kiosk-mode kiosk-mode--${m.type.toLowerCase()}`} onClick={() => onPick(m.type)}>
            <span className="kiosk-mode-title">{m.title}</span>
            <em>{m.sub}</em>
            <span className="kiosk-mode-note">{m.note}</span>
          </button>
        ))}
      </div>
      <button type="button" className="kiosk-link" onClick={onCancel}>Cancel</button>
    </div>
  );
}

const WHO = [
  { type: "operator", title: "Operator", sub: "Registered driver", note: "Check in as this vehicle's driver" },
  { type: "swap", title: "Scan driver QR", sub: "Swap driver", note: "A different driver? Show your own QR code" },
];

export function WhoPanel({ vehicle, onPick, onBack }) {
  return (
    <div className="kiosk-panel">
      <VehicleHead vehicle={vehicle} />
      <h2 className="kiosk-title">Who is driving today?</h2>
      <div className="kiosk-modes">
        {WHO.map((w) => (
          <button key={w.type} type="button" className={`kiosk-mode kiosk-mode--${w.type === "swap" ? "roam" : "queue"}`} onClick={() => onPick(w.type)}>
            <span className="kiosk-mode-title">{w.title}</span>
            <em>{w.sub}</em>
            <span className="kiosk-mode-note">{w.note}</span>
          </button>
        ))}
      </div>
      <button type="button" className="kiosk-link" onClick={onBack}>← Back</button>
    </div>
  );
}

export function SwapPanel({ vehicle, onBack }) {
  return (
    <div className="kiosk-panel">
      <VehicleHead vehicle={vehicle} />
      <h2 className="kiosk-title">Show your driver QR</h2>
      <p className="kiosk-line">Hold your own QR code up to the camera to take over this vehicle.</p>
      <button type="button" className="kiosk-link" onClick={onBack}>← Back</button>
    </div>
  );
}

export function DriverPanel({ vehicle, mode, drivers, onPick, onBack, onActivity }) {
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  const [picked, setPicked] = useState(null);

  const letters = useMemo(() => [...new Set(drivers.map((d) => d.name[0]?.toUpperCase()).filter(Boolean))].sort(), [drivers]);
  const shown = drivers.filter(
    (d) => d.name.toLowerCase().includes(query.trim().toLowerCase()) && (!letter || d.name[0]?.toUpperCase() === letter),
  );

  if (picked) {
    return (
      <div className="kiosk-panel">
        <VehicleHead vehicle={vehicle} />
        <h2 className="kiosk-title">Is this you?</h2>
        <div className="kiosk-confirm-name">{picked.name}</div>
        <div className="kiosk-actions">
          <button type="button" className="kiosk-btn kiosk-btn--ghost" onClick={() => setPicked(null)}>No, go back</button>
          <button type="button" className="kiosk-btn" onClick={() => onPick(picked)}>
            Yes, {mode === "QUEUE" ? "join the queue" : "continue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kiosk-panel kiosk-panel--wide">
      <VehicleHead vehicle={vehicle} />
      <h2 className="kiosk-title">Find your name <span className="kiosk-tag">{mode === "QUEUE" ? "Queue" : "Roaming"}</span></h2>
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
      <button type="button" className="kiosk-link" onClick={onBack}>← Back</button>
    </div>
  );
}

// Everything the server can answer with once a visit exists, reduced to one screen.
const RESULTS = {
  CHECKED_IN: (r) => ({
    tone: "ok",
    title: r.mode === "QUEUE" ? "You're in the queue" : "You're checked in to roam",
    big: r.mode === "QUEUE" ? r.queue_code : null,
    lines: [`Pay ${peso(r.vehicle.amount) || "the terminal fee"} to ${r.checked_in_by}, then scan your QR again to leave.`],
  }),
  WAIT_TURN: (r) => ({
    tone: "info",
    title: "Wait for your turn",
    big: `#${r.position}`,
    lines: ["Scan your QR again when you reach the front of the line."],
  }),
  DEPARTED: (r) => ({
    tone: "ok",
    title: "Checked out — safe trip!",
    big: r.tickets?.length ? r.tickets.join(", ") : null,
    lines: [r.tickets?.length ? "Your ticket number" : null],
  }),
  BLOCKED: (r) => ({ tone: "error", title: "Can't check in", lines: [r.message] }),
  ERROR: (r) => ({ tone: "error", title: "Something went wrong", lines: [r.message] }),
  UNKNOWN: () => ({ tone: "error", title: "QR code not recognized", lines: ["Please try again or see the dispatcher."] }),
};

export function ResultPanel({ result, onDone }) {
  const view = (RESULTS[result.state] || RESULTS.ERROR)(result);
  return (
    <div className={`kiosk-panel kiosk-result kiosk-result--${view.tone}`}>
      {result.vehicle && <VehicleHead vehicle={result.vehicle} />}
      <h2 className="kiosk-title">{view.title}</h2>
      {view.big && <div className="kiosk-big">{view.big}</div>}
      {view.lines.filter(Boolean).map((line) => (
        <p key={line} className="kiosk-line">{line}</p>
      ))}
      <button type="button" className="kiosk-link" onClick={onDone}>Done</button>
    </div>
  );
}
