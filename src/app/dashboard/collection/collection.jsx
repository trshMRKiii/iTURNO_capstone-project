import React, { useState } from "react";
import {
  useCollection,
  formatTime,
  getTodayDateString,
} from "./useCollection";
import { getTicketDisplayId } from "../queue/useQueue";
import "../../../styles/Collection.css";

function Collection() {
  const {
    tickets,
    page,
    setPage,
    totalPages,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    startDate,
    endDate,
    setStartDate,
    setEndDate,

    roamingTickets,
    roamingPage,
    setRoamingPage,
    roamingTotalPages,
    roamingLoading,
    roamingError,
    roamingSearch,
    setRoamingSearch,
  } = useCollection();

  const today = getTodayDateString(new Date());
  const [activeTab, setActiveTab] = useState("collection");
  const activeError = activeTab === "collection" ? error : roamingError;

  return (
    <div className="col-page">
      {/* Header */}
      <div className="col-header">
        <div className="col-header-left">
          <div className="col-header-accent" />
          <div>
            <h1 className="col-title">Tally &amp; Collections</h1>
            <p className="col-subtitle">
              Automated revenue recording
            </p>
          </div>
        </div>
      </div>

      {activeError && (
        <div className="col-alert col-alert--error">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {activeError}
        </div>
      )}

        {/* ── Right: Tabbed Logs ── */}
        <div className="col-card col-log-card">
          {/* Tab bar */}
          <div className="col-tabs">
            <button
              className={`col-tab ${activeTab === "collection" ? "col-tab--active" : ""}`}
              onClick={() => setActiveTab("collection")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Collection Log
            </button>
            <button
              className={`col-tab ${activeTab === "roaming" ? "col-tab--active" : ""}`}
              onClick={() => setActiveTab("roaming")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Roaming Vehicle Log
            </button>
          </div>

          {/* Date range applies to both tabs — they read from the same fetch.
              Left empty, it's no filter at all: the full history, paginated. */}
          <div className="col-date-bar">
            <div className="col-date-field">
              <label className="col-date-label">From</label>
              <input
                type="date"
                className="col-date-input"
                value={startDate}
                max={endDate || today}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="col-date-field">
              <label className="col-date-label">To</label>
              <input
                type="date"
                className="col-date-input"
                value={endDate}
                min={startDate || undefined}
                max={today}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {(startDate || endDate) && (
              <button
                type="button"
                className="col-date-clear"
                onClick={() => { setStartDate(""); setEndDate(""); }}
              >
                Clear
              </button>
            )}
          </div>

          {/* ── Collection Log Tab ── */}
          {activeTab === "collection" && (
            <>
              <div className="col-card-header col-card-header--color col-log-header">
                <div>
                  <span className="col-card-title">Collection Log</span>
                  <p className="col-card-desc">
                    Recent collections and verification status
                  </p>
                </div>
                <div className="col-search-wrap">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="col-search-icon"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    className="col-search"
                    placeholder="Search tickets…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="col-table-wrap">
                <table className="col-table">
                  <thead>
                    <tr>
                      {[
                        "Ticket ID",
                        "Time",
                        "Vehicle",
                        "Driver",
                        "Issued By",
                        "Verified",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="6" className="col-table-state">
                          <div className="col-loading-dots">
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
                          className="col-table-state col-table-state--error"
                        >
                          Error: {error}
                        </td>
                      </tr>
                    ) : tickets.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="col-table-state">
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            opacity="0.3"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span>No records found</span>
                        </td>
                      </tr>
                    ) : (
                      tickets.map((ticket) => (
                        <tr key={ticket.id} className="col-table-row">
                            <td>
                              <span className="col-id-badge">{getTicketDisplayId(ticket)}</span>
                            </td>
                            <td className="col-td-time">
                              {formatTime(ticket.issued_at)}
                            </td>
                            <td>
                              {ticket.vehicle?.plate_number ? (
                                <span className="col-plate">
                                  {ticket.vehicle.plate_number}
                                </span>
                              ) : (
                                <span className="col-na">N/A</span>
                              )}
                            </td>
                            <td className="col-td-name">
                              {ticket.driver?.name || (
                                <span className="col-na">N/A</span>
                              )}
                            </td>
                            <td className="col-td-name">
                              {ticket.active_user_name || (
                                <span className="col-na">N/A</span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`col-verified ${
                                  ticket.status === "CANCELLED"
                                    ? "col-verified--cancelled"
                                    : "col-verified--yes"
                                }`}
                              >
                                {ticket.status === "CANCELLED"
                                  ? "✗ Cancelled"
                                  : "✓ Collected"}
                              </span>
                            </td>
                          </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="col-pagination">
                  <span className="col-pagination-info">
                    Page {page} of {totalPages}
                  </span>
                  <div className="col-pagination-btns">
                    <button
                      className="col-page-btn"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      ← Prev
                    </button>
                    <button
                      className="col-page-btn"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Roaming Vehicle Log Tab ── */}
          {activeTab === "roaming" && (
            <>
              <div className="col-card-header col-card-header--color col-log-header">
                <div>
                  <span className="col-card-title">Roaming Vehicle Log</span>
                  <p className="col-card-desc">
                    Tickets issued to roaming vehicles that unload passengers
                  </p>
                </div>
                <div className="col-search-wrap">
                  <svg
                    width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" className="col-search-icon"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    className="col-search"
                    placeholder="Search tickets…"
                    value={roamingSearch}
                    onChange={(e) => setRoamingSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="col-table-wrap">
                <table className="col-table">
                  <thead>
                    <tr>
                      {[
                        "Ticket ID",
                        "Time",
                        "Vehicle",
                        "Driver",
                        "Issued By",
                        "Verified",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roamingLoading ? (
                      <tr>
                        <td colSpan="6" className="col-table-state">
                          <div className="col-loading-dots"><div /><div /><div /></div>
                        </td>
                      </tr>
                    ) : roamingError ? (
                      <tr>
                        <td colSpan="6" className="col-table-state col-table-state--error">
                          Error: {roamingError}
                        </td>
                      </tr>
                    ) : roamingTickets.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="col-table-state">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>No roaming tickets found</span>
                        </td>
                      </tr>
                    ) : (
                      roamingTickets.map((ticket) => (
                        <tr key={ticket.id} className="col-table-row">
                          <td>
                            <span className="col-id-badge">{getTicketDisplayId(ticket)}</span>
                          </td>
                          <td className="col-td-time">
                            {formatTime(ticket.issued_at)}
                          </td>
                          <td>
                            {ticket.vehicle?.plate_number ? (
                              <span className="col-plate">
                                {ticket.vehicle.plate_number}
                              </span>
                            ) : (
                              <span className="col-na">N/A</span>
                            )}
                          </td>
                          <td className="col-td-name">
                            {ticket.driver?.name || (
                              <span className="col-na">N/A</span>
                            )}
                          </td>
                          <td className="col-td-name">
                            {ticket.active_user_name || (
                              <span className="col-na">N/A</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`col-verified ${
                                ticket.status === "CANCELLED"
                                  ? "col-verified--cancelled"
                                  : "col-verified--yes"
                              }`}
                            >
                              {ticket.status === "CANCELLED"
                                ? "✗ Cancelled"
                                : "✓ Collected"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {roamingTotalPages > 1 && (
                <div className="col-pagination">
                  <span className="col-pagination-info">
                    Page {roamingPage} of {roamingTotalPages}
                  </span>
                  <div className="col-pagination-btns">
                    <button className="col-page-btn" disabled={roamingPage === 1} onClick={() => setRoamingPage((p) => p - 1)}>
                      ← Prev
                    </button>
                    <button className="col-page-btn" disabled={roamingPage >= roamingTotalPages} onClick={() => setRoamingPage((p) => p + 1)}>
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

    </div>
  );
}

export default Collection;
