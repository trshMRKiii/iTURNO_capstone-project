import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiService } from "../../../lib/api-service";
import { useQueueSocket } from "../../../lib/useQueueSocket";
import { getDriverPhotoUrl } from "../driver/driver-utils";
import { ticketsNeeded } from "../queue/useQueue";
import SeriesPicker from "../queue/SeriesPicker";
import { useFeedback, SkeletonList } from "../../../components/ui/kit";
import "../../../styles/Dispatch.css";

// Mirrors DEFAULT_ESTIMATED_LOADING_MINUTES in backend/api/views/records.py —
// the loading-time fallback for a route with no estimated_loading_minutes set.
const DEFAULT_ESTIMATED_LOADING_MINUTES = 5;
const EXTEND_OPTIONS_MINUTES = [5, 10, 15];

// The ticket series picker is shared with the Queue page (roaming
// check-ins use the same selection), so its state lives in useQueue.
function Dispatch({ availableSeries, allSeries = [], setSeriesOverrideId = () => {}, selectedSeriesId, setSelectedSeriesId, onStockChange }) {
  const selected = allSeries.find((s) => String(s.id) === String(selectedSeriesId));
  const [vehicles, setVehicles] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [now, setNow] = useState(() => Date.now());
  const [extendingTicketId, setExtendingTicketId] = useState(null);
  const [roamingVehicleId, setRoamingVehicleId] = useState(null);

  const [dragVehicleId, setDragVehicleId] = useState(null);
  const [dragOverVehicleId, setDragOverVehicleId] = useState(null);
  const [reorderingRouteId, setReorderingRouteId] = useState(null);
  const [reorderError, setReorderError] = useState("");

  const [swapTarget, setSwapTarget] = useState(null);
  const [swapDriverId, setSwapDriverId] = useState("");
  const [swapDriverQuery, setSwapDriverQuery] = useState("");
  const [showSwapDriverDropdown, setShowSwapDriverDropdown] = useState(false);
  const [swapError, setSwapError] = useState("");
  const [swapping, setSwapping] = useState(false);

  const [dispatchError, setDispatchError] = useState("");
  const [dispatchingVehicleId, setDispatchingVehicleId] = useState(null);
  const dispatchingRef = useRef(new Set());
  const { notify } = useFeedback();

  const [plateSearch, setPlateSearch] = useState("");
  const [routeFilter, setRouteFilter] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Ticks the loading-time countdowns once a second — purely a display
  // concern, doesn't touch any fetched data.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Latest-wins: with rapid dispatches several refetches overlap, and an older one
  // (snapshotted before a vehicle left) would otherwise land last and bring its card back.
  const fetchSeq = useRef(0);

  // Drivers and routes are config that doesn't move with the queue, and /routes/ is
  // slow (~1.2s: per-route stats queries), so only the first load pays for them —
  // silent refetches (socket pings, post-dispatch) just refresh vehicles + tickets.
  const fetchData = async (silent = false) => {
    const seq = ++fetchSeq.current;
    if (!silent) setLoading(true);
    try {
      const [vehicleData, ticketData, driverData, routeData] = await Promise.all([
        apiService.getVehicles({ status: "QUEUED", is_archived: "false" }),
        apiService.getTickets({ status: "QUEUED" }),
        silent ? null : apiService.getDrivers({ status: "ACTIVE", is_archived: "false" }),
        silent ? null : apiService.getRoutes(),
      ]);
      if (seq !== fetchSeq.current) return;
      setVehicles(vehicleData);
      setTickets(ticketData);
      if (driverData) setDrivers(driverData);
      if (routeData) setRoutes(routeData);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Backend pushes a "queue_updated" ping whenever a vehicle/ticket change
  // affects the board (e.g. a Check In from Ticket), so we refetch right away
  // instead of waiting for someone to leave and revisit this tab.
  useQueueSocket(() => fetchData(true));

  const routeById = useMemo(() => {
    const map = new Map();
    for (const r of routes) map.set(r.id, r);
    return map;
  }, [routes]);

  // Server already scopes vehicles (status=QUEUED, is_archived=false) and tickets
  // (status=QUEUED) — see fetchData(). This Map indexes the small remaining
  // `tickets` array by vehicle so queue/render logic doesn't rescan it per row
  // on every render (e.g. every keystroke in the Swap modal).
  const openTicketByVehicleId = useMemo(() => {
    const map = new Map();
    for (const t of tickets) {
      if (t.status === "QUEUED" && t.vehicle?.id != null && !map.has(t.vehicle.id)) {
        map.set(t.vehicle.id, t);
      }
    }
    return map;
  }, [tickets]);

  const queue = useMemo(
    () =>
      vehicles.filter(
        (v) => v.status === "QUEUED" && !v.is_archived && openTicketByVehicleId.has(v.id),
      ),
    [vehicles, openTicketByVehicleId],
  );

  const getQueuedAt = (vehicle) => {
    const ticket = openTicketByVehicleId.get(vehicle.id);
    return ticket?.issued_at
      ? new Date(ticket.issued_at).getTime()
      : Number.POSITIVE_INFINITY;
  };

  // Manual drag-and-drop order (see reorder-queue) takes priority; vehicles
  // that were never reordered (or joined after) fall back to plain FIFO —
  // mirrors the backend's order_by('queue_rank', 'issued_at').
  const getQueueRank = (vehicle) => {
    const ticket = openTicketByVehicleId.get(vehicle.id);
    return ticket?.queue_rank ?? Number.POSITIVE_INFINITY;
  };

  const groupedByRoute = useMemo(() => {
    const groups = queue.reduce((acc, vehicle) => {
      const routeName = vehicle.route_detail?.full_name || "No Route Assigned";
      if (!acc[routeName]) {
        acc[routeName] = { routeId: vehicle.route_detail?.id ?? null, vehicles: [] };
      }
      acc[routeName].vehicles.push(vehicle);
      return acc;
    }, {});

    Object.keys(groups).forEach((routeName) => {
      groups[routeName].vehicles.sort((a, b) => {
        const rankDiff = getQueueRank(a) - getQueueRank(b);
        return rankDiff !== 0 ? rankDiff : getQueuedAt(a) - getQueuedAt(b);
      });
    });

    return groups;
  }, [queue, openTicketByVehicleId]);

  const sortedRoutes = useMemo(() => Object.keys(groupedByRoute).sort(), [groupedByRoute]);

  // Deadline for the vehicle currently at the front of its route's line —
  // route's configured estimate (or the shared default), plus any one-off
  // extension applied to just this ticket (see handleExtendLoading).
  const getLoadingWindow = (vehicle) => {
    const ticket = openTicketByVehicleId.get(vehicle.id);
    if (!ticket?.loading_started_at) return null;
    const routeId = vehicle.route_detail?.id;
    const routeMinutes = routeId != null ? routeById.get(routeId)?.estimated_loading_minutes : null;
    const totalMs = ((routeMinutes ?? DEFAULT_ESTIMATED_LOADING_MINUTES) + (ticket.extra_loading_minutes || 0)) * 60000;
    return { deadline: new Date(ticket.loading_started_at).getTime() + totalMs, totalMs };
  };

  const formatCountdown = (deadlineMs) => {
    const diffMs = deadlineMs - now;
    const abs = Math.abs(diffMs);
    const mins = Math.floor(abs / 60000);
    const secs = Math.floor((abs % 60000) / 1000);
    return `${diffMs < 0 ? "+" : ""}${mins}:${String(secs).padStart(2, "0")}`;
  };

  const formatQueuedAt = (vehicle) => {
    const issuedAt = openTicketByVehicleId.get(vehicle.id)?.issued_at;
    return issuedAt
      ? new Date(issuedAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })
      : "—";
  };

  const driverPhotoById = useMemo(() => {
    const map = new Map();
    for (const d of drivers) map.set(d.id, getDriverPhotoUrl(d.photo));
    return map;
  }, [drivers]);

  const isRouteOverdue = (routeVehicles) => {
    const win = getLoadingWindow(routeVehicles[0]);
    return win != null && win.deadline < now;
  };

  // Plate search narrows the "up next" rows; the front vehicle always stays
  // visible so a route's dispatch order is never misrepresented.
  const getDriverName = (vehicle) => {
    if (vehicle.active_driver_name) return vehicle.active_driver_name;
    const ticket = openTicketByVehicleId.get(vehicle.id);
    return ticket?.driver?.name || "—";
  };

  const matchesSearch = (vehicle, routeName, term) =>
    !term ||
    [vehicle.plate_number, routeName, getDriverName(vehicle)].some((text) =>
      String(text || "").toLowerCase().includes(term),
    );

  const visibleRoutes = sortedRoutes.filter((name) => {
    if (routeFilter && routeFilter !== name) return false;
    const term = plateSearch.trim().toLowerCase();
    return !term || groupedByRoute[name].vehicles.some((v) => matchesSearch(v, name, term));
  });

  const quantityFor = (vehicle) => ticketsNeeded(vehicle, Number(selected?.ticket_form_price || 0));

  // Shared by Dispatch and Roam: both pay the terminal fee with the picked series
  // and take the vehicle off the board.
  const finalizeVehicle = async (vehicle, { call, setBusyId, doneLabel, failMessage }) => {
    // Ref, not state: a fast second click lands before the disabled button re-renders.
    if (dispatchingRef.current.has(vehicle.id)) return;
    dispatchingRef.current.add(vehicle.id);
    setBusyId(vehicle.id);
    setDispatchError("");
    try {
      await call(vehicle.id, { seriesId: selectedSeriesId, quantity: quantityFor(vehicle) });
      notify.success({ title: `${vehicle.plate_number} ${doneLabel}` });
      setVehicles((prev) => prev.filter((v) => v.id !== vehicle.id));
      fetchData(true);
      onStockChange?.();
    } catch (err) {
      setDispatchError(err.message || failMessage);
    } finally {
      dispatchingRef.current.delete(vehicle.id);
      setBusyId(null);
    }
  };

  const handleDispatch = (vehicle) => {
    if (!selectedSeriesId) {
      setDispatchError("Please select a ticket series before dispatching.");
      return;
    }
    return finalizeVehicle(vehicle, {
      call: (id, body) => apiService.dispatchTicket(id, body),
      setBusyId: setDispatchingVehicleId,
      doneLabel: "dispatched",
      failMessage: "Failed to dispatch ticket. Please try again.",
    });
  };

  const handleExtendLoading = async (vehicle, minutes) => {
    const ticket = openTicketByVehicleId.get(vehicle.id);
    if (!ticket) return;
    setExtendingTicketId(ticket.id);
    try {
      await apiService.patch(`/tickets/${ticket.id}/`, {
        extra_loading_minutes: (ticket.extra_loading_minutes || 0) + minutes,
      });
      fetchData(true);
    } catch (err) {
      setDispatchError(err.message || "Failed to extend loading time.");
    } finally {
      setExtendingTicketId(null);
    }
  };

  // Lets a driver anywhere in the line (not just the front) pay the terminal
  // fee now and leave instead of waiting their turn — reuses the same
  // denomination/quantity picker as a normal Dispatch.
  const handleRoam = (vehicle) => {
    if (!selectedSeriesId) {
      setDispatchError("Please select a ticket series before converting to roam.");
      return;
    }
    return finalizeVehicle(vehicle, {
      call: (id, body) => apiService.convertToRoam(id, body),
      setBusyId: setRoamingVehicleId,
      doneLabel: "converted to roam",
      failMessage: "Failed to convert to roam. Please try again.",
    });
  };

  // Persists a drag-and-drop reorder within one route's line — the backend
  // rewrites queue_rank for the whole route to match, and every connected
  // client picks it up on the next queue_updated ping.
  const handleReorderDrop = async (routeName, routeId, targetVehicleId) => {
    const sourceId = dragVehicleId;
    setDragVehicleId(null);
    setDragOverVehicleId(null);
    if (routeId == null || sourceId == null || sourceId === targetVehicleId) return;

    const currentOrder = groupedByRoute[routeName].vehicles.map((v) => v.id);
    const fromIdx = currentOrder.indexOf(sourceId);
    const toIdx = currentOrder.indexOf(targetVehicleId);
    if (fromIdx === -1 || toIdx === -1) return;

    const nextOrder = [...currentOrder];
    nextOrder.splice(fromIdx, 1);
    nextOrder.splice(toIdx, 0, sourceId);

    setReorderingRouteId(routeId);
    setReorderError("");
    try {
      await apiService.reorderQueue(routeId, nextOrder);
    } catch (err) {
      setReorderError(err.message || "Failed to reorder queue.");
    } finally {
      setReorderingRouteId(null);
      fetchData(true);
    }
  };

  // Drag source + drop target props shared by the front vehicle and the up-next rows.
  const dragProps = (vehicle, routeName, routeId) => {
    const canReorder = routeId != null;
    return {
      draggable: canReorder,
      onDragStart: () => canReorder && setDragVehicleId(vehicle.id),
      onDragOver: (e) => {
        if (!canReorder) return;
        e.preventDefault();
        if (dragOverVehicleId !== vehicle.id) setDragOverVehicleId(vehicle.id);
      },
      onDragEnd: () => {
        setDragVehicleId(null);
        setDragOverVehicleId(null);
      },
      onDrop: (e) => {
        e.preventDefault();
        handleReorderDrop(routeName, routeId, vehicle.id);
      },
    };
  };

  // Server already filters to status=ACTIVE — see fetchData().
  const activeDrivers = drivers;

  const swapDriverResults = activeDrivers.filter((d) =>
    d.name.toLowerCase().includes(swapDriverQuery.toLowerCase()),
  );

  const openSwapModal = (vehicle) => {
    setSwapTarget(vehicle);
    setSwapDriverId("");
    setSwapDriverQuery("");
    setSwapError("");
  };

  const closeSwapModal = () => {
    if (swapping) return;
    setSwapTarget(null);
    setSwapDriverId("");
    setSwapDriverQuery("");
    setShowSwapDriverDropdown(false);
    setSwapError("");
  };

  const selectSwapDriver = (driver) => {
    setSwapDriverId(driver.id);
    setSwapDriverQuery(driver.name);
    setShowSwapDriverDropdown(false);
    if (swapError) setSwapError("");
  };

  const handleConfirmSwap = async () => {
    if (!swapDriverId) {
      setSwapError("Please select a driver.");
      return;
    }
    setSwapping(true);
    setSwapError("");
    try {
      const openTicket = openTicketByVehicleId.get(swapTarget.id);
      if (!openTicket) {
        throw new Error("No open ticket found for this vehicle.");
      }
      await apiService.reassignTicketDriver(openTicket.id, swapDriverId);
      await fetchData(true);
      closeSwapModal();
    } catch (err) {
      setSwapError(err.message || "Failed to reassign driver. Please try again.");
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="dispatch-page">
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

      {reorderError && (
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
          {reorderError}
        </div>
      )}

      <div className="dispatch-panel">
        <div className="dispatch-panel-header">
          <div>
            <h2 className="dispatch-panel-title">Queued vehicles</h2>
            <span className="dispatch-panel-sub">
              {queue.length} vehicle{queue.length !== 1 ? "s" : ""} in line
            </span>
          </div>
          <label className="dispatch-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              placeholder="Search plate number, route, driver name"
              value={plateSearch}
              onChange={(e) => setPlateSearch(e.target.value)}
            />
          </label>
        </div>

        {dispatchError && (
          <span className="dispatch-modal-field-error dispatch-settings-error">{dispatchError}</span>
        )}

        <div className="dispatch-chips">
          <div className="dispatch-chips-list">
            {!loading && queue.length > 0 && (
              <>
            <button
              type="button"
              className={`dispatch-chip${routeFilter === null ? " dispatch-chip--active" : ""}`}
              onClick={() => setRouteFilter(null)}
            >
              All routes <span className="dispatch-chip-count">{queue.length}</span>
            </button>
            {sortedRoutes.map((routeName) => (
              <button
                key={routeName}
                type="button"
                className={`dispatch-chip${routeFilter === routeName ? " dispatch-chip--active" : ""}`}
                onClick={() => setRouteFilter(routeFilter === routeName ? null : routeName)}
              >
                {routeName}
                <span className="dispatch-chip-count">{groupedByRoute[routeName].vehicles.length}</span>
                {isRouteOverdue(groupedByRoute[routeName].vehicles) && <span className="dispatch-chip-dot" />}
              </button>
            ))}
              </>
            )}
          </div>
          <SeriesPicker
            availableSeries={availableSeries}
            allSeries={allSeries}
            selectedSeriesId={selectedSeriesId}
            setSelectedSeriesId={setSelectedSeriesId}
            setSeriesOverrideId={setSeriesOverrideId}
            onChange={() => dispatchError && setDispatchError("")}
            pickExact
          />
        </div>

        <div className="dispatch-panel-body">
          {loading ? (
            <SkeletonList rows={4} h={72} />
          ) : queue.length === 0 ? (
            <div className="dispatch-state-wrap dispatch-state-wrap--empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                <rect x="1" y="3" width="15" height="13" rx="1" />
                <path d="M16 8h4l3 3v5h-7V8z" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              <span>No vehicles in queue</span>
            </div>
          ) : visibleRoutes.length === 0 ? (
            <div className="dispatch-state-wrap dispatch-state-wrap--empty">
              <span>No vehicles match “{plateSearch}”</span>
            </div>
          ) : (
            <div className="dispatch-board">
              {visibleRoutes.map((routeName) => {
                const { routeId, vehicles: routeVehicles } = groupedByRoute[routeName];
                const [head, ...upNext] = routeVehicles;
                const term = plateSearch.trim().toLowerCase();
                const shownNext = upNext.filter((v) => matchesSearch(v, routeName, term));
                const win = getLoadingWindow(head);
                const overdue = win != null && win.deadline < now;
                const ticket = openTicketByVehicleId.get(head.id);
                const photo = driverPhotoById.get(ticket?.driver?.id);
                const progress = win ? Math.min(1, Math.max(0, (win.deadline - now) / win.totalMs)) : 1;
                const canReorder = routeId != null;
                return (
                  <section
                    key={routeName}
                    className={`dispatch-route-card${overdue ? " dispatch-route-card--overdue" : ""}`}
                  >
                    <header className="dispatch-route-card-head">
                      <h3>{routeName}</h3>
                      {reorderingRouteId === routeId && (
                        <span className="dispatch-route-label-saving">Saving order…</span>
                      )}
                    </header>

                    <div className="dispatch-route-card-body">
                      <span className="dispatch-eyebrow">Now loading</span>
                      <div
                        className={`dispatch-now${routeId != null ? " dispatch-now--draggable" : ""}${dragOverVehicleId === head.id ? " dispatch-upnext-row--drag-over" : ""}${dragVehicleId === head.id ? " dispatch-upnext-row--dragging" : ""}`}
                        {...dragProps(head, routeName, routeId)}
                      >
                        <div className={`dispatch-ring${overdue ? " dispatch-ring--overdue" : ""}`}>
                          <svg viewBox="0 0 64 64" width="64" height="64">
                            <circle className="dispatch-ring-track" cx="32" cy="32" r="28" />
                            <circle
                              className="dispatch-ring-bar"
                              cx="32"
                              cy="32"
                              r="28"
                              pathLength="1"
                              strokeDasharray="1"
                              strokeDashoffset={1 - progress}
                              transform="rotate(-90 32 32)"
                            />
                          </svg>
                          <div className="dispatch-ring-text">
                            {win ? (
                              <>
                                <strong>{formatCountdown(win.deadline)}</strong>
                                <span>{overdue ? "OVER" : "LEFT"}</span>
                              </>
                            ) : (
                              <strong>—</strong>
                            )}
                          </div>
                        </div>
                        <div className="dispatch-now-info">
                          <span className="dispatch-plate">{head.plate_number}</span>
                          <span className="dispatch-now-driver">{getDriverName(head)}</span>
                          <span className="dispatch-now-meta">Queued {formatQueuedAt(head)}</span>
                        </div>
                        <div className="dispatch-photo">
                          {photo ? (
                            <img src={photo} alt={getDriverName(head)} />
                          ) : (
                            <>
                              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 21a8 8 0 0 1 16 0" />
                              </svg>
                              <span>2×2 photo</span>
                            </>
                          )}
                        </div>
                      </div>

                      {overdue && (
                        <div className="dispatch-alert">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          Loading time is up — ready to dispatch
                        </div>
                      )}

                      {win && (
                        <div className="dispatch-add-time">
                          <span>Add time</span>
                          {EXTEND_OPTIONS_MINUTES.map((minutes) => (
                            <button
                              key={minutes}
                              type="button"
                              className="dispatch-extend-btn"
                              onClick={() => handleExtendLoading(head, minutes)}
                              disabled={extendingTicketId === ticket?.id}
                              title={`Extend by ${minutes} minutes`}
                            >
                              +{minutes}{minutes === EXTEND_OPTIONS_MINUTES[0] ? " min" : ""}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="dispatch-action-group">
                        <button
                          type="button"
                          className="dispatch-btn dispatch-btn--dispatch"
                          onClick={() => handleDispatch(head)}
                          disabled={dispatchingVehicleId === head.id}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                          {dispatchingVehicleId === head.id ? "Dispatching…" : "Dispatch"}
                        </button>
                        <button type="button" className="dispatch-btn dispatch-btn--swap" onClick={() => openSwapModal(head)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3" />
                          </svg>
                          Swap driver
                        </button>
                      </div>
                    </div>

                    {shownNext.length > 0 && (
                      <div className="dispatch-upnext">
                        <div className="dispatch-upnext-head">
                          <span className="dispatch-upnext-hint">Drag (⠿) to move queue position</span>
                          <span className="dispatch-eyebrow">Up next · {upNext.length}</span>
                        </div>
                        {shownNext.map((vehicle) => (
                          <div
                            key={vehicle.id}
                            className={`dispatch-upnext-row${dragOverVehicleId === vehicle.id ? " dispatch-upnext-row--drag-over" : ""}${dragVehicleId === vehicle.id ? " dispatch-upnext-row--dragging" : ""}`}
                            {...dragProps(vehicle, routeName, routeId)}
                          >
                            {canReorder && (
                              <span className="dispatch-drag-handle" title="Drag to reorder this route's queue">
                                <svg width="10" height="14" viewBox="0 0 12 16" fill="currentColor">
                                  <circle cx="3" cy="2.5" r="1.4" />
                                  <circle cx="9" cy="2.5" r="1.4" />
                                  <circle cx="3" cy="8" r="1.4" />
                                  <circle cx="9" cy="8" r="1.4" />
                                  <circle cx="3" cy="13.5" r="1.4" />
                                  <circle cx="9" cy="13.5" r="1.4" />
                                </svg>
                              </span>
                            )}
                            <span className="dispatch-order-index">#{routeVehicles.indexOf(vehicle) + 1}</span>
                            <span className="dispatch-plate dispatch-plate--sm">{vehicle.plate_number}</span>
                            <span className="dispatch-upnext-actions">
                              <button
                                type="button"
                                className="dispatch-btn dispatch-btn--roam dispatch-btn--sm"
                                onClick={() => handleRoam(vehicle)}
                                disabled={roamingVehicleId === vehicle.id}
                                title="Pay the terminal fee now and leave without waiting in line"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                  <path d="M3 12h13M11 6l6 6-6 6M21 5v14" />
                                </svg>
                                {roamingVehicleId === vehicle.id ? "Roaming…" : "Roam"}
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
                <div className="dispatch-driver-combobox">
                  <input
                    type="text"
                    className="dispatch-modal-select"
                    placeholder="Type to search drivers…"
                    value={swapDriverQuery}
                    onChange={(e) => {
                      setSwapDriverQuery(e.target.value);
                      setShowSwapDriverDropdown(true);
                      if (swapDriverId) setSwapDriverId("");
                    }}
                    onFocus={() => setShowSwapDriverDropdown(true)}
                    onBlur={() =>
                      setTimeout(() => setShowSwapDriverDropdown(false), 150)
                    }
                    disabled={swapping}
                  />
                  {showSwapDriverDropdown && (
                    <div className="dispatch-driver-dropdown">
                      {swapDriverResults.length === 0 ? (
                        <div className="dispatch-driver-dropdown-empty">
                          No matching drivers
                        </div>
                      ) : (
                        swapDriverResults.map((d) => (
                          <div
                            key={d.id}
                            className="dispatch-driver-dropdown-item"
                            onMouseDown={() => selectSwapDriver(d)}
                          >
                            {d.name}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
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
