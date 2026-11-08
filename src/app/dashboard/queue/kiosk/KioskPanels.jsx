import { useState } from "react";
import { mixText } from "../../../../lib/mixText";
import { operatorsOf } from "./useKiosk";

const MODES = [
  { type: "QUEUE", title: "Queue", sub: "Turno" },
  { type: "ROAM", title: "Roaming", sub: "Payasyas" },
];

const peso = (amount) => (amount ? `₱${Number(amount).toFixed(2)}` : null);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// Which paper the desk hands over, only worth a line when the fare is mixed.
const mixLine = (r) => (mixText(r.breakdown) ? [`Your tickets: ${mixText(r.breakdown)}`] : []);

const soonText = (days) => (days === 0 ? "expires today" : `expires in ${days}d`);

function VehicleHead({ vehicle }) {
  return (
    <div className="kiosk-vehicle">
      <span className="kiosk-plate">{vehicle.plate}</span>
      {vehicle.route && <span className="kiosk-route">{vehicle.route}</span>}
      {vehicle.franchise_days_left != null && <span className="kiosk-tag kiosk-tag--warn">Registration {soonText(vehicle.franchise_days_left)}</span>}
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

// A driver with no record yet: the visit is held while the desk registers them.
const UNREGISTERED = { id: "unregistered", name: "Unregistered driver", unregistered: true };

const ModeTiles = ({ disabled, onPick }) => (
  <div className="kiosk-modes">
    {MODES.map((m) => (
      <button key={m.type} type="button" disabled={disabled} className={`kiosk-mode kiosk-mode--${m.type.toLowerCase()}`} onClick={() => onPick(m.type)}>
        <span className="kiosk-mode-title">{m.title}</span>
        <em>{m.sub}</em>
      </button>
    ))}
  </div>
);

// Plate and route, then the vehicle's drivers on the left and the two big mode tiles on the
// right; the tap on a tile checks the highlighted driver in. `blocked` (expired papers) shows
// the registered operator instead and greys the tiles out.
export function ModePanel({ vehicle, drivers = [], driverName, blocked, expired = [], heading, onPick, onActivity, onCancel, seconds }) {
  const [pickedId, setPickedId] = useState(() => {
    const only = operatorsOf(drivers);
    return only.length === 1 && !only[0].expired ? only[0].id : null;
  });
  const picked = pickedId === UNREGISTERED.id ? UNREGISTERED : drivers.find((d) => d.id === pickedId);

  if (blocked) {
    return (
      <div className="kiosk-panel kiosk-panel--left">
        <VehicleHead vehicle={vehicle} />
        <div className="kiosk-driver kiosk-driver--blocked">
          <div className="kiosk-driver-text">
            <small>Driver · last on this vehicle</small>
            <strong>{driverName}</strong>
          </div>
        </div>
        <p className="kiosk-prompt kiosk-prompt--error">{heading}</p>
        <ModeTiles disabled />
        <Footer seconds={seconds} onCancel={onCancel} />
      </div>
    );
  }

  return (
    <div className="kiosk-panel kiosk-panel--left">
      <VehicleHead vehicle={vehicle} />
      {expired.map((e) => (
        <div key={e.label} className="kiosk-alert">
          <strong>⚠ {e.label} expired</strong>
          <span>{e.days_ago === 0 ? "today" : `${plural(e.days_ago, "day")} ago`} — pick another driver, or register this one at the desk</span>
        </div>
      ))}
      <div className="kiosk-split">
        <div className="kiosk-col">
          <p className="kiosk-prompt">Who is driving?</p>
          <div className="kiosk-names" onScroll={onActivity}>
            {drivers.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`kiosk-name${d.id === pickedId ? " kiosk-name--on" : ""}`}
                disabled={d.expired}
                onClick={() => { setPickedId(d.id); onActivity(); }}
              >
                {d.name}
                <span className="kiosk-tags">
                  {d.last && !d.expired && <span className="kiosk-tag">Last driver</span>}
                  {d.expired && <span className="kiosk-tag kiosk-tag--expired">IWP expired</span>}
                  {d.iwp_days_left != null && <span className="kiosk-tag kiosk-tag--warn">IWP {soonText(d.iwp_days_left)}</span>}
                </span>
              </button>
            ))}
            <button
              type="button"
              className={`kiosk-name kiosk-name--new${pickedId === UNREGISTERED.id ? " kiosk-name--on" : ""}`}
              onClick={() => { setPickedId(UNREGISTERED.id); onActivity(); }}
            >
              {UNREGISTERED.name}
              <span className="kiosk-tag">Not on the list</span>
            </button>
          </div>
        </div>
        <div className="kiosk-col">
          <p className="kiosk-prompt">{picked ? heading : "Pick your name first"}</p>
          <ModeTiles disabled={!picked} onPick={(mode) => onPick(picked, mode)} />
        </div>
      </div>
      <Footer seconds={seconds} onCancel={onCancel} />
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
          lines: [r.position > 1 ? `${plural(r.position - 1, "vehicle")} ahead of you` : "You're next in line", `Pay ${peso(r.vehicle.amount) || "the terminal fee"} at the check-out desk when you leave`, ...mixLine(r), ...(r.driver ? [] : ["Please see the desk to register your driver details — you can't leave until then"])],
        }
      : {
          tone: "roam",
          title: "You're checked in to roam",
          big: "ROAMING",
          lines: r.driver
            ? [`Pay ${peso(r.vehicle.amount) || "the terminal fee"} to ${r.checked_in_by} to get your ticket`, ...mixLine(r), "Scan your QR again when you leave"]
            : ["Please see the desk to register your driver details — you can't get your ticket or leave until then"],
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
