import React, { useState } from "react";
import { ActionButton, useFeedback } from "../../../components/ui/kit";
import { peso } from "../overview/format";
import { STOCK_SCALE_DEFAULTS, readStockScale, saveStockScale } from "../overview/stockScale";

const FIELDS = [
  { key: "fullPesos", label: "Full bar at (₱)", step: 100 },
  { key: "lowPct", label: "Low under (% of full)", max: 100 },
  { key: "lowTotal", label: "Low overall under (₱)", step: 100 },
];

// Where the dashboard's Ticket Stock bars read "full", where a form is flagged "Low",
// and where the combined stock value is flagged low.
function StockScaleCard() {
  const { notify } = useFeedback();
  const [saved, setSaved] = useState(readStockScale);
  const [edits, setEdits] = useState({});

  const draft = Object.fromEntries(FIELDS.map(({ key }) => [key, Number(edits[key] ?? saved[key])]));
  const valid = FIELDS.every(({ key, max = Infinity }) => draft[key] > 0 && draft[key] <= max);
  const same = (a, b) => FIELDS.every(({ key }) => a[key] === b[key]);
  const lowAt = Math.round((draft.fullPesos * draft.lowPct) / 100);

  const apply = (next) => {
    saveStockScale(next);
    setSaved(next);
    setEdits({});
    notify.success({
      title: "Changes saved",
      message: `Full bar at ${peso(next.fullPesos)}; Low under ${next.lowPct}%; overall low under ${peso(next.lowTotal)}.`,
    });
  };

  return (
    <section className="tf-scale">
      <div>
        <h3 className="tf-scale-title">Dashboard ticket stock</h3>
        <p className="tf-scale-desc">
          How the Ticket Stock card on the dashboard reads each ticket form and the stock as a whole. Saved on this device.
        </p>
      </div>
      <div className="tf-scale-fields">
        {FIELDS.map(({ key, label, step, max }) => (
          <label key={key}>
            <span>{label}</span>
            <input
              type="number"
              min="1"
              max={max}
              step={step}
              value={edits[key] ?? saved[key]}
              onChange={(e) => setEdits((x) => ({ ...x, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <p className="tf-scale-note">
        {valid
          ? `A ticket form is flagged Low under ₱${lowAt.toLocaleString()}; the whole stock under ₱${draft.lowTotal.toLocaleString()}.`
          : "Every value must be above 0, and the low percent no more than 100."}
      </p>
      <div className="tf-scale-actions">
        <ActionButton variant="secondary" disabled={same(saved, STOCK_SCALE_DEFAULTS)} onClick={() => apply(STOCK_SCALE_DEFAULTS)}>
          Reset to default
        </ActionButton>
        <ActionButton variant="primary" disabled={same(draft, saved) || !valid} onClick={() => apply(draft)}>
          Save
        </ActionButton>
      </div>
    </section>
  );
}

export default StockScaleCard;
