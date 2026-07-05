import React from "react";

/**
 * Reusable "add item" modal for the Settings page (PUV Types, Routes, Ticket Forms, ...).
 *
 * fields: [{ name, label, type = "text", placeholder, step, min }]
 * values: { [field.name]: value }
 */
function SettingsModal({
  open,
  title,
  fields = [],
  values = {},
  onChange,
  onClose,
  onSubmit,
  saving = false,
  submitLabel = "Save",
}) {
  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.();
  };

  return (
    <div className="setm-overlay" onClick={onClose}>
      <div className="setm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="setm-header">
          <h2 className="setm-title">{title}</h2>
          <button type="button" className="setm-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="setm-body">
            {fields.map((field) => (
              <label key={field.name} className="setm-field">
                <span className="setm-field-label">{field.label}</span>
                <input
                  type={field.type || "text"}
                  className="setm-input"
                  placeholder={field.placeholder}
                  step={field.step}
                  min={field.min}
                  value={values[field.name] ?? ""}
                  onChange={(e) => onChange?.(field.name, e.target.value)}
                  autoFocus={field === fields[0]}
                />
              </label>
            ))}
          </div>
          <div className="setm-footer">
            <button type="button" className="setm-btn setm-btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="setm-btn setm-btn--submit" disabled={saving}>
              {saving ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SettingsModal;
