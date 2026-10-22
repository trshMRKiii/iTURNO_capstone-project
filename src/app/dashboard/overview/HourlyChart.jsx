import { useState } from "react";
import { asSplit, fullDay, hourRange, hourTick, hourWindow, niceScale, peso, pesoShort, percentChange } from "./format";

function Stat({ label, value, sub, tone }) {
  return (
    <div className="hc-stat">
      <span className="hc-stat-label">{label}</span>
      <strong className={`hc-stat-value${tone ? ` is-${tone}` : ""}`}>{value}</strong>
      <span className="hc-stat-sub">{sub}</span>
    </div>
  );
}

// Measured in revenue, not ticket count: denominations differ, so a ticket count says little
// about how much an hour brought in. `route` (a route name, or null for the whole terminal)
// narrows every number and bar to it.
export default function HourlyChart({ stats, rangeLabel, comparedTo, route, onClearRoute }) {
  const [hovered, setHovered] = useState(null);

  const routeRow = route && stats.route_performance.find((r) => r.name === route);
  const hourly = fullDay(route ? routeRow?.hourly : stats.hourly);
  const { compared } = stats;
  const current = route ? asSplit(compared.current_routes[route]) : compared.current;
  const previous = route ? asSplit(compared.previous_routes[route]) : compared.previous;

  const [from, to] = hourWindow(hourly.filter((h) => h.queued + h.roamed > 0).map((h) => h.hour));
  const points = hourly.slice(from, to + 1).map((h) => ({
    hour: h.hour,
    queued: h.queued_total,
    roamed: h.roamed_total,
    total: h.queued_total + h.roamed_total,
  }));
  const total = points.reduce((sum, p) => sum + p.total, 0);

  // Today is only part-way through, so its average runs over the hours that have happened.
  const sameDay = stats.start_date === stats.end_date;
  const elapsed = stats.as_of && sameDay ? Math.min(Math.max(stats.as_of.hour - from + 1, 1), points.length) : points.length;
  const average = total / elapsed;
  const busiest = total > 0 ? points.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  const active = points.find((p) => p.hour === (hovered ?? busiest?.hour));

  const sum = (s) => s.queued.total + s.roamed.total;
  // Today is judged up to the current time; a longer range leaves today out until it is over.
  const compareNote = sameDay && stats.as_of ? ` by ${stats.as_of.label}` : compared.trimmed ? " · completed days only" : "";
  const change = percentChange(sum(current), sum(previous));
  const { top, ticks } = niceScale(Math.max(...points.map((p) => p.total), average, 1));

  return (
    <section className="dash-card">
      <div className="dash-card-head">
        <div>
          <div className="dash-card-title">Collections by hour</div>
          <div className="dash-card-sub">
            {rangeLabel}
            {stats.as_of && sameDay && ` so far · as of ${stats.as_of.label}`}
          </div>
          {route && (
            <button type="button" className="hc-filter" onClick={onClearRoute} aria-label={`Clear route filter: ${route}`}>
              {route} <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      </div>

      <div className="hc-stats">
        <Stat label="Total revenue" value={peso(total)} sub={rangeLabel} />
        <Stat label="Average" value={peso(average)} sub="per hour" />
        <Stat label="Busiest" value={busiest ? hourRange(busiest.hour) : "—"} sub={busiest ? peso(busiest.total) : "No collections yet"} />
        <Stat
          label="Change"
          value={change === null ? "—" : `${change < 0 ? "▼" : change > 0 ? "▲" : "–"} ${Math.abs(change)}%`}
          tone={change === null || change === 0 ? undefined : change < 0 ? "down" : "up"}
          sub={change === null ? `No data for ${comparedTo}` : `vs ${comparedTo}${compareNote}`}
        />
      </div>

      <div className="hc-readout">
        <span>
          {active ? (
            <>
              <strong>{hourRange(active.hour)}</strong> · {peso(active.total)} ({peso(active.queued)} queued · {peso(active.roamed)} roamed)
            </>
          ) : (
            "No collections in this period yet"
          )}
        </span>
        <span className="hc-legend">
          <span className="hc-key hc-key--queued">Queued</span>
          <span className="hc-key hc-key--roamed">Roamed</span>
          <span className="hc-key hc-key--avg">Average</span>
        </span>
      </div>

      <div className="hc-chart" style={{ "--hours": points.length }} onMouseLeave={() => setHovered(null)}>
        <div className="hc-y">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
              {pesoShort(t)}
            </span>
          ))}
        </div>
        <div className="hc-area">
          {ticks.map((t) => (
            <i key={t} className="hc-grid" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <i className="hc-avg" style={{ bottom: `${(average / top) * 100}%` }} />
          <div className="hc-cols">
            {points.map((p) => (
              <div
                key={p.hour}
                className={`hc-col${p.hour === active?.hour ? " is-active" : ""}`}
                tabIndex={0}
                aria-label={`${hourRange(p.hour)}: ${peso(p.total)}`}
                onMouseEnter={() => setHovered(p.hour)}
                onFocus={() => setHovered(p.hour)}
              >
                {p.total > 0 && (
                  <div className="hc-bar" style={{ height: `${(p.total / top) * 100}%` }}>
                    <span className="hc-seg hc-seg--roamed" style={{ flexGrow: p.roamed }} />
                    <span className="hc-seg hc-seg--queued" style={{ flexGrow: p.queued }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="hc-x">
          {points.map((p) => (
            <span key={p.hour}>{hourTick(p.hour)}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
