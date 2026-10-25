import { useState, useRef, useCallback } from "react";
import { DataTable } from "../../../../components/ui/dataTable";
import Pager from "./Pager";
import ExportPdfButton from "./ExportPdfButton";
import { matchesQueueRow, matchesRoamingRow, useDebouncedSearchAll, usePagedPreview } from "../reportHook";
const QUEUE_COLUMNS = ["Timestamp", "Ticket ID", "Driver", "Vehicle", "Route", "Issued By", "Dispatched By"];
const ROAMING_COLUMNS = ["Timestamp", "Ticket ID", "Driver", "Vehicle", "Route", "Issued By", "Dispatched By"];
const ALL_COLUMNS = ["Timestamp", "Ticket ID", "Type", "Driver", "Vehicle", "Route", "Issued By", "Dispatched By"];

const withQueueType = (l) => ({ ...l, type: "Queue" });
const roamingToLogRow = (t) => ({
  id: t.id,
  timestamp: t.issued_at,
  ticket_id: String(t.id || "").replace(/^TICKET-/i, ""),
  driver: t.driver?.name || "",
  vehicle: t.vehicle?.plate_number || "",
  route: t.route_name || "",
  issued_by: t.checked_in_by_name || "—",
  dispatched_by: t.checked_out_by_name || "—",
  type: "Roaming",
});
const sortNewest = (rows) => rows.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
const TOP_BLOCKS = 3; // blocks served by the fast newest-rows fetch before falling back to the full merge
const MAX_PAGE_SIZE = 200; // the server caps page_size here

// Newest `n` rows of one source, in as few requests of <= MAX_PAGE_SIZE rows as it takes.
const fetchNewest = async (fetchPage, n) => {
  const parts = Math.ceil(n / MAX_PAGE_SIZE);
  const size = Math.ceil(n / parts);
  const pages = await Promise.all(Array.from({ length: parts }, (_, i) => fetchPage(i + 1, size)));
  return { results: pages.flatMap((p) => p.results), count: pages[0].count };
};
const MERGED_TTL_MS = 60_000;
const TYPE_COLORS ={ Queue: "#2563eb", Roaming: "#7c3aed" };
// Rows per page on the card.
const PREVIEW_SIZE = 5;

export default function QueueLog({
  queueData,
  queueMeta,
  onQueueFetchPage,
  onQueueFetchAll,
  onExportAllPDF,
  onExportQueuePDF,
  roamingData,
  roamingMeta,
  onRoamingFetchPage,
  onRoamingFetchAll,
  onExportRoamingPDF,
  pageSize,
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");


  const isAll = activeTab === "all";
  const isQueue = activeTab === "queue";

  // "All" merges both sources into the queue-log row shape, newest first. The two
  // endpoints paginate independently, so the merged list is fetched whole and
  // paged client-side.
  const fetchAllMerged = useCallback(async (q = "") => {
    const [queue, roaming] = await Promise.all([onQueueFetchAll(q), onRoamingFetchAll(q)]);
    return sortNewest([...queue.map(withQueueType), ...roaming.map(roamingToLogRow)]);
  }, [onQueueFetchAll, onRoamingFetchAll]);

  // The full merge is the slow part (every ticket in range), so it's downloaded once
  // per date range and shared by the card pager.
  const mergedCache = useRef(null);
  const loadMerged = useCallback(() => {
    const hit = mergedCache.current;
    if (hit && hit.src === fetchAllMerged && Date.now() - hit.at < MERGED_TTL_MS) return hit.promise;
    const promise = fetchAllMerged();
    mergedCache.current = { src: fetchAllMerged, at: Date.now(), promise };
    promise.catch(() => { mergedCache.current = null; });
    return promise;
  }, [fetchAllMerged]);

  // Both sources are newest-first, so while the full merge isn't loaded, block N only
  // needs the newest N*size rows of each.
  const fetchAllPage = useCallback(async (page, size = pageSize) => {
    const need = page * size;
    const hit = mergedCache.current;
    const cached = hit && hit.src === fetchAllMerged && Date.now() - hit.at < MERGED_TTL_MS;
    let rows;
    let count;
    if (!cached && page <= TOP_BLOCKS) {
      const [queue, roaming] = await Promise.all([fetchNewest(onQueueFetchPage, need), fetchNewest(onRoamingFetchPage, need)]);
      rows = sortNewest([...queue.results.map(withQueueType), ...roaming.results.map(roamingToLogRow)]);
      count = queue.count + roaming.count;
    } else {
      rows = await loadMerged();
      count = rows.length;
    }
    return {
      results: rows.slice((page - 1) * size, need),
      count,
      totalPages: Math.max(Math.ceil(count / size), 1),
      page,
    };
  }, [fetchAllMerged, loadMerged, onQueueFetchPage, onRoamingFetchPage, pageSize]);

  const data = isAll
    ? sortNewest([...queueData.map(withQueueType), ...roamingData.map(roamingToLogRow)])
    : isQueue ? queueData : roamingData;
  const meta = isAll
    ? { count: queueMeta.count + roamingMeta.count }
    : isQueue ? queueMeta : roamingMeta;
  const fetchPage = isAll ? fetchAllPage : isQueue ? onQueueFetchPage : onRoamingFetchPage;
  const fetchAll = isAll ? fetchAllMerged : isQueue ? onQueueFetchAll : onRoamingFetchAll;

  const matches = isAll || isQueue ? matchesQueueRow : matchesRoamingRow;

  // data only ever hold one loaded page — once there's an actual
  // query, search the complete date-ranged result set instead of just that page.
  const searchAll = useDebouncedSearchAll(fetchAll, search);

  const searched = searchAll
    ? searchAll.filter((row) => matches(row, search))
    : data.filter((row) => matches(row, search));
  const filtering = Boolean(search.trim());
  const total = filtering ? searched.length : meta.count;
  // Only the newest `pageSize` merged rows are guaranteed in order (each source
  // preloaded `pageSize`); anything deeper comes from the block fetch.
  const { rows: preview, loading, page, totalPages, setPage } = usePagedPreview({
    rows: filtering ? searched : searched.slice(0, pageSize),
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

  const renderQueueRow = (l, idx, { rowClass, cellClass }) => (
    <tr key={`${l.id}-${idx}`} className={rowClass}>
      <td className={`${cellClass} rpt-mono rpt-muted`}>{l.timestamp ? new Date(l.timestamp).toLocaleString() : "—"}</td>
      <td className={`${cellClass} rpt-mono`}>{l.ticket_id}</td>
      <td className={cellClass}>{l.driver}</td>
      <td className={cellClass}><span className="rpt-plate">{l.vehicle}</span></td>
      <td className={cellClass}>{l.route}</td>
      <td className={cellClass}>{l.issued_by}</td>
      <td className={cellClass}>{l.dispatched_by}</td>
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
      <td className={cellClass}>{l.issued_by}</td>
      <td className={cellClass}>{l.dispatched_by}</td>
    </tr>
  );

  const renderRoamingRow = (t, idx, { rowClass, cellClass }) => (
    <tr key={t.id} className={rowClass}>
      <td className={`${cellClass} rpt-mono rpt-muted`}>{t.issued_at ? new Date(t.issued_at).toLocaleString() : "—"}</td>
      <td className={`${cellClass} rpt-mono`}>{String(t.id).replace(/^TICKET-/i, "")}</td>
      <td className={cellClass}>{t.driver?.name || <span className="rpt-na">—</span>}</td>
      <td className={cellClass}>
        {t.vehicle?.plate_number ? (
          <span className="rpt-plate">{t.vehicle.plate_number}</span>
        ) : (
          <span className="rpt-na">—</span>
        )}
      </td>
      <td className={cellClass}>{t.route_name || <span className="rpt-na">—</span>}</td>
      <td className={cellClass}>{t.checked_in_by_name ||<span className="rpt-na">—</span>}</td>
      <td className={cellClass}>{t.checked_out_by_name || <span className="rpt-na">—</span>}</td>
    </tr>
  );

  const columns = isAll ? ALL_COLUMNS : isQueue ? QUEUE_COLUMNS : ROAMING_COLUMNS;
  const rowRenderer = isAll ? renderAllRow : isQueue ? renderQueueRow : renderRoamingRow;

  const handleExport = (onProgress) =>
    (isAll ? onExportAllPDF : isQueue ? onExportQueuePDF : onExportRoamingPDF)(search, onProgress);

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <h2 className="rpt-card-title">Queue and Roaming Logs</h2>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ExportPdfButton
            title={search ? "Export only rows matching your search" : "Export all records in range"}
            label={search ? "Export Matches (PDF)" : "Export PDF"}
            onExport={handleExport}
          />
        </div>
      </div>

      <div className="rpt-card-tabs">
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

      <DataTable columns={columns} data={preview} rowRenderer={rowRenderer} emptyText={loading ? "Loading…" : undefined} />
      <Pager page={page} totalPages={totalPages} count={total} pageSize={PREVIEW_SIZE} onPageChange={setPage} />
    </div>
  );
}
