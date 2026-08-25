import { useState, useEffect, useRef } from "react";
import { DataTable } from "../../../../components/ui/dataTable";
import Pager from "./Pager";
import ReportTableModal from "./ReportTableModal";
import { matchesLogRow, matchesRoamingRow, useDebouncedSearchAll } from "../reportHook";
const LOG_COLUMNS = ["Timestamp", "Ticket ID", "Action", "Driver", "Vehicle", "Route", "User"];
const ROAMING_COLUMNS = ["Ticket ID", "Timestamp", "Vehicle", "Driver", "Issued By", "Verified"];
// Main card shows a short preview like the other report cards (FleetRecords) —
// "View All" opens the modal for the full paginated list.
const PREVIEW_SIZE = 5;

export default function TransactionLogs({
  logsData,
  logsMeta,
  onLogsFetchPage,
  onLogsFetchAll,
  onExportLogsCSV,
  onExportLogsPDF,
  roamingData,
  roamingMeta,
  onRoamingFetchPage,
  onRoamingFetchAll,
  onExportRoamingCSV,
  onExportRoamingPDF,
  STATUS_COLORS,
  pageSize,
}) {
  const [activeTab, setActiveTab] = useState("logs");
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [modalPage, setModalPage] = useState(1);
  const [modalData, setModalData] = useState([]);
  const [modalMeta, setModalMeta] = useState({ count: 0, totalPages: 1 });
  const modalBodyRef = useRef(null);

  const isLogs = activeTab === "logs";
  const data = isLogs ? logsData : roamingData;
  const meta = isLogs ? logsMeta : roamingMeta;
  const fetchPage = isLogs ? onLogsFetchPage : onRoamingFetchPage;
  const fetchAll = isLogs ? onLogsFetchAll : onRoamingFetchAll;

  const matches = isLogs ? matchesLogRow : matchesRoamingRow;

  // data/modalData only ever hold one loaded page — once there's an actual
  // query, search the complete date-ranged result set instead of just that page.
  const searchAll = useDebouncedSearchAll(fetchAll, search);
  const modalSearchAll = useDebouncedSearchAll(fetchAll, modalSearch);
  const isModalSearching = modalSearch.trim() && modalSearchAll;

  const searched = searchAll
    ? searchAll.filter((row) => matches(row, search))
    : data.filter((row) => matches(row, search));
  const preview = searched.slice(0, PREVIEW_SIZE);
  const total = searchAll ? searched.length : meta.count;

  const modalFilteredAll = isModalSearching
    ? modalSearchAll.filter((row) => matches(row, modalSearch))
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

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setShowModal(false);
  };

  const openModal = async () => {
    setShowModal(true);
    setModalSearch("");
    const page = await fetchPage(1);
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
    const result = await fetchPage(page);
    setModalPage(result.page);
    setModalData(result.results);
    setModalMeta({ count: result.count, totalPages: result.totalPages });
  };

  const renderLogRow = (l, idx, { rowClass, cellClass }) => (
    <tr key={l.id + idx} className={rowClass}>
      <td className={`${cellClass} rpt-mono rpt-muted`}>{l.timestamp ? new Date(l.timestamp).toLocaleString() : "—"}</td>
      <td className={`${cellClass} rpt-mono`}>{l.ticket_id}</td>
      <td className={cellClass}>
        <span
          className="rpt-action-pill"
          style={{
            background: `${STATUS_COLORS[l.action] || "#64748b"}22`,
            color: STATUS_COLORS[l.action] || "#64748b",
          }}
        >
          {l.action}
        </span>
      </td>
      <td className={cellClass}>{l.driver}</td>
      <td className={cellClass}><span className="rpt-plate">{l.vehicle}</span></td>
      <td className={cellClass}>{l.route}</td>
      <td className={`${cellClass} rpt-muted`}>{l.user}</td>
    </tr>
  );

  const renderRoamingRow = (t, idx, { rowClass, cellClass }) => (
    <tr key={t.id} className={rowClass}>
      <td className={`${cellClass} rpt-mono`}>{String(t.id).replace(/^TICKET-/i, "")}</td>
      <td className={`${cellClass} rpt-mono rpt-muted`}>{t.issued_at ? new Date(t.issued_at).toLocaleString() : "—"}</td>
      <td className={cellClass}>
        {t.vehicle?.plate_number ? (
          <span className="rpt-plate">{t.vehicle.plate_number}</span>
        ) : (
          <span className="rpt-na">—</span>
        )}
      </td>
      <td className={cellClass}>{t.driver?.name || <span className="rpt-na">—</span>}</td>
      <td className={cellClass}>{t.active_user_name || <span className="rpt-na">—</span>}</td>
      <td className={cellClass}>
        <span
          className="rpt-action-pill"
          style={{
            background: `${STATUS_COLORS[t.status === "CANCELLED" ? "CANCELLED" : t.is_verified ? "COLLECTED" : "QUEUED"] || "#64748b"}22`,
            color: STATUS_COLORS[t.status === "CANCELLED" ? "CANCELLED" : t.is_verified ? "COLLECTED" : "QUEUED"] || "#64748b",
          }}
        >
          {t.status === "CANCELLED" ? "Cancelled" : t.is_verified ? "Verified" : "Pending"}
        </span>
      </td>
    </tr>
  );

  const columns = isLogs ? LOG_COLUMNS : ROAMING_COLUMNS;
  const rowRenderer = isLogs ? renderLogRow : renderRoamingRow;

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <div className="rpt-tab-group">
            <button
              className={`rpt-tab ${isLogs ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("logs")}
            >
              Transaction Logs
            </button>
            <button
              className={`rpt-tab ${!isLogs ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("roaming")}
            >
              Roaming Logs
            </button>
          </div>
          <span className="rpt-record-count">
            {preview.length} of {total} records
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {total > PREVIEW_SIZE && (
            <button className="rpt-btn rpt-btn--secondary" onClick={openModal}>
              View All
            </button>
          )}
          <button
            className="rpt-btn-export rpt-btn-export--green"
            title={search ? "Export only rows matching your search" : "Export all records in range"}
            onClick={() => (isLogs ? onExportLogsCSV(search) : onExportRoamingCSV(search))}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {search ? "Export Matches (CSV)" : "Export CSV"}
          </button>
          <button
            className="rpt-btn-export rpt-btn-export--red"
            title={search ? "Export only rows matching your search" : "Export all records in range"}
            onClick={() => (isLogs ? onExportLogsPDF(search) : onExportRoamingPDF(search))}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {search ? "Export Matches (PDF)" : "Export PDF"}
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={preview} rowRenderer={rowRenderer} />

      {showModal && (
        <ReportTableModal
          title={isLogs ? "Transaction Logs" : "Roaming Logs"}
          subtitle={isLogs ? "Full ticket activity history" : "Full roaming vehicle activity history"}
          count={modalTotal}
          onClose={closeModal}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder={isLogs ? "Search logs…" : "Search roaming…"}
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
          <DataTable columns={columns} data={modalSearched} rowRenderer={rowRenderer} />
        </ReportTableModal>
      )}
    </div>
  );
}
