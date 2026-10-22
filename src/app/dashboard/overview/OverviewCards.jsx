import { useEffect, useRef, useState } from "react";
import { SegmentedControl } from "../../../components/ui/kit";
import { formatWait, peso, plural } from "./format";

const COLLAPSED_ROWS = 2;
// A vehicle waiting this long is flagged.
const LONG_WAIT_MIN = 15;
// A denomination is "low" once its cash value on hand drops under this (₱).
const STOCK_LOW_AMOUNT = 30000;
// A swing in the queued/roamed mix of this many points gets highlighted.
const NOTABLE_SHIFT = 10;

const FORM_COLORS = ["var(--series-queued)","#e8b94a", "#3b82f6", "#22c55e", "#ef4444"];
const QUEUE_VIEWS = [
  { key: "empty", label: "Empty" },
  { key: "queue", label: "With queue" },
];
const SPLIT = [
  { key: "queued", label: "Queued" },
  { key: "roamed", label: "Roamed" },
];

function OverviewCard({ label, action, children }) {
  return (
    <div className="ov-card">
      <div className="ov-card-head">
        <span className="ov-card-label">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

// A short list that shows its first rows; "+N more" opens the full list as a floating panel
// over whatever sits below, so the card never grows. Closes on an outside click or Escape.
function QuickList({ title, items, renderRow, listClass, emptyText }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const hidden = items.length - COLLAPSED_ROWS;
  const toggle = (label) => (
    <button type="button" className="ov-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
      {label}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" className={open ? "is-open" : ""}>
        <path d="m2 3.5 3 3 3-3" />
      </svg>
    </button>
  );

  return (
    <div className="ov-quick" ref={ref}>
      <div className="ov-list-head">
        <span>{title}</span>
        {hidden > 0 && toggle(`+${hidden} more`)}
      </div>
      {items.length === 0 ? (
        <div className="ov-empty">{emptyText}</div>
      ) : (
        <ul className={listClass}>{items.slice(0, COLLAPSED_ROWS).map(renderRow)}</ul>
      )}
      {open && (
        <div className="ov-float" role="dialog" aria-label={title}>
          <div className="ov-list-head">
            <span>{title}</span>
            {toggle("Show less")}
          </div>
          <ul className={listClass}>{items.map(renderRow)}</ul>
        </div>
      )}
    </div>
  );
}

export function CollectionsCard({ stats, rangeLabel }) {
  const { queued, roamed } = stats.summary;
  const forms = stats.collections_by_form;
  return (
    <OverviewCard label="Total Collections" action={<span className="ov-pill ov-pill--muted">{rangeLabel}</span>}>
      <div className="ov-value ov-value--hero">{peso(queued.total + roamed.total)}</div>
      {forms.length === 0 ? (
        <div className="ov-empty">No collections in this period yet.</div>
      ) : (
        <ul className="ov-rows">
          {forms.map((f, i) => (
            <li className="ov-row" key={f.name}>
              <span className="ov-dot" style={{ background: FORM_COLORS[i % FORM_COLORS.length] }} />
              <span className="ov-row-name">{f.name}</span>
              <span className="ov-row-qty">× {f.count}</span>
              <span className="ov-row-amt">{peso(f.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

export function QueueCard({ routes }) {
  const [view, setView] = useState("queue");

  const waiting = routes.filter((r) => r.count > 0).sort((a, b) => b.waiting_minutes - a.waiting_minutes);
  const idle = routes.filter((r) => r.count === 0).sort((a, b) => a.name.localeCompare(b.name));
  const vehicles = waiting.reduce((sum, r) => sum + r.count, 0);
  const list = view === "queue" ? waiting : idle;

  return (
    <OverviewCard
      label="Currently Queued"
      action={
        <div className="ov-seg">
          <SegmentedControl
            label="Routes to show"
            options={QUEUE_VIEWS}
            value={view}
            onChange={setView}
          />
        </div>
      }
    >
      <div className="ov-value">
        {vehicles}
        <span className="ov-unit">{vehicles === 1 ? "vehicle" : "vehicles"} in line</span>
      </div>
      <QuickList
        key={view}
        title={view === "queue" ? "Longest waits" : "Idle routes"}
        items={list}
        listClass="ov-queue"
        emptyText={
          view === "queue"
            ? "No vehicles waiting right now. New check-ins appear here on their own."
            : "Every route has vehicles waiting."
        }
        renderRow={(r) => (
          <li className="ov-queue-row" key={r.name}>
            <div className="ov-queue-info">
              <span className="ov-queue-name">{r.name}</span>
              <span className="ov-queue-sub">
                {r.count > 0 ? (
                  <>
                    Next: <strong>{r.next_plate}</strong> · waiting{" "}
                    <span className={r.waiting_minutes >= LONG_WAIT_MIN ? "is-long" : ""}>{formatWait(r.waiting_minutes)}</span>
                  </>
                ) : (
                  "No vehicles waiting"
                )}
              </span>
            </div>
            <span className="ov-count">{r.count}</span>
          </li>
        )}
      />
    </OverviewCard>
  );
}

export function StockCard({ stats }) {
  const used = Object.fromEntries(stats.collections_by_form.map((f) => [f.name, f.count]));
  // Anything low or out comes first so it is never tucked behind "+N more"; the rest by use.
  const forms = stats.stock_by_form
    .map((f) => ({
      ...f,
      tone: f.remaining === 0 ? "bad" : f.amount < STOCK_LOW_AMOUNT ? "warn" : "good",
      pct: f.original > 0 ? (f.remaining / f.original) * 100 : 0,
      used: used[f.name] || 0,
    }))
    .sort((a, b) => (a.tone === "good") - (b.tone === "good") || b.used - a.used || a.name.localeCompare(b.name));
  const flagged = forms.filter((f) => f.tone !== "good").length;
  const status =
    forms.length === 0 || forms.every((f) => f.remaining === 0)
      ? { label: "Out of stock", tone: "bad" }
      : flagged > 0
        ? { label: `${flagged} low`, tone: "warn" }
        : { label: "Healthy", tone: "good" };

  return (
    <OverviewCard
      label="Ticket Stock"
      action={
        <span className={`ov-pill ov-pill--${status.tone}`}>
          <span className="ov-pill-dot" />
          {status.label}
        </span>
      }
    >
      <div className="ov-value ov-value--hero">
        {peso(forms.reduce((sum, f) => sum + f.amount, 0))}
        <span className="ov-unit">on hand</span>
      </div>
      <QuickList
        title={flagged > 0 ? "Needs attention" : "Most used"}
        items={forms}
        listClass="ov-stock"
        emptyText="No ticket series in stock."
        renderRow={(f) => (
          <li key={f.name}>
            <div className={`ov-stock-row ov-stock-row--${f.tone}`}>
              <span>
                {f.name}
                {f.tone !== "good" && <em className="ov-stock-flag">{f.remaining === 0 ? "Out" : "Low"}</em>}
              </span>
              <strong>{peso(f.amount)}</strong>
            </div>
            <div className={`ov-bar ov-bar--${f.tone}`}>
              <span style={{ width: `${Math.max(f.pct, f.remaining > 0 ? 1.5 : 0)}%` }} />
            </div>
          </li>
        )}
      />
    </OverviewCard>
  );
}

// Whole-number queued/roamed shares that always add up to 100; null when there are no tickets.
function shares({ queued, roamed }) {
  const count = queued.count + roamed.count;
  if (!count) return null;
  const q = Math.round((queued.count / count) * 100);
  return { queued: q, roamed: 100 - q };
}

// One sentence on which kind of ticket leads and how that mix moved against the last period.
function splitNote(now, before, comparedTo, basis) {
  const mine = shares(now);
  if (!mine) return { text: "No tickets in this period yet." };
  if (mine.queued === mine.roamed) return { text: "Queued and roamed tickets are split evenly." };

  const lead = mine.roamed > mine.queued ? "roamed" : "queued";
  const text = `${lead === "roamed" ? "Roaming" : "Queuing"} is ${mine[lead]}% of tickets`;
  const prior = shares(before);
  if (!prior) return { text: `${text}.` };

  const delta = mine[lead] - prior[lead];
  const move = delta === 0 ? `the same as ${comparedTo}` : `${delta > 0 ? "up" : "down"} ${plural(Math.abs(delta), "point")} from ${prior[lead]}% ${comparedTo}`;
  return { text: `${text}, ${move}${basis ? `, ${basis}` : ""}.`, notable: Math.abs(delta) >= NOTABLE_SHIFT };
}

// A full-width strip under the cards, or (`card`) one of the cards in the top row.
export function SplitStrip({ stats, rangeLabel, comparedTo, card }) {
  const mix = shares(stats.summary);
  const { compared } = stats;
  const sameDay = stats.start_date === stats.end_date;
  // Today is judged up to the current time; a longer range leaves today out until it is over.
  const basis = sameDay && stats.as_of ? `by ${stats.as_of.label}` : compared.trimmed ? "counting completed days only" : "";
  const note = splitNote(compared.current, compared.previous, comparedTo, basis);

  return (
    <section className={`split-strip${card ? " split-strip--card" : ""}`}>
      <div className="split-main">
        <div className="split-title">
          <span>Queued vs roamed</span>
          <span className="split-range">{rangeLabel}</span>
        </div>
        <div className="split-bar">
          {mix && SPLIT.map(({ key }) => <span key={key} className={`split-seg split-seg--${key}`} style={{ flexBasis: `${mix[key]}%` }} />)}
        </div>
        <p className={`split-note${note.notable ? " split-note--shift" : ""}`}>{note.text}</p>
      </div>
      {SPLIT.map(({ key, label }) => {
        const { count, total } = stats.summary[key];
        // Every ticket is one check-in. Averaged over whole days only, so a day still running doesn't drag it down.
        const perDay = compared.days > 1 ? Math.round((compared.current[key].count / compared.days) * 10) / 10 : null;
        return (
          <div className="split-stat" key={key}>
            <div className="split-stat-label">
              <span className={`split-dot split-dot--${key}`} />
              {label}
            </div>
            <div className="split-stat-value">
              <strong>{mix ? mix[key] : 0}%</strong>
              <span>{plural(count, "ticket")}</span>
            </div>
            <div className="split-stat-sub">
              {peso(total)}{perDay !== null && ` · avg ${perDay} check-ins / day`}
            </div>
          </div>
        );
      })}
    </section>
  );
}
