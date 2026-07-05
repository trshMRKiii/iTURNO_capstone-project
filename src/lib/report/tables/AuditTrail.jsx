import { useState } from "react";
import { DataTable } from "../../../components/ui/dataTable";
import ReportTableModal from "./ReportTableModal";
import { exportCSV } from "../reportHook";
import { exportTablePDF } from "../exportPDF";

const AUDIT_COLUMNS = ["Timestamp", "Action", "Item", "Details", "User"];

const ACTION_COLORS = {
  CREATE: "#22c55e",
  UPDATE: "#3b82f6",
  DELETE: "#ef4444",
};

const formatChanges = (changes) => {
  if (!changes || typeof changes !== "object") return "—";
  const entries = Object.entries(changes);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
};

export default function AuditTrail({ filteredAuditLogs }) {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");

  const matches = (log, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return [log.created_at, log.action_display, log.model_name, log.object_repr, log.user_name]
      .some((v) => v && String(v).toLowerCase().includes(q));
  };

  const searched = filteredAuditLogs.filter((l) => matches(l, search));
  const preview = searched.slice(0, 5);
  const modalData = searched.filter((l) => matches(l, modalSearch));

  const buildExportRow = (l) => ({
    Timestamp: l.created_at ? new Date(l.created_at).toLocaleString() : "—",
    Action: l.action_display || l.action,
    Item: `${l.model_name} #${l.object_id}`,
    Details: formatChanges(l.changes),
    User: l.user_name || "System",
  });

  const handleExportCSV = () =>
    exportCSV(searched.map(buildExportRow), `audit_trail_${Date.now()}.csv`);

  const handleExportPDF = () =>
    exportTablePDF(searched.map(buildExportRow), "Audit Trail");

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
            {preview.length} of {searched.length} records
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
          {searched.length > 5 && (
            <button className="rpt-btn rpt-btn--secondary" onClick={() => setShowModal(true)}>
              View All
            </button>
          )}
          <button className="rpt-btn-export rpt-btn-export--green" onClick={handleExportCSV}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button className="rpt-btn-export rpt-btn-export--red" onClick={handleExportPDF}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      <DataTable columns={AUDIT_COLUMNS} data={preview} rowRenderer={renderRow} />

      {showModal && (
        <ReportTableModal
          title="Audit Trail"
          subtitle="Full history of who created, changed, or deleted records"
          count={modalData.length}
          onClose={() => { setShowModal(false); setModalSearch(""); }}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder="Search audit trail…"
        >
          <DataTable columns={AUDIT_COLUMNS} data={modalData} rowRenderer={renderRow} />
        </ReportTableModal>
      )}
    </div>
  );
}
