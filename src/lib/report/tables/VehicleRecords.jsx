import { DataTable } from "../../../components/ui/dataTable";
import { useState } from "react";

export default function VehicleRecords({
  vehiclesTotal,
  showAllVehicles,
  setShowAllVehicles,
  visibleVehicles,
  handleExportVehiclesCSV,
  cardStyle,
  cardHeaderStyle,
  cardTitleStyle,
  btnExport,
  btnSecondary,
}) {
  const [search, setSearch] = useState("");
  const searched = visibleVehicles.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const route = v.route_detail ? `${v.route_detail.origin} - San Fernando` : v.route || "";
    return [v.code, v.plate_number, route, v.active_driver_name]
      .some((val) => val && val.toLowerCase().includes(q));
  });

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <span className="rpt-card-title">Vehicle Records</span>
          <span className="rpt-record-count">
            {searched.length} of {vehiclesTotal} records
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search vehicles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {vehiclesTotal > 5 && (
            <button className="rpt-btn rpt-btn--secondary" onClick={() => setShowAllVehicles((v) => !v)}>
              {showAllVehicles ? "Show Less" : "View All"}
            </button>
          )}
          <button className="rpt-btn-export rpt-btn-export--green" onClick={handleExportVehiclesCSV}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      <DataTable
        columns={["Vehicle Code", "Plate Number", "Route", "Driver"]}
        data={searched}
        rowRenderer={(v, idx, { rowClass, cellClass }) => (
          <tr key={v.code} className={rowClass}>
            <td className={`${cellClass} rpt-mono`}>{v.code}</td>
            <td className={cellClass}>
              <span className="rpt-plate">{v.plate_number}</span>
            </td>
            <td className={cellClass}>
              {v.route_detail ? `${v.route_detail.origin} - San Fernando` : v.route}
            </td>
            <td className={cellClass}>
              {v.active_driver_name || <span className="rpt-na">Unassigned</span>}
            </td>
          </tr>
        )}
      />
    </div>
  );
}
