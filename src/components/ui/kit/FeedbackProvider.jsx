import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeedbackContext } from "./feedbackContext";
import Dialog from "./Dialog";
import ActionButton from "./ActionButton";
import { CheckIcon, CloseIcon } from "./icons";

const SUCCESS_MS = 2000;
const UNDO_MS = 5000;

function Notification({ note, onClose }) {
  const isError = note.kind === "error";

  useEffect(() => {
    if (!isError) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isError, onClose]);

  useEffect(() => {
    if (isError) return undefined;
    const t = setTimeout(onClose, note.duration);
    return () => clearTimeout(t);
  }, [isError, note.duration, note.id, onClose]);

  return (
    <div className="ui-note-layer">
      <div className={`ui-note ui-note--${note.kind}`} role={isError ? "alert" : "status"}>
        <button type="button" className="ui-note-x" onClick={onClose} aria-label="Dismiss">
          <CloseIcon size={14} />
        </button>
        <span className={`ui-note-icon ui-note-icon--${note.kind}`}>
          {isError ? <span className="ui-note-bang">!</span> : <CheckIcon size={20} />}
        </span>
        <h3 className="ui-note-title">{note.title}</h3>
        {note.message && <p className="ui-note-text">{note.message}</p>}

        {!isError && note.undo && (
          <button
            type="button"
            className="ui-outline-btn ui-outline-btn--auto"
            onClick={() => { onClose(); note.undo.onUndo(); }}
          >
            {note.undo.label || "Undo"}
          </button>
        )}
        {isError && (
          <div className="ui-note-actions">
            <button type="button" className="ui-outline-btn ui-outline-btn--auto" onClick={onClose}>Close</button>
            {note.onRetry && (
              <button type="button" className="ui-primary-btn" onClick={() => { onClose(); note.onRetry(); }}>Try again</button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

/**
 * Wrap the Settings module with this once. It owns the centered notifications
 * and the confirm dialog, so every add, edit, archive, delete and restore in
 * Settings gives the same feedback.
 */
function FeedbackProvider({ children }) {
  const [note, setNote] = useState(null);
  const [confirm, setConfirm] = useState(null); // { opts, working }
  const idRef = useRef(0);
  const resolveRef = useRef(null);

  const dismiss = useCallback(() => setNote(null), []);

  const notify = useMemo(() => ({
    success: (opts) => setNote({ ...opts, kind: "success", id: ++idRef.current, duration: opts.undo ? UNDO_MS : SUCCESS_MS }),
    error: (opts) => setNote({ ...opts, kind: "error", id: ++idRef.current }),
  }), []);

  const report = useCallback((outcome) => {
    if (outcome?.error) notify.error(outcome.error);
    else if (outcome?.success) notify.success(outcome.success);
  }, [notify]);

  const confirmAction = useCallback((opts) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setConfirm({ opts, working: false });
  }), []);

  const cancelConfirm = () => {
    setConfirm(null);
    resolveRef.current?.(null);
  };

  const runConfirm = async () => {
    const { opts } = confirm;
    setConfirm({ opts, working: true });
    let outcome;
    try {
      outcome = await opts.run();
    } catch (err) {
      console.error(err);
      outcome = { error: { title: "Something went wrong", message: err?.message || "Nothing was changed. Try again." } };
    }
    setConfirm(null);
    report(outcome);
    resolveRef.current?.(outcome);
  };

  const value = useMemo(() => ({ notify, report, confirmAction }), [notify, report, confirmAction]);
  const opts = confirm?.opts;

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {note && <Notification key={note.id} note={note} onClose={dismiss} />}

      <Dialog open={!!confirm} onClose={cancelConfirm} busy={!!confirm?.working} size="sm" title={opts?.title || ""}
        footer={opts && (
          <>
            <ActionButton variant="secondary" onClick={cancelConfirm} disabled={confirm.working}>Cancel</ActionButton>
            <ActionButton variant={opts.tone === "primary" ? "primary" : opts.tone === "success" ? "success" : "danger"} busy={confirm.working} busyLabel={opts.busyLabel} onClick={runConfirm}>
              {opts.confirmLabel || "Confirm"}
            </ActionButton>
          </>
        )}
      >
        {opts?.message && <p className="ui-confirm-text">{opts.message}</p>}
      </Dialog>
    </FeedbackContext.Provider>
  );
}

export default FeedbackProvider;
