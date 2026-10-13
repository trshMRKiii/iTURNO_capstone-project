import React, { useState, useEffect } from "react";
import { apiService } from "../../../lib/api-service";
import { ButtonLabel, useFeedback } from "../../../components/ui/kit";
import CashierNameInput from "./CashierNameInput";
import { useCashierName } from "./useCashierName";
import { downloadRemittancePDF } from "./exportRemittancePDF";

function formatCurrency(val) {
  return "₱" + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const Field = ({ label, children }) => (
  <div className="rem-field">
    <label className="rem-label">{label}</label>
    {children}
  </div>
);

const CreateBatchForm = ({ targetDate, onSaved }) => {
  const { notify } = useFeedback();
  const [saving, setSaving] = useState(false);

  const loadFailed = (what, err) => {
    console.error(`Failed to load ${what}:`, err);
    notify.error({ title: `Couldn't load ${what}`, message: "The batch form may be incomplete. Close it and try again." });
  };

  // Duplicate-batch and batch-ID-collision checks need the complete batch
  // history (both tabs), not just a page of it.
  const [existingBatches, setExistingBatches] = useState([]);
  useEffect(() => {
    Promise.all(
      [false, true].map((archived) =>
        apiService.get(`/report/remittance/?is_archived=${archived}`)
      )
    )
      .then((pages) =>
        setExistingBatches(pages.flatMap((res) => (Array.isArray(res) ? res : res.results || [])))
      )
      .catch(() => setExistingBatches([]));
  }, []);

  const [accountableOfficer, setAccountableOfficer] = useState("");
  const [collections, setCollections] = useState([
    { ticketFormNo: "", from: 0, to: 0, ticketsIssued: 0, amount: 0 },
  ]);
  const [deposits, setDeposits] = useState(
    [
      { type: "bill", denomination: 1000, quantity: 0, depositAmount: 0 },
      { type: "bill", denomination: 500, quantity: 0, depositAmount: 0 },
      { type: "bill", denomination: 200, quantity: 0, depositAmount: 0 },
      { type: "bill", denomination: 100, quantity: 0, depositAmount: 0 },
      { type: "bill", denomination: 50, quantity: 0, depositAmount: 0 },
      { type: "bill", denomination: 20, quantity: 0, depositAmount: 0 },
      { type: "coin", denomination: 0, quantity: 0, depositAmount: 0 },
    ]
  );

  const [ticketFormOptions, setTicketFormOptions] = useState([]);
  const [todayTickets, setTodayTickets] = useState([]);
  const [ticketSeries, setTicketSeries] = useState([]);

  const getTodayDateString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // targetDate is the day this batch COVERS — normally today (unchanged
  // behavior), but an explicit past date when filing a late remittance.
  const dateIssued = targetDate || getTodayDateString(new Date());
  const isLate = dateIssued !== getTodayDateString(new Date());

  // Batch ID is TER-<day of year>-<2-digit year> for the day being covered,
  // e.g. day 236 of 2026 -> TER-236-26. Suffixed with -2, -3, ... on the rare
  // case a batch already exists for that day (e.g. an intentional duplicate).
  const batchId = (() => {
    const [year, month, day] = dateIssued.split("-").map(Number);
    const dayOfYear =
      Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
    const base = `TER-${String(dayOfYear).padStart(3, "0")}-${String(year).slice(-2)}`;

    const codes = new Set(existingBatches.map((b) => b.batch_code).filter(Boolean));
    if (!codes.has(base)) return base;
    let n = 2;
    while (codes.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  })();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await apiService.get("/current-user/");
        const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
        setAccountableOfficer(fullName || user.username);
      } catch (err) {
        console.error("Failed to fetch current user", err);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    apiService.getTicketForms()
      .then(setTicketFormOptions)
      .catch(err => loadFailed("ticket forms", err));

    apiService.getTickets({ start_date: dateIssued, end_date: dateIssued })
      .then(data => {
        const tickets = Array.isArray(data) ? data : [];
        setTodayTickets(
          tickets.filter(t =>
            t.issued_at && getTodayDateString(new Date(t.issued_at)) === dateIssued &&
            t.status !== "CANCELLED" &&
            t.is_verified === true &&
            !t.remittance_batch
          )
        );
      })
      .catch(err => loadFailed("tickets", err));

    apiService.request("/ticket-series/")
      .then(data => setTicketSeries(Array.isArray(data) ? data : []))
      .catch(err => loadFailed("ticket series", err));
    // dateIssued is derived from the targetDate prop, which doesn't change across
    // this modal's lifetime — safe to omit from deps, matching the existing
    // fetch-once-on-mount pattern used for ticketForms/ticketSeries below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computeRowForForm = (name) => {
    const matchingSeries = ticketSeries.filter(
      s => (s.ticket_form_label || s.ticket_form_name || "") === name
    );
    const matchingTickets = todayTickets.filter(
      t => (t.series?.ticket_form_label || "") === name
    );
    const totalCollected = matchingTickets.reduce(
      (sum, t) => sum + Number(t.collection_amount || 0), 0
    );
    const ticketsIssuedToday = matchingTickets.length;
    const beginningPcs = matchingSeries.reduce(
      (sum, s) => sum + (s.beginning ?? ((parseInt(s.end_no) || 0) - (parseInt(s.start_no) || 0))), 0
    );
    const unitPrice = Number(matchingSeries[0]?.ticket_form_price || 0);
    const remainingPcs = matchingSeries.reduce(
      (sum, s) => sum + (s.remaining ?? ((parseInt(s.end_no) || 0) - (parseInt(s.start_no) || 0))), 0
    );

    return {
      ticketFormNo: name,
      from: beginningPcs * unitPrice,
      to: remainingPcs * unitPrice,
      ticketsIssued: ticketsIssuedToday,
      amount: totalCollected,
    };
  };

  useEffect(() => {
    if (ticketFormOptions.length === 0) return;
    setCollections(ticketFormOptions.map(tf => computeRowForForm(tf.name)));
  }, [ticketFormOptions, ticketSeries, todayTickets]);

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
    (sum, c) => sum + Number(c.to || 0),
    0
  );

  const [certified, setCertified] = useState(false);
  const cashier = useCashierName();
  const amountsMismatch = totalRemittances !== totalCollections;
  const nothingToRemit = totalRemittances <= 0;
  const saveBlocked = amountsMismatch || nothingToRemit || !certified;

  const handleSave = async () => {
    if (saveBlocked || saving) return;
    const payload = {
      id: batchId,
      issued_by: accountableOfficer,
      total_amount: totalCollections,
      covers_date: dateIssued,
      collections,
      deposits,
      ticket_ids: todayTickets.map((t) => t.id),
    };
    setSaving(true);
    let cashierName = "";
    try {
      await apiService.post("/report/remittance/", payload);
      cashierName = cashier.save(batchId);
    } catch (err) {
      console.error("Failed to save batch", err);
      notify.error({ title: "Couldn't save batch", message: err?.message?.replace(/^Error:\s*/, "") || "Nothing was changed. Check your connection and try again.", onRetry: handleSave });
      setSaving(false);
      return;
    }
    window.dispatchEvent(new Event("remittance-batch-saved"));
    onSaved();

    // The batch is already recorded, so a failed download is only a warning —
    // the PDF can still be exported from the batch's view screen.
    try {
      await downloadRemittancePDF(
        { id: batchId, batch_code: batchId, issued_by_name: accountableOfficer, issued_at: new Date().toISOString(), collections, deposits },
        cashierName,
      );
      notify.success({ title: "Remittance batch saved", message: `${batchId} was recorded and its PDF downloaded.` });
    } catch (err) {
      console.error("Failed to download remittance PDF", err);
      notify.success({ title: "Remittance batch saved", message: `${batchId} was recorded, but its PDF couldn't be downloaded. Export it from the batch view.` });
    }
  };

  return (
    <div className="rem-modal rem-form-page">
        {/* Header */}
        <div className="rem-modal-header">
          <div className="rem-modal-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h2 className="rem-modal-title">
              {isLate ? `Late Remittance for ${dateIssued}` : "New Remittance Batch"}
            </h2>
          </div>
        </div>

        <div className="rem-modal-body">
          {/* Batch Info */}
          <div className="rem-info-grid">
            <Field label="Batch ID">
              <input type="text" className="rem-input" value={batchId} disabled />
            </Field>
            <Field label={isLate ? "Covering Date" : "Date Issued"}>
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
                  <td>{c.ticketFormNo}</td>
                  <td>
                    <input
                      type="number"
                      className="rem-input"
                      value={c.from}
                      readOnly
                      style={{ opacity: 0.6 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="rem-input"
                      value={c.to}
                      readOnly
                      style={{ opacity: 0.6 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="rem-input"
                      value={c.amount}
                      readOnly
                      style={{ opacity: 0.6 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ textAlign: "right" }}>Totals</td>
                <td>{formatCurrency(collections.reduce((sum, c) => sum + Number(c.from || 0), 0))}</td>
                <td>{formatCurrency(collections.reduce((sum, c) => sum + Number(c.to || 0), 0))}</td>
                <td>{formatCurrency(collections.reduce((sum, c) => sum + Number(c.amount || 0), 0))}</td>
              </tr>
            </tfoot>
          </table>

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
                  <td>{d.type === "coin" ? "Coins" : "Bill"}</td>
                  <td>{d.type === "coin" ? "—" : formatCurrency(d.denomination)}</td>
                  <td>
                    <input
                      type="number"
                      className="rem-input"
                      value={d.quantity}
                      disabled={saving}
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
                <td>{formatCurrency(deposits.reduce((sum, d) => sum + Number(d.depositAmount || 0), 0))}</td>
              </tr>
            </tfoot>
          </table>

          {/* Summary */}
          <div className="rem-summary-grid">
            
            <div className="rem-summary-card">
              <div className="rem-summary-label">Total Remittances</div>
              <div className="rem-summary-value">{formatCurrency(totalRemittances)}</div>
            </div>
            <div className="rem-summary-card">
              <div className="rem-summary-label">Ending Balance</div>
              <div className="rem-summary-value">{formatCurrency(endingBalance)}</div>
            </div>
          </div>

          {/* Certification */}
          <div className="rem-cert">
            <label className="rem-cert-check">
              <input type="checkbox" checked={certified} disabled={saving} onChange={(e) => setCertified(e.target.checked)} />
              <span>I certify that the above collections and deposits are accurate.</span>
            </label>
            <div className="rem-info-grid" style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Prepared By">
                <input type="text" className="rem-input" value={accountableOfficer} disabled />
              </Field>
              <Field label="Cashier / Treasurer">
                <CashierNameInput {...cashier} disabled={saving} className="rem-input" />
              </Field>
            </div>
          </div>

          {/* Footer */}
          {nothingToRemit ? (
            <div className="rem-alert" style={{ marginBottom: 12 }}>
              Enter at least one deposit. A ₱0.00 remittance cannot be saved.
            </div>
          ) : amountsMismatch && (
            <div className="rem-alert" style={{ marginBottom: 12 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Total Deposits ({formatCurrency(totalRemittances)}) does not match Total Collections ({formatCurrency(totalCollections)}). Amounts must match to save.
            </div>
          )}
          <div className="rem-modal-footer">
            <button
              type="button"
              className="rem-modal-btn rem-modal-btn--submit"
              onClick={handleSave}
              disabled={saveBlocked || saving}
              aria-busy={saving || undefined}
              style={saveBlocked ?{ opacity: 0.5, cursor: "not-allowed" } : {}}
            >
              <ButtonLabel busy={saving} busyLabel="Saving...">Save Batch</ButtonLabel>
            </button>
          </div>
        </div>
      </div>
  );
};

export default CreateBatchForm;
