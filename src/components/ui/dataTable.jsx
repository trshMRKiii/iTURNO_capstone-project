export const DataTable = ({ columns, data, rowRenderer }) => (
  <div className="rpt-table-wrap">
    <table className="rpt-table">
      <thead>
        <tr className="rpt-thead-row">
          {columns.map((h) => (
            <th key={h} className="rpt-th">{h}</th>
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
                <span>No records found.</span>
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
