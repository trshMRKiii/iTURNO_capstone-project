import { useState, useEffect, useRef, useCallback } from "react";
import { DataTable } from "../../../../components/ui/dataTable";
import Pager from "./Pager";
import ReportTableModal from "./ReportTableModal";
import { matchesQueueRow, matchesRoamingRow, useDebouncedSearchAll } from "../reportHook";
const QUEUE_COLUMNS = ["Timestamp", "Ticket ID", "Action", "Driver", "Vehicle", "Route", "User"];
const ROAMING_COLUMNS = ["Ticket ID", "Timestamp", "Vehicle", "Driver", "Issued By"];
const ALL_COLUMNS = ["Timestamp", "Ticket ID", "Type", "Driver", "Vehicle", "Route", "User"];

const withQueueType = (l) => ({ ...l, type: "Queue" });
const roamingToLogRow = (t) => ({
  id: t.id,
  timestamp: t.issued_at,
  ticket_id: String(t.id || "").replace(/^TICKET-/i, ""),
  driver: t.driver?.name || "",
  vehicle: t.vehicle?.plate_number || "",
  route: t.route_name || "",
  user: t.active_user_name || "—",
  type: "Roaming",
});
const TYPE_COLORS = { Queue: "#2563eb", Roaming: "#7c3aed" };
// Main card shows a short preview like the other report cards (FleetRecords) —
// "View All" opens the modal for the full paginated list.
const PREVIEW_SIZE = 5;

export default function QueueLog({
  queueData,
  queueMeta,
  onQueueFetchPage,
  onQueueFetchAll,
  onExportQueuePDF,
  roamingData,
  roamingMeta,
  onRoamingFetchPage,
  onRoamingFetchAll,
  onExportRoamingPDF,
  STATUS_COLORS,
  pageSize,
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [modalPage, setModalPage] = useState(1);
  const [modalData, setModalData] = useState([]);
  const [modalMeta, setModalMeta] = useState({ count: 0, totalPages: 1 });
  const modalBodyRef = useRef(null);

  const isAll = activeTab === "all";
  const isQueue = activeTab === "queue";

  // "All" merges both sources into the queue-log row shape, newest first. The two
  // endpoints paginate independently, so the merged list is fetched whole and
  // paged client-side.
  const fetchAllMerged = useCallback(async (q = "") => {
    const [queue, roaming] = await Promise.all([onQueueFetchAll(q), onRoamingFetchAll(q)]);
    return [...queue.map(withQueueType), ...roaming.map(roamingToLogRow)].sort(
      (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0),
    );
  }, [onQueueFetchAll, onRoamingFetchAll]);

  const fetchAllPage = useCallback(async (page) => {
    const rows = await fetchAllMerged();
    return {
      results: rows.slice((page - 1) * pageSize, page * pageSize),
      count: rows.length,
      totalPages: Math.max(Math.ceil(rows.length / pageSize), 1),
      page,
    };
  }, [fetchAllMerged, pageSize]);

  const data = isAll
    ? [...queueData.map(withQueueType), ...roamingData.map(roamingToLogRow)].sort(
        (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0),
      )
    : isQueue ? queueData : roamingData;
  const meta = isAll
    ? { count: queueMeta.count + roamingMeta.count }
    : isQueue ? queueMeta : roamingMeta;
  const fetchPage = isAll ? fetchAllPage : isQueue ? onQueueFetchPage : onRoamingFetchPage;
  const fetchAll = isAll ? fetchAllMerged : isQueue ? onQueueFetchAll : onRoamingFetchAll;

  const matches = isAll || isQueue ? matchesQueueRow : matchesRoamingRow;

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

  const renderQueueRow = (l, idx, { rowClass, cellClass }) => (
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

  const renderAllRow = (l, idx, { rowClass, cellClass }) => (
    <tr key={`${l.type}-${l.id}-${idx}`} className={rowClass}>
      <td className={`${cellClass} rpt-mono rpt-muted`}>{l.timestamp ? new Date(l.timestamp).toLocaleString() : "—"}</td>
      <td className={`${cellClass} rpt-mono`}>{l.ticket_id}</td>
      <td className={cellClass}>
        <span
          className="rpt-action-pill"
          style={{ background: `${TYPE_COLORS[l.type]}22`, color: TYPE_COLORS[l.type] }}
        >
          {l.type}
        </span>
      </td>
      <td className={cellClass}>{l.driver}</td>
      <td className={cellClass}>{l.vehicle ? <span className="rpt-plate">{l.vehicle}</span> : <span className="rpt-na">—</span>}</td>
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
    </tr>
  );

  const columns = isAll ? ALL_COLUMNS : isQueue ? QUEUE_COLUMNS : ROAMING_COLUMNS;
  const rowRenderer = isAll ? renderAllRow : isQueue ? renderQueueRow : renderRoamingRow;
  const tabTitle = isAll ? "All Logs" : isQueue ? "Terminal Queue Log" : "Roaming Logs";

  const handleExport = async () => {
    if (isAll || isQueue) await onExportQueuePDF(search);
    if (isAll || !isQueue) await onExportRoamingPDF(search);
  };

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <div className="rpt-tab-group">
            <button
              className={`rpt-tab ${isAll ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("all")}
            >
              All
            </button>
            <button
              className={`rpt-tab ${isQueue ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("queue")}
            >
              Terminal Queue Log
            </button>
            <button
              className={`rpt-tab ${activeTab === "roaming" ? "rpt-tab--active" : ""}`}
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
            className="rpt-btn-export rpt-btn-export--navy"
            title={search ? "Export only rows matching your search" : "Export all records in range"}
            onClick={handleExport}
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
          title={tabTitle}
          subtitle={isAll ? "Queue and roaming activity combined" : isQueue ? "Full ticket activity history" : "Full roaming vehicle activity history"}
          count={modalTotal}
          onClose={closeModal}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder={isAll ? "Search all…" : isQueue ? "Search logs…" : "Search roaming…"}
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
