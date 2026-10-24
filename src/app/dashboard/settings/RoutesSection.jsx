import React, { useState } from "react";
import {
  DataTable, Toolbar, SearchInput, IconButton, Pagination, SectionHeader, PrimaryButton, SortSelect, UnitInput, ArchiveIcon,
} from "../../../components/ui/kit";

const PAGE_SIZE = 10;
// Mirrors DEFAULT_ESTIMATED_LOADING_MINUTES on the backend (views/records.py).
const DEFAULT_LOADING_MINUTES = 5;

const SORTS = [
  { value: "route-asc", label: "Sort: Route A–Z" },
  { value: "route-desc", label: "Sort: Route Z–A" },
];

// Presentational only: data, drafts, search state and handlers come from settings.jsx.
// Filter, sort and page state is local view state and never touches the API.
function RoutesSection({
  routes, loading, rowStates, search, onSearch, onAdd, estimateInputs, onEstimateChange, onSaveEstimate, onRevertEstimate, onArchive,
}) {
  const [sort, setSort] = useState("route-asc");
  const [page, setPage] = useState(1);

  const resetPage = (fn) => (...args) => { fn(...args); setPage(1); };

  const q = search.trim().toLowerCase();
  const matches = routes
    .filter((r) => !q || r.full_name?.toLowerCase().includes(q))
    .sort((a, b) => (sort === "route-asc" ? 1 : -1) * a.origin.localeCompare(b.origin));

  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = matches.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const columns = [
    {
      key: "route",
      header: "Route",
      render: (r) => (
        <span className="ui-route">{r.origin}</span>
      ),
    },
    {
      key: "default",
      header: "Default loading time",
      render: (r) => {
        const draft = estimateInputs[r.id];
        const dirty = draft !== undefined;
        const working = !!rowStates[r.id];
        const value = dirty ? draft : (r.estimated_loading_minutes ?? "");
        return (
          <div className="ui-fee-field">
            <UnitInput
              suffix="min"
              step={1}
              value={value}
              placeholder={String(DEFAULT_LOADING_MINUTES)}
              onChange={(v) => onEstimateChange(r.id, v)}
              label={`Default loading time for ${r.full_name}`}
            />
            {value === "" && <span className="ui-hint">System default</span>}
            {dirty && (
              <>
                <button type="button" className="ui-text-btn" onClick={() => onSaveEstimate(r)} disabled={working}>
                  Save
                </button>
                <button type="button" className="ui-text-btn ui-text-btn--ghost" onClick={() => onRevertEstimate(r.id)} disabled={working}>
                  Revert
                </button>
              </>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => (
        <div className="ui-cell-actions">
          <IconButton icon={<ArchiveIcon />} text="Archive" label={`Archive ${r.full_name}`} onClick={() => onArchive(r)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <SectionHeader
        title="Routes"
        action={<PrimaryButton onClick={onAdd}>Add route</PrimaryButton>}
      />
      <DataTable
        toolbar={
          <Toolbar>
            <SearchInput value={search} onChange={resetPage(onSearch)} placeholder="Search by origin or destination" />
            <SortSelect value={sort} onChange={setSort} options={SORTS} label="Sort routes" />
          </Toolbar>
        }
        columns={columns}
        rows={rows}
        loading={loading}
        rowState={(r) => rowStates[r.id]}
        rowKey={(r) => r.id}
        emptyMessage={routes.length === 0 ? "No routes configured" : "No routes match your search"}
        footer={
          <>
            <span>Showing {rows.length} of {matches.length} routes</span>
            {pageCount > 1 && <Pagination page={current} pageCount={pageCount} onPage={setPage} />}
          </>
        }
      />
    </>
  );
}

export default RoutesSection;
