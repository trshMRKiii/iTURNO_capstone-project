// How the dashboard's Ticket Stock bars are scaled: a denomination's bar is full at
// `fullPesos` of cash value on hand, and flagged Low under `lowPct` percent of that; the
// whole stock is low under `lowTotal` pesos combined. Kept in this browser (like the
// cashier names) and edited under Settings > Ticket forms.
const KEY = "overview.stockScale";
export const STOCK_SCALE_DEFAULTS = { fullPesos: 20000, lowPct: 20, lowTotal: 30000 };

export function readStockScale() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    const pick = (key, ok = (n) => n > 0) => (ok(Number(saved?.[key])) ? Number(saved[key]) : STOCK_SCALE_DEFAULTS[key]);
    return {
      fullPesos: pick("fullPesos"),
      lowPct: pick("lowPct", (n) => n > 0 && n <= 100),
      lowTotal: pick("lowTotal"),
    };
  } catch {
    return STOCK_SCALE_DEFAULTS;
  }
}

export function saveStockScale(scale) {
  try { localStorage.setItem(KEY, JSON.stringify(scale)); } catch { /* not persisted */ }
}
