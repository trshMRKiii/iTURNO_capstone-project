import React, { useState, useEffect } from "react";
import { useQueue } from "./useQueue";
import Dispatch from "../dispatch/dispatch";
import { useDeskDuty } from "../dispatch/useDeskDuty";
import SeriesPicker from "./SeriesPicker";
import TicketRecipes from "./TicketRecipes";
import { SupervisorPicker } from "../../../components/ui/kit";
import { getIwpStatus, getExpiryStatus } from "../driver/driver-utils";
import "../../../styles/Queue.css";
import { RouteIcon, SearchIcon } from "./queueIcon";

// Supervisor and Manager are one position under two titles; they and the admin assign the desk personnel.
const DESK_ASSIGNERS = ["SUPERADMIN", "SUPERVISOR", "MANAGER"];

function Queue({ userRole }) {
  const {
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

    availableVehicles,
    activeDrivers,
    availableSeries,
    allSeries,
    forms,
    exhaustedLabel,
    setSeriesOverrideId,
    selectedSeriesId,
    setSelectedSeriesId,
    issuePlan,
    ticketFee,
    selectVehicleById,
    handleDriverChange,
    handleIssueTicket,
    driverHasActiveTicket,
  } = useQueue(userRole);

  const desk = useDeskDuty(selectedSeriesId);
  const canAssignDesk = DESK_ASSIGNERS.includes(userRole);
  // What the Issue button hands out: the vehicle's recipe, or the single series.
  const ticketCount = issuePlan(desk.recipes).reduce((n, row) => n + row.quantity, 0);
  // Every fare in use, one recipe slot each.
  const farePrices = [...new Set(vehicles.map((v) => Number(v.terminal_price || 0)).filter(Boolean))].sort((a, b) => a - b);
  // Whoever takes a vehicle in is accountable for it; a roam is in and out at once, so it needs both.
  const missingPersonnel = !desk.checkinId
    ? "A supervisor or admin needs to pick the check-in personnel in Shift setup first."
    : issuanceType === "ROAM" && !desk.checkoutId
      ? "A supervisor or admin needs to pick the check-out personnel in Shift setup first."
      : "";

  const [recipesOpen, setRecipesOpen] = useState(false);
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

  const driverBusy = driverHasActiveTicket(selectedDriver);

  // Ticket issuance clears the selected vehicle/driver in the hook, but the
  // plate/driver search inputs are local text state here — clear them too so
  // the fields are ready for the next entry instead of showing stale text.
  useEffect(() => {
    if (successMessage) {
      setVehicleSearch("");
      setDriverSearch("");
    }
  }, [successMessage]);


  const unavailable = (status) => vehicles.filter((v) => v.status === status).length;

  const issueForm = (
    <>
            {/* Vehicle search / select */}
            <div className="queue-field queue-vehicle-combobox">
              <label className="queue-label">Plate Number</label>
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
                  {vehicles.length - availableVehicles.length} not available —{" "}
                  {unavailable("QUEUED")} already in line, {unavailable("MAINTENANCE")} in maintenance.
                </p>
              )}
            </div>

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

                {driverBusy && (
                  <div className="queue-alert queue-alert--error">
                    This driver already has an active ticket.
                  </div>
                )}

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
                    <span className={`queue-iwp-badge queue-iwp-badge--${getIwpStatus(selectedDriver)}`}>
                      {{ valid: "✓ IWP valid", expired: "✕ IWP expired", none: "IWP expiry not set" }[getIwpStatus(selectedDriver)]}
                    </span>
                  </div>
                ) : (
                  <p className="queue-driver-empty">
                    No driver assigned to this vehicle
                  </p>
                )}

                <div className="queue-driver-info">
                  <span className="queue-label">Franchise</span>
                  <span className={`queue-iwp-badge queue-iwp-badge--${getExpiryStatus(selectedVehicle.franchise_expiration_date)}`}>
                    {{ valid: "✓ Franchise valid", expired: "✕ Franchise expired", none: "Franchise expiry not set" }[getExpiryStatus(selectedVehicle.franchise_expiration_date)]}
                  </span>
                </div>

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
            {missingPersonnel && selectedVehicle && (
              <div className="queue-alert queue-alert--error">{missingPersonnel}</div>
            )}

            <button
              type="button"
              className="queue-issue-btn"
              onClick={() => handleIssueTicket(desk.recipes)}
              disabled={
                issuingTicket ||
                !selectedVehicle ||
                !selectedDriver ||
                driverBusy ||
                !!missingPersonnel ||
                (issuanceType === "ROAM" && !selectedSeriesId)
              }
            >
              {issuingTicket
                ? "Issuing…"
                : !selectedVehicle
                  ? "Pick a vehicle to continue"
                  : issuanceType === "ROAM" && ticketCount > 1
                  ? `Issue ${ticketCount} Tickets`
                  : issuanceType === "ROAM"
                    ? "Issue Ticket"
                    : "Check In Vehicle"}
            </button>
    </>
  );

  const modes = [
    { type: "QUEUE", title: "Queue", sub: "Turno" },
    { type: "ROAM", title: "Roaming", sub: "Payasyas" },
  ];

  return (
    <div className="queue-page">
      {/* ── Page Header ── */}
      <div className="queue-header">
        <div className="queue-header-left">
          <div>
            <h1 className="queue-title">Queue Management</h1>
          </div>
        </div>
        <div className="queue-header-right">
          <button
            type="button"
            className="dashboard-scan-btn"
            onClick={() => window.open("/public-view", "_blank", "noopener,noreferrer")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Public View
          </button>
          <button
            type="button"
            className="dashboard-scan-btn"
            // No "noopener": the kiosk tab inherits this tab's sessionStorage, which holds the login it needs.
            onClick={() => window.open("/kiosk", "_blank")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="12" x2="17" y2="12" />
            </svg>
            QR Kiosk
          </button>
        </div>
      </div>

      <div className="queue-single-col">
        <div className="queue-top">
          <section className="queue-mode">
            <div className="queue-card-head">
              <h2 className="queue-card-title">Check in a vehicle</h2>
            </div>
            {/* Mode switch — Roaming issues cash tickets from the series in Shift setup. */}
            <div className="queue-mode-switch" role="tablist" aria-label="Issuance mode">
              {modes.map(({ type, title, sub }) => (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={issuanceType === type}
                  className={`queue-mode-tab queue-mode-tab--${type.toLowerCase()}${issuanceType === type ? " is-active" : ""}`}
                  onClick={() => setIssuanceType(type)}
                >
                  {title} - <em>{sub}</em>
                </button>
              ))}
            </div>
            <div className="queue-mode-body">
              {issueForm}
            </div>
          </section>

          <section className="queue-shift">
            <h2 className="queue-card-title">Shift setup</h2>
            {/* Mix Values swaps the default series for the fare recipes. */}
            {recipesOpen ? (
              <TicketRecipes
                prices={farePrices}
                denominations={availableSeries}
                allSeries={allSeries}
                defaultSeries={availableSeries.find((s) => String(s.id) === String(selectedSeriesId))}
                forms={forms}
                recipes={desk.recipes}
                onSave={desk.setRecipes}
                onClose={() => setRecipesOpen(false)}
                disabled={!canAssignDesk}
              />
            ) : (
              <SeriesPicker
                availableSeries={availableSeries}
                allSeries={allSeries}
                selectedSeriesId={selectedSeriesId}
                setSelectedSeriesId={setSelectedSeriesId}
                setSeriesOverrideId={setSeriesOverrideId}
                onMix={() => setRecipesOpen(true)}
                exhaustedLabel={exhaustedLabel}
                pickExact
              />
            )}
            <label className="queue-shift-field">
              <span className="queue-label">Check-in personnel</span>
              <SupervisorPicker
                className="queue-shift-input"
                label="Check-in personnel"
                supervisors={desk.personnel}
                disabled={!canAssignDesk}
                value={desk.checkinId}
                onChange={desk.setCheckin}
              />
            </label>
            <label className="queue-shift-field">
              <span className="queue-label">Check-out personnel</span>
              <SupervisorPicker
                className="queue-shift-input"
                label="Check-out personnel"
                supervisors={desk.personnel}
                disabled={!canAssignDesk}
                value={desk.checkoutId}
                onChange={desk.setCheckout}
              />
            </label>
          </section>
        </div>

        <Dispatch seriesId={selectedSeriesId} ticketFee={ticketFee} />
      </div>

    </div>
  );
}

export default Queue;
