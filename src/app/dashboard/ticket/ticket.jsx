import React, { useState } from "react";
import { useTicket, formatTime } from "../../../lib/useTicket";
import LateTicketIssue from "../../../lib/ticket/lateTicketIssue";
import TicketStatusBadge from "../../../lib/ticket/ticketStatusBadge";
import "../../../styles/Ticket.css";
import {
  HistoryIcon,
  RouteIcon,
  IssueTicketIcon,
  LateIssueIcon,
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

    availableVehicles,
    activeDrivers,
    availableSeries,
    selectedSeriesId,
    setSelectedSeriesId,
    handleVehicleChange,
    handleDriverChange,
    handleIssueTicket,

    ticketFee,
  } = useTicket(userRole);

  const [isLateTicketModalOpen, setIsLateTicketModalOpen] = useState(false);

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

      {/* ── Main Grid: left column (Issue + Late), right column (Recent Tickets) ── */}
      <div className="ticket-grid">
        {/* ── LEFT COLUMN ── */}
        <div className="ticket-col">
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
              {/* Vehicle select */}
              <div className="ticket-field">
                <label className="ticket-label">Vehicle (Plate Number)</label>
                <select
                  className="ticket-select"
                  value={selectedVehicle?.id || ""}
                  onChange={handleVehicleChange}
                >
                  <option value="">— Select a vehicle —</option>
                  {availableVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate_number}
                      {v.route_detail ? ` — ${v.route_detail.full_name}` : ""}
                    </option>
                  ))}
                </select>
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
                {issuingTicket ? "Issuing…" : "Issue Ticket"}
              </button>
            </div>
          </div>

          {/* Late Issue Ticket Card — separate card, outside Issue card */}
          <div className="ticket-card">
            <div className="ticket-card-header ticket-card-header--color ticket-card-header--late">
              <div>
                <span className="ticket-card-title">Late Issue Ticket</span>
                <p className="ticket-card-desc">
                  Issue tickets for past dates with batch selection.
                </p>
              </div>
              <span className="ticket-late-badge">Past Date</span>
            </div>

            <div className="ticket-card-body">
              <p className="ticket-card-desc">
                Use this form to issue tickets for past dates. Select the date,
                batch, vehicle, and driver to create a late ticket record.
              </p>
              <button
                type="button"
                className="ticket-issue-btn ticket-issue-btn--outline"
                onClick={() => setIsLateTicketModalOpen(true)}
              >
                <LateIssueIcon />
                Open Late Ticket Form
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN — Recent Tickets ── */}
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

          <div className="ticket-table-wrap">
            <table className="ticket-table">
              <thead>
                <tr>
                  {["Ticket ID", "Plate Number", "Driver", "Issued By", "Time", "Status"].map(
                    (h) => (
                      <th key={h}>{h}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="ticket-table-state">
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
                      colSpan="6"
                      className="ticket-table-state ticket-table-state--error"
                    >
                      Error: {error}
                    </td>
                  </tr>
                ) : filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="ticket-table-state">
                      <EmptyStateIcon className="ticket-empty-icon" />
                      <span>No tickets found</span>
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((t) => (
                    <tr key={t.id} className="ticket-table-row">
                      <td>
                        <span className="ticket-id-badge">#{t.id}</span>
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
                      <td>
                        <TicketStatusBadge ticket={t} />
                      </td>
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
        </div>
      </div>

      {/* ── Late Ticket Modal ── */}
      {isLateTicketModalOpen && (
        <LateTicketIssue
          vehicles={vehicles}
          drivers={drivers}
          ticketFee={ticketFee}
          onClose={() => setIsLateTicketModalOpen(false)}
        />
      )}
    </div>
  );
}

export default Ticket;
