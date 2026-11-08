import { useEffect, useMemo, useState } from "react";
import { apiService } from "../../../lib/api-service";
import { Dialog } from "../../../components/ui/kit";
import RegisterDriverModal from "./RegisterDriverModal";

// Desk-side driver swap for a queued vehicle: the driver tells the desk, the desk picks the new
// name. It becomes the vehicle's last driver, so the kiosk offers them next visit. For a kiosk
// "Unregistered driver" entry (queue ticket, or a roam visit with `target.roam`) it attaches the
// driver instead (registering them first if new).
export default function SwapDriverDialog({ target, busyDriverIds, onClose, onSwapped }) {
  const [drivers, setDrivers] = useState([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState(false);
  const attaching = target.roam || !target.ticket?.driver;

  useEffect(() => {
    apiService.getDrivers({ is_archived: "false" }).then(setDrivers).catch((err) => setError(err.message));
  }, []);

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return drivers.filter(
      (d) => d.status === "ACTIVE" && !busyDriverIds.has(d.id) && (!term || d.name.toLowerCase().includes(term)),
    );
  }, [drivers, query, busyDriverIds]);

  const pick = async (driver) => {
    setSaving(true);
    setError("");
    try {
      await (target.roam
        ? apiService.attachRoamDriver(target.vehicle.id, driver.id)
        : apiService.reassignTicketDriver(target.ticket.id, driver.id));
      onSwapped();
      onClose();
    } catch (err) {
      setError(err.message || `Failed to ${attaching ? "attach" : "swap"} driver.`);
    } finally {
      setSaving(false);
    }
  };

  // The new driver is saved before attaching, so an IWP the attach rejects (expired) still
  // leaves them registered and pickable from the list once renewed.
  if (registering) {
    return (
      <RegisterDriverModal
        onClose={() => setRegistering(false)}
        onRegistered={(driver) => { setRegistering(false); pick(driver); }}
      />
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={attaching ? "Attach driver" : "Swap driver"}
      subtitle={`${target.vehicle.plate_number} — ${attaching ? "pick the driver on this vehicle, or register a new one." : "pick the driver taking over."}`}
    >
      <input
        className="dispatch-swap-search"
        placeholder="Search driver name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {attaching && (
        <button type="button" className="dispatch-swap-item dispatch-swap-item--new" disabled={saving} onClick={() => setRegistering(true)}>
          + Register new driver
        </button>
      )}
      {error && <div className="dispatch-error">{error}</div>}
      <div className="dispatch-swap-list">
        {shown.length === 0 ? (
          <div className="dispatch-state-wrap">No available drivers</div>
        ) : (
          shown.map((d) => (
            <button key={d.id} type="button" className="dispatch-swap-item" disabled={saving} onClick={() => pick(d)}>
              {d.name}
            </button>
          ))
        )}
      </div>
    </Dialog>
  );
}
