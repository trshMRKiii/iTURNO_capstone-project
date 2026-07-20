import React, { useEffect, useState } from "react";
import { apiService } from "../../../lib/api-service";
import "../../../styles/Dispatch.css";

const LAST_TICKET_FORM_KEY = "dispatch:lastTicketFormId";

function Dispatch() {
  const [vehicles, setVehicles] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [ticketForms, setTicketForms] = useState([]);
  const [ticketSeries, setTicketSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [swapTarget, setSwapTarget] = useState(null);
  const [swapDriverId, setSwapDriverId] = useState("");
  const [swapError, setSwapError] = useState("");
  const [swapping, setSwapping] = useState(false);

  const [dispatchTicketFormId, setDispatchTicketFormIdState] = useState(
    () => localStorage.getItem(LAST_TICKET_FORM_KEY) || "",
  );
  const setDispatchTicketFormId = (value) => {
    setDispatchTicketFormIdState(value);
    if (value) {
      localStorage.setItem(LAST_TICKET_FORM_KEY, value);
    } else {
      localStorage.removeItem(LAST_TICKET_FORM_KEY);
    }
  };
  const [dispatchQuantity, setDispatchQuantity] = useState(1);
  const [dispatchError, setDispatchError] = useState("");
  const [dispatchingVehicleId, setDispatchingVehicleId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [vehicleData, ticketData, driverData, ticketFormData, ticketSeriesData] = await Promise.all([
        apiService.getVehicles(),
        apiService.getTickets(),
        apiService.getDrivers(),
        apiService.getTicketForms(),
        apiService.request("/ticket-series/"),
      ]);
      setVehicles(vehicleData);
      setTickets(ticketData);
      setDrivers(driverData);
      setTicketForms(ticketFormData);
      setTicketSeries(ticketSeriesData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Remaining stock per denomination (ticket form), FIFO-oldest-first is a backend
  // concern — here we only need the total so the dropdown can show/allow what's left.
  const denominationOptions = ticketForms
    .map((form) => {
      const remaining = ticketSeries
        .filter((s) => String(s.ticket_form) === String(form.id))
        .reduce((sum, s) => {
          const start = parseInt(s.start_no) || 0;
          const end = parseInt(s.end_no) || 0;
          return sum + Math.max(end - start + 1, 0);
        }, 0);
      return { ...form, remaining };
    })
    .filter((form) => form.remaining > 0);

  const queue = vehicles.filter(
    (v) =>
      v.status === "QUEUED" &&
      !v.is_archived &&
      tickets.some(
        (t) => t.vehicle?.id === v.id && t.status === "ISSUED",
      ),
  );

  const getQueuedAt = (vehicle) => {
    const ticket = tickets.find(
      (t) =>
        t.vehicle?.id === vehicle.id && t.status === "ISSUED",
    );
    return ticket?.issued_at
      ? new Date(ticket.issued_at).getTime()
      : Number.POSITIVE_INFINITY;
  };

  const groupedByRoute = queue.reduce((acc, vehicle) => {
    const routeName = vehicle.route_detail?.full_name || "No Route Assigned";
    if (!acc[routeName]) acc[routeName] = [];
    acc[routeName].push(vehicle);
    return acc;
  }, {});

  Object.keys(groupedByRoute).forEach((routeName) => {
    groupedByRoute[routeName].sort(
      (a, b) => getQueuedAt(a) - getQueuedAt(b),
    );
  });

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
        t.vehicle?.id === vehicle.id && t.status === "ISSUED",
    );

  const handleDispatch = async (vehicle) => {
    if (!dispatchTicketFormId) {
      setDispatchError("Please select a denomination before dispatching.");
      return;
    }
    const quantity = Math.max(1, parseInt(dispatchQuantity) || 1);
    setDispatchingVehicleId(vehicle.id);
    setDispatchError("");
    try {
      await apiService.dispatchTicket(vehicle.id, {
        ticketFormId: dispatchTicketFormId,
        quantity,
      });
      await fetchData();
    } catch (err) {
      setDispatchError(err.message || "Failed to dispatch ticket. Please try again.");
    } finally {
      setDispatchingVehicleId(null);
    }
  };

  const activeDrivers = drivers.filter((d) => d.status === "ACTIVE");

  const openSwapModal = (vehicle) => {
    setSwapTarget(vehicle);
    setSwapDriverId("");
    setSwapError("");
  };

  const closeSwapModal = () => {
    if (swapping) return;
    setSwapTarget(null);
    setSwapDriverId("");
    setSwapError("");
  };

  const handleConfirmSwap = async () => {
    if (!swapDriverId) {
      setSwapError("Please select a driver.");
      return;
    }
    setSwapping(true);
    setSwapError("");
    try {
      const openTicket = tickets.find(
        (t) => t.vehicle?.id === swapTarget.id && t.status === "ISSUED",
      );
      if (!openTicket) {
        throw new Error("No open ticket found for this vehicle.");
      }
      await apiService.reassignTicketDriver(openTicket.id, swapDriverId);
      await fetchData();
      closeSwapModal();
    } catch (err) {
      setSwapError(err.message || "Failed to reassign driver. Please try again.");
    } finally {
      setSwapping(false);
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

      <div className="dispatch-settings-panel">
        <div className="dispatch-settings-header">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span>Dispatch Settings</span>
          <span className="dispatch-settings-hint">
            Applies to every Dispatch click below · remembered for next time
          </span>
        </div>
        <div className="dispatch-settings-body">
          <div className="dispatch-modal-field">
            <label className="dispatch-modal-label">
              Denomination <span className="dispatch-modal-required">*</span>
            </label>
            <select
              className="dispatch-modal-select"
              value={dispatchTicketFormId}
              onChange={(e) => {
                setDispatchTicketFormId(e.target.value);
                if (dispatchError) setDispatchError("");
              }}
            >
              <option value="">— Select a denomination —</option>
              {denominationOptions.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name} — {form.remaining} pcs remaining
                </option>
              ))}
            </select>
            {denominationOptions.length === 0 && (
              <span className="dispatch-modal-field-error">
                No ticket stock available for any denomination.
              </span>
            )}
          </div>

          <div className="dispatch-modal-field dispatch-settings-qty">
            <label className="dispatch-modal-label">Quantity</label>
            <input
              type="number"
              className="dispatch-modal-select"
              min={0}
              value={dispatchQuantity}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setDispatchQuantity("");
                } else {
                  const val = parseInt(raw);
                  setDispatchQuantity(Number.isNaN(val) ? "" : Math.max(0, val));
                }
                if (dispatchError) setDispatchError("");
              }}
            />
          </div>
        </div>
        {dispatchError && (
          <span className="dispatch-modal-field-error dispatch-settings-error">
            {dispatchError}
          </span>
        )}
      </div>

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
                                      disabled={
                                        !canDispatch ||
                                        dispatchingVehicleId === vehicle.id
                                      }
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
                                      {dispatchingVehicleId === vehicle.id
                                        ? "Dispatching…"
                                        : "Dispatch"}
                                    </button>
                                    <button
                                      className="dispatch-btn dispatch-btn--swap"
                                      onClick={() => openSwapModal(vehicle)}
                                    >
                                      <svg
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                      >
                                        <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3" />
                                      </svg>
                                      Swap Driver
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

      {swapTarget && (
        <div className="dispatch-overlay" onClick={closeSwapModal}>
          <div className="dispatch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dispatch-modal-header">
              <div className="dispatch-modal-header-left">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#b7791f"
                  strokeWidth="2.2"
                >
                  <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3" />
                </svg>
                <h2 className="dispatch-modal-title">Swap Driver</h2>
              </div>
              <button
                className="dispatch-modal-close"
                onClick={closeSwapModal}
                disabled={swapping}
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
                    {swapTarget.plate_number}
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
                    {swapTarget.route_detail?.full_name || "No route"}
                  </span>
                </div>
                <span className="dispatch-cancel-vehicle__driver">
                  Current Driver: {getDriverName(swapTarget)}
                </span>
              </div>

              <div className="dispatch-modal-field">
                <label className="dispatch-modal-label">
                  New Driver <span className="dispatch-modal-required">*</span>
                </label>
                <select
                  className="dispatch-modal-select"
                  value={swapDriverId}
                  onChange={(e) => {
                    setSwapDriverId(e.target.value);
                    if (swapError) setSwapError("");
                  }}
                  disabled={swapping}
                >
                  <option value="">— Select a driver —</option>
                  {activeDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {swapError && (
                  <span className="dispatch-modal-field-error">
                    {swapError}
                  </span>
                )}
              </div>
            </div>

            <div className="dispatch-modal-footer">
              <button
                type="button"
                className="dispatch-modal-btn dispatch-modal-btn--secondary"
                onClick={closeSwapModal}
                disabled={swapping}
              >
                Go Back
              </button>
              <button
                type="button"
                className="dispatch-modal-btn dispatch-modal-btn--primary"
                onClick={handleConfirmSwap}
                disabled={swapping || !swapDriverId}
              >
                {swapping ? "Swapping…" : "Confirm Swap"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dispatch;
