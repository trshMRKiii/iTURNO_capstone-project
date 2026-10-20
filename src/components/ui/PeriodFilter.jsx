import React from "react";
import { PERIODS, ALL_PERIOD } from "../../lib/period";
import "../../styles/PeriodFilter.css";

// Period chips + (for "custom") From/To date inputs. `filter` is the object
// returned by usePeriodFilter().
function PeriodFilter({ filter, includeAll = false }) {
  const { period, fromDate, toDate, today, setPeriod, setFrom, setTo } = filter;
  const periods = includeAll ? [ALL_PERIOD, ...PERIODS] : PERIODS;

  return (
    <div className="period-filter">
      <div className="period-chips">
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`period-chip${period === p.key ? " period-chip--active" : ""}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <>
          <label>
            From
            <input type="date" value={fromDate} max={today} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={toDate} max={today} onChange={(e) => setTo(e.target.value)} />
          </label>
        </>
      )}
    </div>
  );
}

export default PeriodFilter;
