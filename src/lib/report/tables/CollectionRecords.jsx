import { DataTable } from "../../../components/ui/dataTable";
import { useState } from "react";
import ReportTableModal from "./ReportTableModal";

const COLUMNS = [
  "Date & Time",
  "Batch",
  "Ticket ID",
  "Driver",
  "Vehicle",
  "Route",
  "Amount",
];

export default function CollectionRecords({
  filters,
  setFilters,
  filteredCollections,
  handleExportCSV,
  handleExportPDF,
  peso,
}) {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const searched = filteredCollections.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.issued_at, r.batch, String(r.id), r.driver, r.vehicle, r.route]
      .some((v) => v && v.toLowerCase().includes(q));
  });

  const previewCollections = searched.slice(0, 5);

  const renderRow = (r, idx, { rowClass, cellClass }) => (
    <tr key={r.id} className={rowClass}>
      <td className={cellClass}>{r.issued_at}</td>
      <td className={cellClass}>
        <span
          className={`rpt-batch-pill ${r.batch === "Batch 1" ? "rpt-batch-pill--b1" : "rpt-batch-pill--b2"}`}
        >
          {r.batch}
        </span>
      </td>
      <td className={`${cellClass} rpt-mono`}>{r.id}</td>
      <td className={cellClass}>{r.driver}</td>
      <td className={cellClass}>
        <span className="rpt-plate">{r.vehicle}</span>
      </td>
      <td className={cellClass}>{r.route}</td>
      <td className={`${cellClass} rpt-amount`}>
        {peso(Number(r.collection_amount) || 0)}
      </td>
    </tr>
  );

  const grandTotal = searched.reduce(
    (s, r) => s + Number(r.collection_amount || 0),
    0,
  );

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <span className="rpt-card-title">Collection Records</span>

          <div className="rpt-batch-toggle">
            {[
              ["all", "All"],
              ["batch1", "Batch 1"],
              ["batch2", "Batch 2"],
            ].map(([val, lbl]) => (
              <button
                key={val}
                className={`rpt-batch-btn ${filters.batch === val ? "rpt-batch-btn--active" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, batch: val }))}
              >
                {lbl}
              </button>
            ))}
          </div>

          <span className="rpt-record-count">
            {Math.min(5, searched.length)} of {searched.length} record(s)
          </span>
        </div>

        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search records…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {searched.length > 5 && (
            <button
              className="rpt-btn rpt-btn--secondary"
              onClick={() => setShowModal(true)}
            >
              View All
            </button>
          )}
          <button
            className="rpt-btn-export rpt-btn-export--green"
            onClick={handleExportCSV}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV
          </button>
          <button
            className="rpt-btn-export rpt-btn-export--navy"
            onClick={handleExportPDF}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      <DataTable columns={COLUMNS} data={previewCollections} rowRenderer={renderRow} />

      {searched.length > 0 && (
        <div className="rpt-totals-row">
          <span>Total ({searched.length} tickets)</span>
          <span className="rpt-totals-amount">{peso(grandTotal)}</span>
        </div>
      )}

      {showModal && (
        <ReportTableModal
          title="Collection Records"
          subtitle="Full list of collected tickets for the selected period"
          count={searched.length}
          onClose={() => setShowModal(false)}
        >
          <DataTable columns={COLUMNS} data={searched} rowRenderer={renderRow} />
          {searched.length > 0 && (
            <div className="rpt-totals-row rpt-totals-row--modal">
              <span>Total ({searched.length} tickets)</span>
              <span className="rpt-totals-amount">{peso(grandTotal)}</span>
            </div>
          )}
        </ReportTableModal>
      )}
    </div>
  );
}
