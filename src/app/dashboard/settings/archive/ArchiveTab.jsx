import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiService } from "../../../../lib/api-service";
import {
  DataTable, Toolbar, SearchInput, IconButton, Pagination, SectionHeader, TabBar, RestoreIcon, useFeedback,
} from "../../../../components/ui/kit";

const PAGE_SIZE = 10;

// Wording for the restore success message ("Route restored · back in Routes.").
const RESTORED_AS = {
  vehicles: { singular: "Vehicle", home: "Vehicles" },
  drivers: { singular: "Driver", home: "Drivers" },
  routes: { singular: "Route", home: "Routes" },
  puvtypes: { singular: "PUV type", home: "PUV types" },
};

const peso = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "—");

// One entry per archivable record type: where to list it and how to render a row.
const SECTIONS = [
  {
    key: "vehicles",
    label: "Vehicles",
    path: "/vehicles/",
    columns: ["Plate Number", "Route", "Franchise #"],
    cells: (v) => [v.plate_number, v.route_detail?.full_name || "—", v.franchise_number || "—"],
    restore: () => ({ is_archived: false }),
    patch: true,
  },
  {
    key: "drivers",
    label: "Drivers",
    path: "/drivers/",
    columns: ["Name", "IWP Number", "Contact"],
    cells: (d) => [
      [d.last_name, d.first_name].filter(Boolean).join(", "),
      d.iwp_number || "—",
      d.contact || "—",
    ],
    restore: () => ({ is_archived: false }),
    patch: true,
  },
  {
    key: "series",
    label: "Ticket Series",
    // Fully-used series archive themselves: no flag, just nothing left to issue.
    path: "/ticket-series/",
    listQuery: "",
    filter: (s) => s.remaining <= 0,
    columns: ["Series No.", "Ticket Form", "Date Created"],
    cells: (s) => [s.series_no, s.ticket_form_label || "—", fmtDate(s.created_at)],
  },
  {
    key: "remittance",
    label: "Remittance",
    path: "/report/remittance/",
    columns: ["Batch ID", "Issued At", "Total Amount"],
    cells: (b) => [b.batch_code || b.id, fmtDate(b.issued_at), peso(b.total_amount)],
  },
  {
    key: "routes",
    label: "Routes",
    path: "/routes/",
    columns: ["Route", "Vehicles", "Tickets"],
    cells: (r) => [r.full_name, r.vehicle_count ?? 0, r.ticket_count ?? 0],
    restore: (r) => ({ origin: r.origin, is_archived: false }),
  },
  {
    key: "puvtypes",
    label: "PUV Types",
    path: "/puvtypes/",
    columns: ["Name", "Terminal Price", "Vehicles"],
    cells: (t) => [t.name, peso(t.terminal_price), t.vehicle_count ?? 0],
    restore: (t) => ({ name: t.name, terminal_price: t.terminal_price, is_archived: false }),
  },
];

export default function ArchiveTab({ onRestored }) {
  const { notify, report } = useFeedback();
  const [active, setActive] = useState("all");
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rowStates, setRowStates] = useState({}); // "<section>-<id>" -> { kind, label }

  const load = useCallback(async () => {
    try {
      const results = await Promise.all(
        SECTIONS.map(async (s) => {
          const res = await apiService.get(`${s.path}${s.listQuery ?? "?is_archived=true"}`);
          const list = Array.isArray(res) ? res : res.results || [];
          return [s.key, s.filter ? list.filter(s.filter) : list];
        }),
      );
      const next = Object.fromEntries(results);
      setRows(next);
    } catch (err) {
      console.error("Failed to load archive:", err);
      notify.error({ title: "Couldn't load archive", message: err?.message || "Nothing was changed. Check your connection and try again.", onRetry: () => { setLoading(true); loadRef.current(); } });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadRef.current = load;
    load();
  }, [load]);

  const countOf = (key) => (rows[key] || []).length;
  // Only record types that actually hold archived records get a tab; "All" is always there.
  const populated = SECTIONS.filter((s) => countOf(s.key) > 0);
  const total = SECTIONS.reduce((n, s) => n + countOf(s.key), 0);
  // If the last record of a type is restored, its tab disappears: fall back to All.
  const activeKey = active !== "all" && countOf(active) === 0 ? "all" : active;
  const isAll = activeKey === "all";
  const section = isAll ? null : SECTIONS.find((s) => s.key === activeKey);

  const handleRestore = async (sec, item) => {
    const key = `${sec.key}-${item.id}`;
    const wording = RESTORED_AS[sec.key] || { singular: sec.label, home: sec.label };
    const name = sec.cells(item)[0];
    setRowStates((prev) => ({ ...prev, [key]: { kind: "busy", label: "Restoring..." } }));
    try {
      await apiService[sec.patch ? "patch" : "put"](`${sec.path}${item.id}/`, sec.restore(item));
      setRows((prev) => ({ ...prev, [sec.key]: prev[sec.key].filter((r) => r.id !== item.id) }));
      onRestored?.(sec.key);
      report({ success: { title: `${wording.singular} restored`, message: `${name} is back in ${wording.home}.` } });
    } catch (err) {
      console.error("Failed to restore:", err);
      report({ error: { title: `Couldn't restore ${wording.singular.toLowerCase()}`, message: err.message || "Nothing was changed. Check your connection and try again.", onRetry: () => handleRestore(sec, item) } });
    } finally {
      setRowStates((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // One entry per archived record, carrying its record type so the "All" view can mix them.
  // Newest first: by the record's own timestamp when it has one, else by id (higher = newer).
  const stamp = (item) => {
    const t = Date.parse(item.archived_at || item.issued_at || item.created_at || item.updated_at);
    return Number.isNaN(t) ? 0 : t;
  };
  const entries = (isAll ? SECTIONS : [section])
    .flatMap((sec) =>
      (rows[sec.key] || []).map((item) => ({ id: `${sec.key}-${item.id}`, sec, item, cells: sec.cells(item) })),
    )
    .sort((a, b) => stamp(b.item) - stamp(a.item) || Number(b.item.id) - Number(a.item.id));
  const q = search.trim().toLowerCase();
  const matches = entries.filter((e) => !q || `${e.sec.label} ${e.cells.join(" ")}`.toLowerCase().includes(q));
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = matches.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const restoreCell = (e) =>
    e.sec.restore ? (
      <div className="ui-cell-actions">
        <IconButton icon={<RestoreIcon />} text="Restore" label={`Restore ${e.cells[0]}`} onClick={() => handleRestore(e.sec, e.item)} />
      </div>
    ) : null;

  const columns = isAll
    ? [
      { key: "record", header: "Record", render: (e) => <span className="ui-cell-strong">{e.cells[0]}</span> },
      { key: "type", header: "Type", render: (e) => e.sec.label },
      {
        key: "details",
        header: "Details",
        render: (e) => e.cells.slice(1).map((c, i) => `${e.sec.columns[i + 1]}: ${c}`).join("  ·  "),
      },
      { key: "actions", header: "Actions", align: "right", render: restoreCell },
    ]
    : [
      ...section.columns.map((header, i) => ({
        key: String(i),
        header,
        render: (e) => (i === 0 ? <span className="ui-cell-strong">{e.cells[i]}</span> : e.cells[i]),
      })),
      ...(section.restore ? [{ key: "actions", header: "Actions", align: "right", render: restoreCell }] : []),
    ];

  const switchSection = (key) => { setActive(key); setSearch(""); setPage(1); };
  const noun = isAll ? "records" : section.label.toLowerCase();

  return (
    <>
      <SectionHeader
        title="Archive"
      />
      <TabBar
        tabs={[
          { key: "all", label: "All", count: loading ? null : total },
          ...populated.map((s) => ({ key: s.key, label: s.label, count: countOf(s.key) })),
        ]}
        value={activeKey}
        onChange={switchSection}
      />
      <DataTable
        toolbar={
          <Toolbar>
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder={isAll ? "Search the archive" : `Search archived ${noun}`}
            />
          </Toolbar>
        }
        columns={columns}
        rows={pageRows}
        loading={loading}
        rowState={(e) => rowStates[e.id]}
        rowKey={(e) => e.id}
        emptyMessage={entries.length === 0 ? "Nothing archived" : "No matches found"}
        footer={
          <>
            <span>Showing {loading ? 0 : pageRows.length} of {loading ? 0 : matches.length} archived {noun}</span>
            {pageCount > 1 && <Pagination page={currentPage} pageCount={pageCount} onPage={setPage} />}
          </>
        }
      />
    </>
  );
}
