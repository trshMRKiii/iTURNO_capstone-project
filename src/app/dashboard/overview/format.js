export const peso = (n) =>
  `₱${(Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Whole pesos without the ".00" — for tight lists where cents are noise.
export const pesoShort = (n) => (Number.isInteger(Number(n)) ? `₱${Number(n).toLocaleString("en-PH")}` : peso(n));

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const hour12 = (h) => `${h % 12 || 12}`;
const meridiem = (h) => (h % 24 < 12 ? "a" : "p");

// "5a", "12p" — axis labels.
export const hourTick = (h) => `${hour12(h)}${meridiem(h)}`;

// "9 AM–10 AM" — what a bar or heat cell covers.
export const hourRange = (h) => `${hour12(h)} ${meridiem(h).toUpperCase()}M–${hour12(h + 1)} ${meridiem(h + 1).toUpperCase()}M`;

// The stats' hourly rows (all 24, or just the hours a route had tickets) as a full day.
export function fullDay(rows = []) {
  const byHour = new Map(rows.map((row) => [row.hour, row]));
  return Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? { hour, queued: 0, roamed: 0, queued_total: 0, roamed_total: 0 });
}

// A route's flat counts in the same shape as stats.summary.
export const asSplit = (row) => ({
  queued: { count: row?.queued ?? 0, total: row?.queued_total ?? 0 },
  roamed: { count: row?.roamed ?? 0, total: row?.roamed_total ?? 0 },
});

// Hours worth drawing: the usual 5 AM–9 PM day, widened if tickets landed outside it.
export function hourWindow(activeHours, from = 5, to = 21) {
  return [Math.min(from, ...activeHours), Math.max(to, ...activeHours)];
}

// Round an axis maximum up to at most four even steps.
export function niceScale(max) {
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const m of [1, 2, 5]) {
      const step = m * magnitude;
      if (Math.ceil(max / step) <= 4) {
        const top = Math.ceil(max / step) * step;
        return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
      }
    }
  }
}

export const formatWait = (minutes) =>
  minutes < 1 ? "<1 min" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

// Percent change of `now` against `before`; null when there is nothing to compare with.
export const percentChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
