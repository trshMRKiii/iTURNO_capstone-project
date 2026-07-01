import React from "react";

export default function ReportTableModal({ title, subtitle, count, onClose, children, searchValue, onSearchChange, searchPlaceholder }) {
  return (
    <div className="rpt-overlay" onClick={onClose}>
      <div className="rpt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rpt-modal-header">
          <div className="rpt-modal-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <div>
              <h2 className="rpt-modal-title">{title}</h2>
              {subtitle && <p className="rpt-modal-subtitle">{subtitle}</p>}
            </div>
          </div>
          <div className="rpt-modal-header-right">
            {typeof count === "number" && (
              <span className="rpt-modal-count">{count} record{count !== 1 ? "s" : ""}</span>
            )}
            {onSearchChange && (
              <input
                type="text"
                className="rpt-search-input"
                placeholder={searchPlaceholder || "Search…"}
                value={searchValue || ""}
                onChange={(e) => onSearchChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <button className="rpt-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="rpt-modal-body">{children}</div>
      </div>
    </div>
  );
}
