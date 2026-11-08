// Roaming visits checked in on the kiosk have no place on the queue board (they are paid and
// numbered but still inside until they scan out), so they wait here with a timer; past the
// limit the row turns red.
import { mixText } from "../../../lib/mixText";

const ROAM_LIMIT_MS = 5 * 60000;

const peso = (amount) => (amount ? `₱${Number(amount).toFixed(2)}` : "—");

const roamStay = (checkedInAt, now) => {
  const ms = Math.max(0, now - new Date(checkedInAt).getTime());
  const secs = Math.floor(ms / 1000);
  return { label: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, over: ms > ROAM_LIMIT_MS };
};

export default function KioskRoamStrip({ sessions, now, onAttach }) {
  if (sessions.length === 0) return null;
  return (
    <div className="dispatch-roam-strip">
      <span className="dispatch-roam-eyebrow">Roaming · checked in at the kiosk · {sessions.length}</span>
      {sessions.map((s) => {
        const stay = s.checked_in_at ? roamStay(s.checked_in_at, now) : null;
        return (
          <div key={s.vehicle_id} className={`dispatch-roam-row${stay?.over ? " dispatch-roam-row--over" : ""}`}>
            <span className="dispatch-plate">{s.plate}</span>
            <span className="dispatch-roam-info">
              <span className={s.driver ? undefined : "dispatch-unregistered"}>{s.driver || "Unregistered driver"}</span> · {s.route || "No route"} · {peso(s.amount)}
              {mixText(s.breakdown) && ` (${mixText(s.breakdown)})`}
              {s.checked_in_by && ` · In: ${s.checked_in_by}`}
            </span>
            {!s.driver && (
              <button type="button" className="dispatch-driver-swap dispatch-driver-swap--attach" onClick={() => onAttach(s)}>
                Register &amp; attach driver
              </button>
            )}
            {stay && (
              <span
                className={`dispatch-roam-timer${stay.over ? " dispatch-roam-timer--over" : ""}`}
                title={`Roaming limit is ${ROAM_LIMIT_MS / 60000} minutes`}
              >
                {stay.over ? `Over limit · ${stay.label}` : stay.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
