import React, { useState, useEffect } from "react";
import "../../../styles/Vehicle.css";

// Kebab button + popup for a registry row (shared by the Vehicles and Drivers
// tabs). `items` is [{ label, icon, onClick, danger?, hidden? }].
function RowMenu({ items }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  return (
    <>
      <button
        className={`veh-btn veh-btn--more${pos ? " is-open" : ""}`}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) return setPos(null);
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {pos && (
        <div
          className="veh-menu"
          role="menu"
          style={{ top: pos.top, right: pos.right }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.filter((i) => !i.hidden).map(({ label, icon, onClick, danger }) => (
            <button
              key={label}
              role="menuitem"
              className={`veh-menu-item${danger ? " veh-menu-item--danger" : ""}`}
              onClick={() => {
                onClick();
                setPos(null);
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default RowMenu;
