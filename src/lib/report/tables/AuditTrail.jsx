import { useState } from "react";
import { DataTable } from "../../../components/ui/dataTable";
import Pager from "./Pager";
import ReportTableModal from "./ReportTableModal";
import { formatChanges } from "../reportHook";

const AUDIT_COLUMNS = ["Timestamp", "Action", "Item", "Details", "User"];

const ACTION_COLORS = {
  CREATE: "#22c55e",
  UPDATE: "#3b82f6",
  DELETE: "#ef4444",
};

export default function AuditTrail({ auditData, auditMeta, onAuditFetchPage, onExportCSV, onExportPDF, pageSize }) {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [modalPage, setModalPage] = useState(1);
  const [modalData, setModalData] = useState([]);
  const [modalMeta, setModalMeta] = useState({ count: 0, totalPages: 1 });

  const matches = (log, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return [log.created_at, log.action_display, log.model_name, log.object_repr, log.user_name]
      .some((v) => v && String(v).toLowerCase().includes(q));
  };

  const searched = auditData.filter((l) => matches(l, search));
  const modalSearched = modalData.filter((l) => matches(l, modalSearch));

  const openModal = async () => {
    setShowModal(true);
    setModalSearch("");
    const page = await onAuditFetchPage(1);
    setModalPage(page.page);
    setModalData(page.results);
    setModalMeta({ count: page.count, totalPages: page.totalPages });
  };

  const closeModal = () => {
    setShowModal(false);
    setModalSearch("");
  };

  const changeModalPage = async (page) => {
    const result = await onAuditFetchPage(page);
    setModalPage(result.page);
    setModalData(result.results);
    setModalMeta({ count: result.count, totalPages: result.totalPages });
  };

  const renderRow = (l, idx, { rowClass, cellClass }) => (
    <tr key={l.id + idx} className={rowClass}>
      <td className={`${cellClass} rpt-mono rpt-muted`}>
        {l.created_at ? new Date(l.created_at).toLocaleString() : "—"}
      </td>
      <td className={cellClass}>
        <span
          className="rpt-action-pill"
          style={{
            background: `${ACTION_COLORS[l.action] || "#64748b"}22`,
            color: ACTION_COLORS[l.action] || "#64748b",
          }}
        >
          {l.action_display || l.action}
        </span>
      </td>
      <td className={cellClass}>{l.model_name} #{l.object_id}</td>
      <td className={cellClass}>{l.object_repr || formatChanges(l.changes)}</td>
      <td className={`${cellClass} rpt-muted`}>{l.user_name || "System"}</td>
    </tr>
  );

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <div className="rpt-tab-group">
            <button className="rpt-tab rpt-tab--active">Audit Trail</button>
          </div>
          <span className="rpt-record-count">
            {searched.length} of {auditMeta.count} records
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search audit trail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {auditMeta.count > pageSize && (
            <button className="rpt-btn rpt-btn--secondary" onClick={openModal}>
              View All
            </button>
          )}
          <button className="rpt-btn-export rpt-btn-export--green" onClick={onExportCSV}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button className="rpt-btn-export rpt-btn-export--red" onClick={onExportPDF}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      <DataTable columns={AUDIT_COLUMNS} data={searched} rowRenderer={renderRow} />

      {showModal && (
        <ReportTableModal
          title="Audit Trail"
          subtitle="Full history of who created, changed, or deleted records"
          count={modalMeta.count}
          onClose={closeModal}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder="Search audit trail…"
        >
          <DataTable columns={AUDIT_COLUMNS} data={modalSearched} rowRenderer={renderRow} />
          <Pager
            page={modalPage}
            totalPages={modalMeta.totalPages}
            count={modalMeta.count}
            pageSize={pageSize}
            onPageChange={changeModalPage}
          />
        </ReportTableModal>
      )}
    </div>
  );
}
