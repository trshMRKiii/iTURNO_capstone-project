import { Fragment, useState, useEffect, useMemo } from "react";
import { DataTable } from "../../../../components/ui/dataTable";
import { buildRouteAnalytics, matchesRouteRow } from "../reportHook";

const COLUMNS = ["Route", "Queue", "Roaming", "Total", "Drivers"];
const CENTERED = ["Queue", "Roaming", "Total", "Drivers"];
const SUB_COLUMNS = ["Driver", "Vehicle", "Queue", "Roaming", "Total"];

// Count pills reuse the colors QueueLog's "All" tab already gives each type.
const Count = ({ n, color }) =>
  n ? (
    <span className="rpt-action-pill" style={{ background: `${color}22`, color }}>{n}</span>
  ) : (
    <span className="rpt-na">—</span>
  );

export default function RouteAnalytics({ onFetchQueue, onFetchRoaming, onExportPDF }) {
  // Results are tagged with the fetcher that produced them (see useDebouncedSearchAll),
  // so a date-range change shows "Loading…" until the new range's rows arrive.
  const [result, setResult] = useState(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(() => new Set());

  // Both fetchers change identity with the report's date range, so this refetches
  // whenever the filter does.
  useEffect(() => {
    let cancelled = false;
    Promise.all([onFetchQueue(), onFetchRoaming()])
      .then(([queue, roaming]) => buildRouteAnalytics(queue, roaming))
      .catch(() => [])
      .then((rows) => !cancelled && setResult({ source: onFetchQueue, rows }));
    return () => {
      cancelled = true;
    };
  }, [onFetchQueue, onFetchRoaming]);

  const loading = result?.source !== onFetchQueue;

  const visible = useMemo(
    () => (result?.rows ?? []).filter((r) => matchesRouteRow(r, search)),
    [result, search],
  );

  const toggle = (route) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(route) ? next.delete(route) : next.add(route);
      return next;
    });

  const handleExport = () =>
    onExportPDF(
      visible.flatMap((r) =>
        r.drivers.map((d) => ({
          Route: r.route,
          Driver: d.driver,
          Vehicle: d.plates.join(", "),
          Queue: d.queue,
          Roaming: d.roaming,
          Total: d.total,
        })),
      ),
    );

  const renderRow = (r, idx, { rowClass, cellClass }) => {
    const expanded = open.has(r.route);
    return (
      <Fragment key={r.route}>
        <tr className={`${rowClass} rpt-route-row`} onClick={() => toggle(r.route)}>
          <td className={`${cellClass} rpt-bold`}>
            <span className={`rpt-route-caret${expanded ? " rpt-route-caret--open" : ""}`}>▸</span>
            {r.route}
          </td>
          <td className={`${cellClass} rpt-center`}><Count n={r.queue} color="#2563eb" /></td>
          <td className={`${cellClass} rpt-center`}><Count n={r.roaming} color="#7c3aed" /></td>
          <td className={`${cellClass} rpt-center rpt-bold`}>{r.total}</td>
          <td className={`${cellClass} rpt-center rpt-muted`}>{r.drivers.length}</td>
        </tr>
        {expanded && (
          <tr className={rowClass}>
            <td className={`${cellClass} rpt-route-detail`} colSpan={COLUMNS.length}>
              <table className="rpt-table rpt-route-sub">
                <thead>
                  <tr className="rpt-thead-row">
                    {SUB_COLUMNS.map((h) => (
                      <th key={h} className={`rpt-th${h === "Driver" || h === "Vehicle" ? "" : " rpt-th--center"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.drivers.map((d) => (
                    <tr key={d.driver} className="rpt-tr">
                      <td className="rpt-td">{d.driver}</td>
                      <td className="rpt-td">
                        {d.plates.length
                          ? d.plates.map((p) => <span key={p} className="rpt-plate rpt-route-plate">{p}</span>)
                          : <span className="rpt-na">—</span>}
                      </td>
                      <td className="rpt-td rpt-center"><Count n={d.queue} color="#2563eb" /></td>
                      <td className="rpt-td rpt-center"><Count n={d.roaming} color="#7c3aed" /></td>
                      <td className="rpt-td rpt-center rpt-bold">{d.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <span className="rpt-card-title">Route Analytics</span>
          <span className="rpt-record-count">
            {loading ? "Loading…" : `${visible.length} routes · click a route to see who took queue / roaming`}
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search route, driver, plate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="rpt-btn-export rpt-btn-export--navy"
            disabled={!visible.length}
            onClick={handleExport}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      <DataTable columns={COLUMNS} centeredColumns={CENTERED} data={visible} rowRenderer={renderRow} />
    </div>
  );
}
