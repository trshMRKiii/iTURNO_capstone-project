import React, { useState, useEffect, useMemo } from "react";
import { apiService } from "../api-service";

const MAX_RECORDS = 20;

const STATUS_COLORS = {
  ISSUED: "#3b82f6",
  DISPATCHED: "#f59e0b",
  COLLECTED: "#22c55e",
  CANCELLED: "#ef4444",
  RETURNED: "#8b5cf6",
  ROAMING: "#f97316",
};

function VehicleModal({ vehicle, onClose }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!vehicle) return;
    setLoading(true);
    Promise.all([apiService.getTickets(), apiService.getRoamingLogs()])
      .then(([ticketData, roamingData]) => {
        const vehicleTickets = (ticketData || [])
          .filter((t) => t.vehicle_id === vehicle.id || t.vehicle?.id === vehicle.id)
          .map((t) => ({ ...t, _date: t.issued_at }));

        const vehicleRoaming = (roamingData || [])
          .filter((r) => r.vehicle === vehicle.id)
          .map((r) => ({
            id: `R-${r.id}`,
            _date: r.recorded_at,
            issued_at: r.recorded_at,
            driver: { name: r.driver_name || null },
            status: "ROAMING",
            collection_amount: null,
            notes: r.notes,
          }));

        const combined = [...vehicleTickets, ...vehicleRoaming]
          .sort((a, b) => new Date(b._date) - new Date(a._date));
        setTickets(combined);
      })
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [vehicle]);

  const filtered = useMemo(() => {
    let list = tickets;
    if (filter !== "ALL") list = list.filter((t) => t.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.id || "").toLowerCase().includes(q) ||
          (t.driver?.name || "").toLowerCase().includes(q) ||
          (t.collection_amount?.toString() || "").includes(q)
      );
    }
    return list.slice(0, MAX_RECORDS);
  }, [tickets, filter, search]);

  if (!vehicle) return null;

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

  const totalAmount = filtered.reduce((sum, t) => sum + (t.collection_amount || 0), 0);

  return (
    <div className="veh-overlay" onClick={onClose}>
      <div
        className="veh-modal"
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="veh-modal-header">
          <div className="veh-modal-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <h2 className="veh-modal-title">
              Ticket History — {vehicle.plate_number}
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
              placeholder="Search ticket or driver…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="veh-ledger-pills">
            {["ALL", "COLLECTED", "CANCELLED", "ROAMING"].map((s) => (
              <button
                key={s}
                className={`veh-ledger-pill ${filter === s ? "veh-ledger-pill--active" : ""}`}
                onClick={() => setFilter(s)}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="veh-ledger-body">
          {loading ? (
            <div className="veh-table-state">
              <div className="veh-loading-dots"><div /><div /><div /></div>
            </div>
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
              </div>

              <div className="veh-table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="veh-table">
                  <thead>
                    <tr>
                      {["Ticket ID", "Date", "Driver", "Status", "Amount"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t, i) => (
                      <tr key={t.id || i} className="veh-row">
                        <td>
                          <span className="veh-code">{t.id}</span>
                        </td>
                        <td className="veh-td-route">{formatDate(t.issued_at)}</td>
                        <td>{t.driver?.name || <span className="veh-na">—</span>}</td>
                        <td>
                          <span
                            className="veh-status"
                            style={{
                              background: `${STATUS_COLORS[t.status] || "#64748b"}18`,
                              color: STATUS_COLORS[t.status] || "#64748b",
                            }}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {t.collection_amount
                            ? `₱${t.collection_amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                            : <span className="veh-na">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {tickets.length > MAX_RECORDS && filter === "ALL" && !search.trim() && (
                <p className="veh-field-hint" style={{ textAlign: "center", padding: "10px 0 4px" }}>
                  Showing latest {MAX_RECORDS} of {tickets.length} tickets
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default VehicleModal;
