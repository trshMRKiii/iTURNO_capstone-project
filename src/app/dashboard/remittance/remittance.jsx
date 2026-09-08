import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CreateBatchForm from "./createRemittance";
import ViewRemittance from "./viewRemittance";
import { useRemittance } from "./useRemittance";
import { useToast, useConfirm } from "../../../components/ui/ToastConfirmContext";
import { apiService } from "../../../lib/api-service";
import { getToday } from "../report/reportHook";
import { getPhDateString } from "../../../lib/phDate";
import EodReconciliation from "../report/tables/EodReconciliation";
import "../../../styles/Remittance.css";
import "../../../styles/Report.css";

const STATUS_COLOR = {
  OPEN: "rem-status--open",
  CLOSED: "rem-status--closed",
};

export default function Remittance() {
  const {
    showModal,
    setShowModal,
    batches,
    loading,
    error,
    handleSaveBatch,
    handleArchiveBatch,
    handleRestoreBatch,
  } = useRemittance();

  const showToast = useToast();
  const showConfirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [viewBatch, setViewBatch] = useState(null);
  const [eodDate, setEodDate] = useState(getToday);
  const [eod, setEod] = useState(null);
  const [eodLoading, setEodLoading] = useState(false);
  const [batchTab, setBatchTab] = useState("active");

  // Late-remittance flow: lateTargetDate is null for a normal (today) batch,
  // or a past date string when filing for a previously missed day.
  const [lateTargetDate, setLateTargetDate] = useState(null);
  const [showLatePicker, setShowLatePicker] = useState(false);
  const [latePickerDate, setLatePickerDate] = useState(getPhDateString(-1));

  // Arriving from the remittance-gap banner (via navigate state) jumps straight
  // into the late-remittance flow, pre-filled with the specific missed date —
  // consumed once, then cleared so a back/refresh doesn't reopen it.
  useEffect(() => {
    if (location.state?.lateDate) {
      setLateTargetDate(location.state.lateDate);
      setShowModal(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateNewBatch = () => {
    setLateTargetDate(null);
    setShowModal(true);
  };

  const handleStartLateRemittance = () => {
    setLatePickerDate(getPhDateString(-1));
    setShowLatePicker(true);
  };

  const handleConfirmLateDate = () => {
    setLateTargetDate(latePickerDate);
    setShowLatePicker(false);
    setShowModal(true);
  };

  const fetchEod = useCallback(async () => {
    setEodLoading(true);
    try {
      const data = await apiService.get(`/report/eod-reconciliation/?date=${eodDate}`);
      setEod(data);
    } catch {
      console.error("Failed to load end-of-day reconciliation");
    } finally {
      setEodLoading(false);
    }
  }, [eodDate]);

  useEffect(() => {
    fetchEod();
  }, [fetchEod]);

  const handleArchiveClick = async (batch) => {
    const ok = await showConfirm(
      `Archive remittance batch #${batch.id}? It will move out of the active list.`
    );
    if (!ok) return;
    try {
      await handleArchiveBatch(batch.id);
      showToast("Remittance batch archived", "success");
    } catch {
      showToast("Failed to archive remittance batch", "info");
    }
  };

  const handleRestoreClick = async (batch) => {
    try {
      await handleRestoreBatch(batch.id);
      showToast("Remittance batch restored", "success");
    } catch {
      showToast("Failed to restore remittance batch", "info");
    }
  };

  const activeBatches = batches.filter((b) => !b.is_archived);
  const archivedBatches = batches.filter((b) => b.is_archived);
  const tabBatches = batchTab === "active" ? activeBatches : archivedBatches;

  const filteredBatches = tabBatches.filter((b) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      (b.id || "").toString().toLowerCase().includes(q) ||
      (b.issued_by_name || "").toLowerCase().includes(q) ||
      (b.status || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="rem-page">
      {/* Header */}
      <div className="rem-header">
        <div className="rem-header-left">
          <div className="rem-header-accent" />
          <div>
            <h1 className="rem-title">Remittance Batches</h1>
            <p className="rem-subtitle">
              Manage remittance collections and deposits
            </p>
          </div>
        </div>
        <div className="rem-header-right">
          <div className="rem-search-wrap">
            <svg className="rem-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="rem-search"
              placeholder="Search by ID, officer, or status…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="rem-add-btn rem-add-btn--secondary" onClick={handleStartLateRemittance}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            File Late Remittance
          </button>
          <button className="rem-add-btn" onClick={handleCreateNewBatch}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Create New Batch
          </button>
        </div>
      </div>

      {showLatePicker && (
        <div className="rem-alert rem-alert--info">
          <span>File a late remittance covering which day?</span>
          <input
            type="date"
            className="rem-input"
            value={latePickerDate}
            max={getPhDateString(-1)}
            onChange={(e) => setLatePickerDate(e.target.value)}
          />
          <button className="rem-btn rem-btn--view" onClick={handleConfirmLateDate}>Continue</button>
          <button className="rem-btn rem-btn--delete" onClick={() => setShowLatePicker(false)}>Cancel</button>
        </div>
      )}

      {error && (
        <div className="rem-alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      <EodReconciliation
        eodDate={eodDate}
        setEodDate={setEodDate}
        eod={eod}
        eodLoading={eodLoading}
      />

      {/* Table card */}
      <div className="rem-card">
        {/* Tab bar */}
        <div className="rem-tabs">
          <button
            type="button"
            className={`rem-tab ${batchTab === "active" ? "rem-tab--active" : ""}`}
            onClick={() => setBatchTab("active")}
          >
            Active
            {activeBatches.length > 0 && (
              <span className="rem-tab-count">{activeBatches.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`rem-tab ${batchTab === "archived" ? "rem-tab--active" : ""}`}
            onClick={() => setBatchTab("archived")}
          >
            Archived
            {archivedBatches.length > 0 && (
              <span className="rem-tab-count">{archivedBatches.length}</span>
            )}
          </button>
        </div>
        <div className="rem-table-wrap">
          <table className="rem-table">
            <thead>
              <tr>
                {["Batch ID", "Issued By", "Issued At", "Total Amount", "Actions"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="rem-table-state">
                    <div className="rem-loading-dots">
                      <div />
                      <div />
                      <div />
                    </div>
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan="6" className="rem-table-state">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span>
                      {tabBatches.length === 0
                        ? batchTab === "archived"
                          ? "No archived remittance batches"
                          : "No remittance batches found"
                        : `No results for "${searchTerm}"`}
                    </span>
                  </td>
                </tr>
              ) : (
                filteredBatches.map((b) => (
                  <tr key={b.id} className="rem-row">
                    <td className="rem-td-meta">{b.batch_code || b.id}</td>
                    <td className="rem-td-meta">{b.issued_by_name}</td>
                    <td className="rem-td-meta">
                      {new Date(b.issued_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      {new Date(b.issued_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <span className="rem-amount">
                        ₱{Number(b.total_amount).toLocaleString()}
                      </span>
                    </td>

                    <td>
                      <div className="rem-actions">
                        <button className="rem-btn rem-btn--view" onClick={() => setViewBatch(b)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          View
                        </button>
                        {batchTab === "archived" ? (
                          <button className="rem-btn rem-btn--restore" onClick={() => handleRestoreClick(b)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M3 12a9 9 0 1 0 3-6.7" />
                              <path d="M3 4v5h5" />
                            </svg>
                            Restore
                          </button>
                        ) : (
                          <button className="rem-btn rem-btn--delete" onClick={() => handleArchiveClick(b)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M21 8v13H3V8" />
                              <path d="M1 3h22v5H1z" />
                              <path d="M10 12h4" />
                            </svg>
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <CreateBatchForm
          onClose={() => {
            setShowModal(false);
            setLateTargetDate(null);
          }}
          onSave={async (payload) => {
            await handleSaveBatch(payload);
            setLateTargetDate(null);
          }}
          existingBatches={batches}
          targetDate={lateTargetDate}
        />
      )}

      {/* View/Preview Modal */}
      {viewBatch && (
        <ViewRemittance
          batch={viewBatch}
          onClose={() => setViewBatch(null)}
        />
      )}
    </div>
  );
}
