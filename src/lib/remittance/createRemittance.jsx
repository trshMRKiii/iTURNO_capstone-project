import React, { useState, useEffect } from "react";
import { apiService } from "../api-service";
import { v4 as uuidv4 } from "uuid";

const Field = ({ label, children }) => (
  <div className="rem-field">
    <label className="rem-label">{label}</label>
    {children}
  </div>
);

const CreateBatchForm = ({ onClose, onSave }) => {
  const [accountableOfficer, setAccountableOfficer] = useState("");
  const [collections, setCollections] = useState([
    { ticketFormNo: "", from: 0, to: 0, amount: 0 },
  ]);
  const [deposits, setDeposits] = useState([
    { type: "bill", denomination: 1000, quantity: 0, depositAmount: 0 },
  ]);

  const [ticketFormOptions, setTicketFormOptions] = useState([]);
  const [denominationOptions, setDenominationOptions] = useState([]);
  const [todayTickets, setTodayTickets] = useState([]);
  const [ticketSeries, setTicketSeries] = useState([]);

  const batchId = uuidv4().slice(0, 8).toUpperCase();
  const dateIssued = new Date().toISOString().split("T")[0];

  const getTodayDateString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await apiService.get("/current-user/");
        setAccountableOfficer(user.username || user.first_name);
      } catch (err) {
        console.error("Failed to fetch current user", err);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    apiService.getTicketForms()
      .then(setTicketFormOptions)
      .catch(err => console.error("Failed to load ticket forms:", err));
    apiService.getDenominations()
      .then(setDenominationOptions)
      .catch(err => console.error("Failed to load denominations:", err));

    const today = getTodayDateString(new Date());
    apiService.getTickets()
      .then(data => {
        const tickets = Array.isArray(data) ? data : [];
        setTodayTickets(
          tickets.filter(t =>
            t.issued_at && getTodayDateString(new Date(t.issued_at)) === today &&
            t.status !== "CANCELLED"
          )
        );
      })
      .catch(err => console.error("Failed to load tickets:", err));

    apiService.request("/ticket-series/")
      .then(data => setTicketSeries(Array.isArray(data) ? data : []))
      .catch(err => console.error("Failed to load ticket series:", err));
  }, []);

  const updateCollection = (index, field, value) => {
    const updated = [...collections];
    updated[index][field] = value;

    if (field === "ticketFormNo" && value) {
      const matchingSeries = ticketSeries.filter(
        s => (s.ticket_form_label || s.ticket_form_name || "") === value
      );
      const matchingTickets = todayTickets.filter(
        t => (t.series?.ticket_form_label || "") === value
      );
      const totalCollected = matchingTickets.reduce(
        (sum, t) => sum + Number(t.collection_amount || 0), 0
      );
      const totalStock = matchingSeries.reduce(
        (sum, s) => sum + ((parseInt(s.end_no) || 0) - (parseInt(s.start_no) || 0) + 1), 0
      );

      updated[index].from = totalStock;
      updated[index].amount = totalCollected;
    }

    setCollections(updated);
  };

  const updateDeposit = (index, field, value) => {
    const updated = [...deposits];
    updated[index][field] = value;

    if (updated[index].type === "bill") {
      updated[index].depositAmount =
        Number(updated[index].denomination || 0) *
        Number(updated[index].quantity || 0);
    } else if (updated[index].type === "coin") {
      updated[index].denomination = 0;
      updated[index].depositAmount = Number(updated[index].quantity || 0);
    }

    setDeposits(updated);
  };

  const totalCollections = collections.reduce(
    (sum, c) => sum + Number(c.amount || 0),
    0
  );

  const totalRemittances = deposits.reduce(
    (sum, d) => sum + Number(d.depositAmount || 0),
    0
  );

  const endingBalance = collections.reduce(
    (sum, c) => sum + (Number(c.from) - Number(c.amount || 0)),
    0
  );

  const amountsMismatch = totalRemittances !== totalCollections;

  const handleSave = () => {
    if (amountsMismatch) return;
    const payload = {
      id: batchId,
      issued_at: dateIssued,
      issued_by: accountableOfficer,
      total_amount: totalCollections,
      status: "OPEN",
      collections,
      deposits,
    };
    onSave(payload);
  };

  return (
    <div className="rem-overlay" onClick={onClose}>
      <div className="rem-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="rem-modal-header">
          <div className="rem-modal-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h2 className="rem-modal-title">New Remittance Batch</h2>
          </div>
          <button className="rem-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="rem-modal-body">
          {/* Batch Info */}
          <div className="rem-info-grid">
            <Field label="Batch ID">
              <input type="text" className="rem-input" value={batchId} disabled />
            </Field>
            <Field label="Date Issued">
              <input type="date" className="rem-input" value={dateIssued} disabled />
            </Field>
            <Field label="Accountable Officer">
              <input type="text" className="rem-input" value={accountableOfficer} disabled />
            </Field>
          </div>

          {/* Collections */}
          <div>
            <h3 className="rem-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Collections
            </h3>
          </div>
          <table className="rem-section-table">
            <thead>
              <tr>
                <th>Ticket Form No.</th>
                <th>From</th>
                <th>To</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c, i) => (
                <tr key={i}>
                  <td>
                    <select
                      className="rem-select"
                      value={c.ticketFormNo}
                      onChange={(e) => updateCollection(i, "ticketFormNo", e.target.value)}
                    >
                      <option value="">-- Select --</option>
                      {ticketFormOptions.map(tf => (
                        <option key={tf.id} value={tf.name}>{tf.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="rem-input"
                      value={c.from}
                      onChange={(e) => updateCollection(i, "from", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="rem-input"
                      value={Number(c.from) - Number(c.amount || 0)}
                      readOnly
                      style={{ opacity: 0.6 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="rem-input"
                      value={c.amount}
                      onChange={(e) => updateCollection(i, "amount", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ textAlign: "right" }}>Totals</td>
                <td>{collections.reduce((sum, c) => sum + Number(c.from || 0), 0)}</td>
                <td>{collections.reduce((sum, c) => sum + (Number(c.from || 0) - Number(c.amount || 0)), 0)}</td>
                <td>{collections.reduce((sum, c) => sum + Number(c.amount || 0), 0)}</td>
              </tr>
            </tfoot>
          </table>
          <button
            onClick={() => setCollections([...collections, { ticketFormNo: "", from: 0, to: 0, amount: 0 }])}
            className="rem-add-row-btn"
          >
            + Add Ticket Row
          </button>

          {/* Deposits */}
          <div>
            <h3 className="rem-section-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Remittances / Deposits
            </h3>
          </div>
          <table className="rem-section-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Denomination</th>
                <th>Quantity</th>
                <th>Deposit Amount</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d, i) => (
                <tr key={i}>
                  <td>
                    <select
                      className="rem-select"
                      value={d.type || "bill"}
                      onChange={(e) => updateDeposit(i, "type", e.target.value)}
                    >
                      <option value="bill">Bill</option>
                      <option value="coin">Coin</option>
                    </select>
                  </td>
                  <td>
                    {d.type === "coin" ? (
                      <input type="number" className="rem-input" value={0} disabled />
                    ) : (
                      <select
                        className="rem-select"
                        value={d.denomination}
                        onChange={(e) => updateDeposit(i, "denomination", Number(e.target.value))}
                      >
                        <option value={0}>-- Select --</option>
                        {denominationOptions
                          .filter(dn => dn.type === "bill")
                          .map(dn => (
                            <option key={dn.id} value={dn.value}>{dn.label}</option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      className="rem-input"
                      value={d.quantity}
                      onChange={(e) => updateDeposit(i, "quantity", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="rem-input"
                      value={d.depositAmount}
                      readOnly
                      style={{ opacity: 0.6 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: "right" }}>Total Deposits</td>
                <td>{deposits.reduce((sum, d) => sum + Number(d.depositAmount || 0), 0)}</td>
              </tr>
            </tfoot>
          </table>
          <button
            onClick={() => setDeposits([...deposits, { type: "bill", denomination: 1000, quantity: 0, depositAmount: 0 }])}
            className="rem-add-row-btn"
          >
            + Add Deposit Row
          </button>

          {/* Summary */}
          <div className="rem-summary-grid">
            <div className="rem-summary-card">
              <div className="rem-summary-label">Total Collections</div>
              <div className="rem-summary-value">₱{totalCollections.toLocaleString()}</div>
            </div>
            <div className="rem-summary-card">
              <div className="rem-summary-label">Total Remittances</div>
              <div className="rem-summary-value">₱{totalRemittances.toLocaleString()}</div>
            </div>
            <div className="rem-summary-card">
              <div className="rem-summary-label">Ending Balance</div>
              <div className="rem-summary-value">{endingBalance.toLocaleString()}</div>
            </div>
          </div>

          {/* Certification */}
          <div className="rem-cert">
            <label className="rem-cert-check">
              <input type="checkbox" />
              <span>I certify that the above collections and deposits are accurate.</span>
            </label>
            <div className="rem-info-grid" style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Prepared By">
                <input type="text" className="rem-input" value={accountableOfficer} disabled />
              </Field>
            </div>
          </div>

          {/* Footer */}
          {amountsMismatch && (
            <div className="rem-alert" style={{ marginBottom: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Total Deposits (₱{totalRemittances.toLocaleString()}) does not match Total Collections (₱{totalCollections.toLocaleString()}). Amounts must match to save.
            </div>
          )}
          <div className="rem-modal-footer">
            <button type="button" className="rem-modal-btn rem-modal-btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="rem-modal-btn rem-modal-btn--submit"
              onClick={handleSave}
              disabled={amountsMismatch}
              style={amountsMismatch ? { opacity: 0.5, cursor: "not-allowed" } : {}}
            >
              Save Batch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateBatchForm;
