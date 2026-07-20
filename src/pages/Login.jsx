import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";
import { handleLogin, apiService } from '../lib/api-service';
import { useToast } from '../components/ui/ToastConfirmContext';
import { useQueueSocket } from '../lib/useQueueSocket';

// ── Import images
import sfcLogo   from '../pictures/sfc-nobg-logo.png';
import sfcBanner from '../pictures/sfc-nobg-banner.png';
import sfcMain   from '../pictures/sfc-main.jpg';

function Login() {
  const [showLoginForm,  setShowLoginForm]  = useState(false);
  const [username,       setUsername]       = useState("");
  const [password,       setPassword]       = useState("");
  const [error,          setError]          = useState("");
  const [queue,          setQueue]          = useState([]);
  const [loadingQueue,   setLoadingQueue]   = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);

  // ── Forgot password ──
  const [modalView,      setModalView]      = useState("login"); // 'login' | 'forgot'
  const [forgotEmail,    setForgotEmail]    = useState("");
  const [forgotError,    setForgotError]    = useState("");
  const [forgotSending,  setForgotSending]  = useState(false);
  const [forgotSent,     setForgotSent]     = useState(false);

  const navigate  = useNavigate();
  const showToast = useToast();

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
    setLoadingQueue(true);
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
      setLoadingQueue(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await handleLogin(username, password, setError, navigate, showToast);
  };

  const closeLoginModal = () => {
    setShowLoginForm(false);
    setError("");
    setModalView("login");
    setForgotEmail("");
    setForgotError("");
    setForgotSent(false);
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError("");

    if (!forgotEmail.trim()) {
      setForgotError("Please enter your email.");
      return;
    }

    setForgotSending(true);
    try {
      await apiService.requestPasswordReset(forgotEmail.trim());
      setForgotSent(true);
    } catch (err) {
      setForgotError(err.message || "Something went wrong. Please try again.");
    } finally {
      setForgotSending(false);
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

          {!showLoginForm ? (
            <button className="lp-btn lp-btn--gold" onClick={() => setShowLoginForm(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Staff Login
            </button>
          ) : (
            <button className="lp-btn lp-btn--outline" onClick={closeLoginModal}>
              ← Back
            </button>
          )}
        </div>
      </header>

      {/* ── LOGIN FORM OVERLAY ── */}
      {showLoginForm && (
        <div className="lp-login-overlay" onClick={closeLoginModal}>
          <div className="lp-login-modal" onClick={(e) => e.stopPropagation()}>
            {modalView === "login" ? (
              <>
                <div className="lp-login-modal__brand">
                  <img src={sfcLogo} alt="Logo" className="lp-login-modal__logo" style={{ borderRadius: '40px' }} />
                  <h2>Staff Access</h2>
                  <p>Sign in to manage terminal operations</p>
                </div>
                <form onSubmit={handleSubmit} className="lp-login-form">
                  <div className="lp-field">
                    <label htmlFor="username">Email</label>
                    <input
                      id="username" type="email" placeholder="Enter your email"
                      value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
                    />
                  </div>
                  <div className="lp-field">
                    <label htmlFor="password">Password</label>
                    <input
                      id="password" type="password" placeholder="Enter your password"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {error && <div className="lp-error">{error}</div>}
                  <button type="submit" className="lp-btn lp-btn--navy lp-btn--full">Sign In</button>
                  <button
                    type="button"
                    className="lp-link-btn"
                    onClick={() => { setModalView("forgot"); setError(""); }}
                  >
                    Forgot password?
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="lp-login-modal__brand">
                  <img src={sfcLogo} alt="Logo" className="lp-login-modal__logo" style={{ borderRadius: '40px' }} />
                  <h2>Reset Password</h2>
                  <p>
                    {forgotSent
                      ? "Check your inbox for the reset link"
                      : "Enter your email and we'll send you a reset link"}
                  </p>
                </div>
                {forgotSent ? (
                  <div className="lp-login-form">
                    <div className="lp-success">
                      If an account exists for <strong>{forgotEmail}</strong>, a password reset
                      link has been sent to it.
                    </div>
                    <button
                      type="button"
                      className="lp-btn lp-btn--navy lp-btn--full"
                      onClick={() => setModalView("login")}
                    >
                      Back to Sign In
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="lp-login-form">
                    <div className="lp-field">
                      <label htmlFor="forgot-email">Email</label>
                      <input
                        id="forgot-email" type="email" placeholder="Enter your email"
                        value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoFocus
                      />
                    </div>
                    {forgotError && <div className="lp-error">{forgotError}</div>}
                    <button type="submit" className="lp-btn lp-btn--navy lp-btn--full" disabled={forgotSending}>
                      {forgotSending ? "Sending…" : "Send Reset Link"}
                    </button>
                    <button
                      type="button"
                      className="lp-link-btn"
                      onClick={() => { setModalView("login"); setForgotError(""); }}
                    >
                      ← Back to Sign In
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}

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

export default Login;
