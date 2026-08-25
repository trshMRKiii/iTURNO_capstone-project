import React, { useState } from "react";
import { useQueue, formatTime, getTicketDisplayId } from "./useQueue";
import "../../../styles/Queue.css";
import {
  HistoryIcon,
  RouteIcon,
  IssueTicketIcon,
  SearchIcon,
  EmptyStateIcon,
} from "./queueIcon";

function Queue({ userRole }) {
  const {
    filteredTickets,
    searchTerm,
    setSearchTerm,
    loading,
    error,

    vehicles,
    drivers,
    issuanceType,
    setIssuanceType,
    selectedVehicle,
    selectedDriver,
    showDriverModal,
    setShowDriverModal,

    issuingTicket,
    successMessage,
    issueError,

    routes,
    selectedRouteId,
    availableVehicles,
    activeDrivers,
    availableSeries,
    selectedSeriesId,
    setSelectedSeriesId,
    ticketQuantity,
    setTicketQuantity,
    handleRouteChange,
    selectVehicleById,
    handleDriverChange,
    handleIssueTicket,
  } = useQueue(userRole);

  const [activeTab, setActiveTab] = useState("tickets");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [driverSearch, setDriverSearch] = useState("");
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);

  const vehicleSearchResults = availableVehicles.filter((v) => {
    const term = vehicleSearch.toLowerCase();
    return (
      v.plate_number.toLowerCase().includes(term) ||
      (v.route_detail?.full_name || "").toLowerCase().includes(term)
    );
  });

  const driverSearchResults = activeDrivers.filter((d) =>
    d.name.toLowerCase().includes(driverSearch.toLowerCase()),
  );

  const handleSelectDriver = (driver) => {
    handleDriverChange(driver.id);
    setDriverSearch("");
    setShowDriverDropdown(false);
  };

  const handleSelectVehicle = (vehicle) => {
    selectVehicleById(vehicle.id);
    setVehicleSearch(vehicle.plate_number);
    setShowVehicleDropdown(false);
  };

  const handleVehicleSearchChange = (e) => {
    setVehicleSearch(e.target.value);
    setShowVehicleDropdown(true);
    if (selectedVehicle) {
      selectVehicleById(null);
    }
  };


  const cancelledTickets = filteredTickets.filter((t) => t.status === "CANCELLED");
  const activeTickets = filteredTickets.filter((t) => t.status !== "CANCELLED");
  const roamingTickets = activeTickets.filter((t) => t.mode === "UNLOAD");
  const queuingTickets = activeTickets.filter(
    (t) => t.mode === "QUEUE" && t.status === "QUEUED",
  );
  const ticketsTab = activeTickets.filter(
    (t) => !(t.mode === "QUEUE" && t.status === "QUEUED"),
  );

  const displayTickets =
    activeTab === "tickets"
      ? ticketsTab
      : activeTab === "queuing"
        ? queuingTickets
        : activeTab === "roaming"
          ? roamingTickets
          : cancelledTickets;

  return (
    <div className="queue-page">
      {/* ── Page Header ── */}
      <div className="queue-header">
        <div className="queue-header-left">
          <div className="queue-header-accent" />
          <div>
            <h1 className="queue-title">Queue Management</h1>
            <p className="queue-subtitle">
              Check vehicles into the queue and issue roaming tickets
            </p>
          </div>
        </div>
      </div>

      {/* ── Single Column Layout ── */}
      <div className="queue-single-col">
        {/* Issue New Ticket Card */}
        <div className="queue-card">
          <div className="queue-card-header queue-card-header--color">
            <div>
              <span className="queue-card-title">
                {issuanceType === "ROAM" ? "Issue New Ticket" : "Check In Vehicle"}
              </span>
              <p className="queue-card-desc">
                {issuanceType === "ROAM"
                  ? "Only available vehicles and active drivers may be selected."
                  : "Only available vehicles and active drivers may be selected. Denomination and quantity are chosen at Dispatch."}
              </p>
            </div>
          </div>

          <div className="queue-card-body">
            {/* Issuance type radio group */}
            <div className="queue-field">
              <label className="queue-label">Issuance Type</label>
              <div className="queue-type-toggle" role="radiogroup" aria-label="Issuance Type">
                <label
                  className={`queue-type-option ${issuanceType === "QUEUE" ? "queue-type-option--active" : ""}`}
                >
                  <input
                    type="radio"
                    name="issuanceType"
                    value="QUEUE"
                    checked={issuanceType === "QUEUE"}
                    onChange={(e) => setIssuanceType(e.target.value)}
                  />
                  <span className="queue-type-option-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </span>
                  <span className="queue-type-option-text">
                    <span className="queue-type-option-title">Queue</span>
                    <span className="queue-type-option-desc">Check in vehicle</span>
                  </span>
                </label>
                <label
                  className={`queue-type-option ${issuanceType === "ROAM" ? "queue-type-option--active" : ""}`}
                >
                  <input
                    type="radio"
                    name="issuanceType"
                    value="ROAM"
                    checked={issuanceType === "ROAM"}
                    onChange={(e) => setIssuanceType(e.target.value)}
                  />
                  <span className="queue-type-option-icon">
                    <RouteIcon />
                  </span>
                  <span className="queue-type-option-text">
                    <span className="queue-type-option-title">Roaming</span>
                    <span className="queue-type-option-desc">Issue ticket now</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Route select */}
            <div className="queue-field">
              <label className="queue-label">Route</label>
              <select
                className="queue-select"
                value={selectedRouteId}
                onChange={(e) => {
                  handleRouteChange(e);
                  setVehicleSearch("");
                }}
              >
                <option value="">— Select a route —</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Vehicle search / select */}
            <div className="queue-field queue-vehicle-combobox">
              <label className="queue-label">Vehicle (Plate Number)</label>
              <div className="queue-search-wrap">
                <SearchIcon className="queue-search-icon" />
                <input
                  className="queue-select queue-vehicle-search-input"
                  placeholder="Search by plate number or route…"
                  value={vehicleSearch}
                  onChange={handleVehicleSearchChange}
                  onFocus={() => setShowVehicleDropdown(true)}
                  onBlur={() =>
                    setTimeout(() => setShowVehicleDropdown(false), 150)
                  }
                />
              </div>
              {showVehicleDropdown && (
                <div className="queue-vehicle-dropdown">
                  {vehicleSearchResults.length === 0 ? (
                    <div className="queue-vehicle-dropdown-empty">
                      No matching vehicles
                    </div>
                  ) : (
                    vehicleSearchResults.map((v) => (
                      <div
                        key={v.id}
                        className="queue-vehicle-dropdown-item"
                        onMouseDown={() => handleSelectVehicle(v)}
                      >
                        <span className="queue-plate">{v.plate_number}</span>
                        {v.route_detail && (
                          <span className="queue-vehicle-dropdown-route">
                            {v.route_detail.full_name}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
              {vehicles.length > availableVehicles.length && (
                <p className="queue-field-hint">
                  {vehicles.length - availableVehicles.length} vehicle(s)
                  excluded (Maintenance / Has Active Ticket).
                </p>
              )}
            </div>

            {/* Ticket Form / Series select — roaming issues + dispatches in one step, */}
            {/* so it still needs a denomination picked here. Queue check-ins pick */}
            {/* the denomination later, at Dispatch. */}
            {issuanceType === "ROAM" && (
              <>
                <div className="queue-field">
                  <label className="queue-label">Ticket Form / Series</label>
                  <select
                    className="queue-select"
                    value={selectedSeriesId}
                    onChange={(e) => setSelectedSeriesId(e.target.value)}
                  >
                    <option value="">— Select a ticket series —</option>
                    {availableSeries.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.ticket_form_label || "Unspecified"} — Series {s.series_no} ({s.pcs} pcs remaining)
                      </option>
                    ))}
                  </select>
                  {availableSeries.length === 0 && (
                    <p className="queue-field-hint">
                      No ticket series with stock available. Create a new requisition first.
                    </p>
                  )}
                </div>

                {/* Quantity */}
                <div className="queue-field">
                  <label className="queue-label">Quantity</label>
                  <input
                    type="number"
                    className="queue-select"
                    min={1}
                    value={ticketQuantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setTicketQuantity(Number.isNaN(val) ? 1 : Math.max(1, val));
                    }}
                  />
                </div>
              </>
            )}

            {/* Driver panel */}
            {selectedVehicle && (
              <div className="queue-driver-panel">
                <div className="queue-driver-panel-top">
                  <span className="queue-label">Assigned Driver</span>
                  <button
                    type="button"
                    className="queue-change-btn"
                    onClick={() => {
                      setShowDriverModal(!showDriverModal);
                      setDriverSearch("");
                    }}
                  >
                    {showDriverModal ? "Close" : "Change Driver"}
                  </button>
                </div>

                {selectedDriver ? (
                  <div className="queue-driver-info">
                    <div className="queue-driver-avatar">
                      {selectedDriver.name.charAt(0)}
                    </div>
                    <div className="queue-driver-meta">
                      <span className="queue-driver-name">
                        {selectedDriver.name}
                      </span>
                      <span className="queue-driver-id">
                        ID: {selectedDriver.id}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="queue-driver-empty">
                    No driver assigned to this vehicle
                  </p>
                )}

                {selectedDriver && (
                  <div className="queue-route-pill">
                    <RouteIcon />
                    {selectedVehicle.route_detail?.full_name || "N/A"}
                  </div>
                )}

                {showDriverModal && (
                  <div className="queue-driver-modal">
                    <label className="queue-label">
                      Select Active Driver
                    </label>
                    <div className="queue-vehicle-combobox">
                    <div className="queue-search-wrap">
                      <SearchIcon className="queue-search-icon" />
                      <input
                        className="queue-select queue-vehicle-search-input"
                        placeholder="Search by driver name…"
                        value={driverSearch}
                        onChange={(e) => {
                          setDriverSearch(e.target.value);
                          setShowDriverDropdown(true);
                        }}
                        onFocus={() => setShowDriverDropdown(true)}
                        onBlur={() =>
                          setTimeout(() => setShowDriverDropdown(false), 150)
                        }
                      />
                    </div>
                    {showDriverDropdown && (
                      <div className="queue-vehicle-dropdown">
                        {driverSearchResults.length === 0 ? (
                          <div className="queue-vehicle-dropdown-empty">
                            No matching drivers
                          </div>
                        ) : (
                          driverSearchResults.map((d) => (
                            <div
                              key={d.id}
                              className="queue-vehicle-dropdown-item"
                              onMouseDown={() => handleSelectDriver(d)}
                            >
                              <span className="queue-plate">{d.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {successMessage && (
              <div className="queue-alert queue-alert--success">
                {successMessage}
              </div>
            )}
            {issueError && (
              <div className="queue-alert queue-alert--error">
                {issueError}
              </div>
            )}

            <button
              type="button"
              className="queue-issue-btn"
              onClick={handleIssueTicket}
              disabled={
                issuingTicket ||
                !selectedVehicle ||
                !selectedDriver ||
                (issuanceType === "ROAM" && !selectedSeriesId)
              }
            >
              <IssueTicketIcon />
              {issuingTicket
                ? "Issuing…"
                : issuanceType === "ROAM" && ticketQuantity > 1
                  ? `Issue ${ticketQuantity} Tickets`
                  : issuanceType === "ROAM"
                    ? "Issue Ticket"
                    : "Check In Vehicle"}
            </button>
          </div>
        </div>

        {/* ── Recent Tickets with Tabs ── */}
        <div className="queue-card">
          <div className="queue-card-header queue-card-header--color">
            <div>
              <span className="queue-card-title">Recent Tickets</span>
              <p className="queue-card-desc">Last 10 issued tickets</p>
            </div>
            <div className="queue-search-wrap">
              <SearchIcon className="queue-search-icon" />
              <input
                className="queue-search"
                placeholder="Search tickets…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Tab bar */}
          <div className="queue-tabs">
            <button
              className={`queue-tab ${activeTab === "tickets" ? "queue-tab--active" : ""}`}
              onClick={() => setActiveTab("tickets")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Tickets
              {ticketsTab.length > 0 && (
                <span className="queue-tab-count">{ticketsTab.length}</span>
              )}
            </button>
            <button
              className={`queue-tab ${activeTab === "queuing" ? "queue-tab--active" : ""}`}
              onClick={() => setActiveTab("queuing")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Queuing
              {queuingTickets.length > 0 && (
                <span className="queue-tab-count">{queuingTickets.length}</span>
              )}
            </button>
            <button
              className={`queue-tab ${activeTab === "roaming" ? "queue-tab--active" : ""}`}
              onClick={() => setActiveTab("roaming")}
            >
              <RouteIcon />
              Roaming
              {roamingTickets.length > 0 && (
                <span className="queue-tab-count">{roamingTickets.length}</span>
              )}
            </button>
            <button
              className={`queue-tab ${activeTab === "cancelled" ? "queue-tab--active" : ""}`}
              onClick={() => setActiveTab("cancelled")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
              Cancelled
              {cancelledTickets.length > 0 && (
                <span className="queue-tab-count">{cancelledTickets.length}</span>
              )}
            </button>
          </div>

          {/* Tickets / Queuing / Roaming / Cancelled tab content */}
          {(activeTab === "tickets" || activeTab === "queuing" || activeTab === "roaming" || activeTab === "cancelled") && (
            <>
              <div className="queue-table-wrap">
                <table className="queue-table">
                  <thead>
                    <tr>
                      {["Ticket ID", "Plate Number", "Driver", "Issued By", "Time", ...(activeTab === "cancelled" ? ["Reason"] : [])].map(
                        (h) => (
                          <th key={h}>{h}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={activeTab === "cancelled" ? 6 : 5} className="queue-table-state">
                          <div className="queue-loading-dots">
                            <div />
                            <div />
                            <div />
                          </div>
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td
                          colSpan={activeTab === "cancelled" ? 6 : 5}
                          className="queue-table-state queue-table-state--error"
                        >
                          Error: {error}
                        </td>
                      </tr>
                    ) : displayTickets.length === 0 ? (
                      <tr>
                        <td colSpan={activeTab === "cancelled" ? 6 : 5} className="queue-table-state">
                          <EmptyStateIcon className="queue-empty-icon" />
                          <span>
                            {activeTab === "cancelled"
                              ? "No cancelled tickets"
                              : activeTab === "roaming"
                                ? "No roaming tickets"
                                : activeTab === "queuing"
                                  ? "No vehicles currently queuing"
                                  : "No tickets found"}
                          </span>
                        </td>
                      </tr>
                    ) : (
                      displayTickets.map((t) => (
                        <tr key={t.id} className="queue-table-row">
                          <td>
                            <span className="queue-id-badge">{getTicketDisplayId(t)}</span>
                          </td>
                          <td>
                            {t.vehicle?.plate_number ? (
                              <span className="queue-plate">
                                {t.vehicle.plate_number}
                              </span>
                            ) : (
                              <span className="queue-na">N/A</span>
                            )}
                          </td>
                          <td className="queue-td-name">
                            {t.driver?.name || (
                              <span className="queue-na">N/A</span>
                            )}
                          </td>
                          <td className="queue-td-name">
                            {t.active_user_name || (
                              <span className="queue-na">N/A</span>
                            )}
                          </td>
                          <td className="queue-td-time">
                            {formatTime(t.issued_at)}
                          </td>
                          {activeTab === "cancelled" && (
                            <td>
                              {t.reason || <span className="queue-na">N/A</span>}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="queue-card-footer">
                <a href="/dashboard/Reports" className="queue-history-link">
                  <HistoryIcon />
                  View Full History
                </a>
              </div>
            </>
          )}

        </div>
      </div>

    </div>
  );
}

export default Queue;
