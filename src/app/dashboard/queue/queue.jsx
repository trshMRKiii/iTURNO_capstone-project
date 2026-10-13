import React, { useState, useEffect, useRef } from "react";
import { useQueue } from "./useQueue";
import Dispatch from "../dispatch/dispatch";
import SeriesPicker from "./SeriesPicker";
import { useScanChannel } from "../../../lib/useScanChannel";
import { getIwpStatus, getExpiryStatus } from "../driver/driver-utils";
import "../../../styles/Queue.css";
import { RouteIcon, SearchIcon } from "./queueIcon";

function Queue({ userRole }) {
  const scannedPlate = useRef(null); // plate awaiting check-in after a scan
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
    setSeriesOverrideId,
    selectedSeriesId,
    setSelectedSeriesId,
    ticketQuantity,
    selectVehicleById,
    handleDriverChange,
    handleIssueTicket,
    driverHasActiveTicket,
    fetchTicketSeries,
  } = useQueue(userRole);

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

  // A QR read by the /scan camera tab selects the
  // vehicle here; the operator then checks in. The camera tab is only told about
  // a pending vehicle and a successful check-in — never errors.
  const postToCamera = useScanChannel((msg) => {
    if (msg.type === "scan") handleScannedText(msg.text);
  });

  function handleScannedText(text) {
    const vehicle = vehicles.find(
      (v) =>
        v.qr_code === text || v.plate_number === text || String(v.id) === text,
    );
    if (vehicle?.status === "AVAILABLE" && !issuingTicket) {
      handleSelectVehicle(vehicle);
      scannedPlate.current = vehicle.plate_number;
      postToCamera({
        type: "pending",
        plate: vehicle.plate_number,
        franchiseExpired: getExpiryStatus(vehicle.franchise_expiration_date) === "expired",
      });
    }
  }

  // The driver is assigned after the scan, so tell the camera tab once it is known
  // whether the permit is expired — flags only, never the driver's name.
  useEffect(() => {
    if (scannedPlate.current && selectedDriver) {
      postToCamera({
        type: "pending",
        plate: scannedPlate.current,
        iwpExpired: getIwpStatus(selectedDriver) === "expired",
        franchiseExpired: getExpiryStatus(selectedVehicle?.franchise_expiration_date) === "expired",
      });
    }
  }, [selectedDriver, selectedVehicle]); // eslint-disable-line react-hooks/exhaustive-deps

  const driverBusy = driverHasActiveTicket(selectedDriver);

  const handleCheckIn = async () => {
    const vehicle = selectedVehicle;
    scannedPlate.current = null;
    const { ticket } = await handleIssueTicket();
    if (ticket) {
      postToCamera({
        type: "result",
        mode: issuanceType,
        plate: vehicle.plate_number,
        queueCode: ticket.queue_code,
        ticketId: ticket.id,
        at: ticket.issued_at,
      });
    }
  };

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

            <button
              type="button"
              className="queue-issue-btn"
              onClick={handleCheckIn}
              disabled={
                issuingTicket ||
                !selectedVehicle ||
                !selectedDriver ||
                driverBusy ||
                (issuanceType === "ROAM" && !selectedSeriesId)
              }
            >
              {issuingTicket
                ? "Issuing…"
                : !selectedVehicle
                  ? "Pick a vehicle to continue"
                  : issuanceType === "ROAM" && ticketQuantity > 1
                  ? `Issue ${ticketQuantity} Tickets`
                  : issuanceType === "ROAM"
                    ? "Issue Ticket"
                    : "Check In Vehicle"}
            </button>
    </>
  );

  const modes = [
    { type: "QUEUE", title: "Queue", sub: "Turno", other: "Roaming" },
    { type: "ROAM", title: "Roaming", sub: "Payasyas", other: "Queue" },
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
            onClick={() => window.open("/scan", "_blank", "noopener,noreferrer")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="12" x2="17" y2="12" />
            </svg>
            QR Camera
          </button>
        </div>
      </div>

      <div className="queue-single-col">
        <div className="queue-modes">
          {modes.map(({ type, title, sub, other }) => {
            const active = issuanceType === type;
            return (
              <section
                key={type}
                className={`queue-mode${active ? " queue-mode--active" : " queue-mode--off"}`}
              >
                <h2 className="queue-mode-title">
                  {title} - <em>{sub}</em>
                </h2>
                {active ? (
                  <div className="queue-mode-body">
                    {type === "ROAM" && (
                      <SeriesPicker
                        availableSeries={availableSeries}
                        allSeries={allSeries}
                        selectedSeriesId={selectedSeriesId}
                        setSelectedSeriesId={setSelectedSeriesId}
                        setSeriesOverrideId={setSeriesOverrideId}
                      />
                    )}
                    {issueForm}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="queue-mode-off"
                    onClick={() => setIssuanceType(type)}
                  >
                    <span className="queue-mode-off-note">Off while {other} is active — click to switch</span>
                  </button>
                )}
              </section>
            );
          })}
        </div>

        {/* ── Dispatch board (queued vehicles) ── */}
        <Dispatch
          availableSeries={availableSeries}
          allSeries={allSeries}
          setSeriesOverrideId={setSeriesOverrideId}
          selectedSeriesId={selectedSeriesId}
          setSelectedSeriesId={setSelectedSeriesId}
          onStockChange={fetchTicketSeries}
        />
      </div>

    </div>
  );
}

export default Queue;
