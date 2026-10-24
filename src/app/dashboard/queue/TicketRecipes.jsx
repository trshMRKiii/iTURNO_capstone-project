import React, { useState } from "react";
import MixedSeriesPicker from "./MixedSeriesPicker";

const peso = (n) => `₱${Number(n).toFixed(2)}`;
// How a price is spelled in DeskDuty.recipes — mirrors kiosk._price_key on the backend.
const keyOf = (price) => String(Number(price));

// Per-fare mixes the kiosk hands out on its own: a price with a recipe draws those
// denominations, any other price (or a recipe that ran short) uses the default series
// from Single Mode. The desk's roam issuing follows the same rule. `denominations` feeds the editor, `allSeries` counts stock, `forms` names them.
function TicketRecipes({ prices, denominations, allSeries, forms, recipes, onSave, onClose, disabled, defaultSeries }) {
  const [editing, setEditing] = useState(null); // the price being edited
  const [rows, setRows] = useState([]); // [{ form, qty }]

  const formOf = (id) => forms.find((f) => f.id === id);
  const stockOf = (id) => allSeries.filter((s) => s.ticket_form === id).reduce((sum, s) => sum + s.pcs, 0);
  // What Single Mode's series hands out for a fare, e.g. "4 × Cash Tickets@10".
  const defaultFee = Number(defaultSeries?.ticket_form_price || 0);
  const describeDefault = (price) =>
    defaultFee > 0 ? `${Math.ceil(price / defaultFee - 1e-9)} × ${defaultSeries.ticket_form_label || "Default series"}` : "Default series";

  const items = rows
    .map(({ form, qty }) => {
      const head = denominations.find((d) => d.ticket_form === form);
      return head && { ...head, qty };
    })
    .filter(Boolean);
  const total = items.reduce((sum, s) => sum + Number(s.ticket_form_price || 0) * s.qty, 0);

  const patchRow = (index, patch) => setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const mix = {
    items,
    stop: () => setEditing(null),
    add: () => {
      const next = denominations.find((d) => !rows.some((r) => r.form === d.ticket_form));
      if (next) setRows((r) => [...r, { form: next.ticket_form, qty: 1 }]);
    },
    set: (i, id) => patchRow(i, { form: denominations.find((d) => String(d.id) === String(id)).ticket_form }),
    setQty: (i, qty) => patchRow(i, { qty: Math.min(items[i].pcs, Math.max(1, Math.floor(Number(qty)) || 1)) }),
    remove: (i) => setRows((r) => r.filter((_, j) => j !== i)),
  };

  const start = (price) => {
    setRows(recipes[keyOf(price)] ?? [{ form: denominations[0].ticket_form, qty: 1 }]);
    setEditing(price);
  };
  const save = async (next) => {
    if (await onSave(next)) setEditing(null);
  };
  const useDefault = (price) => {
    const { [keyOf(price)]: _dropped, ...rest } = recipes;
    return save(rest);
  };

  if (editing !== null) {
    return (
      <div className="queue-recipe-editor">
        <MixedSeriesPicker
          mix={mix}
          denominations={denominations}
          target={editing}
          title={`Mix for ${peso(editing)}`}
          stopLabel="Cancel"
        />
        <button
          type="button"
          className="queue-change-series-btn queue-recipe-save"
          disabled={items.length === 0 || Math.abs(total - editing) > 0.005}
          onClick={() => save({ ...recipes, [keyOf(editing)]: rows })}
        >
          Save mix
        </button>
      </div>
    );
  }

  return (
    <div className="queue-roam-series">
      <div className="queue-roam-series-row">
        <span className="queue-label">Kiosk fare mixes</span>
        <button type="button" className="queue-change-series-btn" onClick={onClose}>
          ← Single Mode
        </button>
      </div>
      {prices.length === 0 && <span className="queue-series-left">No vehicle fares to set a mix for yet.</span>}
      {prices.map((price) => {
        const recipe = recipes[keyOf(price)];
        const short = recipe?.some(({ form, qty }) => stockOf(form) < qty);
        return (
          <div key={price} className="queue-recipe-row">
            <span className="queue-recipe-price">{peso(price)}</span>
            <span className="queue-recipe-chips">
              {recipe ? (
                recipe.map(({ form, qty }) => (
                  <span key={form} className="queue-recipe-chip">
                    <b>{qty} ×</b> {formOf(form)?.label ?? "?"}
                  </span>
                ))
              ) : (
                <span className="queue-recipe-chip is-default">{describeDefault(price)} · default</span>
              )}
            </span>
            <span className="queue-recipe-actions">
              <button type="button" className="queue-change-series-btn" disabled={disabled} onClick={() => start(price)}>
                Edit mix
              </button>
              {recipe && (
                <button type="button" className="queue-recipe-reset" disabled={disabled} onClick={() => useDefault(price)}>
                  Reset to default
                </button>
              )}
            </span>
            {short && <span className="queue-series-left is-low">Short on stock · using default</span>}
          </div>
        );
      })}
    </div>
  );
}

export default TicketRecipes;
