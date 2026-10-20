import React, { useEffect, useRef, useState } from "react";
import "../../../styles/SupervisorPicker.css";

// Pick one supervisor by name. Typing only filters the list; what is chosen is always an
// entry from it (its id goes up), so free text can never become the value.
export default function SupervisorPicker({ supervisors, value, onChange, disabled, className = "" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selected = supervisors.find((s) => String(s.id) === String(value));
  const needle = query.trim().toLowerCase();
  const matches = supervisors.filter((s) => s.name.toLowerCase().includes(needle));

  const pick = (id) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="sup-combo" ref={ref}>
      <input
        className={className}
        value={open ? query : selected?.name ?? ""}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQuery(""); } }}
        placeholder="Search supervisor…"
        aria-label="Supervisor"
        spellCheck={false}
      />
      {open && (
        <ul className="sup-combo-list" role="listbox">
          {matches.length === 0 && <li className="sup-combo-empty">No supervisor found</li>}
          {matches.map((s) => (
            <li key={s.id} role="option" aria-selected={String(s.id) === String(value)}>
              <button type="button" className="sup-combo-option" onClick={() => pick(s.id)}>{s.name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
