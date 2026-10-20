import React, { useRef, useState } from "react";
import { ButtonLabel, SupervisorPicker } from "../../../components/ui/kit";

function numberToWords(num) {
  if (num === 0) return "Zero";
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
    "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const scales = ["","Thousand","Million","Billion"];
  function chunk(n) {
    let s = "";
    if (n >= 100) { s += ones[Math.floor(n / 100)] + " Hundred "; n %= 100; }
    if (n >= 20) { s += tens[Math.floor(n / 10)] + " "; n %= 10; }
    if (n > 0) s += ones[n] + " ";
    return s;
  }
  const whole = Math.floor(num);
  const centavos = Math.round((num - whole) * 100);
  let words = "", scaleIdx = 0, w = whole;
  if (w === 0) words = "Zero ";
  while (w > 0) {
    const c = w % 1000;
    if (c > 0) words = chunk(c) + (scales[scaleIdx] ? scales[scaleIdx] + " " : "") + words;
    w = Math.floor(w / 1000);
    scaleIdx++;
  }
  words = words.trim() + " Pesos";
  if (centavos > 0) words += " and " + centavos + "/100";
  return words;
}

const ITEM_FIELDS = [
  ["ticket_form", "Select a ticket form."],
  ["start_no", "Enter a start number."],
  ["end_no", "Enter an end number."],
];

// A labelled required field; `error` (shown only after a save attempt) turns it red.
function Field({ id, label, error, children }) {
  return (
    <div className={`req-field${error ? " req-field--invalid" : ""}`} data-field={id}>
      <label className="req-label">{label} <span className="req-required" aria-hidden="true">*</span></label>
      {children}
      {error && <span className="req-error">{error}</span>}
    </div>
  );
}

const RequisitionFormModal = (props) => (props.showForm ? <RequisitionForm {...props} /> : null);

// Mounted only while open, so a cancelled attempt never leaves red fields behind.
function RequisitionForm({
  setShowForm,
  seriesItems,
  supervisors,
  requestedBy,
  setRequestedBy,
  updateSeriesItem,
  addSeriesItem,
  removeSeriesItem,
  ticketForms,
  computeTotal,
  handleSave,
  saving,
}) {
  const [attempted, setAttempted] = useState(false);
  const bodyRef = useRef(null);

  // Locked while saving so nobody can double-submit or close mid-request.
  const close = () => { if (!saving) setShowForm(false); };

  // Blank rows are ignored on save, but at least one row must be complete (the first, if all are blank).
  const isFilled = (it) => it.ticket_form || it.start_no || it.end_no;
  const anyFilled = seriesItems.some(isFilled);
  const problems = [];
  if (!requestedBy) problems.push(["requester", "Choose the supervisor who requested this."]);
  seriesItems.forEach((it, i) => {
    if (!isFilled(it) && (anyFilled || i > 0)) return;
    ITEM_FIELDS.forEach(([field, message]) => { if (!it[field]) problems.push([`${i}-${field}`, message]); });
  });
  const errors = attempted ? Object.fromEntries(problems) : {};

  // Nothing saves while the form is incomplete; clicking shows what's missing and scrolls to the first gap.
  const submit = () => {
    if (problems.length === 0) return handleSave();
    setAttempted(true);
    const target = bodyRef.current?.querySelector(`[data-field="${problems[0][0]}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.querySelector("input, select")?.focus({ preventScroll: true });
  };

  return (
    <div className="req-overlay" onClick={close}>
      <div className="req-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="req-modal-header">
          <div>
            <h2 className="req-modal-title">
              Requisition and Issue Voucher
            </h2>
            <p className="req-modal-subtitle">
              Revised January 1992 — Appendix 29
            </p>
          </div>
          <button
            className="req-modal-close"
            onClick={close}
            disabled={saving}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="req-modal-body" ref={bodyRef}>
          <div className={`req-requester${errors.requester ? " req-field--invalid" : ""}`} data-field="requester">
            <h3 className="req-section-title">Requested By <span className="req-required" aria-hidden="true">*</span></h3>
            <SupervisorPicker className="req-input" supervisors={supervisors} value={requestedBy} onChange={setRequestedBy} disabled={saving} />
            {errors.requester && <span className="req-error">{errors.requester}</span>}
          </div>

          <h3 className="req-section-title">Ticket Series Items</h3>

          {seriesItems.map((item, i) => (
            <div key={i} className="req-item-card">
              <div className="req-item-header">
                <span className="req-item-label">Item {i + 1}</span>
                {seriesItems.length > 1 && (
                  <button
                    type="button"
                    className="req-item-remove"
                    onClick={() => removeSeriesItem(i)}
                  >
                    Remove
                  </button>
                )}
              </div>

              <Field id={`${i}-ticket_form`} label="Ticket Form" error={errors[`${i}-ticket_form`]}>
                <select
                  className="req-input"
                  value={item.ticket_form}
                  onChange={(e) =>
                    updateSeriesItem(i, "ticket_form", e.target.value)
                  }
                >
                  <option value="">— Select —</option>
                  {ticketForms.map((tf) => (
                    <option key={tf.id} value={tf.id}>
                      {tf.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="req-grid-2">
                <Field id={`${i}-start_no`} label="Start No." error={errors[`${i}-start_no`]}>
                  <input
                    className="req-input"
                    inputMode="numeric"
                    value={item.start_no}
                    onChange={(e) =>
                      updateSeriesItem(i, "start_no", e.target.value)
                    }
                    placeholder="e.g. 18981001"
                  />
                </Field>
                <Field id={`${i}-end_no`} label="End No." error={errors[`${i}-end_no`]}>
                  <input
                    className="req-input"
                    inputMode="numeric"
                    value={item.end_no}
                    onChange={(e) =>
                      updateSeriesItem(i, "end_no", e.target.value)
                    }
                    placeholder="e.g. 18981999"
                  />
                </Field>
              </div>

              <div className="req-grid-2">
                
                <div className="req-field">
                  <label className="req-label">Total Amount (₱)</label>
                  <input
                    className="req-input req-input--readonly"
                    readOnly
                    tabIndex={-1}
                    placeholder="0.00"
                    value={item.total_value}
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="req-add-btn"
            onClick={addSeriesItem}
          >
            + Add Item
          </button>

          {/* Total */}
          <div className="req-total-row">
            <span className="req-total-label">TOTAL AMOUNT</span>
            <span className="req-total-value">
              ₱{computeTotal().toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="req-amount-words">
            <span className="req-amount-words-label">Amount in Words:</span>
            <span className="req-amount-words-value">
              {numberToWords(computeTotal())}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="req-modal-footer">
          <button
            type="button"
            className="req-cancel-btn"
            onClick={close}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="req-save-btn"
            onClick={submit}
            disabled={saving}
            aria-disabled={problems.length > 0 || undefined}
            aria-busy={saving || undefined}
          >
            <ButtonLabel busy={saving} busyLabel="Saving...">Save Requisition</ButtonLabel>
          </button>
        </div>
      </div>
    </div>
  );
}

export default RequisitionFormModal;
