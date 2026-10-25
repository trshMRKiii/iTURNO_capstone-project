import { Fragment } from "react";
import { Skel } from "../../../components/ui/kit";
import { hourRange, hourTick, hourWindow } from "./format";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEGEND_SHADES = [8, 35, 65, 100];
// Shade (percent of full colour) for a cell: even an empty hour stays faintly visible.
const shade = (value, peak) => Math.round(8 + 92 * (value / peak));

// ["2026-09-22", "2026-09-29"] -> "Sep 22, Sep 29" — the days a cell's average is taken over.
const MAX_LISTED_DAYS = 6;
const shortDay = (iso) => new Date(`${iso}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayList = (isoDates = []) =>
  isoDates.length > MAX_LISTED_DAYS
    ? `${isoDates.length} days, ${shortDay(isoDates[0])} – ${shortDay(isoDates[isoDates.length - 1])}`
    : isoDates.map(shortDay).join(", ");

// `busiest` is null while loading and false if it failed to load.
export default function BusiestTimes({ busiest, rangeLabel }) {
  const grid = busiest?.grid;
  const hours = grid ? [...Array(24).keys()].filter((h) => grid.some((row) => row[h] > 0)) : [];
  const [from, to] = hourWindow(hours);
  const shown = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  let peak = null;
  grid?.forEach((row, day) => {
    shown.forEach((hour) => {
      if (row[hour] > (peak?.value ?? 0)) peak = { day, hour, value: row[hour] };
    });
  });

  let body;
  if (busiest === null) {
    body = <Skel h={200} />;
  } else if (!peak) {
    body = <div className="dash-empty">{busiest ? "No check-ins recorded in this period." : "Couldn't load busiest times."}</div>;
  } else {
    body = (
      <>
        <div className="bt-grid" style={{ "--hours": shown.length }}>
          {DAYS.map((day, d) => (
            <Fragment key={day}>
              <span className="bt-day">{day}</span>
              {shown.map((h) => (
                <i
                  key={h}
                  className={`bt-cell${peak.day === d && peak.hour === h ? " is-peak" : ""}`}
                  style={{ "--shade": `${shade(grid[d][h], peak.value)}%` }}
                  title={`${day} ${hourRange(h)} · ${grid[d][h].toFixed(1)} check-ins on average\n${dayList(busiest.dates?.[d])}`}
                />
              ))}
            </Fragment>
          ))}
          <span />
          {shown.map((h) => (
            <span key={h} className="bt-hour">
              {(h - from) % 2 === 0 ? hourTick(h) : ""}
            </span>
          ))}
        </div>
        <div className="bt-legend">
          Fewer
          {LEGEND_SHADES.map((s) => (
            <i key={s} className="bt-cell" style={{ "--shade": `${s}%` }} />
          ))}
          More
        </div>
      </>
    );
  }

  return (
    <section className="dash-card">
      <div className="dash-card-head">
        <div>
          <div className="dash-card-title">Busiest times</div>
          {peak && (
            <div className="dash-card-sub">
              <strong>
                Peak: {DAYS[peak.day]} {hourRange(peak.hour)}
              </strong>{" "}
              · {peak.value.toFixed(1)} check-ins on average
            </div>
          )}
        </div>
        <span className="dash-card-note">Avg check-ins per hour · {rangeLabel}</span>
      </div>
      {body}
    </section>
  );
}
