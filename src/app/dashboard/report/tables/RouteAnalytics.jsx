import { Fragment, useState, useEffect, useRef, useMemo } from "react";
import { DataTable, SortTh } from "../../../../components/ui/dataTable";
import Pager from "./Pager";

const COLUMNS = ["Route", "Queue", "Roaming", "Total", "Drivers"];
const CENTERED = ["Queue", "Roaming", "Total", "Drivers"];
const SUB_COLUMNS = ["Driver", "Vehicle", "Queue", "Roaming", "Total"];
const DRIVER_PAGE_SIZE = 10;
const ALL = "__all__";
// Column label -> field, shared by the route table (sorted here) and the driver table (sorted by the server).
const ROUTE_SORT = { Route: "route", Queue: "queue", Roaming: "roaming", Total: "total", Drivers: "drivers" };
const DRIVER_SORT = { Driver: "driver", Queue: "queue", Roaming: "roaming", Total: "total" };
const DEFAULT_SORT = { column: "Total", dir: "desc" };
// Text columns start A→Z, count columns start biggest-first; clicking the active column flips it.
const nextSort = (sort, column) =>
  sort.column === column
    ? { column, dir: sort.dir === "asc" ? "desc" : "asc" }
    : { column, dir: column === "Route" || column === "Driver" ? "asc" : "desc" };

// Count pills reuse the colors QueueLog's "All" tab already gives each type.
const Count = ({ n, color }) =>
  n ? (
    <span className="rpt-action-pill" style={{ background: `${color}22`, color }}>{n}</span>
  ) : (
    <span className="rpt-na">—</span>
  );

// One route's drivers, a page at a time. Remounted (via key) whenever the report's range
// or search changes, so the page number resets with it.
function RouteDrivers({ route, search, onFetch }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [data, setData] = useState(null);
  const tag = `${page}|${sort.column}|${sort.dir}`;

  useEffect(() => {
    let cancelled = false;
    onFetch({ route, search, page, page_size: DRIVER_PAGE_SIZE, sort: DRIVER_SORT[sort.column], dir: sort.dir })
      .catch(() => ({ results: [], count: 0, total_pages: 1 }))
      .then((d) => !cancelled && setData({ ...d, tag }));
    return () => {
      cancelled = true;
    };
  }, [onFetch, route, search, page, sort, tag]);

  const loading = data?.tag !== tag;
  const handleSort = (column) => {
    setSort(nextSort(sort, column));
    setPage(1);
  };

  return (
    <>
      <table className="rpt-table rpt-route-sub">
        <thead>
          <tr className="rpt-thead-row">
            {SUB_COLUMNS.map((h) => (
              <SortTh
                key={h}
                label={h}
                centered={h !== "Driver" && h !== "Vehicle"}
                sort={sort}
                onSort={DRIVER_SORT[h] ? handleSort : undefined}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={SUB_COLUMNS.length} className="rpt-td rpt-muted">Loading…</td></tr>
          ) : (
            data.results.map((d) => (
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
            ))
          )}
        </tbody>
      </table>
      {!loading && (
        <Pager
          page={page}
          totalPages={data.total_pages || 1}
          count={data.count || 0}
          pageSize={DRIVER_PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </>
  );
}

// onFetch(extra) hits the server-side tally (see route_analytics in the backend): with no
// route it returns the route summary, with one it returns that route's drivers, a page at a time.
export default function RouteAnalytics({ onFetch, onExportPDF }) {
  // The summary is tagged with the fetcher (and search) that produced it, so a date-range
  // change shows "Loading…" until the new range's routes arrive.
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(null); // null until chosen → the busiest route
  const [openRoute, setOpenRoute] = useState(null); // accordion, used while viewing "All routes"
  const [sort, setSort] = useState(DEFAULT_SORT);
  const generation = useRef(0);
  const term = search.trim();

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      onFetch({ search: term })
        .then((d) => d.routes || [])
        .catch(() => [])
        .then((routes) => {
          if (!cancelled) setSummary({ source: onFetch, search: term, gen: ++generation.current, routes });
        });
    }, term ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onFetch, term]);

  const loading = summary?.source !== onFetch;
  const routes = useMemo(() => {
    if (loading) return [];
    const field = ROUTE_SORT[sort.column];
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...summary.routes].sort((a, b) =>
      sign * (field === "route" ? a.route.localeCompare(b.route) : a[field] - b[field]) || a.route.localeCompare(b.route));
  }, [loading, summary, sort]);
  // Unpicked defaults to the server's first route (the busiest), whatever the table is sorted by.
  const selected = picked === ALL || routes.some((r) => r.route === picked) ? picked : summary?.routes[0]?.route ?? ALL;
  const single = selected !== ALL;
  const shown = single ? routes.filter((r) => r.route === selected) : routes;

  const handleExport = async () => {
    const { results = [] } = await onFetch({ export: 1, search: term });
    onExportPDF(
      results.map((r) => ({
        Route: r.route,
        Driver: r.driver,
        Vehicle: r.plates.join(", "),
        Queue: r.queue,
        Roaming: r.roaming,
        Total: r.total,
      })),
    );
  };

  const renderRow = (r, idx, { rowClass, cellClass }) => {
    const expanded = single || openRoute === r.route;
    return (
      <Fragment key={r.route}>
        <tr
          className={`${rowClass}${single ? "" : " rpt-route-row"}`}
          onClick={single ? undefined : () => setOpenRoute(expanded ? null : r.route)}
        >
          <td className={`${cellClass} rpt-bold`}>
            {!single && <span className={`rpt-route-caret${expanded ? " rpt-route-caret--open" : ""}`}>▸</span>}
            {r.route}
          </td>
          <td className={`${cellClass} rpt-center`}><Count n={r.queue} color="#2563eb" /></td>
          <td className={`${cellClass} rpt-center`}><Count n={r.roaming} color="#7c3aed" /></td>
          <td className={`${cellClass} rpt-center rpt-bold`}>{r.total}</td>
          <td className={`${cellClass} rpt-center rpt-muted`}>{r.drivers}</td>
        </tr>
        {expanded && (
          <tr className={rowClass}>
            <td className={`${cellClass} rpt-route-detail`} colSpan={COLUMNS.length}>
              <RouteDrivers key={`${summary.gen}|${r.route}`} route={r.route} search={summary.search} onFetch={onFetch} />
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
          <h2 className="rpt-card-title">Route Analytics</h2>
          <span className="rpt-record-count">
            {loading ? "Loading…" : `${routes.length} routes · ${single ? "showing one route" : "click a route"} to see who took queue / roaming`}
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <select
            className="rpt-search-input rpt-route-select"
            aria-label="Route"
            value={selected}
            disabled={!routes.length}
            onChange={(e) => {
              setPicked(e.target.value);
              setOpenRoute(null);
            }}
          >
            <option value={ALL}>All routes</option>
            {routes.map((r) => <option key={r.route} value={r.route}>{r.route}</option>)}
          </select>
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search route, driver, plate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="rpt-btn-export rpt-btn-export--navy"
            disabled={!routes.length}
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

      <DataTable
        columns={COLUMNS}
        centeredColumns={CENTERED}
        data={shown}
        rowRenderer={renderRow}
        sort={sort}
        onSort={(column) => setSort(nextSort(sort, column))}
      />
    </div>
  );
}
