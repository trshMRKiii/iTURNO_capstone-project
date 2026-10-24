import { useState } from "react";
import { SegmentedControl } from "../../../components/ui/kit";
import { pesoShort, plural } from "./format";

// `kinds` are the stats.hourly / route_performance keys each choice adds up.
const FILTERS = [
  { key: "all", label: "All", noun: "tickets", kinds: ["queued", "roamed"] },
  { key: "queued", label: "Queue", noun: "queue tickets", kinds: ["queued"] },
  { key: "roamed", label: "Roam", noun: "roam tickets", kinds: ["roamed"] },
];

// Clicking a route selects it (click again to clear); the hourly chart follows the selection.
export default function RoutePerformance({ routes, rangeLabel, selected, onSelect }) {
  const [filter, setFilter] = useState("all");
  const { kinds, noun } = FILTERS.find((f) => f.key === filter);

  const sum = (r, suffix = "") => kinds.reduce((s, kind) => s + r[`${kind}${suffix}`], 0);
  const ranked = routes
    .map((r) => ({ ...r, count: sum(r), total: sum(r, "_total") }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name));
  const revenue = ranked.reduce((s, r) => s + r.total, 0);
  const max = Math.max(...ranked.map((r) => r.total), 1);

  return (
    <section className="dash-card">
      <div className="dash-card-head">
        <div>
          <div className="dash-card-title">Route performance</div>
          <div className="dash-card-sub">
          </div>
        </div>
        <SegmentedControl label="Show tickets" options={FILTERS} value={filter} onChange={setFilter} />
      </div>
      {ranked.length > 0 && (
        <div className="rp-legend">
          {filter === "all" && (
            <>
              <span className="hc-key hc-key--queued">Queue</span>
              <span className="hc-key hc-key--roamed">Roam</span>
            </>
          )}
        </div>
      )}
      {ranked.length === 0 ? (
        <div className="dash-empty">No {noun} in this period yet.</div>
      ) : (
        <ul className="rp-list">
          {ranked.map((r, i) => (
            <li key={r.name}>
              <button
                type="button"
                className={`rp-row${i === 0 ? " is-top" : ""}${selected === r.name ? " is-selected" : ""}`}
                aria-pressed={selected === r.name}
                onClick={() => onSelect(r.name)}
              >
              <span className="rp-rank">{i + 1}</span>
              <div className="rp-body">
                <div className="rp-line">
                  <span className="rp-name">{r.name}</span>
                  <strong>{pesoShort(r.total)}</strong>
                </div>
                <div className="rp-line">
                  <div className="rp-track">
                    <div
                      className="rp-fill"
                      style={{ width: `${(r.total / max) * 100}%` }}
                      title={kinds.map((kind) => `${kind === "queued" ? "Queue" : "Roam"} ${pesoShort(r[`${kind}_total`])}`).join(" · ")}
                    >
                      {kinds.map((kind) => (
                        <span key={kind} className={`rp-seg rp-seg--${kind}`} style={{ flexGrow: r[`${kind}_total`] }} />
                      ))}
                    </div>
                  </div>
                  <span className="rp-sub">
                    {revenue ? Math.round((r.total / revenue) * 100) : 0}% · {plural(r.count, "ticket")}
                  </span>
                </div>
              </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
