// Roaming visits checked in on the kiosk have no place on the queue board (no ticket until
// they scan out), so they wait here with the Personnel who took their payment.

const ROAM_LIMIT_MS = 10 * 60000;

const peso = (amount) => (amount ? `₱${Number(amount).toFixed(2)}` : "—");

// How long the vehicle has been out roaming; flagged once it passes the limit.
const roamStay = (checkedInAt, now) => {
  const ms = Math.max(0, now - new Date(checkedInAt).getTime());
  const secs = Math.floor(ms / 1000);
  return { label: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, over: ms > ROAM_LIMIT_MS };
};

export default function KioskRoamStrip({ sessions, now, busyId, onCancel }) {
  if (sessions.length === 0) return null;
  return (
    <div className="dispatch-roam-strip">
      <span className="dispatch-eyebrow">Roaming · checked in at the kiosk · {sessions.length}</span>
      {sessions.map((s) => {
        const stay = s.checked_in_at ? roamStay(s.checked_in_at, now) : null;
        return (
          <div key={s.vehicle_id} className={`dispatch-roam-row${stay?.over ? " dispatch-roam-row--over" : ""}`}>
            <span className="dispatch-plate dispatch-plate--sm">{s.plate}</span>
            <span className="dispatch-roam-info">
              {s.driver} · {s.route || "No route"} · {peso(s.amount)}
            </span>
            <span className="dispatch-upnext-actions">
              {stay && (
                <span
                  className={`dispatch-roam-timer${stay.over ? " dispatch-roam-timer--over" : ""}`}
                  title={stay.over ? "Out roaming longer than the 10 minute limit" : "Time out roaming (10 minute limit)"}
                >
                  {stay.over ? `Over limit · ${stay.label}` : stay.label}
                </span>
              )}
              {s.checked_in_by && <span className="dispatch-accountable">In: {s.checked_in_by}</span>}
              <button
                type="button"
                className="dispatch-btn dispatch-btn--sm"
                onClick={() => onCancel(s)}
                disabled={busyId === s.vehicle_id}
              >
                Cancel
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
