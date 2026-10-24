import React, { useState, useEffect } from "react";
import { apiService } from "../../../lib/api-service";
import { ButtonLabel, SupervisorPicker, useFeedback } from "../../../components/ui/kit";
import { useSupervisors } from "../../../lib/useSupervisors";
import CashierNameInput from "./CashierNameInput";
import { useCashierName } from "./useCashierName";
import { downloadRemittancePDF, phDay } from "./exportRemittancePDF";

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
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  useEffect(() => {
    Promise.all(
      [false, true].map((archived) =>
        apiService.get(`/report/remittance/?is_archived=${archived}`)
      )
    )
      .then((pages) =>
        setExistingBatches(pages.flatMap((res) => (Array.isArray(res) ? res : res.results || [])))
      )
      .catch(() => setExistingBatches([]))
      .finally(() => setBatchesLoaded(true));
  }, []);

  // Only a supervisor can prepare a batch. One keying in their own is the default; anyone else must choose.
  const { supervisors, currentUser } = useSupervisors();
  const [pickedPreparer, setPickedPreparer] = useState("");
  const preparedBy = pickedPreparer || (currentUser?.role === "SUPERVISOR" ? currentUser.id : "");
  const keyedByName = currentUser ? `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim() || currentUser.username : "";
  const preparedByName = supervisors.find((s) => String(s.id) === String(preparedBy))?.name || "";
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

  // Every collected, verified ticket of the day — including those a previous batch already remitted.
  const [dayTickets, setDayTickets] = useState([]);
  const [ticketFormOptions, setTicketFormOptions] = useState([]);
  const [ticketSeries, setTicketSeries] = useState([]);
  const [ticketsLoaded, setTicketsLoaded] = useState(false);
  const [amending, setAmending] = useState(false);

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
  // A day is remitted once: the in-system batch already covering this date (outside "EXT-"
  // batches are filed separately). Legacy batches without covers_date count by the day issued.
  const existing = existingBatches.find(
    (b) => !String(b.batch_code || "").startsWith("EXT-") &&
      (b.covers_date ? b.covers_date === dateIssued : phDay(b.issued_at) === dateIssued)
  );
  const batchId = amending ? existing.batch_code : (() => {
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
    apiService.getTicketForms()
      .then(setTicketFormOptions)
      .catch(err => loadFailed("ticket forms", err));

    apiService.request("/ticket-series/")
      .then(data => setTicketSeries(Array.isArray(data) ? data : data?.results || []))
      .catch(err => loadFailed("ticket series", err));

    apiService.getTickets({ start_date: dateIssued, end_date: dateIssued })
      .then(data => {
        const tickets = Array.isArray(data) ? data : [];
        setDayTickets(
          tickets.filter(t =>
            t.issued_at && getTodayDateString(new Date(t.issued_at)) === dateIssued &&
            t.status !== "CANCELLED" &&
            t.is_verified === true
          )
        );
      })
      .catch(err => loadFailed("tickets", err))
      .finally(() => setTicketsLoaded(true));
    // dateIssued is derived from the targetDate prop, which doesn't change across
    // this modal's lifetime — safe to omit from deps (fetch-once-on-mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tickets not yet in any batch; editing the day's batch also re-files the ones it already holds.
  const todayTickets = dayTickets.filter((t) => !t.remittance_batch);
  const batchTickets = amending ? dayTickets.filter((t) => !t.remittance_batch || t.remittance_batch === existing.id) : todayTickets;

  // One row per ticket series in use, so two series of the same form are two rows. From is where the
  // series stood when the day began (its first ticket collected today) and To where it stands now: the
  // next unused number after the last ticket issued. A series nothing was collected from yet shows its
  // next unused number in both.
  const collected = {};
  batchTickets.forEach((t) => {
    if (!t.series) return;
    const c = (collected[t.series.id] ||= { count: 0, amount: 0, from: Infinity, to: 0 });
    const no = Number(t.id) || 0;
    c.count += 1;
    c.amount += Number(t.collection_amount || 0);
    c.from = Math.min(c.from, no);
    c.to = Math.max(c.to, no);
  });
  const seriesRows = ticketSeries
    .filter((s) => s.remaining > 0 || collected[s.id])
    .map((s) => {
      const from = collected[s.id]?.from ?? (s.last_used_no ?? Number(s.start_no) - 1) + 1;
      return {
        ticketFormNo: s.ticket_form_label || "",
        createdAt: new Date(s.created_at).getTime() || 0,
        from,
        to: collected[s.id] ? collected[s.id].to + 1 : from,
        ticketsIssued: collected[s.id]?.count || 0,
        amount: collected[s.id]?.amount || 0,
      };
    });
  // Every ticket form configured in Settings is listed; one with no series in use gets an empty row.
  const emptyRows = ticketFormOptions
    .filter((f) => !seriesRows.some((r) => r.ticketFormNo === f.name))
    .map((f) => ({ ticketFormNo: f.name, createdAt: 0, from: "", to: "", ticketsIssued: 0, amount: 0 }));
  // Forms run smallest to largest denomination (the number in "Cash Tickets@N"); a form's series keep
  // the order they were recorded (oldest first).
  const collections = [...seriesRows, ...emptyRows].sort((a, b) =>
    a.ticketFormNo.localeCompare(b.ticketFormNo, undefined, { numeric: true }) ||
    a.createdAt - b.createdAt
  );

  // Editing the day's remittance starts from what was already deposited; the cashier then adds the new cash.
  const startAmending = () => {
    setDeposits((rows) => rows.map((row) => {
      const old = (existing.deposits || []).find((d) => d.type === row.type && Number(d.denomination || 0) === Number(row.denomination));
      return old ? { ...row, quantity: String(old.quantity), depositAmount: Number(old.deposit_amount || 0) } : row;
    }));
    setCertified(false);
    setAmending(true);
  };
  const cancelAmending = () => {
    setDeposits((rows) => rows.map((row) => ({ ...row, quantity: 0, depositAmount: 0 })));
    setAmending(false);
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

  const [certified, setCertified] = useState(false);
  const cashier = useCashierName();
  const amountsMismatch = totalRemittances !== totalCollections;
  const nothingToRemit = totalRemittances <= 0;
  const saveBlocked = amountsMismatch || nothingToRemit || !certified || !preparedBy;

  const handleSave = async () => {
    if (saveBlocked || saving) return;
    const payload = {
      id: batchId,
      prepared_by: preparedBy,
      total_amount: totalCollections,
      covers_date: dateIssued,
      collections,
      deposits,
      ticket_ids: todayTickets.map((t) => t.id),
    };
    setSaving(true);
    let cashierName = "";
    try {
      await apiService.post(amending ? `/report/remittance/${existing.id}/amend/` : "/report/remittance/", payload);
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
        { id: batchId, batch_code: batchId, prepared_by_name: preparedByName, issued_by_name: keyedByName, issued_at: amending ? existing.issued_at : new Date().toISOString(), covers_date: dateIssued, collections, deposits },
        cashierName,
      );
      notify.success({ title: amending ? "Remittance updated" : "Remittance batch saved", message: `${batchId} was ${amending ? "updated" : "recorded"} and its PDF downloaded.` });
    } catch (err) {
      console.error("Failed to download remittance PDF", err);
      notify.success({ title: amending ? "Remittance updated" : "Remittance batch saved", message: `${batchId} was ${amending ? "updated" : "recorded"}, but its PDF couldn't be downloaded. Export it from the batch view.` });
    }
  };

  if (!batchesLoaded || !ticketsLoaded) {
    return <div className="rem-modal rem-form-page"><div className="rem-modal-body"><span className="ui-skel" style={{ width: "100%", height: 120 }} /></div></div>;
  }

  // The day is already remitted: block a second batch. New tickets can still be added by editing that one.
  if (existing && !amending) {
    const newTotal = todayTickets.reduce((s, t) => s + Number(t.collection_amount || 0), 0);
    const n = todayTickets.length;
    return (
      <div className="rem-modal rem-form-page">
        <div className="rem-modal-body">
          <div className={`rem-alert${n ? "" : " rem-alert--info"}`}>
            <span>
              {n
                ? `${dateIssued} was already remitted as ${existing.batch_code}, but ${n} new ${n === 1 ? "ticket" : "tickets"} (${formatCurrency(newTotal)}) ${n === 1 ? "was" : "were"} issued since. A day can only be remitted once — edit the existing remittance to include ${n === 1 ? "it" : "them"}.`
                : `${dateIssued} has already been remitted as ${existing.batch_code}. A day can only be remitted once, and there are no new tickets to add.`}
            </span>
            {n > 0 && !existing.is_archived && (
              <button type="button" className="rem-btn rem-btn--view" onClick={startAmending}>
                Edit {existing.batch_code}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rem-modal rem-form-page">
        {/* Header */}
        <div className="rem-modal-header">
          <div className="rem-modal-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h2 className="rem-modal-title">
              {amending ? `Edit Remittance ${batchId}` : isLate ? `Late Remittance for ${dateIssued}` : "New Remittance Batch"}
            </h2>
          </div>
          {amending && (
            <button type="button" className="rem-btn rem-btn--delete" onClick={cancelAmending} disabled={saving}>Cancel edit</button>
          )}
        </div>
        {amending && (
          <div className="rem-alert rem-alert--info" style={{ margin: "0 16px" }}>
            Collections now include the new tickets. Add their cash to the deposits so the totals match, then save.
          </div>
        )}

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
              <input type="text" className="rem-input" value={preparedByName} placeholder="Choose who prepared this below" disabled />
            </Field>
          </div>

          {/* Collections */}
          <div>
            <h3 className="rem-section-title">
              Collections
            </h3>
          </div>
          <table className="rem-section-table">
            <thead>
              <tr>
                <th>Ticket Form No.</th>
                <th>Series From</th>
                <th>Series To</th>
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
                <td colSpan={2}></td>
                <td>{formatCurrency(totalCollections)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Deposits */}
          <div>
            <h3 className="rem-section-title">
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
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={7}
                      autoComplete="off"
                      className="rem-input"
                      value={d.quantity}
                      disabled={saving}
                      onKeyDown={(e) => {
                        if (e.ctrlKey || e.metaKey || e.altKey) return;
                        if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 7);
                        if (digits) updateDeposit(i, "quantity", String(Number(digits)));
                      }}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                        updateDeposit(i, "quantity", digits === "" ? "" : String(Number(digits)));
                      }}
                      onBlur={() => {
                        if (d.quantity === "") updateDeposit(i, "quantity", "0");
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
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
          </div>

          {/* Certification */}
          <div className="rem-cert">
            <label className="rem-cert-check">
              <input type="checkbox" checked={certified} disabled={saving} onChange={(e) => setCertified(e.target.checked)} />
              <span>I certify that the above collections and deposits are accurate.</span>
            </label>
            <div className="rem-info-grid" style={{ gridTemplateColumns: "1fr" }}>
              <Field label={<>Prepared By <span className="rem-required" aria-hidden="true">*</span></>}>
                <SupervisorPicker className="rem-input" supervisors={supervisors} value={preparedBy} onChange={setPickedPreparer} disabled={saving} />
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
          {!preparedBy && (
            <div className="rem-alert" style={{ marginBottom: 12 }}>
              Choose the supervisor who prepared this remittance.
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
              <ButtonLabel busy={saving} busyLabel="Saving...">{amending ? "Save Changes" : "Save Batch"}</ButtonLabel>
            </button>
          </div>
        </div>
      </div>
  );
};

export default CreateBatchForm;
