import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../styles/ClockTimePicker.css";

const CLOCK_NUMBERS = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i));

function formatDisplay(hour) {
  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return { hour12, period };
}

/**
 * Hour-only clock-dial time picker, styled like a Material time picker.
 * value / onChange operate on a 24-hour integer (0-23).
 */
function ClockTimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const { hour12, period } = formatDisplay(Number(value) || 0);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;

    const POPOVER_WIDTH = 240;
    const POPOVER_HEIGHT = 400;
    const GAP = 8;

    const reposition = () => {
      const rect = wrapRef.current.getBoundingClientRect();
      let top = rect.bottom + GAP;
      if (top + POPOVER_HEIGHT > window.innerHeight) {
        top = Math.max(GAP, rect.top - GAP - POPOVER_HEIGHT);
      }
      let left = rect.left;
      if (left + POPOVER_WIDTH > window.innerWidth) {
        left = Math.max(GAP, window.innerWidth - POPOVER_WIDTH - GAP);
      }
      setCoords({ top, left });
    };

    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const setHour12 = (h12) => {
    const isPM = period === "PM";
    const hour24 = isPM ? (h12 % 12) + 12 : h12 % 12;
    onChange(hour24);
  };

  const setPeriod = (nextPeriod) => {
    const isPM = nextPeriod === "PM";
    const hour24 = isPM ? (hour12 % 12) + 12 : hour12 % 12;
    onChange(hour24);
  };

  return (
    <div className="ctp-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ctp-trigger set-input"
        onClick={() => setOpen((v) => !v)}
      >
        {String(hour12).padStart(2, "0")}:00 {period}
      </button>

      {open && createPortal(
        <div
          className="ctp-popover"
          ref={popoverRef}
          style={{ position: "fixed", top: coords.top, left: coords.left }}
        >
          <div className="ctp-readout">
            <span className="ctp-readout-hour">{String(hour12).padStart(2, "0")}</span>
            <span className="ctp-readout-colon">:00</span>
            <div className="ctp-ampm">
              <button
                type="button"
                className={`ctp-ampm-btn ${period === "AM" ? "ctp-ampm-btn-active" : ""}`}
                onClick={() => setPeriod("AM")}
              >
                AM
              </button>
              <button
                type="button"
                className={`ctp-ampm-btn ${period === "PM" ? "ctp-ampm-btn-active" : ""}`}
                onClick={() => setPeriod("PM")}
              >
                PM
              </button>
            </div>
          </div>

          <div className="ctp-dial">
            <div className="ctp-dial-center" />
            <div
              className="ctp-dial-hand"
              style={{ transform: `rotate(${(hour12 % 12) * 30}deg)` }}
            />
            {CLOCK_NUMBERS.map((n) => {
              const angle = (n % 12) * 30 - 90;
              const radius = 78;
              const x = 100 + radius * Math.cos((angle * Math.PI) / 180);
              const y = 100 + radius * Math.sin((angle * Math.PI) / 180);
              const active = n === hour12;
              return (
                <button
                  type="button"
                  key={n}
                  className={`ctp-dial-num ${active ? "ctp-dial-num-active" : ""}`}
                  style={{ left: `${x}px`, top: `${y}px` }}
                  onClick={() => setHour12(n)}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="ctp-footer">
            <button type="button" className="ctp-ok-btn" onClick={() => setOpen(false)}>
              OK
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default ClockTimePicker;
