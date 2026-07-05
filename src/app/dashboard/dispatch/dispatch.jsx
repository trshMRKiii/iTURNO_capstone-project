import React, { useEffect, useState } from "react";
import { apiService } from "../../../lib/api-service";
import "../../../styles/Dispatch.css";

function Dispatch() {
  const [vehicles, setVehicles] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [vehicleData, ticketData] = await Promise.all([
        apiService.getVehicles(),
        apiService.getTickets(),
      ]);
      setVehicles(vehicleData);
      setTickets(ticketData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const queue = vehicles.filter(
    (v) =>
      v.status === "QUEUED" &&
      !v.is_archived &&
      tickets.some(
        (t) => t.vehicle?.id === v.id && t.status === "ISSUED" && !t.is_late,
      ),
  );

  const groupedByRoute = queue.reduce((acc, vehicle) => {
    const routeName = vehicle.route_detail?.full_name || "No Route Assigned";
    if (!acc[routeName]) acc[routeName] = [];
    acc[routeName].push(vehicle);
    return acc;
  }, {});

  const sortedRoutes = Object.keys(groupedByRoute).sort();

  const getDriverName = (vehicle) => {
    if (vehicle.active_driver_name) return vehicle.active_driver_name;
    const ticket = tickets.find(
      (t) =>
        t.vehicle && t.vehicle.id === vehicle.id && t.status === "DISPATCHED",
    );
    return ticket?.driver?.name || "—";
  };

  const isInActiveQueue = (vehicle) =>
    vehicle.status === "QUEUED" &&
    !vehicle.is_archived &&
    tickets.some(
      (t) =>
        t.vehicle?.id === vehicle.id && t.status === "ISSUED" && !t.is_late,
    );

  const handleDispatch = async (vehicle) => {
    try {
      await apiService.patch(`/vehicles/${vehicle.id}/`, {
        status: "AVAILABLE",
      });
      // A vehicle can hold multiple ISSUED tickets when quantity > 1 was used
      // at issuance time — all of them belong to this one dispatch action.
      const activeTickets = tickets.filter(
        (t) => t.vehicle?.id === vehicle.id && t.status === "ISSUED",
      );
      const dispatchedAt = new Date().toISOString();
      await Promise.all(
        activeTickets.map((t) =>
          apiService.patch(`/tickets/${t.id}/`, {
            status: "DISPATCHED",
            dispatched_at: dispatchedAt,
          }),
        ),
      );
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openCancelModal = (vehicle) => {
    setCancelTarget(vehicle);
    setCancelReason("");
    setCancelError("");
  };

  const closeCancelModal = () => {
    if (cancelling) return;
    setCancelTarget(null);
    setCancelReason("");
    setCancelError("");
  };

  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      setCancelError("Please provide a reason for cancellation.");
      return;
    }
    setCancelling(true);
    setCancelError("");
    try {
      // Cancel every ISSUED ticket for this vehicle — quantity > 1 issuance
      // creates multiple tickets that all belong to the same pending trip.
      const activeTickets = tickets.filter(
        (t) => t.vehicle?.id === cancelTarget.id && t.status === "ISSUED",
      );
      await Promise.all(
        activeTickets.map((t) =>
          apiService.patch(`/tickets/${t.id}/`, {
            status: "CANCELLED",
            reason: cancelReason.trim(),
          }),
        ),
      );
      await apiService.patch(`/vehicles/${cancelTarget.id}/`, {
        status: "AVAILABLE",
      });
      await fetchData();
      closeCancelModal();
    } catch (err) {
      setCancelError(
        err.message || "Failed to cancel ticket. Please try again.",
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="dispatch-page">
      <div className="dispatch-header">
        <div className="dispatch-header-left">
          <div className="dispatch-header-accent" />
          <div>
            <h1 className="dispatch-title">Active Terminal Queue</h1>
            <p className="dispatch-subtitle">
              Dispatch control and active trip monitoring
            </p>
          </div>
        </div>
        <div className="dispatch-header-badges">
          <span className="dispatch-badge dispatch-badge--queue">
            <span className="dispatch-badge-dot dispatch-badge-dot--green" />
            {queue.length} In Queue
          </span>
          {sortedRoutes.length > 0 && (
            <span className="dispatch-badge">
              <span className="dispatch-badge-dot dispatch-badge-dot--amber" />
              {sortedRoutes.length} Route{sortedRoutes.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="dispatch-error">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      <div className="dispatch-panel">
        <div className="dispatch-panel-header">
          <div className="dispatch-panel-header-left">
            <span className="dispatch-panel-indicator" />
            <span className="dispatch-panel-title">Queued Vehicles</span>
          </div>
          <span className="dispatch-panel-count">{queue.length}</span>
        </div>

        <div className="dispatch-panel-body">
          {loading ? (
            <div className="dispatch-state-wrap">
              <div className="dispatch-loading-dots">
                <div />
                <div />
                <div />
              </div>
            </div>
          ) : queue.length === 0 ? (
            <div className="dispatch-state-wrap dispatch-state-wrap--empty">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.3"
              >
                <rect x="1" y="3" width="15" height="13" rx="1" />
                <path d="M16 8h4l3 3v5h-7V8z" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              <span>No vehicles in queue</span>
            </div>
          ) : (
            <div className="dispatch-routes-list">
              {sortedRoutes.map((routeName, routeIdx) => (
                <div
                  key={routeName}
                  className={`dispatch-route-group${routeIdx > 0 ? " dispatch-route-group--gap" : ""}`}
                >
                  <div className="dispatch-route-label">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{routeName}</span>
                    <span className="dispatch-route-label-count">
                      {groupedByRoute[routeName].length} vehicle
                      {groupedByRoute[routeName].length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="dispatch-table-wrap">
                    <table className="dispatch-table">
                      <thead>
                        <tr>
                          <th>Plate No.</th>
                          <th>Driver</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedByRoute[routeName].map(
                          (vehicle, vehicleIdx) => {
                            const canDispatch = vehicleIdx === 0;
                            return (
                              <tr
                                key={vehicle.id}
                                className="dispatch-table-row"
                              >
                                <td>
                                  <span className="dispatch-plate">
                                    {vehicle.plate_number}
                                  </span>
                                </td>
                                <td className="dispatch-td-name">
                                  {getDriverName(vehicle)}
                                </td>
                                <td>
                                  <span
                                    className={`dispatch-status-badge${canDispatch ? " dispatch-status-badge--queued" : " dispatch-status-badge--other"}`}
                                  >
                                    <span
                                      className={`dispatch-status-dot${canDispatch ? " dispatch-status-dot--active" : " dispatch-status-dot--inactive"}`}
                                    />
                                    {canDispatch
                                      ? "Ready"
                                      : `#${vehicleIdx + 1} in line`}
                                  </span>
                                </td>
                                <td>
                                  <div className="dispatch-action-group">
                                    <button
                                      className={`dispatch-btn dispatch-btn--dispatch${!canDispatch ? " dispatch-btn--dispatch-disabled" : ""}`}
                                      onClick={() =>
                                        canDispatch && handleDispatch(vehicle)
                                      }
                                      disabled={!canDispatch}
                                      title={
                                        !canDispatch
                                          ? `Waiting — #${vehicleIdx + 1} in line for this route`
                                          : "Dispatch vehicle"
                                      }
                                    >
                                      <svg
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                      >
                                        <path d="M5 12h14M12 5l7 7-7 7" />
                                      </svg>
                                      Dispatch
                                    </button>
                                    <button
                                      className="dispatch-btn dispatch-btn--cancel"
                                      onClick={() => openCancelModal(vehicle)}
                                    >
                                      <svg
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                      >
                                        <path d="M18 6 6 18M6 6l12 12" />
                                      </svg>
                                      Cancel
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {cancelTarget && (
        <div className="dispatch-overlay" onClick={closeCancelModal}>
          <div className="dispatch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dispatch-modal-header">
              <div className="dispatch-modal-header-left">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c9a84c"
                  strokeWidth="2.2"
                >
                  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
                <h2 className="dispatch-modal-title">Cancel Ticket</h2>
              </div>
              <button
                className="dispatch-modal-close"
                onClick={closeCancelModal}
                disabled={cancelling}
                aria-label="Close"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="dispatch-modal-body">
              <div className="dispatch-cancel-vehicle">
                <div className="dispatch-cancel-vehicle__row">
                  <span className="dispatch-plate">
                    {cancelTarget.plate_number}
                  </span>
                  <span className="dispatch-cancel-vehicle__route">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {cancelTarget.route_detail?.full_name || "No route"}
                  </span>
                </div>
                <span className="dispatch-cancel-vehicle__driver">
                  Driver: {getDriverName(cancelTarget)}
                </span>
              </div>

              <div className="dispatch-cancel-warning">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                <span>
                  This will cancel the issued ticket and return the vehicle to{" "}
                  <strong>Available</strong> status. This action cannot be
                  undone.
                </span>
              </div>

              <div className="dispatch-modal-field">
                <label className="dispatch-modal-label">
                  Reason for Cancellation{" "}
                  <span className="dispatch-modal-required">*</span>
                </label>
                <textarea
                  className="dispatch-modal-textarea"
                  rows={3}
                  placeholder="Enter the reason for cancelling this ticket…"
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    if (cancelError) setCancelError("");
                  }}
                  disabled={cancelling}
                />
                {cancelError && (
                  <span className="dispatch-modal-field-error">
                    {cancelError}
                  </span>
                )}
              </div>
            </div>

            <div className="dispatch-modal-footer">
              <button
                type="button"
                className="dispatch-modal-btn dispatch-modal-btn--secondary"
                onClick={closeCancelModal}
                disabled={cancelling}
              >
                Go Back
              </button>
              <button
                type="button"
                className="dispatch-modal-btn dispatch-modal-btn--danger"
                onClick={handleConfirmCancel}
                disabled={cancelling || !cancelReason.trim()}
              >
                {cancelling ? (
                  <>
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="dispatch-modal-spin"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Cancelling…
                  </>
                ) : (
                  <>
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    Confirm Cancel
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dispatch;
