import React, { useMemo, useState } from "react";
import { useRequisition } from "./useRequisition";
import RequisitionFormModal from "./RequisitionFormModal";
import PaperRangeModal from "./PaperRangeModal";
import { IS_REMOTE } from "../../../lib/api-service";
import "../../../styles/requisition.css";
import "../../../components/ui/kit";

function formatCurrency(val) {
  return "₱" + Number(val || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(val) {
  if (!val) return "—";
  const d = new Date(val);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

const fmt = (n) => Number(n || 0).toLocaleString();
const serial = (n) => String(n ?? "");
const count = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

// Does this series contain the ticket number being searched for?
function seriesHasTicket(ts, query) {
  const n = Number(query);
  return Number.isFinite(n) && n >= Number(ts.start_no) && n <= Number(ts.end_no);
}

function Chevron({ open }) {
  return (
    <svg className={`rq-chevron ${open ? "rq-chevron--open" : ""}`} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Requisition() {
  const {
    ticketForms,
    loading,
    saving,
    showForm,
    setShowForm,
    seriesItems,
    updateSeriesItem,
    addSeriesItem,
    removeSeriesItem,
    computeTotal,
    handleSave,
    inventory,
    approvedBy,
    setApprovedBy,
    refresh,
  } = useRequisition();

  const [expandedDenom, setExpandedDenom] = useState(null);
  const [paperSeries, setPaperSeries] = useState(null);
  const [search, setSearch] = useState("");

  const query = search.replace(/[,\s]/g, "");

  // Series with stock left, grouped by denomination. A ticket-number search keeps only the series containing it.
  const groups = useMemo(
    () =>
      Object.entries(inventory.byDenomination)
        .map(([denom, d]) => {
          const inStock = d.series.filter((ts) => ts.remaining > 0);
          return { denom, ...d, seriesCount: inStock.length, shown: query ? inStock.filter((ts) => seriesHasTicket(ts, query)) : inStock };
        })
        .filter((g) => (query ? g.shown.length > 0 : g.series.length > 0)),
    [inventory, query]
  );

  const toggleDenom = (denom) => setExpandedDenom((prev) => (prev === denom ? null : denom));

  return (
    <div className="req-page">
      <div className="req-header">
        <h1 className="req-title">Ticket Requisition</h1>
        <button type="button" className="req-new-btn" onClick={() => setShowForm(true)}>
          + Add requisition
        </button>
      </div>

      <RequisitionFormModal
        showForm={showForm}
        setShowForm={setShowForm}
        seriesItems={seriesItems}
        updateSeriesItem={updateSeriesItem}
        addSeriesItem={addSeriesItem}
        removeSeriesItem={removeSeriesItem}
        ticketForms={ticketForms}
        approvedBy={approvedBy}
        setApprovedBy={setApprovedBy}
        computeTotal={computeTotal}
        handleSave={handleSave}
        saving={saving}
      />

      {paperSeries && (
        <PaperRangeModal series={paperSeries} onClose={() => setPaperSeries(null)} onSaved={refresh} />
      )}

      <div className="rq-card" aria-busy={loading}>
        <div className="rq-card-head">
          <h3 className="rq-card-title">COLLECTIONS & DEPOSITS</h3>
          <input
            type="search"
            className="rq-search"
            placeholder="Search ticket series number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search ticket series number"
          />
        </div>

        <div className="rq-cols rq-cols--denom rq-head">
          <span>Denomination</span>
          <span className="rq-num">Quantity</span>
          <span className="rq-num">Amount</span>
        </div>

        {loading ? (
          <div aria-hidden="true">
            {[0, 1, 2].map((r) => (
              <div key={r} className="rq-cols rq-cols--denom rq-denom">
                <span className="ui-skel" style={{ width: ["46%", "34%", "52%"][r] }} />
                <span className="ui-skel" style={{ width: "40%", marginLeft: "auto" }} />
                <span className="ui-skel" style={{ width: "50%", marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="rq-empty">
            {query ? `No series contains ticket ${search.trim()}` : 'No ticket stock — click "+ Add requisition" to add stock'}
          </p>
        ) : (
          groups.map((g) => {
            const open = !!query || expandedDenom === g.denom;
            return (
              <div key={g.denom}>
                <button
                  type="button"
                  className={`rq-cols rq-cols--denom rq-denom ${open ? "rq-denom--open" : ""}`}
                  onClick={() => toggleDenom(g.denom)}
                  aria-expanded={open}
                >
                  <span className="rq-denom-name">
                    <span className="rq-toggle">
                      <Chevron open={open} />
                      <span className="rq-toggle-label">{open ? "Hide" : "View"}</span>
                    </span>
                    <span>
                      <strong>{g.denom}</strong>
                      <small>{g.seriesCount} series</small>
                    </span>
                  </span>
                  <span className="rq-num">{fmt(g.totalQty)}</span>
                  <span className="rq-num">{formatCurrency(g.totalValue)}</span>
                </button>

                {open && (
                  <div className="rq-series">
                    <div className="rq-cols rq-cols--series rq-series-head">
                      <span>Series range</span>
                      <span>Received</span>
                      <span>Last issued no.</span>
                      <span>Remaining</span>
                      <span className="rq-num">Amount</span>
                    </div>
                    {g.shown.map((ts) => {
                      const total = ts.pcs || ts.remaining;
                      const pct = total > 0 ? Math.min(100, (ts.remaining / total) * 100) : 0;
                      return (
                        <div key={ts.id} className="rq-cols rq-cols--series rq-series-row">
                          <span>
                            <span className="rq-mono">{serial(ts.start_no)} - {serial(ts.end_no)}</span>
                            <small>{count(ts.pcs, "ticket")}</small>
                          </span>
                          <span>{formatDate(ts.created_at)}</span>
                          <span className="rq-mono">{ts.last_used_no != null ? serial(ts.last_used_no) : "None yet"}</span>
                          <span>
                            <span className="rq-remaining"><strong>{fmt(ts.remaining)}</strong> of {fmt(total)}</span>
                            <span className="rq-bar"><span style={{ width: `${pct}%` }} /></span>
                          </span>
                          <span className="rq-num">
                            {formatCurrency(ts.current_value)}
                            {!IS_REMOTE && (
                              <button type="button" className="rq-link" onClick={() => setPaperSeries(ts)}>
                                Paper range
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {!loading && groups.length > 0 && (
          <div className="rq-cols rq-cols--denom rq-total">
            <span>TOTAL ON HAND</span>
            <span className="rq-num">{fmt(inventory.totalStock)}</span>
            <span className="rq-num">{formatCurrency(inventory.totalValue)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Requisition;
