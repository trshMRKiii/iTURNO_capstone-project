import { Fragment, useState } from "react";
import { DataTable } from "../../../../components/ui/dataTable";
import { IS_REMOTE } from "../../../../lib/api-service";
import BackfillDetail from "./BackfillDetail";
import Pager from "./Pager";
import ExportPdfButton from "./ExportPdfButton";
import { AUDIT_CATEGORIES, auditCategoryOf, formatAuditAction, formatAuditItem, matchesAuditRow, useDebouncedSearchAll, usePagedPreview } from "../reportHook";

const AUDIT_COLUMNS = ["Timestamp", "Action", "Item", "User"];
// Rows per page on the card.
const PREVIEW_SIZE = 5;

export default function AuditTrail({ auditData, auditMeta, onAuditFetchPage, onAuditFetchAll, onExportPDF }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [openId, setOpenId] = useState(null);

  // auditData only ever hold one loaded page — once there's an actual
  // query or category, filter the complete date-ranged result set instead of just that page.
  const byCategory = category !== "all";
  const searchAll = useDebouncedSearchAll(onAuditFetchAll, search.trim() || (byCategory ? category : ""));

  const searched = (searchAll || auditData).filter(
    (l) => matchesAuditRow(l, search) && (!byCategory || auditCategoryOf(l) === category),
  );
  const filtering = Boolean(search.trim()) || byCategory;
  const total = filtering ? searched.length : auditMeta.count;
  const { rows: preview, loading, page, totalPages, setPage } = usePagedPreview({
    rows: searched,
    total,
    fetchPage: onAuditFetchPage,
    local: filtering,
    resetKey: [onAuditFetchPage, search, category],
    size: PREVIEW_SIZE,
  });

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
      <td className={`${cellClass} rpt-muted`}>{l.user_name || "System"}</td>
    </tr>
  );

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <h2 className="rpt-card-title">Audit Trail</h2>
        </div>
        <div className="rpt-card-header-actions">
          <select
            className="rpt-search-input rpt-route-select"
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {[...Object.entries(AUDIT_CATEGORIES), ["Other", "Other"]].map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search audit trail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ExportPdfButton
            title={filtering ? "Export only rows matching your filters" : "Export all records in range"}
            label={filtering ? "Export Matches (PDF)" : "Export PDF"}
            onExport={() => onExportPDF(search, category)}
          />
        </div>
      </div>

      <DataTable columns={AUDIT_COLUMNS} data={preview} rowRenderer={renderRow} emptyText={loading ? "Loading…" : undefined} />
      <Pager page={page} totalPages={totalPages} count={total} pageSize={PREVIEW_SIZE} onPageChange={setPage} />
    </div>
  );
}
