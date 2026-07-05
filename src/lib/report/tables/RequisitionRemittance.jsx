import React, { useState } from "react";
import { DataTable } from "../../../components/ui/dataTable";
import { peso, STATUS_COLORS } from "../reportHook";
import ReportTableModal from "./ReportTableModal";
import ViewRemittance from "../../remittance/viewRemittance";

const REQUISITION_COLUMNS = ["Date Requested", "Requested By", "Approved By", "Ticket Series", "Total Value"];
const REMITTANCE_COLUMNS = ["Batch ID", "Issued At", "Issued By", "Total Amount", "Actions"];

export default function RequisitionRemittance({
  requisitions,
  requisitionsTotal,
  handleExportRequisitionsCSV,
  handleExportRequisitionsPDF,
  remittance,
  remittanceTotal,
  handleExportRemittanceCSV,
  handleExportRemittancePDF,
}) {
  const [activeTab, setActiveTab] = useState("remittance");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [viewBatch, setViewBatch] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const isRequisition = activeTab === "requisition";

  const toggleExpand = (id) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const matchesRequisition = (r, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return [r.requested_by_name, r.approved_by_name].some(
      (val) => val && String(val).toLowerCase().includes(q),
    );
  };

  const matchesRemittance = (b, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return [b.issued_by_name].some(
      (val) => val && String(val).toLowerCase().includes(q),
    );
  };

  const searchedRequisitions = requisitions.filter((r) => matchesRequisition(r, search));
  const searchedRemittance = remittance.filter((b) => matchesRemittance(b, search));

  const searched = isRequisition ? searchedRequisitions : searchedRemittance;
  const preview = searched.slice(0, 5);

  const modalSearchedRequisitions = searchedRequisitions.filter((r) => matchesRequisition(r, modalSearch));
  const modalSearchedRemittance = searchedRemittance.filter((b) => matchesRemittance(b, modalSearch));
  const modalData = isRequisition ? modalSearchedRequisitions : modalSearchedRemittance;

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setModalSearch("");
    setShowModal(false);
  };

  const renderRequisitionRow = (r, idx, { rowClass, cellClass }) => {
    const hasSeries = r.ticket_series && r.ticket_series.length > 0;
    const isExpanded = expandedId === r.id;
    return (
      <React.Fragment key={r.id}>
        <tr
          className={rowClass}
          onClick={() => hasSeries && toggleExpand(r.id)}
          style={{ cursor: hasSeries ? "pointer" : "default" }}
        >
          <td className={cellClass}>{r.date_requested ? r.date_requested.slice(0, 10) : "—"}</td>
          <td className={`${cellClass} rpt-bold`}>{r.requested_by_name || "—"}</td>
          <td className={cellClass}>{r.approved_by_name || <span className="rpt-na">—</span>}</td>
          <td className={cellClass}>
            {hasSeries && (
              <span className={`req-expand-icon ${isExpanded ? "req-expand-icon--open" : ""}`}>&#9654;</span>
            )}
            {r.ticket_series ? r.ticket_series.length : 0}
          </td>
          <td className={cellClass}>{peso(r.total_value)}</td>
        </tr>
        {isExpanded && hasSeries && (
          <tr className="req-series-row">
            <td colSpan={5}>
              <table className="req-series-table">
                <thead>
                  <tr>
                    <th>Ticket Form</th>
                    <th>Series No.</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {r.ticket_series.map((ts) => (
                    <tr key={ts.id}>
                      <td>{ts.ticket_form_label || "—"}</td>
                      <td>{ts.series_no || `${ts.start_no}-${ts.end_no}`}</td>
                      <td className="text-right">{ts.qty}</td>
                      <td className="text-right">{peso(ts.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const renderRemittanceRow = (b, idx, { rowClass, cellClass }) => (
    <tr key={b.id} className={rowClass}>
      <td className={cellClass}>{b.batch_code || b.id}</td>
      <td className={cellClass}>{b.issued_at ? new Date(b.issued_at).toLocaleString() : "—"}</td>
      <td className={`${cellClass} rpt-bold`}>{b.issued_by_name || "—"}</td>
      <td className={cellClass}>{peso(b.total_amount)}</td>
      <td className={cellClass}>
        <button className="rpt-btn rpt-btn--secondary" onClick={() => setViewBatch(b)}>
          View
        </button>
      </td>
    </tr>
  );

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <div className="rpt-tab-group">
            <button
              className={`rpt-tab ${!isRequisition ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("remittance")}
            >
              Remittance
            </button>
            <button
              className={`rpt-tab ${isRequisition ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("requisition")}
            >
              Requisition
            </button>
          </div>
          <span className="rpt-record-count">
            {preview.length} of {searched.length} records
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder={isRequisition ? "Search requisitions…" : "Search remittance…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {searched.length > 5 && (
            <button className="rpt-btn rpt-btn--secondary" onClick={() => setShowModal(true)}>
              View All
            </button>
          )}
          <button
            className="rpt-btn-export rpt-btn-export--green"
            onClick={isRequisition ? handleExportRequisitionsCSV : handleExportRemittanceCSV}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button
            className="rpt-btn-export rpt-btn-export--red"
            onClick={isRequisition ? handleExportRequisitionsPDF : handleExportRemittancePDF}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {isRequisition ? (
        <DataTable columns={REQUISITION_COLUMNS} data={preview} rowRenderer={renderRequisitionRow} />
      ) : (
        <DataTable columns={REMITTANCE_COLUMNS} data={preview} rowRenderer={renderRemittanceRow} />
      )}

      {showModal && (
        <ReportTableModal
          title={isRequisition ? "Requisition" : "Remittance"}
          subtitle={isRequisition ? "Complete history of ticket series requisitions" : "Complete history of remittance batches"}
          count={modalData.length}
          onClose={() => { setShowModal(false); setModalSearch(""); }}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder={isRequisition ? "Search requisitions…" : "Search remittance…"}
        >
          {isRequisition ? (
            <DataTable columns={REQUISITION_COLUMNS} data={modalData} rowRenderer={renderRequisitionRow} />
          ) : (
            <DataTable columns={REMITTANCE_COLUMNS} data={modalData} rowRenderer={renderRemittanceRow} />
          )}
        </ReportTableModal>
      )}

      {viewBatch && (
        <ViewRemittance batch={viewBatch} onClose={() => setViewBatch(null)} />
      )}
    </div>
  );
}
