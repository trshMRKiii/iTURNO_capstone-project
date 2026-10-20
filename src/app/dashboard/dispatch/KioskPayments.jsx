// Cashier controls for kiosk visits: a driver who checked in on the kiosk pays here,
// then their next QR scan releases the vehicle (see backend/api/views/kiosk.py).

const peso = (amount) => (amount ? `₱${Number(amount).toFixed(2)}` : "—");

// Toggle: "Mark paid" until the cashier confirms, then a "✓ Paid" button that takes it back.
export function MarkPaidButton({ session, busy, onMark, onUndo, small }) {
  const paid = session?.status === "PAID";
  return (
    <button
      type="button"
      className={`dispatch-btn dispatch-btn--paid${paid ? " dispatch-btn--paid-on" : ""}${small ? " dispatch-btn--sm" : ""}`}
      onClick={paid ? onUndo : onMark}
      disabled={busy}
      title={paid ? "Paid — click to undo" : "Driver paid the terminal fee — lets their QR scan check them out"}
    >
      {paid ? "✓ Paid" : "Mark paid"}
    </button>
  );
}

// Roaming visits have no place in the queue board, so they wait here for payment.
export function RoamPaymentStrip({ sessions, busyId, onMark, onUndo, onCancel }) {
  if (sessions.length === 0) return null;
  return (
    <div className="dispatch-roam-strip">
      <span className="dispatch-eyebrow">Roaming · awaiting kiosk checkout · {sessions.length}</span>
      {sessions.map((s) => (
        <div key={s.vehicle_id} className="dispatch-roam-row">
          <span className="dispatch-plate dispatch-plate--sm">{s.plate}</span>
          <span className="dispatch-roam-info">
            {s.driver} · {s.route || "No route"} · {peso(s.amount)}
          </span>
          <span className="dispatch-upnext-actions">
            <MarkPaidButton
              small
              session={s}
              busy={busyId === s.vehicle_id}
              onMark={() => onMark(s)}
              onUndo={() => onUndo(s)}
            />
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
      ))}
    </div>
  );
}
