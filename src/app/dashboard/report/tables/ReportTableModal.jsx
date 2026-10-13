import React from "react";

export default function ReportTableModal({ title, subtitle, count, onClose, children, footer, bodyRef, searchValue, onSearchChange, searchPlaceholder }) {
  return (
    <div className="rpt-overlay" onClick={onClose}>
      <div className="rpt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rpt-modal-header">
          <div className="rpt-modal-header-left">
            <h2 className="rpt-modal-title">{title}</h2>
            {typeof count === "number" && (
              <span className="rpt-modal-count">{count} record{count !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="rpt-modal-header-right">
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

        <div className="rpt-modal-body" ref={bodyRef}>{children}</div>
        {footer && <div className="rpt-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
