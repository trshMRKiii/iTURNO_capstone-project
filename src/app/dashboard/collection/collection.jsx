import React, { useState, useEffect, useCallback } from "react";
import {
  useCollection,
  formatTime,
  BatchCard,
} from "../../../lib/collection/useCollection";
import { OperationsService } from "../../../lib/operations-service";
import { useShifts } from "../../../lib/useShifts";
import { apiService } from "../../../lib/api-service";
import "../../../styles/Collection.css";

function Collection({ userRole }) {
  const {
    shifts,
    loading: shiftsLoading,
    error: shiftsError,
  } = useShifts();
  const {
    tickets,
    filteredTickets,
    searchTerm,
    loading,
    error,
    batchStats,
    verifyingBatch,
    verifyingTicketId,
    successMessage,
    setSearchTerm,
    handleVerifyBatch,
    handleVerifyTicket,
    isBatchVerifiable,
    isBatchEnded,
  } = useCollection(shifts);

  const [activeTab, setActiveTab] = useState("collection");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUnverifiedModalOpen, setIsUnverifiedModalOpen] = useState(false);
  const [confirmingBatchKey, setConfirmingBatchKey] = useState(null);

  const [roamingLogs, setRoamingLogs] = useState([]);
  const [roamingLoading, setRoamingLoading] = useState(false);
  const [roamingPage, setRoamingPage] = useState(1);
  const [roamingSearch, setRoamingSearch] = useState("");
  const [isRoamingModalOpen, setIsRoamingModalOpen] = useState(false);
  const [roamingForm, setRoamingForm] = useState({ vehicle: "", driver: "", notes: "" });
  const [roamingSubmitting, setRoamingSubmitting] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);

  const fetchRoamingLogs = useCallback(async () => {
    try {
      setRoamingLoading(true);
      const data = await apiService.getRoamingLogs();
      setRoamingLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch roaming logs", err);
    } finally {
      setRoamingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "roaming") {
      fetchRoamingLogs();
    }
  }, [activeTab, fetchRoamingLogs]);

  const handleOpenRoamingModal = async () => {
    try {
      const [v, d] = await Promise.all([apiService.getVehicles(), apiService.getDrivers()]);
      setVehicles(Array.isArray(v) ? v : []);
      setDrivers(Array.isArray(d) ? d : []);
    } catch (err) {
      console.error("Failed to load vehicles/drivers", err);
    }
    setRoamingForm({ vehicle: "", driver: "", notes: "" });
    setIsRoamingModalOpen(true);
  };

  const handleSubmitRoaming = async () => {
    if (!roamingForm.vehicle) return;
    try {
      setRoamingSubmitting(true);
      await apiService.createRoamingLog({
        vehicle: Number(roamingForm.vehicle),
        driver: roamingForm.driver ? Number(roamingForm.driver) : null,
        notes: roamingForm.notes,
      });
      setIsRoamingModalOpen(false);
      fetchRoamingLogs();
    } catch (err) {
      console.error("Failed to create roaming log", err);
    } finally {
      setRoamingSubmitting(false);
    }
  };

  const filteredRoamingLogs = roamingLogs.filter((log) => {
    const term = roamingSearch.toLowerCase();
    return (
      (log.vehicle_plate || "").toLowerCase().includes(term) ||
      (log.driver_name || "").toLowerCase().includes(term) ||
      (log.recorded_by_name || "").toLowerCase().includes(term) ||
      (log.notes || "").toLowerCase().includes(term)
    );
  });

  const rowsPerPage = 15;
  const unverifiedTickets = tickets.filter(
    (t) => !t.is_verified && t.status !== "CANCELLED",
  );
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentTickets = filteredTickets.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredTickets.length / rowsPerPage);

  const handleVerifyBatchWithConfirm = (batchKey) => {
    setConfirmingBatchKey(batchKey);
  };

  const confirmBatchVerification = () => {
    if (confirmingBatchKey) {
      handleVerifyBatch(confirmingBatchKey);
      setConfirmingBatchKey(null);
    }
  };

  const batchKeys = Object.keys(shifts || {});

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

      {(error || shiftsError) && (
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
          {error || shiftsError}
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

      <div className="col-grid">
        {/* ── Left: Shift Tally ── */}
        <div className="col-tally">
          {batchKeys.length > 0 ? (
            batchKeys.map((key) => {
              const shift = shifts[key];
              return (
                <BatchCard
                  key={key}
                  label={`${shift.name} — ${shift.label}`}
                  stats={batchStats?.[key]}
                  batchKey={shift.name}
                  onVerify={handleVerifyBatchWithConfirm}
                  verifyingBatch={verifyingBatch}
                  userRole={userRole}
                  isBatchEnded={isBatchEnded(shift.name)}
                />
              );
            })
          ) : (
            <div className="col-shift-loading">
              {shiftsLoading
                ? "Loading schedule..."
                : "No shift configuration found."}
            </div>
          )}
          {userRole === "ADMIN" && (
            <button
              type="button"
              className="col-override-btn"
              onClick={() => setIsUnverifiedModalOpen(true)}
            >
              Override
            </button>
          )}
        </div>

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
                        "Batch",
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
                        <td colSpan="7" className="col-table-state">
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
                          colSpan="7"
                          className="col-table-state col-table-state--error"
                        >
                          Error: {error}
                        </td>
                      </tr>
                    ) : filteredTickets.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="col-table-state">
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
                      currentTickets.map((ticket) => {
                        const effectiveBatch =
                          OperationsService.getEffectiveBatchName(ticket, shifts);
                        return (
                          <tr
                            key={ticket.id}
                            className={`col-table-row ${ticket.is_late ? "col-table-row--late" : ""}`}
                          >
                            <td>
                              <span className="col-id-badge">{ticket.id.replace(/^TICKET-/i, '')}</span>
                            </td>
                            <td>
                              <div className="col-batch-cell">
                                <span className="col-batch-name">
                                  {effectiveBatch}
                                </span>
                                {ticket.is_late && (
                                  <span className="col-late-tag">
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                    >
                                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                                      <path d="M12 9v4" />
                                      <path d="M12 17h.01" />
                                    </svg>
                                    Late
                                  </span>
                                )}
                              </div>
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
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredTickets.length > rowsPerPage && (
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
                      disabled={endIndex >= filteredTickets.length}
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
                      Vehicles that entered the terminal to unload passengers
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                        placeholder="Search logs…"
                        value={roamingSearch}
                        onChange={(e) => setRoamingSearch(e.target.value)}
                      />
                    </div>
                    <button className="col-action-btn" onClick={handleOpenRoamingModal}>
                      + Record
                    </button>
                  </div>
                </div>

                <div className="col-table-wrap">
                  <table className="col-table">
                    <thead>
                      <tr>
                        {["Vehicle", "Driver", "Recorded By", "Time", "Notes"].map((h) => (
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
                      ) : currentRoaming.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="col-table-state">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                              <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <span>No roaming records found</span>
                          </td>
                        </tr>
                      ) : (
                        currentRoaming.map((log) => (
                          <tr key={log.id} className="col-table-row">
                            
                            <td>
                              {log.vehicle_plate ? (
                                <span className="col-plate">{log.vehicle_plate}</span>
                              ) : (
                                <span className="col-na">N/A</span>
                              )}
                            </td>
                            <td className="col-td-name">{log.driver_name || <span className="col-na">N/A</span>}</td>
                            <td className="col-td-name">{log.recorded_by_name || <span className="col-na">N/A</span>}</td>
                            <td className="col-td-time">{formatTime(log.recorded_at)}</td>
                            <td><span className="col-na">{log.notes || "—"}</span></td>
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
      </div>

      {confirmingBatchKey && (
        <div
          className="col-sched-overlay"
          onClick={() => setConfirmingBatchKey(null)}
        >
          <div className="col-sched-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="col-sched-modal-header">
              <div className="col-sched-modal-header-left">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c9a84c"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <h2 className="col-sched-modal-title">Confirm Verification</h2>
              </div>
              <button
                type="button"
                className="col-sched-modal-close"
                onClick={() => setConfirmingBatchKey(null)}
                aria-label="Close"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="col-sched-modal-body">
              <div className="col-sched-batch-label-row">
                <span className="col-sched-batch-name">Batch</span>
                <span className="col-sched-batch-preview">
                  {confirmingBatchKey}
                </span>
              </div>

              <p className="col-sched-note" style={{ marginTop: 12 }}>
                All pending tickets in <strong>{confirmingBatchKey}</strong>{" "}
                will be marked as verified. This action cannot be undone.
              </p>
            </div>

            {/* Footer */}
            <div className="col-sched-modal-footer">
              <button
                type="button"
                className="col-sched-modal-btn col-sched-modal-btn--cancel"
                onClick={() => setConfirmingBatchKey(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="col-sched-modal-btn col-sched-modal-btn--submit"
                onClick={confirmBatchVerification}
              >
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
                Yes, Verify
              </button>
            </div>
          </div>
        </div>
      )}

      {isUnverifiedModalOpen && (
        <div
          className="col-overlay"
          onClick={() => setIsUnverifiedModalOpen(false)}
        >
          <div className="col-modal" onClick={(e) => e.stopPropagation()}>
            <div className="col-modal-header">
              <div>
                <h2 className="col-modal-title">Unverified Tickets</h2>
                <p className="col-modal-subtitle">
                  All tickets that are not verified yet.
                </p>
              </div>
              <button
                type="button"
                className="col-modal-close"
                onClick={() => setIsUnverifiedModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="col-modal-body">
              <div className="col-table-wrap">
                <table className="col-table">
                  <thead>
                    <tr>
                      {[
                        "Ticket ID",
                        "Batch",
                        "Time",
                        "Vehicle",
                        "Driver",
                        "Action",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unverifiedTickets.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="col-table-state">
                          No unverified tickets to show.
                        </td>
                      </tr>
                    ) : (
                      unverifiedTickets.map((ticket) => {
                        const effectiveBatch =
                          OperationsService.getEffectiveBatchName(
                            ticket,
                            shifts,
                          );
                        return (
                          <tr key={ticket.id} className="col-table-row">
                            <td>
                              <span className="col-id-badge">{ticket.id.replace(/^TICKET-/i, '')}</span>
                            </td>
                            <td>
                              <div className="col-batch-cell">
                                <span className="col-batch-name">
                                  {effectiveBatch}
                                </span>
                              </div>
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
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {isRoamingModalOpen && (
        <div className="col-sched-overlay" onClick={() => setIsRoamingModalOpen(false)}>
          <div className="col-sched-modal" onClick={(e) => e.stopPropagation()}>
            <div className="col-sched-modal-header">
              <div className="col-sched-modal-header-left">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
                  <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <h2 className="col-sched-modal-title">Record Roaming Vehicle</h2>
              </div>
              <button type="button" className="col-sched-modal-close" onClick={() => setIsRoamingModalOpen(false)} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="col-sched-modal-body">
              <div className="col-sched-batch-block">
                <div className="col-sched-field">
                  <label className="col-sched-label">Vehicle *</label>
                  <select
                    className="col-sched-input"
                    style={{ paddingLeft: 12 }}
                    value={roamingForm.vehicle}
                    onChange={(e) => setRoamingForm((f) => ({ ...f, vehicle: e.target.value }))}
                  >
                    <option value="">Select vehicle…</option>
                    {vehicles.filter((v) => !v.is_archived).map((v) => (
                      <option key={v.id} value={v.id}>{v.plate_number}</option>
                    ))}
                  </select>
                </div>

                <div className="col-sched-field" style={{ marginTop: 12 }}>
                  <label className="col-sched-label">Driver (optional)</label>
                  <select
                    className="col-sched-input"
                    style={{ paddingLeft: 12 }}
                    value={roamingForm.driver}
                    onChange={(e) => setRoamingForm((f) => ({ ...f, driver: e.target.value }))}
                  >
                    <option value="">Select driver…</option>
                    {drivers.filter((d) => !d.is_archived).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-sched-field" style={{ marginTop: 12 }}>
                  <label className="col-sched-label">Notes (optional)</label>
                  <input
                    className="col-sched-input"
                    style={{ paddingLeft: 12 }}
                    placeholder="e.g. Unloading passengers only"
                    value={roamingForm.notes}
                    onChange={(e) => setRoamingForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="col-sched-modal-footer">
              <button type="button" className="col-sched-modal-btn col-sched-modal-btn--cancel" onClick={() => setIsRoamingModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="col-sched-modal-btn col-sched-modal-btn--submit"
                onClick={handleSubmitRoaming}
                disabled={!roamingForm.vehicle || roamingSubmitting}
              >
                {roamingSubmitting ? "Saving…" : "Save Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Collection;
