import { DataTable } from "../../../components/ui/dataTable";
import { useState } from "react";

export default function TransactionLogs({
  logsTotal,
  showAllLogs,
  setShowAllLogs,
  filteredLogs,
  handleExportLogsCSV,
  STATUS_COLORS,
  roaming = [],
  roamingTotal = 0,
  handleExportRoamingCSV,
}) {
  const [activeTab, setActiveTab] = useState("logs");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const searchedLogs = filteredLogs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [l.timestamp, l.ticket_id, l.action, l.batch, l.driver, l.vehicle, l.route, l.user]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });

  const searchedRoaming = roaming.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.vehicle_plate, r.driver_name, r.recorded_by_name, r.notes]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });

  const isLogs = activeTab === "logs";
  const searched = isLogs ? searchedLogs : searchedRoaming;
  const pageSize = showAllLogs ? 20 : 5;
  const start = page * pageSize;
  const end = start + pageSize;
  const visible = searched.slice(start, end);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(0);
    setSearch("");
  };

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <div className="rpt-tab-group">
            <button
              className={`rpt-tab ${isLogs ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("logs")}
            >
              Transaction Logs
            </button>
            <button
              className={`rpt-tab ${!isLogs ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("roaming")}
            >
              Roaming Logs
            </button>
          </div>
          <span className="rpt-record-count">
            {visible.length} of {searched.length} records
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder={isLogs ? "Search logs…" : "Search roaming…"}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
          <button
            className="rpt-btn-export rpt-btn-export--green"
            onClick={isLogs ? handleExportLogsCSV : handleExportRoamingCSV}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {isLogs ? (
        <DataTable
          columns={["Timestamp", "Ticket ID", "Action", "Batch", "Driver", "Vehicle", "Route", "User"]}
          data={visible}
          rowRenderer={(l, idx, { rowClass, cellClass }) => (
            <tr key={l.id + idx} className={rowClass}>
              <td className={`${cellClass} rpt-mono rpt-muted`}>{l.timestamp}</td>
              <td className={`${cellClass} rpt-mono`}>{l.ticket_id}</td>
              <td className={cellClass}>
                <span
                  className="rpt-action-pill"
                  style={{
                    background: `${STATUS_COLORS[l.action] || "#64748b"}22`,
                    color: STATUS_COLORS[l.action] || "#64748b",
                  }}
                >
                  {l.action}
                </span>
              </td>
              <td className={cellClass}>
                <span className={`rpt-batch-pill ${l.batch === "Batch 1" ? "rpt-batch-pill--b1" : "rpt-batch-pill--b2"}`}>
                  {l.batch}
                </span>
              </td>
              <td className={cellClass}>{l.driver}</td>
              <td className={cellClass}><span className="rpt-plate">{l.vehicle}</span></td>
              <td className={cellClass}>{l.route}</td>
              <td className={`${cellClass} rpt-muted`}>{l.user}</td>
            </tr>
          )}
        />
      ) : (
        <DataTable
          columns={["Vehicle Plate", "Driver", "Recorded By", "Notes", "Recorded At"]}
          data={visible}
          rowRenderer={(r, idx, { rowClass, cellClass }) => (
            <tr key={r.id} className={rowClass}>
              <td className={`${cellClass} rpt-mono`}>
                <span className="rpt-plate">{r.vehicle_plate}</span>
              </td>
              <td className={cellClass}>{r.driver_name || <span className="rpt-na">—</span>}</td>
              <td className={cellClass}>{r.recorded_by_name || <span className="rpt-na">—</span>}</td>
              <td className={cellClass}>{r.notes || <span className="rpt-na">—</span>}</td>
              <td className={`${cellClass} rpt-mono rpt-muted`}>
                {r.recorded_at ? new Date(r.recorded_at).toLocaleString() : "—"}
              </td>
            </tr>
          )}
        />
      )}

      <div className="flex justify-between">
        {searched.length > pageSize && (
          <div className="rpt-pagination">
            <button className="rpt-btn rpt-btn--secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>Page {page + 1} of {Math.ceil(searched.length / pageSize)}</span>
            <button className="rpt-btn rpt-btn--secondary" disabled={end >= searched.length} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
        {searched.length > 5 && (
          <button
            className="rpt-btn rpt-btn--secondary"
            onClick={() => { setShowAllLogs((v) => !v); setPage(0); }}
          >
            {showAllLogs ? "Show Less" : "Show More"}
          </button>
        )}
      </div>
    </div>
  );
}
