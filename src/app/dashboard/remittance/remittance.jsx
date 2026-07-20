import React, { useCallback, useEffect, useState } from "react";
import CreateBatchForm from "../../../lib/remittance/createRemittance";
import ViewRemittance from "../../../lib/remittance/viewRemittance";
import { useRemittance } from "../../../lib/remittance/useRemittance";
import { useToast, useConfirm } from "../../../components/ui/ToastConfirmContext";
import { apiService } from "../../../lib/api-service";
import { today } from "../../../lib/report/reportHook";
import EodReconciliation from "../../../lib/report/tables/EodReconciliation";
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
    handleDeleteBatch,
  } = useRemittance();

  const showToast = useToast();
  const showConfirm = useConfirm();

  const [searchTerm, setSearchTerm] = useState("");
  const [viewBatch, setViewBatch] = useState(null);
  const [eodDate, setEodDate] = useState(today);
  const [eod, setEod] = useState(null);
  const [eodLoading, setEodLoading] = useState(false);

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

  const handleDeleteClick = async (batch) => {
    const ok = await showConfirm(
      `Delete remittance batch #${batch.id}? This action cannot be undone.`
    );
    if (!ok) return;
    try {
      await handleDeleteBatch(batch.id);
      showToast("Remittance batch deleted", "success");
    } catch {
      showToast("Failed to delete remittance batch", "info");
    }
  };

  const filteredBatches = batches.filter((b) => {
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
          <button className="rem-add-btn" onClick={() => setShowModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Create New Batch
          </button>
        </div>
      </div>

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
                      {batches.length === 0
                        ? "No remittance batches found"
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
                        <button className="rem-btn rem-btn--delete" onClick={() => handleDeleteClick(b)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          Delete
                        </button>
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
          onClose={() => setShowModal(false)}
          onSave={handleSaveBatch}
          existingBatches={batches}
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
