import React, { useEffect, useRef, useState } from "react";

// Free-text input with a dropdown of previously used names (see useCashierName).
// Not a <datalist>: that only lists names matching the current text, so a
// pre-filled name would hide every other option.
export default function CashierNameInput({ name, setName, names, disabled, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (n) => {
    setName(n);
    setOpen(false);
  };

  return (
    <div className="rem-combo" ref={ref}>
      <input
        className={className}
        value={name}
        disabled={disabled}
        onChange={(e) => setName(e.target.value.toUpperCase())}
        style={{ textTransform: "uppercase" }}
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        placeholder="Type or pick a name"
        aria-label="Cashier/Treasurer name"
      />
      <button
        type="button"
        className="rem-combo-toggle"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label="Show saved names"
        aria-expanded={open}
      >
        ▾
      </button>
      {open && (
        <ul className="rem-combo-list" role="listbox">
          {names.map((n) => (
            <li key={n} role="option" aria-selected={n === name}>
              <button type="button" className="rem-combo-option" onClick={() => pick(n)}>{n}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
