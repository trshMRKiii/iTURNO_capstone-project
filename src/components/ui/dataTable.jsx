// Header cell; clickable with an ▲/▼ indicator when `onSort` is given. `sort` is { column, dir }.
export const SortTh = ({ label, centered, sort, onSort }) => (
  <th
    className={`rpt-th${centered ? " rpt-th--center" : ""}${onSort ? " rpt-th--sortable" : ""}`}
    aria-sort={sort?.column === label ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    onClick={onSort && (() => onSort(label))}
  >
    {label}
    {onSort && <span className="rpt-sort-icon">{sort?.column === label ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>}
  </th>
);

export const DataTable = ({ columns, data, rowRenderer, centeredColumns = [], emptyText = "No records found.", sort, onSort }) => (
  <div className="rpt-table-wrap">
    <table className="rpt-table">
      <thead>
        <tr className="rpt-thead-row">
          {columns.map((h) => (
            <SortTh key={h} label={h} centered={centeredColumns.includes(h)} sort={sort} onSort={onSort} />
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="rpt-td-empty">
              <div className="rpt-td-empty-inner">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span>{emptyText}</span>
              </div>
            </td>
          </tr>
        ) : (
          data.map((row, idx) =>
            rowRenderer(row, idx, {
              rowClass: "rpt-tr",
              cellClass: "rpt-td",
            })
          )
        )}
      </tbody>
    </table>
  </div>
);
