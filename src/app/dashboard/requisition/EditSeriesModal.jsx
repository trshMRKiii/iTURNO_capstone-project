import React from "react";
import { ButtonLabel } from "../../../components/ui/kit";

const EditSeriesModal = ({ editing, setEditing, updateEdit, saveEdit, saving }) => {
  if (!editing) return null;

  const close = () => { if (!saving) setEditing(null); };

  return (
    <div className="req-overlay" onClick={close}>
      <div className="req-modal" onClick={(e) => e.stopPropagation()}>
        <div className="req-modal-header">
          <h2 className="req-modal-title">Edit ticket series</h2>
          <button className="req-modal-close" onClick={close} disabled={saving} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="req-modal-body">
          <div className="req-grid-2">
            <div className="req-field">
              <label className="req-label">Start No.</label>
              <input className="req-input" inputMode="numeric" value={editing.start_no} onChange={(e) => updateEdit("start_no", e.target.value)} />
            </div>
            <div className="req-field">
              <label className="req-label">End No.</label>
              <input className="req-input" inputMode="numeric" value={editing.end_no} onChange={(e) => updateEdit("end_no", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="req-modal-footer">
          <button type="button" className="req-cancel-btn" onClick={close} disabled={saving}>Cancel</button>
          <button type="button" className="req-save-btn" onClick={saveEdit} disabled={saving} aria-busy={saving || undefined}>
            <ButtonLabel busy={saving} busyLabel="Saving...">Save changes</ButtonLabel>
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditSeriesModal;
