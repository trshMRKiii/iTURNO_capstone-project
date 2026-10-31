import { useState, useEffect, useRef } from "react";

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
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

export const getPeriodRange = (key) => {
  const now = new Date();
  if (key === "month") return { startDate: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: getToday() };
  if (key === "7d") return { startDate: toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), endDate: getToday() };
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

// Audit entries grouped by the kind of record touched; anything unlisted is "Other".
// Shared by the dashboard's Recent activity chips and the Audit Trail dropdown.
export const AUDIT_CATEGORIES = { TicketSeries: "Ticket series", Requisition: "Requisitions", TicketForm: "Ticket forms" };
export const auditCategoryOf = (log) => (AUDIT_CATEGORIES[log.model_name] ? log.model_name : "Other");

const AUDIT_ACTION_LABELS ={ CREATE: "Created", UPDATE: "Updated", DELETE: "Deleted" };
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
  fieldsMatch([l.timestamp, l.ticket_id, l.action, l.driver, l.vehicle, l.route, l.issued_by, l.dispatched_by], query);

export const matchesRoamingRow = (t, query) =>
  fieldsMatch([t.id, t.vehicle?.plate_number, t.driver?.name, t.route_name, t.checked_in_by_name, t.checked_out_by_name], query);

export const matchesRequisitionRow = (r, query) =>
  fieldsMatch([r.requested_by_name, r.issued_by_name], query);

export const matchesRemittanceRow = (b, query) =>
  fieldsMatch([b.prepared_by_name, b.issued_by_name], query);

export const matchesAuditRow = (l, query) =>
  fieldsMatch([l.created_at, l.action_display, l.model_name, l.object_repr, l.user_name], query);

// The report tables only ever hold one server-paginated page (e.g. 30 rows) in
// memory, so filtering that page client-side silently misses matches sitting
// on other pages — the search box looked like it searched everything but only
// ever searched what happened to already be loaded. Once there's a real query,
// this fetches the *complete* date-ranged result set (the same fetcher the
// CSV/PDF export buttons already use) and matches against all of it instead.
// Debounced so fast typing doesn't fire a fetch per keystroke.
const sameDeps = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const BLOCK_PAGES = 20;
const MAX_BLOCK_ROWS = 200; // the server caps page_size here

// Paging for a report table, loaded in blocks of up to BLOCK_PAGES pages so flipping
// within a block is instant and only crossing into the next block hits the server.
//  - rows: rows already in memory (the preloaded first page, or the full search result
//    when `local`); they serve the first pages while block 0 loads in the background.
//  - total: known row count (omit to take it from the server response).
//  - fetchPage(page, pageSize) -> { results, count }; null = nothing to fetch.
//  - resetKey: any change (tab, date range, search text) returns to page 1.
export function usePagedPreview({ rows = [], total, fetchPage, local = false, resetKey, size }) {
  const [pos, setPos] = useState({ key: resetKey, page: 1 });
  const [cache, setCache] = useState({ source: fetchPage, blocks: {}, count: null });
  const latest = useRef(fetchPage);
  useEffect(() => {
    latest.current = fetchPage;
  });

  const page = sameDeps(pos.key, resetKey) ? pos.page : 1;
  const blockRows = size * Math.min(BLOCK_PAGES, Math.floor(MAX_BLOCK_ROWS / size));
  const fresh = cache.source === fetchPage;
  const blocks = fresh ? cache.blocks : {};

  const allLocal = total != null && rows.length >= total;
  const covered = rows.length >= page * size || allLocal;
  const useRows = local || !fetchPage || covered;
  const block = Math.floor(((page - 1) * size) / blockRows);
  // Block to have in memory: the page's own — or block 0 as a background prefetch
  // while the preloaded rows still cover the page.
  const want = local || !fetchPage || allLocal ? null : covered ? 0 : block;
  const have = want != null && Boolean(blocks[want]);

  useEffect(() => {
    if (want == null || have) return;
    fetchPage(want + 1, blockRows)
      .then((r) => ({ rows: r.results, count: r.count }))
      .catch(() => ({ rows: [], count: null }))
      .then((res) => {
        if (latest.current !== fetchPage) return;
        setCache((prev) => {
          const same = prev.source === fetchPage;
          return {
            source: fetchPage,
            blocks: { ...(same ? prev.blocks : {}), [want]: res.rows },
            count: res.count ?? (same ? prev.count : null),
          };
        });
      });
  }, [fetchPage, want, have, blockRows]);

  const start = (page - 1) * size;
  const blockRowsLoaded = blocks[block];
  const visible = useRows
    ? rows.slice(start, start + size)
    : blockRowsLoaded ? blockRowsLoaded.slice(start % blockRows, (start % blockRows) + size) : [];
  const count = total ?? (fresh ? cache.count : null) ?? 0;

  return {
    rows: visible,
    loading: !useRows && !blockRowsLoaded,
    page,
    count,
    totalPages: Math.max(Math.ceil(count / size), 1),
    setPage: (p) => setPos({ key: resetKey, page: p }),
  };
}

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
