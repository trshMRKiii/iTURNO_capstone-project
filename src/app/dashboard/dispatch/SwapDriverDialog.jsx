import { useEffect, useMemo, useState } from "react";
import { apiService } from "../../../lib/api-service";
import { Dialog } from "../../../components/ui/kit";

// Desk-side driver swap for a queued vehicle: the driver tells the desk, the desk picks the new
// name. It becomes the vehicle's last driver, so the kiosk offers them next visit.
export default function SwapDriverDialog({ target, busyDriverIds, onClose, onSwapped }) {
  const [drivers, setDrivers] = useState([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      await apiService.reassignTicketDriver(target.ticket.id, driver.id);
      onSwapped();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to swap driver.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Swap driver"
      subtitle={`${target.vehicle.plate_number} — pick the driver taking over.`}
    >
      <input
        className="dispatch-swap-search"
        placeholder="Search driver name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
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
