import { DataTable } from "../../../components/ui/dataTable";
import { useState } from "react";
import ReportTableModal from "./ReportTableModal";
import { peso } from "../reportHook";

const VEHICLE_COLUMNS = [
  "Plate Number",
  "Route",
  "Transportation",
  "Franchise #",
  "Active Driver",
];
const DRIVER_COLUMNS = ["IWP", "Full Name", "Contact No.", "Address"];
const REWARD_COLUMNS = ["Date", "Driver", "Points Redeemed", "Peso Value", "Approved By"];

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

  redemptions,
  redemptionsTotal,
  handleExportRedemptionsCSV,
  handleExportRedemptionsPDF,
}) {
  const [activeTab, setActiveTab] = useState("vehicles");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");

  const isVehicles = activeTab === "vehicles";
  const isRewards = activeTab === "rewards";

  const searchedVehicles = visibleVehicles.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const route = v.route_detail ? `${v.route_detail.origin} - San Fernando` : v.route || "";
    return [v.plate_number, route, v.active_driver_name]
      .some((val) => val && val.toLowerCase().includes(q));
  });

  const searchedDrivers = visibleDrivers.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [d.iwp_number || String(d.id), d.name, d.contact]
      .some((val) => val && String(val).toLowerCase().includes(q));
  });

  const searchedRewards = (redemptions || []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.driver_name, r.status].some(
      (val) => val && String(val).toLowerCase().includes(q),
    );
  });

  const searched = isVehicles ? searchedVehicles : isRewards ? searchedRewards : searchedDrivers;
  const showAll = isVehicles ? showAllVehicles : !isRewards && showAllDrivers;
  const total = isVehicles ? vehiclesTotal : isRewards ? redemptionsTotal : driversTotal;
  const preview = isRewards ? searched.slice(0, 5) : showAll ? searched.slice(0, 5) : searched;

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

  const renderRewardRow = (r, idx, { rowClass, cellClass }) => (
    <tr key={r.id} className={rowClass}>
      <td className={cellClass}>{r.created_at ? r.created_at.slice(0, 10) : "—"}</td>
      <td className={`${cellClass} rpt-bold`}>{r.driver_name || "—"}</td>
      <td className={cellClass}>{r.points_redeemed}</td>
      <td className={cellClass}>{peso(r.peso_value)}</td>
      <td className={cellClass}>{r.approved_by_name || <span className="rpt-na">—</span>}</td>
    </tr>
  );

  const modalSearchedVehicles = searchedVehicles.filter((v) => {
    if (!modalSearch) return true;
    const q = modalSearch.toLowerCase();
    const route = v.route_detail ? `${v.route_detail.origin} - San Fernando` : v.route || "";
    return [v.plate_number, route, v.active_driver_name]
      .some((val) => val && val.toLowerCase().includes(q));
  });

  const modalSearchedDrivers = searchedDrivers.filter((d) => {
    if (!modalSearch) return true;
    const q = modalSearch.toLowerCase();
    return [d.iwp_number || String(d.id), d.name, d.contact]
      .some((val) => val && String(val).toLowerCase().includes(q));
  });

  const modalSearchedRewards = searchedRewards.filter((r) => {
    if (!modalSearch) return true;
    const q = modalSearch.toLowerCase();
    return [r.driver_name, r.status].some(
      (val) => val && String(val).toLowerCase().includes(q),
    );
  });

  const modalData = isVehicles ? modalSearchedVehicles : isRewards ? modalSearchedRewards : modalSearchedDrivers;

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setModalSearch("");
    setShowModal(false);
  };

  const handleViewAll = () => {
    if (isVehicles) setShowAllVehicles(true);
    else if (!isRewards) setShowAllDrivers(true);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalSearch("");
    if (isVehicles) setShowAllVehicles(false);
    else if (!isRewards) setShowAllDrivers(false);
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
              className={`rpt-tab ${!isVehicles && !isRewards ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("drivers")}
            >
              Driver Records
            </button>
            <button
              className={`rpt-tab ${isRewards ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("rewards")}
            >
              Reward Logs
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
            placeholder={isVehicles ? "Search vehicles…" : isRewards ? "Search redemptions…" : "Search drivers…"}
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
            onClick={isVehicles ? handleExportVehiclesCSV : isRewards ? handleExportRedemptionsCSV : handleExportDriversCSV}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
          <button
            className="rpt-btn-export rpt-btn-export--red"
            onClick={isVehicles ? handleExportVehiclesPDF : isRewards ? handleExportRedemptionsPDF : handleExportDriversPDF}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {isVehicles ? (
        <DataTable columns={VEHICLE_COLUMNS} data={preview} rowRenderer={renderVehicleRow} />
      ) : isRewards ? (
        <DataTable columns={REWARD_COLUMNS} data={preview} rowRenderer={renderRewardRow} />
      ) : (
        <DataTable columns={DRIVER_COLUMNS} data={preview} rowRenderer={renderDriverRow} />
      )}

      {showModal && (
        <ReportTableModal
          title={isVehicles ? "Vehicle Records" : isRewards ? "Reward Logs" : "Driver Records"}
          subtitle={
            isVehicles
              ? "Complete registered vehicle fleet"
              : isRewards
              ? "Complete history of driver reward redemptions"
              : "Complete registered driver roster"
          }
          count={modalData.length}
          onClose={handleCloseModal}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder={isVehicles ? "Search vehicles…" : isRewards ? "Search redemptions…" : "Search drivers…"}
        >
          {isVehicles ? (
            <DataTable columns={VEHICLE_COLUMNS} data={modalData} rowRenderer={renderVehicleRow} />
          ) : isRewards ? (
            <DataTable columns={REWARD_COLUMNS} data={modalData} rowRenderer={renderRewardRow} />
          ) : (
            <DataTable columns={DRIVER_COLUMNS} data={modalData} rowRenderer={renderDriverRow} />
          )}
        </ReportTableModal>
      )}
    </div>
  );
}
