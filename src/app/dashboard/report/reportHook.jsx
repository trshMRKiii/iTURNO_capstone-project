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

export const today = new Date().toISOString().split("T")[0];

// Default report window: Jan 1 of the current year through today. Keeps the
// initial load bounded to the current year's data instead of the whole table
// — older years are only pulled in when the user explicitly picks a wider range.
export const yearStart = `${new Date().getFullYear()}-01-01`;

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

export function exportCSV(data, filename = "report.csv") {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SummaryCard({ label, count, total }) {
  return (
    <div className="rpt-summary-card">
      <span className="rpt-summary-label">{label}</span>
      <div className="rpt-summary-count">
        {count}
        <span className="rpt-summary-unit">tickets</span>
      </div>
      <div className="rpt-summary-total">{peso(total)}</div>
    </div>
  );
}

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

export const matchesLogRow = (l, query) =>
  fieldsMatch([l.timestamp, l.ticket_id, l.action, l.driver, l.vehicle, l.route, l.user], query);

export const matchesRoamingRow = (t, query) =>
  fieldsMatch([t.id, t.vehicle?.plate_number, t.driver?.name, t.active_user_name], query);

export const matchesRequisitionRow = (r, query) =>
  fieldsMatch([r.requested_by_name, r.approved_by_name], query);

export const matchesRemittanceRow = (b, query) =>
  fieldsMatch([b.issued_by_name], query);

export const matchesAuditRow = (l, query) =>
  fieldsMatch([l.created_at, l.action_display, l.model_name, l.object_repr, l.user_name], query);

export const matchesVehicleRow = (v, query) =>
  fieldsMatch(
    [v.plate_number, v.route_detail ? `${v.route_detail.origin} - San Fernando` : v.route, v.active_driver_name],
    query,
  );

export const matchesDriverRow = (d, query) =>
  fieldsMatch([d.iwp_number || String(d.id), d.name, d.contact], query);

// The report tables only ever hold one server-paginated page (e.g. 30 rows) in
// memory, so filtering that page client-side silently misses matches sitting
// on other pages — the search box looked like it searched everything but only
// ever searched what happened to already be loaded. Once there's a real query,
// this fetches the *complete* date-ranged result set (the same fetcher the
// CSV/PDF export buttons already use) and matches against all of it instead.
// Debounced so fast typing doesn't fire a fetch per keystroke.
export function useDebouncedSearchAll(fetchAll, query, delayMs = 300) {
  const [allResults, setAllResults] = useState(null);

  useEffect(() => {
    if (!query.trim()) {
      setAllResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await fetchAll();
        if (!cancelled) setAllResults(rows);
      } catch {
        if (!cancelled) setAllResults([]);
      }
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, fetchAll, delayMs]);

  return allResults;
}
