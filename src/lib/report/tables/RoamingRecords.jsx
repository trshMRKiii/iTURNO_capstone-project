import { DataTable } from "../../../components/ui/dataTable";
import { useState } from "react";

export default function RoamingRecords({
  roamingTotal,
  showAllRoaming,
  setShowAllRoaming,
  visibleRoaming,
  handleExportRoamingCSV,
}) {
  const [search, setSearch] = useState("");
  const searched = visibleRoaming.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.vehicle_plate, r.driver_name, r.recorded_by_name, r.notes]
      .some((val) => val && val.toLowerCase().includes(q));
  });

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <span className="rpt-card-title">Roaming Vehicle Logs</span>
          <span className="rpt-record-count">
            {searched.length} of {roamingTotal} records
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search roaming logs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {roamingTotal > 5 && (
            <button className="rpt-btn rpt-btn--secondary" onClick={() => setShowAllRoaming((v) => !v)}>
              {showAllRoaming ? "Show Less" : "View All"}
            </button>
          )}
          <button className="rpt-btn-export rpt-btn-export--green" onClick={handleExportRoamingCSV}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      <DataTable
        columns={["Vehicle Plate", "Driver", "Recorded By", "Notes", "Recorded At"]}
        data={searched}
        rowRenderer={(r, idx, { rowClass, cellClass }) => (
          <tr key={r.id} className={rowClass}>
            <td className={`${cellClass} rpt-mono`}>
              <span className="rpt-plate">{r.vehicle_plate}</span>
            </td>
            <td className={cellClass}>
              {r.driver_name || <span className="rpt-na">—</span>}
            </td>
            <td className={cellClass}>
              {r.recorded_by_name || <span className="rpt-na">—</span>}
            </td>
            <td className={cellClass}>{r.notes || <span className="rpt-na">—</span>}</td>
            <td className={cellClass}>
              {r.recorded_at ? new Date(r.recorded_at).toLocaleString() : "—"}
            </td>
          </tr>
        )}
      />
    </div>
  );
}
