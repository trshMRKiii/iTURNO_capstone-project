import { useEffect, useRef, useState } from "react";
import { authFetch } from "../../../../lib/api-service";
import "../../../../styles/SupervisorPicker.css";

const ROLES = [
  ["either", "All"],
  ["issued", "Issued"],
  ["dispatched", "Dispatched"],
];

// "Whose history": a type-ahead over the server's staff search (never the full staff list, so it
// stays fast with many accounts). What gets picked is always a returned entry — its id is what
// the logs filter on, so two people with the same name can't be mixed up.
export default function StaffFilter({ staff, role, totals, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const ref = useRef(null);

  const close = () => { setOpen(false); setQuery(""); };

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) close(); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await authFetch(`/staff/?search=${encodeURIComponent(query.trim())}`);
        const list = res.ok ? await res.json() : [];
        if (!stale) setOptions(Array.isArray(list) ? list : []);
      } catch {
        if (!stale) setOptions([]);
      }
    }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [open, query]);

  const pick = (person) => { onChange(person, role); close(); };

  return (
    <div className="rpt-staff" ref={ref}>
      <div className="rpt-staff-row">
      <div className={`sup-combo rpt-staff-combo${staff ? " is-set" : ""}`}>
        <svg className="rpt-staff-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
        <input
          className="rpt-search-input"
          value={open ? query : staff?.name ?? ""}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Escape") close(); }}
          placeholder="All staff"
          aria-label="Filter by staff member"
          spellCheck={false}
        />
        {staff && (
          <button type="button" className="rpt-staff-clear" aria-label="Clear staff filter" onClick={() => { onChange(null, "either"); close(); }}>✕</button>
        )}
        {open && (
          <ul className="sup-combo-list" role="listbox">
            {options.length === 0 && <li className="sup-combo-empty">No staff found</li>}
            {options.map((p) => (
              <li key={p.id} role="option" aria-selected={p.id === staff?.id}>
                <button type="button" className="sup-combo-option" onClick={() => pick(p)}>
                  {p.name}{p.is_active ? "" : " (inactive)"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {staff && (
        <select
          className="rpt-date-input"
          aria-label="Count tickets this person"
          value={role}
          onChange={(e) => onChange(staff, e.target.value)}
        >
          {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      )}
      </div>
      {staff && totals && (
        <span className="rpt-staff-totals">
          <strong>{totals.issued}</strong> issued · <strong>{totals.dispatched}</strong> dispatched
        </span>
      )}
    </div>
  );
}
