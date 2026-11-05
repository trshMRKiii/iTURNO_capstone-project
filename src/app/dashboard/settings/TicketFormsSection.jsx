import React, { useState } from "react";
import {
  DataTable, Toolbar, SearchInput, IconButton, Pagination, SectionHeader, PrimaryButton, SortSelect, TrashIcon,
} from "../../../components/ui/kit";

import StockScaleCard from "./StockScaleCard";

const PAGE_SIZE = 10;

// Presentational only: data, search state and handlers come from settings.jsx.
function TicketFormsSection({ ticketForms, loading, rowStates, search, onSearch, onAdd, onDelete }) {
  const [sort, setSort] = useState("price-asc");
  const [page, setPage] = useState(1);

  const q = search.trim().toLowerCase();
  const matches = ticketForms
    .filter((tf) => !q || tf.name?.toLowerCase().includes(q))
    .sort((a, b) => (sort === "price-asc" ? 1 : -1) * (Number(a.price || 0) - Number(b.price || 0)));

  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = matches.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const columns = [
    { key: "name", header: "Name", render: (tf) => <span className="ui-cell-strong">{tf.name}</span> },
    { key: "price", header: "Price", align: "right", render: (tf) => `₱${Number(tf.price || 0).toFixed(2)}` },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (tf) => (
        <div className="ui-cell-actions">
          <IconButton icon={<TrashIcon />} text="Delete" label={`Delete ${tf.name}`} tone="danger" onClick={() => onDelete(tf.id)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <SectionHeader
        title="Ticket forms"
        action={<PrimaryButton onClick={onAdd}>Add ticket form</PrimaryButton>}
      />
      <DataTable
        toolbar={
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => { onSearch(v); setPage(1); }}
            placeholder="Search ticket forms"
          />
          <SortSelect
            value={sort}
            onChange={setSort}
            label="Sort ticket forms"
            options={[
              { value: "price-asc", label: "Price: low to high" },
              { value: "price-desc", label: "Price: high to low" },
            ]}
          />
        </Toolbar>
        }
          columns={columns}
          rows={rows}
          loading={loading}
          rowState={(tf) => rowStates[tf.id]}
          rowKey={(tf) => tf.id}
          emptyMessage={ticketForms.length === 0 ? "No ticket forms configured" : "No matches found"}
          footer={
            <>
              <span>Showing {rows.length} of {matches.length} ticket forms</span>
              {pageCount > 1 && <Pagination page={current} pageCount={pageCount} onPage={setPage} />}
            </>
          }
        />
      <StockScaleCard />
    </>
  );
}

export default TicketFormsSection;
