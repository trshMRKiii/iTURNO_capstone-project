import { useState } from "react";
import { Link } from "react-router-dom";
import { formatAuditAction } from "../report/reportHook";

const PAGE_SIZE = 7;
const DAY_MS = 86400000;

const MODELS = {
  TicketSeries: { filter: "Ticket series", noun: "ticket series", badge: "TS" },
  Requisition: { filter: "Requisitions", noun: "requisition", badge: "RQ" },
  TicketForm: { filter: "Ticket forms", noun: "ticket form", badge: "TF" },
};
const REQUISITION_NOTES = { PENDING: "Waiting for approval", APPROVED: "Approved", ISSUED: "Issued" };

const categoryOf = (log) => (MODELS[log.model_name] ? log.model_name : "Other");
const inThousands = (n) => Number(n).toLocaleString("en-US");

// What one audit entry says in dashboard terms. Requisition and series entries carry their
// state in object_repr ("Requisition #9 - PENDING", "Series 5 (1100001–1110000)").
function describe(log) {
  const meta = MODELS[log.model_name];
  const words = (log.model_name || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  const badge = meta?.badge || (words.includes(" ") ? words.split(" ").map((w) => w[0]).join("") : words).slice(0, 2).toUpperCase();
  const id = log.object_id && String(log.object_id).length <= 12 ? ` #${log.object_id}` : "";
  const repr = log.object_repr || "";
  const title = `${formatAuditAction(log)} ${meta?.noun || words.toLowerCase()}${id}`;

  if (log.model_name === "Requisition") {
    const state = /- (\w+)$/.exec(repr)?.[1];
    return { title, badge, state, sub: REQUISITION_NOTES[state] || "" };
  }
  const range = log.model_name === "TicketSeries" && /\((\d+)\s*[–-]\s*(\d+)\)/.exec(repr);
  return { title, badge, sub: range ? `Series ${inThousands(range[1])} – ${inThousands(range[2])}` : repr };
}

function dayLabel(iso) {
  const date = new Date(iso);
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysAgo = Math.round((midnight(new Date()) - midnight(date)) / DAY_MS);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function timeAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function RecentActivity({ logs }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);

  const count = (key) => logs.filter((l) => categoryOf(l) === key).length;
  const chips = [
    { key: "all", label: "All", count: logs.length },
    ...[...Object.keys(MODELS), "Other"].map((key) => ({ key, label: MODELS[key]?.filter || key, count: count(key) })),
  ].filter((c) => c.key === "all" || c.count > 0);

  const active = chips.some((c) => c.key === filter) ? filter : "all";
  const rows = active === "all" ? logs : logs.filter((l) => categoryOf(l) === active);
  const pages = Math.max(Math.ceil(rows.length / PAGE_SIZE), 1);
  const current = Math.min(page, pages - 1);

  // Rows with a day header ahead of the first row of each day.
  const pageRows = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const items = pageRows.flatMap((log, i) => {
    const day = dayLabel(log.created_at);
    return i === 0 || day !== dayLabel(pageRows[i - 1].created_at) ? [{ day }, { log }] : [{ log }];
  });

  return (
    <section className="dash-card ra">
      <div className="dash-card-head">
        <div className="dash-card-title">Recent activity</div>
        <span className="dash-card-note">Live · not affected by the period filter</span>
      </div>
      <div className="ra-chips">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`ra-chip${active === c.key ? " is-active" : ""}`}
            onClick={() => {
              setFilter(c.key);
              setPage(0);
            }}
          >
            {c.label} <span>{c.count}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="dash-empty">No activity recorded yet.</div>
      ) : (
        <ul className="ra-list">
          {items.map(({ day, log }) => {
            if (day) return <li className="ra-day" key={`day-${day}`}>{day}</li>;
            const { title, badge, sub, state } = describe(log);
            return (
              <li className="ra-row" key={log.id}>
                <span className={`ra-badge ra-badge--${categoryOf(log)}`}>{badge}</span>
                <div className="ra-main">
                  <span className="ra-title">
                    {title}
                    {state && <em className={`ra-state ra-state--${state}`}>{state[0] + state.slice(1).toLowerCase()}</em>}
                  </span>
                  {sub && <span className="ra-sub">{sub}</span>}
                </div>
                <div className="ra-meta">
                  <span>{timeAgo(log.created_at)}</span>
                  <span>{log.user_name || "System"}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="ra-foot">
        <Link to="/dashboard/Reports">View full audit log →</Link>
        <div className="ra-pager">
          <span>
            Page {current + 1} of {pages}
          </span>
          <button type="button" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
            ‹
          </button>
          <button type="button" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
