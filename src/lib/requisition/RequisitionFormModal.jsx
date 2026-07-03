import React from "react";

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

const RequisitionFormModal = ({
  showForm,
  setShowForm,
  seriesItems,
  updateSeriesItem,
  addSeriesItem,
  removeSeriesItem,
  ticketForms,
  computeTotal,
  handleSave,
  saving,
}) => {
  if (!showForm) return null;

  return (
    <div className="req-overlay" onClick={() => setShowForm(false)}>
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
            onClick={() => setShowForm(false)}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="req-modal-body">
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

              <div className="req-grid-3">
                <div className="req-field">
                  <label className="req-label">Ticket Form</label>
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
                </div>
                {/* quantity */}
                <div className="req-field">
                  <label className="req-label">QTY</label>
                  <input
                    className="req-input"
                    type="number"
                    value={item.qty}
                    onChange={(e) =>
                      updateSeriesItem(i, "qty", e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="req-grid-2">
                <div className="req-field">
                  <label className="req-label">Start No.</label>
                  <input
                    className="req-input"
                    value={item.start_no}
                    onChange={(e) =>
                      updateSeriesItem(i, "start_no", e.target.value)
                    }
                    placeholder="e.g. 18981001"
                  />
                </div>
                <div className="req-field">
                  <label className="req-label">End No.</label>
                  <input
                    className="req-input"
                    value={item.end_no}
                    readOnly
                    placeholder="Auto-calculated"
                  />
                </div>
              </div>

              <div className="req-grid-2">
                
                <div className="req-field">
                  <label className="req-label">Total Amount (₱)</label>
                  <input
                    className="req-input"
                    type="number"
                    step="0.01"
                    value={item.total_value}
                    readOnly
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
            onClick={() => setShowForm(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="req-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Requisition"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequisitionFormModal;
