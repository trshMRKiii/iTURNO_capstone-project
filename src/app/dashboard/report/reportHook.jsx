import { useState, useEffect } from "react";

export const peso = (n) => {
  const num = parseFloat(n);
  if (isNaN(num)) return "₱0.00";
  return (
    "₱" +
    num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

export const STATUS_COLORS = {
  COLLECTED: "#22c55e",
  QUEUED: "#3b82f6",
  CANCELLED: "#ef4444",
};

// Built from local date parts (not toISOString, which is UTC) so the max-selectable
// date in the report filters always matches the user's actual local calendar day.
// Functions, not module-load-time consts — a report tab left open across midnight
// (a terminal kiosk scenario) would otherwise keep showing yesterday's date forever.
export const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

// Default report window: Jan 1 of the current year through today. Keeps the
// initial load bounded to the current year's data instead of the whole table
// — older years are only pulled in when the user explicitly picks a wider range.
export const getYearStart = () => `${new Date().getFullYear()}-01-01`;

const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Period chips on the report filter bar. "custom" has no range of its own —
// it keeps whatever dates are already set and reveals the date inputs.
export const PERIODS = [
  { key: "month", label: "This month" },
  { key: "30d", label: "Last 30 days" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

export const getPeriodRange = (key) => {
  const now = new Date();
  if (key === "month") return { startDate: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: getToday() };
  if (key === "30d") return { startDate: toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), endDate: getToday() };
  if (key === "year") return { startDate: getYearStart(), endDate: getToday() };
  return null;
};

export const formatRangeLabel = (startDate, endDate) => {
  const fmt = (s) =>
    s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "…";
  return `${fmt(startDate)} – ${fmt(endDate)}`;
};

export const formatTime = (dateString) => {
  try {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "N/A";
  }
};

export const formatChanges = (changes) => {
  if (!changes || typeof changes !== "object") return "—";
  const entries = Object.entries(changes);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
};

const AUDIT_ACTION_LABELS = { CREATE: "Created", UPDATE: "Updated", DELETE: "Deleted" };
export const formatAuditAction = (log) => AUDIT_ACTION_LABELS[log.action] || log.action_display || log.action;

// Item names the record that was touched in human terms ("Vehicle: DSH-6456",
// "Driver: Cruz, Amalia") rather than a database id like "Vehicle #133", which
// tells a reader nothing. The id is only a fallback when there's no label, and
// is skipped for models keyed by a long generated string.
export const formatAuditItem = (log) => {
  const label = (log.model_name || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  const repr = log.object_repr;
  if (repr) return repr.toLowerCase().startsWith(label.toLowerCase()) ? repr : `${label}: ${repr}`;
  return log.object_id && String(log.object_id).length <= 12 ? `${label} #${log.object_id}` : label;
};

// Details is only what changed (the Action column already says create / update
// / delete and Item already says which record), so it no longer repeats the
// record's name in front of the field changes.
export const formatAuditDetails = (log) => formatChanges(log.changes);

// Shared row-match predicates: used both by each report table's on-screen
// search box (filtering the loaded preview/page) and by report.jsx's export
// handlers (filtering the fully-fetched, date-ranged export rows), so typing
// a search term and exporting only pulls in what's actually visible/matched
// instead of always dumping the whole date range.
function fieldsMatch(fields, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((v) => v != null && String(v).toLowerCase().includes(q));
}

export const matchesQueueRow = (l, query) =>
  fieldsMatch([l.timestamp, l.ticket_id, l.action, l.driver, l.vehicle, l.route, l.user], query);

export const matchesRoamingRow = (t, query) =>
  fieldsMatch([t.id, t.vehicle?.plate_number, t.driver?.name, t.route_name, t.active_user_name], query);

export const matchesRequisitionRow = (r, query) =>
  fieldsMatch([r.requested_by_name, r.approved_by_name], query);

export const matchesRemittanceRow = (b, query) =>
  fieldsMatch([b.issued_by_name], query);

export const matchesAuditRow = (l, query) =>
  fieldsMatch([l.created_at, l.action_display, l.model_name, l.object_repr, l.user_name], query);

// The report tables only ever hold one server-paginated page (e.g. 30 rows) in
// memory, so filtering that page client-side silently misses matches sitting
// on other pages — the search box looked like it searched everything but only
// ever searched what happened to already be loaded. Once there's a real query,
// this fetches the *complete* date-ranged result set (the same fetcher the
// CSV/PDF export buttons already use) and matches against all of it instead.
// Debounced so fast typing doesn't fire a fetch per keystroke.
export function useDebouncedSearchAll(fetchAll, query, delayMs = 300) {
  // Results are tagged with the fetcher that produced them so a stale result set
  // (e.g. from the other tab's table) is never handed back for a different source.
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!query.trim()) {
      setState(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await fetchAll(query.trim());
        if (!cancelled) setState({ fetchAll, rows });
      } catch {
        if (!cancelled) setState({ fetchAll, rows: [] });
      }
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, fetchAll, delayMs]);

  return state && state.fetchAll === fetchAll && query.trim() ? state.rows : null;
}
