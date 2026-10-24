import React, { useState } from "react";
import { DataTable } from "../../../../components/ui/dataTable";
import { nameWithRole } from "../../../../lib/roles";
import { peso } from "../reportHook";
import Pager from "./Pager";
import ViewRemittance from "../../remittance/viewRemittance";
import { downloadRemittancePDF } from "../../remittance/exportRemittancePDF";
import { getBatchCashierName } from "../../remittance/useCashierName";
import { useFeedback } from "../../../../components/ui/kit";
import { EyeIcon, DownloadIcon } from "../../../../components/ui/kit/icons";
import RowMenu from "../../registry/RowMenu";
import { matchesRequisitionRow, matchesRemittanceRow, useDebouncedSearchAll, usePagedPreview } from "../reportHook";

const REQUISITION_COLUMNS = ["Date Requested", "Requested By", "Recorded By", "Ticket Series", "Total Value"];
const REMITTANCE_COLUMNS = ["Batch ID", "Issued At", "Prepared By", "Recorded By", "Total Amount", "Actions"];
// Rows per page on the card.
const PREVIEW_SIZE = 5;

export default function RequisitionRemittance({
  requisitionData,
  requisitionMeta,
  onRequisitionFetchPage,
  onRequisitionFetchAll,
  onExportRequisitionsPDF,
  remittanceData,
  remittanceMeta,
  onRemittanceFetchPage,
  onRemittanceFetchAll,
  onExportRemittancePDF,
}) {
  const { notify } = useFeedback();
  const [downloadingId, setDownloadingId] = useState(null);
  const [activeTab, setActiveTab] = useState("remittance");
  const [search, setSearch] = useState("");
  const [viewBatch, setViewBatch] = useState(null);
  const [expandedId, setExpandedId] = useState(null);


  const isRequisition = activeTab === "requisition";
  const data = isRequisition ? requisitionData : remittanceData;
  const meta = isRequisition ? requisitionMeta : remittanceMeta;
  const fetchPage = isRequisition ? onRequisitionFetchPage : onRemittanceFetchPage;
  const fetchAll = isRequisition ? onRequisitionFetchAll : onRemittanceFetchAll;

  const toggleExpand = (id) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const matches = isRequisition ? matchesRequisitionRow : matchesRemittanceRow;

  // data only ever hold one loaded page — once there's an actual
  // query, search the complete date-ranged result set instead of just that page.
  const searchAll = useDebouncedSearchAll(fetchAll, search);

  const searched = searchAll
    ? searchAll.filter((row) => matches(row, search))
    : data.filter((row) => matches(row, search));
  const filtering = Boolean(search.trim());
  const total = filtering ? searched.length : meta.count;
  const { rows: preview, loading, page, totalPages, setPage } = usePagedPreview({
    rows: searched,
    total,
    fetchPage: fetchPage,
    local: filtering,
    resetKey: [fetchPage, search],
    size: PREVIEW_SIZE,
  });

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch("");
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
          <td className={cellClass}>{nameWithRole(r.issued_by_name, r.issued_by_role) || <span className="rpt-na">—</span>}</td>
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
                      <td className="text-right">{Math.max((parseInt(ts.end_no) || 0) - (parseInt(ts.start_no) || 0) + 1, 0).toLocaleString()}</td>
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

  const downloadBatch = async (b) => {
    setDownloadingId(b.id);
    try {
      await downloadRemittancePDF(b, getBatchCashierName(b.id));
    } catch (err) {
      notify.error({
        title: "Couldn't export the official form",
        message: err?.message?.replace(/^Error:\s*/, "") || "Check your connection and try again.",
        onRetry: () => downloadBatch(b),
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const renderRemittanceRow = (b, idx, { rowClass, cellClass }) => (
    <tr key={b.id} className={rowClass}>
      <td className={cellClass}>{b.batch_code || b.id}</td>
      <td className={cellClass}>{b.issued_at ? new Date(b.issued_at).toLocaleString() : "—"}</td>
      <td className={`${cellClass} rpt-bold`}>{b.prepared_by_name || <span className="rpt-na">—</span>}</td>
      <td className={cellClass}>{nameWithRole(b.issued_by_name, b.issued_by_role) || "—"}</td>
      <td className={cellClass}>{peso(b.total_amount)}</td>
      <td className={cellClass}>
        <div className="rpt-row-actions rpt-row-actions--center">
          <RowMenu
            items={[
              { label: "View", icon: <EyeIcon size={14} />, onClick: () => setViewBatch(b) },
              {
                label: "Download",
                icon: <DownloadIcon size={14} />,
                onClick: () => downloadBatch(b),
                hidden: downloadingId === b.id,
              },
            ]}
          />
        </div>
      </td>
    </tr>
  );

  const columns = isRequisition ? REQUISITION_COLUMNS : REMITTANCE_COLUMNS;
  const rowRenderer = isRequisition ? renderRequisitionRow : renderRemittanceRow;

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <h2 className="rpt-card-title">Remittance and Requisition</h2>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder={isRequisition ? "Search requisitions…" : "Search remittance…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="rpt-btn-export rpt-btn-export--navy"
            title={search ? "Export only rows matching your search" : "Export all records in range"}
            onClick={() => (isRequisition ? onExportRequisitionsPDF(search) : onExportRemittancePDF(search))}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {search ? "Export Matches (PDF)" : "Export PDF"}
          </button>
        </div>
      </div>

      <div className="rpt-card-tabs">
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
          {preview.length} of {total} records
        </span>
      </div>

      <DataTable columns={columns} data={preview} rowRenderer={rowRenderer} emptyText={loading ? "Loading…" : undefined} centeredColumns={["Actions"]} />
      <Pager page={page} totalPages={totalPages} count={total} pageSize={PREVIEW_SIZE} onPageChange={setPage} />

      {viewBatch && (
        <ViewRemittance batch={viewBatch} onClose={() => setViewBatch(null)} />
      )}
    </div>
  );
}
