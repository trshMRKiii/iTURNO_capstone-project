import React, { useState } from "react";
import { useEditGrant } from "../useEditGrant";

const TicketPriceModal = ({
  ticketFee,
  ticketPriceLoading,
  ticketPriceError,
  isTicketPriceModalOpen,
  setIsTicketPriceModalOpen,
  newTicketPrice,
  setNewTicketPrice,
  saveTicketPrice,
  isSavingTicketPrice,
  userRole,
}) => {
  const grant = useEditGrant("ticketPrice", userRole);
  const [grantUsername, setGrantUsername] = useState("");
  const [grantPassword, setGrantPassword] = useState("");

  if (!isTicketPriceModalOpen) return null;

  const handleClose = () => {
    setIsTicketPriceModalOpen(false);
    setGrantUsername("");
    setGrantPassword("");
    grant.setGrantError("");
  };

  const handleRequestGrant = async (e) => {
    e.preventDefault();
    const ok = await grant.requestGrant(grantUsername, grantPassword);
    if (ok) {
      setGrantUsername("");
      setGrantPassword("");
    }
  };

  // ── Grant request screen (PERSONNEL without active grant) ──────────────────
  if (!grant.hasAccess) {
    return (
      <div className="ticket-overlay" onClick={handleClose}>
        <div className="ticket-modal" onClick={(e) => e.stopPropagation()}>
          <div className="ticket-modal-header">
            <div className="ticket-modal-header-left">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <h2 className="ticket-modal-title">Access Required</h2>
            </div>
            <button className="ticket-modal-close" onClick={handleClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div className="ticket-modal-body">
            <div className="grant-info-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
              </svg>
              <p>
                Editing the <strong>Ticket Price</strong> requires Supervisor, Manager, or Super Admin authorization.
                Have a privileged user sign in below to grant a <strong>30-minute editing window</strong>.
              </p>
            </div>
            <form className="grant-form" onSubmit={handleRequestGrant}>
              <div className="ticket-field">
                <label className="ticket-label">Authoriser Username</label>
                <input
                  type="text"
                  className="ticket-select"
                  placeholder="Supervisor / Manager / Super Admin username"
                  value={grantUsername}
                  onChange={(e) => setGrantUsername(e.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="ticket-field">
                <label className="ticket-label">Authoriser Password</label>
                <input
                  type="password"
                  className="ticket-select"
                  placeholder="Password"
                  value={grantPassword}
                  onChange={(e) => setGrantPassword(e.target.value)}
                  required
                />
              </div>
              {grant.grantError && (
                <div className="ticket-alert ticket-alert--error">{grant.grantError}</div>
              )}
              <div className="ticket-modal-footer" style={{ paddingTop: 0, border: "none" }}>
                <button type="button" className="ticket-modal-btn ticket-modal-btn--cancel" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="ticket-modal-btn ticket-modal-btn--submit" disabled={grant.requesting}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  {grant.requesting ? "Verifying…" : "Grant Access"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal edit screen (privileged OR PERSONNEL with valid grant) ──────────
  return (
    <div className="ticket-overlay" onClick={handleClose}>
      <div className="ticket-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ticket-modal-header">
          <div className="ticket-modal-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
            </svg>
            <h2 className="ticket-modal-title">Update Ticket Price</h2>
          </div>
          <button className="ticket-modal-close" onClick={handleClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="ticket-modal-body">
          {/* Grant badge — shown only for PERSONNEL with an active grant */}
          {!grant.isPrivileged && grant.grant && (
            <div className="grant-active-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Access granted by <strong>{grant.grant.grantedBy}</strong>
              &nbsp;—&nbsp;expires in <span className="grant-timer">{grant.remainingLabel}</span>
            </div>
          )}
          <div className="ticket-price-current">
            <span className="ticket-price-current__label">Current Ticket Price</span>
            <span className="ticket-price-current__value">
              {ticketPriceLoading ? "Loading…" : `₱${ticketFee.toFixed(2)}`}
            </span>
          </div>
          <div className="ticket-field">
            <label className="ticket-label">New Price (PHP)</label>
            <div className="ticket-price-input-wrap">
              <span className="ticket-price-input-prefix">₱</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="ticket-select ticket-price-input"
                placeholder="0.00"
                value={newTicketPrice}
                onChange={(e) => setNewTicketPrice(e.target.value)}
              />
            </div>
          </div>
          {ticketPriceError && (
            <div className="ticket-alert ticket-alert--error">{ticketPriceError}</div>
          )}
          <p className="ticket-price-note">
            The new price will apply to all tickets issued after saving. Existing tickets are unaffected.
          </p>
        </div>
        <div className="ticket-modal-footer">
          <button type="button" className="ticket-modal-btn ticket-modal-btn--cancel" onClick={handleClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ticket-modal-btn ticket-modal-btn--submit"
            onClick={saveTicketPrice}
            disabled={isSavingTicketPrice}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
            </svg>
            {isSavingTicketPrice ? "Saving…" : "Save Price"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TicketPriceModal;
