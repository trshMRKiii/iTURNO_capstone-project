import React, { useState } from "react";
import { useTicket, formatTime } from "../../../lib/useTicket";
import "../../../styles/Ticket.css";
import {
  HistoryIcon,
  RouteIcon,
  IssueTicketIcon,
  SearchIcon,
  EmptyStateIcon,
} from "../../../lib/ticket/ticketIcon";

function Ticket({ userRole }) {
  const {
    filteredTickets,
    searchTerm,
    setSearchTerm,
    loading,
    error,

    vehicles,
    drivers,
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
  } = useTicket(userRole);

  const [activeTab, setActiveTab] = useState("tickets");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  const vehicleSearchResults = availableVehicles.filter((v) => {
    const term = vehicleSearch.toLowerCase();
    return (
      v.plate_number.toLowerCase().includes(term) ||
      (v.route_detail?.full_name || "").toLowerCase().includes(term)
    );
  });

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

  const displayTickets = activeTab === "tickets" ? activeTickets : cancelledTickets;

  return (
    <div className="ticket-page">
      {/* ── Page Header ── */}
      <div className="ticket-header">
        <div className="ticket-header-left">
          <div className="ticket-header-accent" />
          <div>
            <h1 className="ticket-title">Ticket Issuance</h1>
            <p className="ticket-subtitle">
              Issue and monitor trip dispatch tickets
            </p>
          </div>
        </div>
      </div>

      {/* ── Single Column Layout ── */}
      <div className="ticket-single-col">
        {/* Issue New Ticket Card */}
        <div className="ticket-card">
          <div className="ticket-card-header ticket-card-header--color">
            <div>
              <span className="ticket-card-title">Issue New Ticket</span>
              <p className="ticket-card-desc">
                Only available vehicles and active drivers may be selected.
              </p>
            </div>
          </div>

          <div className="ticket-card-body">
            {/* Route select */}
            <div className="ticket-field">
              <label className="ticket-label">Route</label>
              <select
                className="ticket-select"
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
            <div className="ticket-field ticket-vehicle-combobox">
              <label className="ticket-label">Vehicle (Plate Number)</label>
              <div className="ticket-search-wrap">
                <SearchIcon className="ticket-search-icon" />
                <input
                  className="ticket-select ticket-vehicle-search-input"
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
                <div className="ticket-vehicle-dropdown">
                  {vehicleSearchResults.length === 0 ? (
                    <div className="ticket-vehicle-dropdown-empty">
                      No matching vehicles
                    </div>
                  ) : (
                    vehicleSearchResults.map((v) => (
                      <div
                        key={v.id}
                        className="ticket-vehicle-dropdown-item"
                        onMouseDown={() => handleSelectVehicle(v)}
                      >
                        <span className="ticket-plate">{v.plate_number}</span>
                        {v.route_detail && (
                          <span className="ticket-vehicle-dropdown-route">
                            {v.route_detail.full_name}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
              {vehicles.length > availableVehicles.length && (
                <p className="ticket-field-hint">
                  {vehicles.length - availableVehicles.length} vehicle(s)
                  excluded (Maintenance / Has Active Ticket).
                </p>
              )}
            </div>

            {/* Ticket Form / Series select */}
            <div className="ticket-field">
              <label className="ticket-label">Ticket Form / Series</label>
              <select
                className="ticket-select"
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
                <p className="ticket-field-hint">
                  No ticket series with stock available. Create a new requisition first.
                </p>
              )}
            </div>

            {/* Quantity */}
            <div className="ticket-field">
              <label className="ticket-label">Quantity</label>
              <input
                type="number"
                className="ticket-select"
                min={1}
                value={ticketQuantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setTicketQuantity(Number.isNaN(val) ? 1 : Math.max(1, val));
                }}
              />
            </div>

            {/* Driver panel */}
            {selectedVehicle && (
              <div className="ticket-driver-panel">
                <div className="ticket-driver-panel-top">
                  <span className="ticket-label">Assigned Driver</span>
                  <button
                    type="button"
                    className="ticket-change-btn"
                    onClick={() => setShowDriverModal(!showDriverModal)}
                  >
                    {showDriverModal ? "Close" : "Change Driver"}
                  </button>
                </div>

                {selectedDriver ? (
                  <div className="ticket-driver-info">
                    <div className="ticket-driver-avatar">
                      {selectedDriver.name.charAt(0)}
                    </div>
                    <div className="ticket-driver-meta">
                      <span className="ticket-driver-name">
                        {selectedDriver.name}
                      </span>
                      <span className="ticket-driver-id">
                        ID: {selectedDriver.id}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="ticket-driver-empty">
                    No driver assigned to this vehicle
                  </p>
                )}

                {selectedDriver && (
                  <div className="ticket-route-pill">
                    <RouteIcon />
                    {selectedVehicle.route_detail?.full_name || "N/A"}
                  </div>
                )}

                {showDriverModal && (
                  <div className="ticket-driver-modal">
                    <label className="ticket-label">
                      Select Active Driver
                    </label>
                    <select
                      className="ticket-select"
                      value={selectedDriver?.id || ""}
                      onChange={(e) =>
                        handleDriverChange(parseInt(e.target.value))
                      }
                    >
                      <option value="">— Choose a driver —</option>
                      {activeDrivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {successMessage && (
              <div className="ticket-alert ticket-alert--success">
                {successMessage}
              </div>
            )}
            {issueError && (
              <div className="ticket-alert ticket-alert--error">
                {issueError}
              </div>
            )}

            <button
              type="button"
              className="ticket-issue-btn"
              onClick={handleIssueTicket}
              disabled={issuingTicket || !selectedVehicle || !selectedDriver || !selectedSeriesId}
            >
              <IssueTicketIcon />
              {issuingTicket
                ? "Issuing…"
                : ticketQuantity > 1
                  ? `Issue ${ticketQuantity} Tickets`
                  : "Issue Ticket"}
            </button>
          </div>
        </div>

        {/* ── Recent Tickets with Tabs ── */}
        <div className="ticket-card">
          <div className="ticket-card-header ticket-card-header--color">
            <div>
              <span className="ticket-card-title">Recent Tickets</span>
              <p className="ticket-card-desc">Last 10 issued tickets</p>
            </div>
            <div className="ticket-search-wrap">
              <SearchIcon className="ticket-search-icon" />
              <input
                className="ticket-search"
                placeholder="Search tickets…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Tab bar */}
          <div className="ticket-tabs">
            <button
              className={`ticket-tab ${activeTab === "tickets" ? "ticket-tab--active" : ""}`}
              onClick={() => setActiveTab("tickets")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Tickets
              {activeTickets.length > 0 && (
                <span className="ticket-tab-count">{activeTickets.length}</span>
              )}
            </button>
            <button
              className={`ticket-tab ${activeTab === "cancelled" ? "ticket-tab--active" : ""}`}
              onClick={() => setActiveTab("cancelled")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
              Cancelled
              {cancelledTickets.length > 0 && (
                <span className="ticket-tab-count">{cancelledTickets.length}</span>
              )}
            </button>
          </div>

          {/* Tickets / Cancelled tab content */}
          {(activeTab === "tickets" || activeTab === "cancelled") && (
            <>
              <div className="ticket-table-wrap">
                <table className="ticket-table">
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
                        <td colSpan={activeTab === "cancelled" ? 6 : 5} className="ticket-table-state">
                          <div className="ticket-loading-dots">
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
                          className="ticket-table-state ticket-table-state--error"
                        >
                          Error: {error}
                        </td>
                      </tr>
                    ) : displayTickets.length === 0 ? (
                      <tr>
                        <td colSpan={activeTab === "cancelled" ? 6 : 5} className="ticket-table-state">
                          <EmptyStateIcon className="ticket-empty-icon" />
                          <span>
                            {activeTab === "cancelled"
                              ? "No cancelled tickets"
                              : "No tickets found"}
                          </span>
                        </td>
                      </tr>
                    ) : (
                      displayTickets.map((t) => (
                        <tr key={t.id} className="ticket-table-row">
                          <td>
                            <span className="ticket-id-badge">{t.id.replace(/^TICKET-/i, '')}</span>
                          </td>
                          <td>
                            {t.vehicle?.plate_number ? (
                              <span className="ticket-plate">
                                {t.vehicle.plate_number}
                              </span>
                            ) : (
                              <span className="ticket-na">N/A</span>
                            )}
                          </td>
                          <td className="ticket-td-name">
                            {t.driver?.name || (
                              <span className="ticket-na">N/A</span>
                            )}
                          </td>
                          <td className="ticket-td-name">
                            {t.active_user_name || (
                              <span className="ticket-na">N/A</span>
                            )}
                          </td>
                          <td className="ticket-td-time">
                            {formatTime(t.issued_at)}
                          </td>
                          {activeTab === "cancelled" && (
                            <td>
                              {t.reason || <span className="ticket-na">N/A</span>}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="ticket-card-footer">
                <a href="/dashboard/Reports" className="ticket-history-link">
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

export default Ticket;
