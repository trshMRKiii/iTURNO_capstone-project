import React, { useState } from "react";
import {
  useCollection,
  formatTime,
  formatCurrency,
} from "../../../lib/collection/useCollection";
import "../../../styles/Collection.css";

function Collection({ userRole }) {
  const {
    tickets,
    filteredTickets,
    searchTerm,
    loading,
    error,
    todayStats,
    verifyingAll,
    verifyingTicketId,
    verifyingOverride,
    unverifiedTickets,
    successMessage,
    setSearchTerm,
    handleVerifyAllPending,
    handleVerifyTicket,
    handleVerifyAllOverride,
  } = useCollection(userRole);

  const [activeTab, setActiveTab] = useState("collection");
  const [currentPage, setCurrentPage] = useState(1);
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  const [roamingPage, setRoamingPage] = useState(1);
  const [roamingSearch, setRoamingSearch] = useState("");

  // Roaming vehicles are tickets issued with mode "UNLOAD" (see ticket.jsx issuance flow)
  const roamingTickets = tickets.filter((t) => t.mode === "UNLOAD");

  const filteredRoamingLogs = roamingTickets
    .filter((t) => {
      const term = roamingSearch.toLowerCase();
      return (
        t.id.toLowerCase().includes(term) ||
        (t.vehicle?.plate_number || "").toLowerCase().includes(term) ||
        (t.driver?.name || "").toLowerCase().includes(term) ||
        (t.active_user_name || "").toLowerCase().includes(term)
      );
    })
    .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));

  // Roaming tickets have their own tab (see above) so exclude them here to avoid duplicates.
  const collectionOnlyTickets = filteredTickets.filter((t) => t.mode !== "UNLOAD");

  const rowsPerPage = 15;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentTickets = collectionOnlyTickets.slice(startIndex, endIndex);
  const totalPages = Math.ceil(collectionOnlyTickets.length / rowsPerPage);

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
        <button
          type="button"
          className="col-override-btn"
          onClick={() => setShowOverrideModal(true)}
        >
          ⚠ Override Verify
        </button>
      </div>

      {error && (
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
          {error}
        </div>
      )}

      {successMessage && (
        <div className="col-alert col-alert--success">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {successMessage}
        </div>
      )}

      {todayStats && (
        <div className="col-card" style={{ marginBottom: 16 }}>
          <div className="col-card-header col-card-header--color">
            <div>
              <span className="col-card-title">Today's Collection</span>
              <p className="col-card-desc">Revenue and verification status for today</p>
            </div>
          </div>
          <div className="bc-body">
            <div className="bc-rows">
              {[
                { label: "Revenue", value: formatCurrency(todayStats.total) },
                { label: "Active Dispatches", value: todayStats.count },
                {
                  label: "Pending Verification",
                  value: todayStats.pending,
                  warn: todayStats.pending > 0,
                },
              ].map(({ label: l, value, warn }) => (
                <div key={l} className="bc-row">
                  <span className="bc-row-label">{l}</span>
                  <span className={`bc-row-value ${warn ? "bc-row-value--warn" : ""}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="bc-verify-btn"
              onClick={handleVerifyAllPending}
              disabled={verifyingAll || todayStats.pending === 0 || userRole === "MANAGER"}
            >
              {verifyingAll ? "Verifying…" : "Verify All Pending"}
            </button>
          </div>
        </div>
      )}

        {/* ── Right: Tabbed Logs ── */}
        <div className="col-card col-log-card">
          {/* Tab bar */}
          <div className="col-tabs">
            <button
              className={`col-tab ${activeTab === "collection" ? "col-tab--active" : ""}`}
              onClick={() => { setActiveTab("collection"); setCurrentPage(1); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Collection Log
            </button>
            <button
              className={`col-tab ${activeTab === "roaming" ? "col-tab--active" : ""}`}
              onClick={() => { setActiveTab("roaming"); setRoamingPage(1); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Roaming Vehicle Log
            </button>
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
                    ) : collectionOnlyTickets.length === 0 ? (
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
                      currentTickets.map((ticket) => (
                        <tr key={ticket.id} className="col-table-row">
                            <td>
                              <span className="col-id-badge">{ticket.id.replace(/^TICKET-/i, '')}</span>
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
                                    : ticket.is_verified
                                      ? "col-verified--yes"
                                      : "col-verified--pending"
                                }`}
                              >
                                {ticket.status === "CANCELLED"
                                  ? "✗ Cancelled"
                                  : ticket.is_verified
                                    ? "✓ Verified"
                                    : "○ Pending"}
                              </span>
                            </td>
                          </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {collectionOnlyTickets.length > rowsPerPage && (
                <div className="col-pagination">
                  <span className="col-pagination-info">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="col-pagination-btns">
                    <button
                      className="col-page-btn"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                    >
                      ← Prev
                    </button>
                    <button
                      className="col-page-btn"
                      disabled={endIndex >= collectionOnlyTickets.length}
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Roaming Vehicle Log Tab ── */}
          {activeTab === "roaming" && (() => {
            const roamingStart = (roamingPage - 1) * rowsPerPage;
            const roamingEnd = roamingStart + rowsPerPage;
            const currentRoaming = filteredRoamingLogs.slice(roamingStart, roamingEnd);
            const roamingTotalPages = Math.ceil(filteredRoamingLogs.length / rowsPerPage);
            return (
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
                      {loading ? (
                        <tr>
                          <td colSpan="6" className="col-table-state">
                            <div className="col-loading-dots"><div /><div /><div /></div>
                          </td>
                        </tr>
                      ) : currentRoaming.length === 0 ? (
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
                        currentRoaming.map((ticket) => (
                          <tr key={ticket.id} className="col-table-row">
                            <td>
                              <span className="col-id-badge">{ticket.id.replace(/^TICKET-/i, '')}</span>
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
                                    : ticket.is_verified
                                      ? "col-verified--yes"
                                      : "col-verified--pending"
                                }`}
                              >
                                {ticket.status === "CANCELLED"
                                  ? "✗ Cancelled"
                                  : ticket.is_verified
                                    ? "✓ Verified"
                                    : "○ Pending"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredRoamingLogs.length > rowsPerPage && (
                  <div className="col-pagination">
                    <span className="col-pagination-info">
                      Page {roamingPage} of {roamingTotalPages}
                    </span>
                    <div className="col-pagination-btns">
                      <button className="col-page-btn" disabled={roamingPage === 1} onClick={() => setRoamingPage((p) => p - 1)}>
                        ← Prev
                      </button>
                      <button className="col-page-btn" disabled={roamingEnd >= filteredRoamingLogs.length} onClick={() => setRoamingPage((p) => p + 1)}>
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

      {showOverrideModal && (
        <div className="col-overlay" onClick={() => setShowOverrideModal(false)}>
          <div className="col-modal" onClick={(e) => e.stopPropagation()}>
            <div className="col-modal-header">
              <div>
                <h2 className="col-modal-title">Manual Verification Override</h2>
                <p className="col-modal-subtitle">
                  Force-verify tickets that failed to verify automatically, from any
                  date and regardless of role. Use only to recover from system errors.
                </p>
              </div>
              <button
                type="button"
                className="col-modal-close"
                onClick={() => setShowOverrideModal(false)}
              >
                ×
              </button>
            </div>
            <div className="col-modal-body">
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: 12,
                }}
              >
                <button
                  type="button"
                  className="col-action-btn"
                  onClick={handleVerifyAllOverride}
                  disabled={verifyingOverride || unverifiedTickets.length === 0}
                >
                  {verifyingOverride
                    ? "Verifying…"
                    : `Verify All (${unverifiedTickets.length})`}
                </button>
              </div>

              <div className="col-table-wrap">
                <table className="col-table">
                  <thead>
                    <tr>
                      {["Ticket ID", "Time", "Vehicle", "Driver", "Issued By", ""].map(
                        (h) => (
                          <th key={h}>{h}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {unverifiedTickets.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="col-table-state">
                          <span>No unverified tickets — everything is caught up.</span>
                        </td>
                      </tr>
                    ) : (
                      unverifiedTickets.map((ticket) => (
                        <tr key={ticket.id} className="col-table-row">
                          <td>
                            <span className="col-id-badge">
                              {ticket.id.replace(/^TICKET-/i, "")}
                            </span>
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
                            <button
                              type="button"
                              className="col-action-btn"
                              onClick={() => handleVerifyTicket(ticket.id)}
                              disabled={verifyingTicketId === ticket.id}
                            >
                              {verifyingTicketId === ticket.id
                                ? "Verifying…"
                                : "Verify"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Collection;
