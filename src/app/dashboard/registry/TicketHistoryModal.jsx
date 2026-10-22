import React, { useState, useEffect, useMemo } from "react";
import { apiService } from "../../../lib/api-service";
import { SkeletonList } from "../../../components/ui/kit";
import PeriodFilter from "../../../components/ui/PeriodFilter";
import { usePeriodFilter, inPeriod } from "../../../lib/period";
import { exportTablePDF } from "../report/exportPDF";
import { getDriverDisplayName } from "../driver/driver-utils";
import "../../../styles/Vehicle.css";

const MAX_RECORDS = 20;

// Status badge shown only in the All view, to tell the modes apart.
const BADGES = {
  QUEUE: { label: "Queue", color: "#3b82f6" },
  UNLOAD: { label: "Roaming", color: "#8b5cf6" },
  CANCELLED: { label: "Cancelled", color: "#ef4444" },
};
const badgeOf = (t) => BADGES[t.status === "CANCELLED" ? "CANCELLED" : t.mode] || BADGES.QUEUE;

// Cancelled is its own view (any mode); Queue/Roaming show the non-cancelled
// tickets of that check-in mode so no ticket appears under two views.
const VIEWS = [
  { key: "ALL", label: "All", match: () => true },
  { key: "QUEUE", label: "Queue", match: (t) => t.mode === "QUEUE" && t.status !== "CANCELLED" },
  { key: "UNLOAD", label: "Roaming", match: (t) => t.mode === "UNLOAD" && t.status !== "CANCELLED" },
  { key: "CANCELLED", label: "Cancelled", match: (t) => t.status === "CANCELLED" },
];

// Check-in / check-out stamps and the stay between them. Dispatch creates a fresh
// ticket, so checked_in_at carries the real arrival; older rows fall back to issued_at.
// A cancelled visit has no check-out, so its stay runs until it was cancelled.
const visitOf = (t) => {
  const cancelled = t.status === "CANCELLED";
  const inAt = t.checked_in_at || t.issued_at;
  const open = t.status === "QUEUED" && !t.dispatched_at; // still waiting in line
  const end = cancelled ? t.updated_at : t.dispatched_at || (open ? new Date() : null);
  const mins = inAt && end ? Math.max(0, Math.round((new Date(end) - new Date(inAt)) / 60000)) : null;
  let stay = "—";
  if (mins !== null) {
    const h = Math.floor(mins / 60);
    stay = mins < 1 ? "< 1 min" : h ? `${h}h ${mins % 60}m` : `${mins} min`;
  }
  return { inAt, outAt: cancelled ? null : t.dispatched_at, stay: open ? `${stay} so far` : stay, open };
};

// Ticket history for one vehicle or one driver; the other party gets a column.
function TicketHistoryModal({ vehicle, driver, onClose }) {
  const isDriver = !!driver;
  const subject = isDriver ? driver : vehicle;
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("ALL");
  const periodFilter = usePeriodFilter("all");
  const { fromDate, toDate } = periodFilter;
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!subject) return;
    setLoading(true);
    apiService.getTickets(isDriver ? { driver_id: subject.id } : { vehicle_id: subject.id })
      .then((ticketData) => {
        const own = isDriver ? (t) => t.driver?.id === subject.id : (t) => t.vehicle?.id === subject.id;
        setTickets(
          (ticketData || [])
            .filter(own)
            .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at))
        );
      })
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [subject, isDriver]);

  const viewTickets = useMemo(() => {
    const match = VIEWS.find((v) => v.key === view).match;
    return tickets.filter((t) => match(t) && inPeriod(t.issued_at, fromDate, toDate));
  }, [tickets, view, fromDate, toDate]);

  // Everything matching view + period + search; the on-screen table shows only the latest MAX_RECORDS.
  const matches = useMemo(() => {
    let list = viewTickets;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.id || "").toLowerCase().includes(q) ||
          (isDriver ? t.vehicle?.plate_number || "" : t.driver?.name || "").toLowerCase().includes(q) ||
          (t.collection_amount?.toString() || "").includes(q)
      );
    }
    return list;
  }, [viewTickets, search, isDriver]);
  const filtered = matches.slice(0, MAX_RECORDS);

  if (!subject) return null;

  const formatDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const peso = (n) => (n ? `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—");

  const handleExportPDF = () => {
    const viewLabel = VIEWS.find((v) => v.key === view).label;
    const range = fromDate ? ` · ${fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}` : "";
    const name = isDriver ? getDriverDisplayName(driver) : vehicle.plate_number;
    exportTablePDF(
      matches.map((t) => {
        const { inAt, outAt, stay, open } = visitOf(t);
        return {
          "Ticket ID": t.id,
          "Check-in": formatDate(inAt),
          "Check-out": open ? "In queue" : formatDate(outAt),
          "Checked in by": t.checked_in_by_name || "—",
          "Checked out by": (!open && t.checked_out_by_name) || "—",
          Stayed: stay,
          [isDriver ? "Vehicle" : "Driver"]: (isDriver ? t.vehicle?.plate_number : t.driver?.name) || "—",
          Type: badgeOf(t).label,
          Amount: peso(t.collection_amount),
        };
      }),
      `Ticket History — ${name} (${viewLabel}${range})`
    );
  };

  return (
    <div className="veh-overlay" onClick={onClose}>
      <div
        className="veh-modal"
        style={{ maxWidth: 920 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="veh-modal-header">
          <div className="veh-modal-header-left">
            <h2 className="veh-modal-title">
              Ticket History — {isDriver ? getDriverDisplayName(driver) : vehicle.plate_number}
            </h2>
          </div>
          <button className="veh-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="veh-ledger-filters">
          <div className="veh-search-wrap" style={{ width: 200 }}>
            <svg className="veh-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="veh-search"
              placeholder={isDriver ? "Search ticket or plate…" : "Search ticket or driver…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="veh-seg">
            {VIEWS.map(({ key, label }) => (
              <button
                key={key}
                className={`veh-seg-btn ${view === key ? "veh-seg-btn--active" : ""}`}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <PeriodFilter filter={periodFilter} includeAll />
        </div>

        {/* Body */}
        <div className="veh-ledger-body">
          {loading ? (
            <SkeletonList rows={4} h={40} />
          ) : filtered.length === 0 ? (
            <div className="veh-table-state">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>No tickets found</span>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="veh-ledger-summary">
                <span>{filtered.length} ticket{filtered.length !== 1 ? "s" : ""}</span>
                <button className="veh-btn veh-btn--history" onClick={handleExportPDF} title="Export all matching tickets as PDF">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Export PDF
                </button>
              </div>

              <div className="veh-table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="veh-table">
                  <thead>
                    <tr>
                      {["Ticket ID", "Check-in", "Check-out", "Stayed", isDriver ? "Vehicle" : "Driver", ...(view === "ALL" ? ["Status"] : []), "Amount"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t, i) => {
                      const { inAt, outAt, stay, open } = visitOf(t);
                      return (
                      <tr key={t.id || i} className="veh-row">
                        <td>
                          <span className="veh-code">{t.id}</span>
                        </td>
                        <td className="veh-td-route">
                          {formatDate(inAt)}
                          {t.checked_in_by_name && <small style={{ display: "block", opacity: 0.7 }}>by {t.checked_in_by_name}</small>}
                        </td>
                        <td className="veh-td-route">
                          {open ? "In queue" : formatDate(outAt)}
                          {!open && t.checked_out_by_name && <small style={{ display: "block", opacity: 0.7 }}>by {t.checked_out_by_name}</small>}
                        </td>
                        <td style={{ fontWeight: 600 }}>{stay}</td>
                        <td>
                          {(isDriver ? t.vehicle?.plate_number : t.driver?.name) || <span className="veh-na">—</span>}
                        </td>
                        {view === "ALL" && (
                          <td>
                            <span
                              className="veh-status"
                              style={{ background: `${badgeOf(t).color}18`, color: badgeOf(t).color }}
                            >
                              {badgeOf(t).label}
                            </span>
                          </td>
                        )}
                        <td style={{ fontWeight: 600 }}>{peso(t.collection_amount)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {viewTickets.length > MAX_RECORDS && !search.trim() && (
                <p className="veh-field-hint" style={{ textAlign: "center", padding: "10px 0 4px" }}>
                  Showing latest {MAX_RECORDS} of {viewTickets.length} tickets
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default TicketHistoryModal;
