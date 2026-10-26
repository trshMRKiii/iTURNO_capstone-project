import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiService } from "../../../lib/api-service";
import { useQueueSocket } from "../../../lib/useQueueSocket";
import { Dialog, SkeletonList } from "../../../components/ui/kit";
import { ticketsNeeded } from "../queue/useQueue";
import KioskRoamStrip from "./KioskRoamStrip";
import SwapDriverDialog from "./SwapDriverDialog";
import "../../../styles/Dispatch.css";

const NO_ROUTE = "No Route Assigned";
const DEFAULT_LOADING_MINUTES = 5; // same fallback as the backend for routes with no estimate

const Arrow = ({ down }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
    <path d={down ? "M12 5v14M19 12l-7 7-7-7" : "M12 19V5M5 12l7-7 7 7"} />
  </svg>
);

// The queued-vehicles board: one table per route, in dispatch order. Vehicles leave the
// line at the kiosk (Check-out QR) or via the Dispatch button here, which draws the
// desk's ticket series; the arrows reorder them.
function Dispatch({ seriesId, ticketFee }) {
  const [dispatchingId, setDispatchingId] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reorderingRouteId, setReorderingRouteId] = useState(null);
  const [search, setSearch] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [roamSessions, setRoamSessions] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [baySwap, setBaySwap] = useState(null);
  const [driverSwap, setDriverSwap] = useState(null);
  const [reason, setReason] = useState("");
  const [reasonOpenId, setReasonOpenId] = useState(null);
  const [reasonPos, setReasonPos] = useState({});
  const reasonTimer = useRef(null);

  // Click the "!" to read the swap reason; it hides itself after a few seconds.
  // Fixed-positioned from the badge's rect so the route card's overflow can't clip it.
  const showReason = (vehicleId, e) => {
    clearTimeout(reasonTimer.current);
    const r = e.currentTarget.getBoundingClientRect();
    const flip = r.bottom > window.innerHeight - 140;
    setReasonOpenId(vehicleId);
    setReasonPos({ left: Math.min(r.left, window.innerWidth - 260), ...(flip ? { bottom: window.innerHeight - r.top + 8 } : { top: r.bottom + 8 }) });
    reasonTimer.current = setTimeout(() => setReasonOpenId(null), 4000);
  };
  useEffect(() => () => clearTimeout(reasonTimer.current), []);

  // Roam timers tick every second while someone is out roaming; otherwise a slow tick
  // is enough to flag a loading-bay vehicle that has passed its estimated departure.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), roamSessions.length ? 1000 : 15000);
    return () => clearInterval(timer);
  }, [roamSessions.length]);

  // Latest-wins: overlapping refetches (socket pings, post-reorder) must not let an older snapshot land last.
  const fetchSeq = useRef(0);

  const fetchData = async (silent = false) => {
    const seq = ++fetchSeq.current;
    if (!silent) setLoading(true);
    try {
      const [vehicleData, ticketData, sessionData] = await Promise.all([
        apiService.getVehicles({ status: "QUEUED", is_archived: "false" }),
        apiService.getTickets({ status: "QUEUED" }),
        apiService.getKioskSessions(),
      ]);
      if (seq !== fetchSeq.current) return;
      setVehicles(vehicleData);
      setTickets(ticketData);
      setRoamSessions(sessionData);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Backend pings "queue_updated" whenever a vehicle/ticket change affects the board.
  useQueueSocket(() => fetchData(true));

  const ticketByVehicleId = useMemo(() => {
    const map = new Map();
    for (const t of tickets) {
      if (t.vehicle?.id != null && !map.has(t.vehicle.id)) map.set(t.vehicle.id, t);
    }
    return map;
  }, [tickets]);

  // Drivers already in line can't take over another vehicle.
  const busyDriverIds = useMemo(() => new Set(tickets.map((t) => t.driver?.id).filter(Boolean)), [tickets]);

  const getDriverName = (vehicle) =>
    vehicle.active_driver_name || ticketByVehicleId.get(vehicle.id)?.driver?.name || "—";

  // Only the loading-bay vehicle has an estimate: loading start + the route's minutes (+ any
  // "+5m" extension). Mirrors public_queue's departure_time on the backend.
  const departureAt = (vehicle) => {
    const ticket = ticketByVehicleId.get(vehicle.id);
    const start = ticket?.loading_started_at ?? ticket?.issued_at;
    if (!start) return null;
    const minutes = (vehicle.route_detail?.estimated_loading_minutes || DEFAULT_LOADING_MINUTES) + (ticket.extra_loading_minutes || 0);
    return new Date(Date.parse(start) + minutes * 60000).toISOString();
  };

  const formatTime = (iso) =>
    iso ? new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "—";

  // Manual up/down order (queue_rank) wins; never-reordered vehicles fall back to FIFO,
  // mirroring the backend's order_by('queue_rank', 'issued_at').
  const groups = useMemo(() => {
    const byRoute = {};
    for (const v of vehicles) {
      if (!ticketByVehicleId.has(v.id)) continue;
      const name = v.route_detail?.full_name || NO_ROUTE;
      (byRoute[name] ??= { routeId: v.route_detail?.id ?? null, vehicles: [] }).vehicles.push(v);
    }
    const order = (v) => {
      const t = ticketByVehicleId.get(v.id);
      return [t.queue_rank ?? Infinity, t.issued_at ? Date.parse(t.issued_at) : Infinity];
    };
    for (const g of Object.values(byRoute)) {
      g.vehicles.sort((a, b) => {
        const [ra, ta] = order(a);
        const [rb, tb] = order(b);
        return (ra === rb ? 0 : ra - rb) || (ta === tb ? 0 : ta - tb);
      });
    }
    return byRoute;
  }, [vehicles, ticketByVehicleId]);

  const routeNames = useMemo(() => Object.keys(groups).sort((a, b) => a.localeCompare(b)), [groups]);

  const term = search.trim().toLowerCase();
  const matches = (v, routeName) =>
    !term || [v.plate_number, routeName, getDriverName(v)].some((text) => String(text || "").toLowerCase().includes(term));

  const visible = routeNames
    .filter((name) => !routeFilter || name === routeFilter)
    .map((name) => ({ name, ...groups[name], shown: groups[name].vehicles.filter((v) => matches(v, name)) }))
    .filter((r) => r.shown.length > 0);

  // Swaps a vehicle with its neighbour (delta -1/+1); the backend rewrites queue_rank for the whole
  // route and every client picks it up on the next queue_updated ping.
  // A swap that touches the loading bay (#1) is held for a reason + confirmation first.
  const handleMove = async (route, vehicleId, delta, reason) => {
    if (route.routeId == null || reorderingRouteId != null) return;
    const order = route.vehicles.map((v) => v.id);
    const from = order.indexOf(vehicleId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= order.length) return;
    if (reason === undefined && (from === 0 || to === 0)) {
      setBaySwap({ route, vehicleId, delta, front: route.vehicles[0], other: route.vehicles[from === 0 ? to : from] });
      setReason("");
      return;
    }
    [order[from], order[to]] = [order[to], order[from]];

    setReorderingRouteId(route.routeId);
    setError("");
    try {
      await apiService.reorderQueue(route.routeId, order, reason);
    } catch (err) {
      setError(err.message || "Failed to reorder queue.");
    } finally {
      setReorderingRouteId(null);
      fetchData(true);
    }
  };

  const handleExtend = async (route, minutes) => {
    setError("");
    try {
      await apiService.extendLoading(route.routeId, minutes);
    } catch (err) {
      setError(err.message || "Failed to extend loading time.");
    } finally {
      fetchData(true);
    }
  };

  const handleDispatch = async (vehicle) => {
    if (!seriesId) {
      setError("Pick a ticket series in Shift setup first.");
      return;
    }
    setDispatchingId(vehicle.id);
    setError("");
    try {
      await apiService.dispatchTicket(vehicle.id, {
        seriesId: parseInt(seriesId),
        quantity: ticketsNeeded(vehicle, ticketFee),
      });
    } catch (err) {
      setError(err.message || "Failed to dispatch vehicle.");
    } finally {
      setDispatchingId(null);
      fetchData(true);
    }
  };

  return (
    <div className="dispatch-page">
      <div className="dispatch-panel">
        <div className="dispatch-panel-header">
          <h2 className="dispatch-panel-title">Queued vehicles</h2>
          <div className="dispatch-tools">
            <select
              className="dispatch-filter"
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              aria-label="Filter by route"
            >
              <option value="">Filter by Route</option>
              {routeNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <label className="dispatch-search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                placeholder="Search plate number, route, driver name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
        </div>

        {error && <div className="dispatch-error">{error}</div>}

        <KioskRoamStrip sessions={roamSessions} now={now} />

        <div className="dispatch-panel-body">
          {loading ? (
            <SkeletonList rows={4} h={72} />
          ) : vehicles.length === 0 ? (
            <div className="dispatch-state-wrap">No vehicles in queue</div>
          ) : visible.length === 0 ? (
            <div className="dispatch-state-wrap">No vehicles match the current filter</div>
          ) : (
            <div className="dispatch-board">
              {visible.map((route) => (
                <section key={route.name} className="dispatch-route-card">
                  <header className="dispatch-route-card-head">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <h3>{route.name}</h3>
                    <span className="dispatch-count">
                      {route.vehicles.length} vehicle{route.vehicles.length !== 1 ? "s" : ""}
                    </span>
                  </header>
                  <table className="dispatch-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Plate Number</th>
                        <th>Driver</th>
                        <th>Est. departure</th>
                        <th className="dispatch-col-action">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {route.shown.map((vehicle) => {
                        const pos = route.vehicles.indexOf(vehicle);
                        const busy = reorderingRouteId != null || route.routeId == null;
                        return (
                          <tr key={vehicle.id} className={pos === 0 ? "dispatch-row--next" : undefined}>
                            <td className="dispatch-order-index">#{pos + 1}</td>
                            <td className="dispatch-plate">
                              {vehicle.plate_number}
                              {ticketByVehicleId.get(vehicle.id)?.bay_swap_reason && (
                                <span className="dispatch-swap-wrap">
                                  <button
                                    type="button"
                                    className="dispatch-swap-flag"
                                    onClick={(e) => showReason(vehicle.id, e)}
                                    aria-label="Why was this vehicle swapped out of the loading bay?"
                                  >
                                    !
                                  </button>
                                  {reasonOpenId === vehicle.id && (
                                    <span className="dispatch-swap-pop" role="status" style={reasonPos}>
                                      <strong>Swapped out of the loading bay</strong>
                                      {ticketByVehicleId.get(vehicle.id).bay_swap_reason}
                                    </span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td>
                              {getDriverName(vehicle)}
                              <button
                                type="button"
                                className="dispatch-driver-swap"
                                onClick={() => setDriverSwap({ vehicle, ticket: ticketByVehicleId.get(vehicle.id) })}
                              >
                                Swap driver
                              </button>
                            </td>
                            <td>
                              {pos === 0 ? (() => {
                                const eta = departureAt(vehicle);
                                const lateMin = eta ? Math.floor((now - Date.parse(eta)) / 60000) : -1;
                                return (
                                  <>
                                    <span className={lateMin >= 0 ? "dispatch-eta--late" : undefined}>{formatTime(eta)}</span>
                                    {lateMin >= 0 && (
                                      <span className="dispatch-late-tag">
                                        Overdue{lateMin > 0 ? ` ${lateMin} min` : ""}
                                      </span>
                                    )}
                                    {eta && route.routeId != null && (
                                      <span className="dispatch-extend">
                                        {[5, 10, 15].map((m) => (
                                          <button key={m} type="button" className="dispatch-extend-btn" onClick={() => handleExtend(route, m)}>
                                            +{m}m
                                          </button>
                                        ))}
                                      </span>
                                    )}
                                  </>
                                );
                              })() : "—"}
                            </td>
                            <td className="dispatch-col-action">
                              <button
                                type="button"
                                className="dispatch-move-btn"
                                onClick={() => handleMove(route, vehicle.id, -1)}
                                disabled={busy || pos === 0}
                                aria-label={`Move ${vehicle.plate_number} up`}
                              >
                                <Arrow />
                              </button>
                              <button
                                type="button"
                                className="dispatch-move-btn"
                                onClick={() => handleMove(route, vehicle.id, 1)}
                                disabled={busy || pos === route.vehicles.length - 1}
                                aria-label={`Move ${vehicle.plate_number} down`}
                              >
                                <Arrow down />
                              </button>
                              <button
                                type="button"
                                className="dispatch-go-btn"
                                onClick={() => handleDispatch(vehicle)}
                                disabled={dispatchingId != null}
                              >
                                {dispatchingId === vehicle.id ? "Dispatching…" : "Dispatch"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {driverSwap && (
        <SwapDriverDialog
          target={driverSwap}
          busyDriverIds={busyDriverIds}
          onClose={() => setDriverSwap(null)}
          onSwapped={() => fetchData(true)}
        />
      )}

      <Dialog
        open={!!baySwap}
        onClose={() => setBaySwap(null)}
        size="sm"
        title="Swap the loading bay?"
        subtitle={baySwap && `${baySwap.front.plate_number} is in the loading bay. It will swap places with ${baySwap.other.plate_number}.`}
        footer={
          <>
            <button type="button" className="ui-outline-btn ui-outline-btn--auto" onClick={() => setBaySwap(null)}>Cancel</button>
            <button
              type="button"
              className="dispatch-go-btn"
              disabled={!reason.trim()}
              onClick={() => {
                const { route, vehicleId, delta } = baySwap;
                setBaySwap(null);
                handleMove(route, vehicleId, delta, reason.trim());
              }}
            >
              Confirm swap
            </button>
          </>
        }
      >
        <label className="dispatch-reason">
          Reason for the swap
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. vehicle needs repair, driver not ready"
            autoFocus
          />
        </label>
      </Dialog>
    </div>
  );
}

export default Dispatch;
