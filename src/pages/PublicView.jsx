import React, { useState, useEffect, useRef } from "react";
import "../styles/login.css";
import { apiService } from '../lib/api-service';
import { useQueueSocket } from '../lib/useQueueSocket';

// ── Import images
import sfcLogo   from '../pictures/sfc-nobg-logo.png';
import sfcBanner from '../pictures/sfc-nobg-banner.png';
import sfcMain   from '../pictures/sfc-main.jpg';

function PublicView() {
  const [queue,          setQueue]          = useState([]);
  const [loadingQueue,   setLoadingQueue]   = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    loadQueue();
    const handleScroll = () => setHeaderScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // ── Core queue loader ──────────────────────────────────────────────────────
  // Logic: fetch vehicles + tickets together.
  // A vehicle qualifies for the queue if:
  //   - status === 'QUEUED'
  //   - not archived
  //   - has at least one ticket that is ISSUED and not late
  // Vehicles are ordered by issue time (earliest first = next to be dispatched),
  // then grouped by route so each route gets its own queue table.
  const loadQueue = async () => {
    // Only show the loading spinner on first mount — a websocket-triggered
    // refetch (e.g. a new vehicle joining the queue) should swap the table
    // data in place, not flash the whole board back to a loading state on
    // the terminal TV.
    if (!hasLoadedOnce.current) setLoadingQueue(true);
    try {
      const [vehicleData, ticketData] = await Promise.all([
        apiService.getVehicles(),
        apiService.getTickets(),
      ]);

      const vehicles = Array.isArray(vehicleData) ? vehicleData : [];
      const tickets  = Array.isArray(ticketData)  ? ticketData  : [];

      // Filter: only QUEUED, non-archived vehicles that have an active ISSUED ticket
      const queuedVehicles = vehicles.filter(
        (v) =>
          v.status === 'QUEUED' &&
          !v.is_archived &&
          tickets.some(
            (t) =>
              t.vehicle?.id === v.id &&
              t.status === 'ISSUED',
          ),
      );

      // Attach the relevant issued ticket to each vehicle for easy access (e.g. departure_time)
      const withTicket = queuedVehicles.map((v) => {
        const ticket = tickets.find(
          (t) =>
            t.vehicle?.id === v.id &&
            t.status === 'ISSUED',
        );
        return { ...v, _ticket: ticket || null };
      });

      // Earliest-issued first, so index 0 within a route group is the next to dispatch
      withTicket.sort((a, b) => {
        const aTime = a._ticket?.issued_at ? new Date(a._ticket.issued_at).getTime() : 0;
        const bTime = b._ticket?.issued_at ? new Date(b._ticket.issued_at).getTime() : 0;
        return aTime - bTime;
      });

      setQueue(withTicket);
    } catch (err) {
      console.error('Failed to load queue:', err);
    } finally {
      hasLoadedOnce.current = true;
      setLoadingQueue(false);
    }
  };

  // Backend pushes a "queue_updated" ping whenever a vehicle/ticket
  // change affects the board, so we refetch immediately instead of
  // waiting for the next fallback poll.
  useQueueSocket(loadQueue);

  // ── Derived display data ───────────────────────────────────────────────────

  // Group by route → one table per route
  const queueGrouped = queue.reduce((acc, v) => {
    const key = v.route_detail?.full_name || v.route_detail?.origin || 'No Route';
    if (!acc[key]) acc[key] = [];
    acc[key].push(v);
    return acc;
  }, {});
  const queueGroupEntries = Object.entries(queueGrouped);

  return (
    <div className="lp-root" style={{ backgroundImage: `url(${sfcMain})` }}>

      {/* Background overlay */}
      <div className="lp-bg-overlay" />

      {/* ── HEADER ── */}
      <header className={`lp-header ${headerScrolled ? 'lp-header--scrolled' : ''}`}>
        <div className="lp-header__inner">
          <div className="lp-header__brand">
            <img src={sfcLogo} alt="SFC Logo" className="lp-header__logo" style={{ borderRadius: '40px' }} />
            <div className="lp-header__brand-text">
              <span className="lp-header__title">North Central Terminal</span>
              <span className="lp-header__sub">City Government of San Fernando</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="lp-main">
        <div className="lp-container">

          {/* Page title bar */}
          <div className="lp-page-title">
            <div>
              <span className="lp-section-eyebrow">Live Updates</span>
              <h2 className="lp-section-title lp-section-title--light">Jeepney Queue Board</h2>
            </div>
          </div>

          {/* ── ROUTE QUEUES ── */}
          <div className="lp-next-header">
            <div className="lp-board-label">
              <div className="lp-board-label__dot lp-board-label__dot--active" />
              Route Queues
            </div>
          </div>

          {loadingQueue ? (
            <div className="lp-queue-card">
              <div className="lp-queue-loading">
                <div className="lp-spinner" />
                <p>Loading queue data…</p>
              </div>
            </div>
          ) : queueGroupEntries.length === 0 ? (
            <div className="lp-queue-card">
              <div className="lp-queue-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.35">
                  <rect x="1" y="3" width="15" height="13" rx="1"/>
                  <path d="M16 8h4l3 3v5h-7V8z"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/>
                  <circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
                <p>No vehicles in queue.</p>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 20,
              }}
            >
            {queueGroupEntries.map(([routeName, vehicles]) => (
              <div className="lp-queue-card" key={routeName}>
                <div className="lp-route-label-badge lp-route-label-badge--active" style={{ margin: '14px 16px' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                    <path d="M3 12h18M13 6l6 6-6 6"/>
                  </svg>
                  {routeName}
                </div>
                <div className="lp-table-wrap">
                  <table className="lp-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Plate Number</th>
                        <th>Driver</th>
                        <th>Status</th>
                        <th>Est. Departure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((v, idx) => (
                        <tr key={v.id}>
                          <td className="lp-td--num">{idx + 1}</td>
                          <td><span className="lp-plate">{v.plate_number}</span></td>
                          <td>{v.active_driver_name || <span className="lp-na">Unassigned</span>}</td>
                          <td>
                            <span className={`lp-status ${idx === 0 ? 'lp-status--available' : ''}`}>
                              {idx === 0 ? 'Active' : 'Queued'}
                            </span>
                          </td>
                          <td className="lp-td--time">
                            {idx === 0 && v._ticket?.issued_at
                              ? new Date(v._ticket.issued_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            </div>
          )}

        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer__inner">
          <div className="lp-footer__brand">
            <img src={sfcBanner} alt="San Fernando City Banner" className="lp-footer__banner" style={{ borderRadius: '100px' }} />
            <p className="lp-footer__desc">
              Serving the commuters of San Fernando City with organized, efficient, and transparent
              public transport management under the City Government of San Fernando, La Union.
            </p>
          </div>
          <div className="lp-footer__info">
            <h4 className="lp-footer__label">Location</h4>
            <address className="lp-footer__address">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Tanqui, San Fernando City, La Union
            </address>
            <h4 className="lp-footer__label" style={{ marginTop: 20 }}>System</h4>
            <p className="lp-footer__sys-name">North Central Terminal<br />Management System</p>
          </div>
        </div>
        <div className="lp-footer__bottom">
          <span>© {new Date().getFullYear()} City Government of San Fernando, La Union. All rights reserved.</span>
        </div>
      </footer>

    </div>
  );
}

export default PublicView;
