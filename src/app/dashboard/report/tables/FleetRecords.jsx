import { DataTable } from "../../../../components/ui/dataTable";
import { useState } from "react";
import ReportTableModal from "./ReportTableModal";
import { matchesVehicleRow, matchesDriverRow } from "../reportHook";

const VEHICLE_COLUMNS = [
  "Plate Number",
  "Route",
  "Transportation",
  "Franchise #",
  "Active Driver",
];
const DRIVER_COLUMNS = ["IWP", "Full Name", "Contact No.", "Address"];

export default function FleetRecords({
  vehiclesTotal,
  showAllVehicles,
  setShowAllVehicles,
  visibleVehicles,
  handleExportVehiclesCSV,
  handleExportVehiclesPDF,

  driversTotal,
  showAllDrivers,
  setShowAllDrivers,
  visibleDrivers,
  handleExportDriversCSV,
  handleExportDriversPDF,
}) {
  const [activeTab, setActiveTab] = useState("vehicles");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");

  const isVehicles = activeTab === "vehicles";

  const searchedVehicles = visibleVehicles.filter((v) => matchesVehicleRow(v, search));

  const searchedDrivers = visibleDrivers.filter((d) => matchesDriverRow(d, search));

  const searched = isVehicles ? searchedVehicles : searchedDrivers;
  const showAll = isVehicles ? showAllVehicles : showAllDrivers;
  const total = isVehicles ? vehiclesTotal : driversTotal;
  const preview = showAll ? searched.slice(0, 5) : searched;

  const renderVehicleRow = (v, idx, { rowClass, cellClass }) => (
    <tr key={v.id} className={rowClass}>
      <td className={cellClass}>
        <span className="rpt-plate">{v.plate_number}</span>
      </td>
      <td className={cellClass}>
        {v.route_detail ? `${v.route_detail.origin} - San Fernando` : v.route || <span className="rpt-na">No route</span>}
      </td>
      <td className={cellClass}>
        {v.transportation_name || v.transportation_id || <span className="rpt-na">—</span>}
      </td>
      <td className={cellClass}>
        {v.franchise_number || <span className="rpt-na">—</span>}
      </td>

      <td className={cellClass}>
        {v.active_driver_name || <span className="rpt-na">Unassigned</span>}
      </td>
    </tr>
  );

  const renderDriverRow = (d, idx, { rowClass, cellClass }) => (
    <tr key={d.id} className={rowClass}>
      <td className={`${cellClass} rpt-mono`}>{d.iwp_number || d.id}</td>
      <td className={`${cellClass} rpt-bold`}>{d.name}</td>
      <td className={cellClass}>{d.contact}</td>
      <td className={cellClass}>
        {[d.barangay, d.city, d.province].filter(Boolean).join(", ") || "—"}
      </td>
    </tr>
  );

  const modalSearchedVehicles = searchedVehicles.filter((v) => matchesVehicleRow(v, modalSearch));

  const modalSearchedDrivers = searchedDrivers.filter((d) => matchesDriverRow(d, modalSearch));

  const modalData = isVehicles ? modalSearchedVehicles : modalSearchedDrivers;

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setModalSearch("");
    setShowModal(false);
  };

  const handleViewAll = () => {
    if (isVehicles) setShowAllVehicles(true);
    else setShowAllDrivers(true);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalSearch("");
    if (isVehicles) setShowAllVehicles(false);
    else setShowAllDrivers(false);
  };

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <div className="rpt-tab-group">
            <button
              className={`rpt-tab ${isVehicles ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("vehicles")}
            >
              Vehicle Records
            </button>
            <button
              className={`rpt-tab ${!isVehicles ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("drivers")}
            >
              Driver Records
            </button>
          </div>
          <span className="rpt-record-count">
            {preview.length} of {total} records
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder={isVehicles ? "Search vehicles…" : "Search drivers…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {total > 5 && (
            <button className="rpt-btn rpt-btn--secondary" onClick={handleViewAll}>
              View All
            </button>
          )}
          <button
            className="rpt-btn-export rpt-btn-export--green"
            title={search ? "Export only rows matching your search" : "Export all records"}
            onClick={() => (isVehicles ? handleExportVehiclesCSV(search) : handleExportDriversCSV(search))}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {search ? "Export Matches (CSV)" : "Export CSV"}
          </button>
          <button
            className="rpt-btn-export rpt-btn-export--red"
            title={search ? "Export only rows matching your search" : "Export all records"}
            onClick={() => (isVehicles ? handleExportVehiclesPDF(search) : handleExportDriversPDF(search))}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            {search ? "Export Matches (PDF)" : "Export PDF"}
          </button>
        </div>
      </div>

      {isVehicles ? (
        <DataTable columns={VEHICLE_COLUMNS} data={preview} rowRenderer={renderVehicleRow} />
      ) : (
        <DataTable columns={DRIVER_COLUMNS} data={preview} rowRenderer={renderDriverRow} />
      )}

      {showModal && (
        <ReportTableModal
          title={isVehicles ? "Vehicle Records" : "Driver Records"}
          subtitle={
            isVehicles
              ? "Complete registered vehicle fleet"
              : "Complete registered driver roster"
          }
          count={modalData.length}
          onClose={handleCloseModal}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder={isVehicles ? "Search vehicles…" : "Search drivers…"}
        >
          {isVehicles ? (
            <DataTable columns={VEHICLE_COLUMNS} data={modalData} rowRenderer={renderVehicleRow} />
          ) : (
            <DataTable columns={DRIVER_COLUMNS} data={modalData} rowRenderer={renderDriverRow} />
          )}
        </ReportTableModal>
      )}
    </div>
  );
}
