import { Fragment, useState, useEffect, useMemo } from "react";
import { DataTable } from "../../../../components/ui/dataTable";
import Pager from "./Pager";

const COLUMNS = ["Driver", "Incidents", "Queue", "Roaming", "Total Over", "Worst", "Last Seen"];
const CENTERED = ["Incidents", "Queue", "Roaming", "Total Over", "Worst"];
const SUB_COLUMNS = ["When", "Type", "Vehicle", "Route", "Stayed", "Allowed", "Over"];
const SORT_FIELD = { Incidents: "incidents", Queue: "queue", Roaming: "roaming", "Total Over": "total_over_minutes", Worst: "worst_minutes", "Last Seen": "last_at" };
const PAGE_SIZE = 10;
const REPEAT_AT = 3; // this many incidents in the range = repeat offender

const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`);
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

const Pill = ({ n, color }) =>
  n ? <span className="rpt-action-pill" style={{ background: `${color}22`, color }}>{n}</span> : <span className="rpt-na">—</span>;

// onFetch(extra) hits /report/overstays/ (see overstays in the backend): drivers ranked by
// incidents, plus every incident so a driver's row can expand into the dated list.
export default function Overstays({ onFetch, onExportPDF }) {
  const [result, setResult] = useState(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ column: "Last Seen", dir: "desc" }); // latest first

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      onFetch()
        .catch(() => ({ drivers: [], incidents: [] }))
        .then((d) => !cancelled && setResult({ source: onFetch, ...d }));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onFetch]);

  const loading = result?.source !== onFetch;
  const drivers = useMemo(() => {
    if (loading) return [];
    const term = search.trim().toLowerCase();
    const rows = term ? result.drivers.filter((d) => d.driver.toLowerCase().includes(term)) : result.drivers;
    const field = SORT_FIELD[sort.column];
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => sign * (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) || a.driver.localeCompare(b.driver));
  }, [loading, result, search, sort]);

  const handleSort = (column) => {
    setSort((s) => ({ column, dir: s.column === column && s.dir === "desc" ? "asc" : "desc" }));
    setPage(1);
  };

  const totalPages = Math.max(Math.ceil(drivers.length / PAGE_SIZE), 1);
  const current = Math.min(page, totalPages);
  const shown = drivers.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const handleExport = () =>
    onExportPDF(
      result.incidents
        .filter((i) => drivers.some((d) => d.driver_id === i.driver_id))
        .map((i) => ({
          When: when(i.at), Driver: i.driver, Type: i.kind, Vehicle: i.plate, Route: i.route || "—",
          Stayed: mins(i.stay_minutes), Allowed: mins(i.limit_minutes), Over: mins(i.over_minutes),
        })),
      "Overstay Violations",
    );

  const renderRow = (d, idx, { rowClass, cellClass }) => {
    const expanded = open === d.driver_id;
    return (
      <Fragment key={d.driver_id}>
        <tr className={`${rowClass} rpt-route-row`} onClick={() => setOpen(expanded ? null : d.driver_id)}>
          <td className={`${cellClass} rpt-bold`}>
            <span className={`rpt-route-caret${expanded ? " rpt-route-caret--open" : ""}`}>▸</span>
            {d.driver}
            {d.incidents >= REPEAT_AT && <span className="rpt-action-pill" style={{ background: "#dc262622", color: "#dc2626", marginLeft: 8 }}>Repeat</span>}
          </td>
          <td className={`${cellClass} rpt-center rpt-bold`}>{d.incidents}</td>
          <td className={`${cellClass} rpt-center`}><Pill n={d.queue} color="#2563eb" /></td>
          <td className={`${cellClass} rpt-center`}><Pill n={d.roaming} color="#7c3aed" /></td>
          <td className={`${cellClass} rpt-center`}>{mins(d.total_over_minutes)}</td>
          <td className={`${cellClass} rpt-center`}>{mins(d.worst_minutes)}</td>
          <td className={`${cellClass} rpt-muted`}>{when(d.last_at)}</td>
        </tr>
        {expanded && (
          <tr className={rowClass}>
            <td className={`${cellClass} rpt-route-detail`} colSpan={COLUMNS.length}>
              <table className="rpt-table rpt-route-sub">
                <thead>
                  <tr className="rpt-thead-row">{SUB_COLUMNS.map((h) => <th key={h} className="rpt-th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {result.incidents.filter((i) => i.driver_id === d.driver_id).map((i, n) => (
                    <tr key={n} className="rpt-tr">
                      <td className="rpt-td">{when(i.at)}</td>
                      <td className="rpt-td">{i.kind}</td>
                      <td className="rpt-td"><span className="rpt-plate rpt-route-plate">{i.plate}</span></td>
                      <td className="rpt-td">{i.route || "—"}</td>
                      <td className="rpt-td">{mins(i.stay_minutes)}</td>
                      <td className="rpt-td">{mins(i.limit_minutes)}</td>
                      <td className="rpt-td rpt-bold" style={{ color: "#dc2626" }}>+{mins(i.over_minutes)}</td>
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
          <h2 className="rpt-card-title">Overstay Violations</h2>
          <span className="rpt-record-count">
            {loading ? "Loading…" : `${result.incidents.length} incidents · ${result.drivers.length} drivers`}
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input type="text" className="rpt-search-input" placeholder="Search driver…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <button className="rpt-btn-export rpt-btn-export--navy" disabled={!drivers.length} onClick={handleExport}>Export PDF</button>
        </div>
      </div>
      <p className="rpt-muted" style={{ margin: "0 24px 12px" }}>
      </p>
      <DataTable columns={COLUMNS} centeredColumns={CENTERED} data={shown} rowRenderer={renderRow} sort={sort} onSort={handleSort} unsortable={["Driver"]} />
      {!loading && drivers.length > PAGE_SIZE && (
        <Pager page={current} totalPages={totalPages} count={drivers.length} pageSize={PAGE_SIZE} onPageChange={(n) => { setPage(n); setOpen(null); }} />
      )}
    </div>
  );
}
