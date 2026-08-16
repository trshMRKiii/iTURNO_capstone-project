import React from "react";

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
}) => {
  if (!isTicketPriceModalOpen) return null;

  const handleClose = () => {
    setIsTicketPriceModalOpen(false);
  };

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
