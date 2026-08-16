export default function Pager({ page, totalPages, count, pageSize, onPageChange }) {
  if (count === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, count);

  return (
    <div className="rpt-pager">
      <span className="rpt-pager-info">
        {start}–{end} of {count}
      </span>
      <div className="rpt-pager-controls">
        <button
          type="button"
          className="rpt-btn rpt-btn--secondary"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Prev
        </button>
        <span className="rpt-pager-page">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="rpt-btn rpt-btn--secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
