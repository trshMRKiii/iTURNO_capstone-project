import "../../../../styles/Pager.css";

export default function Pager({ page, totalPages, count, pageSize, onPageChange }) {
  if (count === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, count);

  return (
    <div className="rpt-pager">
      <span className="rpt-pager-info">
        {start}–{end} of {count} records
      </span>
      <div className="rpt-pager-controls">
        {[
          { label: "First page", glyph: "«", to: 1, off: page <= 1 },
          { label: "Previous page", glyph: "‹", to: page - 1, off: page <= 1 },
        ].map((b) => (
          <button key={b.label} type="button" className="rpt-pager-btn" aria-label={b.label} onClick={() => onPageChange(b.to)} disabled={b.off}>
            {b.glyph}
          </button>
        ))}
        <span className="rpt-pager-page">
          Page {page} of {totalPages}
        </span>
        {[
          { label: "Next page", glyph: "›", to: page + 1, off: page >= totalPages },
          { label: "Last page", glyph: "»", to: totalPages, off: page >= totalPages },
        ].map((b) => (
          <button key={b.label} type="button" className="rpt-pager-btn" aria-label={b.label} onClick={() => onPageChange(b.to)} disabled={b.off}>
            {b.glyph}
          </button>
        ))}
      </div>
    </div>
  );
}
