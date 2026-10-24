import "../../styles/ToastConfirm.css";
import React, { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastCtx   = createContext(null);
const ConfirmCtx = createContext(null);

export const useToast   = () => useContext(ToastCtx);
export const useConfirm = () => useContext(ConfirmCtx);

export function ToastConfirmProvider({ children }) {
  const [toasts,  setToasts]  = useState([]);
  const [confirm, setConfirm] = useState(null);
  const idRef = useRef(0);

  const showToast = useCallback((message, type = "success") => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showConfirm = useCallback((message) =>
    new Promise(resolve => setConfirm({ message, resolve }))
  , []);

  const handleConfirmAnswer = (answer) => {
    if (confirm) confirm.resolve(answer);
    setConfirm(null);
  };

  return (
    <ToastCtx.Provider value={showToast}>
      <ConfirmCtx.Provider value={showConfirm}>
        {children}

        {/* Toast stack */}
        <div className="tc-toast-stack">
          {toasts.map(t => (
            <div key={t.id} className={`tc-toast tc-toast--${t.type}`}>
              <span className="tc-toast__icon">
                {t.type === "success" && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                )}
                {t.type === "info" && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                )}
              </span>
              <span className="tc-toast__msg">{t.message}</span>
              <button className="tc-toast__close" onClick={() => removeToast(t.id)} aria-label="Dismiss">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Confirm dialog */}
        {confirm && (
          <div className="tc-confirm-overlay">
            <div className="tc-confirm-box">
              <div className="tc-confirm-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <path d="M12 9v4"/><path d="M12 17h.01"/>
                </svg>
              </div>
              <p className="tc-confirm-msg">{confirm.message}</p>
              <div className="tc-confirm-btns">
                <button className="tc-confirm-btn tc-confirm-btn--cancel" onClick={() => handleConfirmAnswer(false)}>
                  Cancel
                </button>
                <button className="tc-confirm-btn tc-confirm-btn--ok" onClick={() => handleConfirmAnswer(true)}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}
