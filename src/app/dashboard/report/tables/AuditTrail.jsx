import { Fragment, useState, useEffect, useRef } from "react";
import { DataTable } from "../../../../components/ui/dataTable";
import { IS_REMOTE } from "../../../../lib/api-service";
import BackfillDetail from "./BackfillDetail";
import Pager from "./Pager";
import ReportTableModal from "./ReportTableModal";
import { formatAuditAction, formatAuditItem,formatAuditDetails, matchesAuditRow, useDebouncedSearchAll } from "../reportHook";

const AUDIT_COLUMNS = ["Timestamp", "Action", "Item", "Details", "User"];
// Main card shows a short preview like the other report cards (FleetRecords) —
// "View All" opens the modal for the full paginated list.
const PREVIEW_SIZE = 5;

export default function AuditTrail({ auditData, auditMeta, onAuditFetchPage, onAuditFetchAll, onExportPDF, pageSize }) {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [modalSearch, setModalSearch] = useState("");
  const [modalPage, setModalPage] = useState(1);
  const [modalData, setModalData] = useState([]);
  const [modalMeta, setModalMeta] = useState({ count: 0, totalPages: 1 });
  const modalBodyRef = useRef(null);

  // auditData/modalData only ever hold one loaded page — once there's an actual
  // query, search the complete date-ranged result set instead of just that page.
  const searchAll = useDebouncedSearchAll(onAuditFetchAll, search);
  const modalSearchAll = useDebouncedSearchAll(onAuditFetchAll, modalSearch);
  const isModalSearching = modalSearch.trim() && modalSearchAll;

  const searched = searchAll
    ? searchAll.filter((l) => matchesAuditRow(l, search))
    : auditData.filter((l) => matchesAuditRow(l, search));
  const preview = searched.slice(0, PREVIEW_SIZE);
  const total = searchAll ? searched.length : auditMeta.count;

  const modalFilteredAll = isModalSearching
    ? modalSearchAll.filter((l) => matchesAuditRow(l, modalSearch))
    : [];
  const modalSearched = isModalSearching
    ? modalFilteredAll.slice((modalPage - 1) * pageSize, modalPage * pageSize)
    : modalData;
  const modalTotal = isModalSearching ? modalFilteredAll.length : modalMeta.count;
  const modalTotalPages = isModalSearching
    ? Math.max(Math.ceil(modalFilteredAll.length / pageSize), 1)
    : modalMeta.totalPages;

  // A fresh modal search should start back at page 1, not wherever the
  // server-paginated browsing left off.
  useEffect(() => {
    setModalPage(1);
  }, [modalSearch]);

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
    modalBodyRef.current?.scrollTo({ top: 0 });
    if (isModalSearching) {
      setModalPage(page);
      return;
    }
    const result = await onAuditFetchPage(page);
    setModalPage(result.page);
    setModalData(result.results);
    setModalMeta({ count: result.count, totalPages: result.totalPages });
  };

  // Backfill audit rows carry the BackfillRecord id; clicking one expands the
  // tickets that batch added (same behavior the old Backfill History table had).
  const renderRow = (l, idx, { rowClass, cellClass }) => {
    const backfillId = !IS_REMOTE ? l.backfill_id : null;
    const isOpen = backfillId && openId === l.id;
    return (
      <Fragment key={`${l.id}-${idx}`}>
        {renderAuditRow(l, rowClass, cellClass, backfillId, isOpen)}
        {isOpen && (
          <tr>
            <td colSpan={AUDIT_COLUMNS.length} className={cellClass}>
              <BackfillDetail id={backfillId} />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const renderAuditRow = (l, rowClass, cellClass, backfillId, isOpen) => (
    <tr
      className={rowClass}
      style={backfillId ? { cursor: "pointer" } : undefined}
      onClick={backfillId ? () => setOpenId(isOpen ? null : l.id) : undefined}
    >
      <td className={`${cellClass} rpt-mono rpt-muted`}>
        {backfillId ? (isOpen ? "▾ " : "▸ ") : ""}
        {l.created_at ? new Date(l.created_at).toLocaleString() : "—"}
      </td>
      <td className={cellClass}>{formatAuditAction(l)}</td>
      <td className={cellClass}>{formatAuditItem(l)}</td>
      <td className={cellClass}>{formatAuditDetails(l)}</td>
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
            {preview.length} of {total} records
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
          {total > PREVIEW_SIZE && (
            <button className="rpt-btn rpt-btn--secondary" onClick={openModal}>
              View All
            </button>
          )}
          <button
            className="rpt-btn-export rpt-btn-export--navy"
            title={search ? "Export only rows matching your search" : "Export all records in range"}
            onClick={() => onExportPDF(search)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {search ? "Export Matches (PDF)" : "Export PDF"}
          </button>
        </div>
      </div>

      <DataTable columns={AUDIT_COLUMNS} data={preview} rowRenderer={renderRow} />

      {showModal && (
        <ReportTableModal
          title="Audit Trail"
          subtitle="Full history of who created, changed, or deleted records"
          count={modalTotal}
          onClose={closeModal}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder="Search audit trail…"
          bodyRef={modalBodyRef}
          footer={
            <Pager
              page={modalPage}
              totalPages={modalTotalPages}
              count={modalTotal}
              pageSize={pageSize}
              onPageChange={changeModalPage}
            />
          }
        >
          <DataTable columns={AUDIT_COLUMNS} data={modalSearched} rowRenderer={renderRow} />
        </ReportTableModal>
      )}
    </div>
  );
}
