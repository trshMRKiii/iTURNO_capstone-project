import React from "react";

const labelOf = (s) => s?.ticket_form_label || "Unspecified";
const peso = (n) => `₱${Number(n).toFixed(2)}`;

// Mixed cash tickets: one row per denomination, one ticket handed out per row,
// so a terminal price of ₱30 can be met with a ₱10 + ₱20. Rows resolve to a
// denomination's head series (see useQueue), so each row shows its next range.
function MixedSeriesPicker({ mix, denominations, target = 0, title = "Mixed cash tickets", stopLabel = "← Single Mode" }) {
  const { items } = mix;
  const used = new Set(items.map((s) => labelOf(s)));
  const total = items.reduce((sum, s) => sum + Number(s.ticket_form_price || 0) * s.qty, 0);
  const gap = target - total;

  return (
    <div className="queue-roam-series">
      <div className="queue-roam-series-row">
        <span className="queue-label">{title}</span>
        <button type="button" className="queue-change-series-btn" onClick={mix.stop}>
          {stopLabel}
        </button>
      </div>

      {items.map((s, i) => (
        <div key={labelOf(s)} className="queue-mix-row">
          <select
            className="queue-mix-select"
            value={s.id}
            aria-label={`Ticket denomination ${i + 1}`}
            onChange={(e) => mix.set(i, e.target.value)}
          >
            {denominations
              .filter((d) => d.id === s.id || !used.has(labelOf(d)))
              .map((d) => (
                <option key={d.id} value={d.id}>{labelOf(d)}</option>
              ))}
          </select>
          <label className="queue-mix-qty">
            ×
            <input
              type="number"
              min="1"
              max={s.pcs ?? s.remaining ?? 1}
              value={s.qty}
              aria-label={`${labelOf(s)} quantity`}
              onChange={(e) => mix.setQty(i, e.target.value)}
            />
          </label>
          <button
            type="button"
            className="queue-mix-remove"
            aria-label={`Remove ${labelOf(s)}`}
            onClick={() => mix.remove(i)}
          >
            ✕
          </button>
          <span className="queue-series-range">Series {s.start_no}-{s.end_no}</span>
          <span className="queue-series-left">{s.pcs ?? s.remaining ?? 0} pcs remaining</span>
        </div>
      ))}

      {items.length < denominations.length && (
        <button type="button" className="queue-change-series-btn queue-mix-add" onClick={mix.add}>
          + Add Ticket Denomination
        </button>
      )}

      <span className={`queue-series-left${target > 0 && gap !== 0 ? " is-low" : ""}`}>
        Total {peso(total)}{target > 0 ? ` of ${peso(target)} terminal price` : ""}
        {target > 0 && gap !== 0 && ` · ${gap > 0 ? `${peso(gap)} left` : `${peso(-gap)} over`}`}
      </span>
    </div>
  );
}

export default MixedSeriesPicker;
