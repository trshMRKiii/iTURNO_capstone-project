import React, { useState } from "react";
import { useRequisition } from "../../../lib/requisition/useRequisition";
import RequisitionFormModal from "../../../lib/requisition/RequisitionFormModal";
import "../../../styles/requisition.css";

function formatCurrency(val) {
  return "₱" + Number(val || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Requisition() {
  const {
    requisitions,
    ticketForms,
    loading,
    error,
    saving,
    showForm,
    setShowForm,
    seriesItems,
    updateSeriesItem,
    addSeriesItem,
    removeSeriesItem,
    computeTotal,
    handleSave,
    allSeries,
    inventory,
    handleDelete,
    approvedBy,
    setApprovedBy,
  } = useRequisition();

  const [expandedId, setExpandedId] = useState(null);
  const [expandedDenom, setExpandedDenom] = useState(null);

  const toggleExpand = (id) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const toggleDenom = (denom) =>
    setExpandedDenom((prev) => (prev === denom ? null : denom));

  const denomOptions = Object.keys(inventory.byDenomination);

  return (
    <div className="req-page">
      {/* Header */}
      <div className="req-header">
        <div className="req-header-left">
          <div className="req-header-accent" />
          <div>
            <h1 className="req-title">Requisition & Issue Voucher</h1>
            <p className="req-subtitle">
              Ticket inventory ledger — stock receipts and availability
            </p>
          </div>
        </div>
        <button
          type="button"
          className="req-new-btn"
          onClick={() => setShowForm(true)}
        >
          + New Requisition
        </button>
      </div>

      {/* Error */}
      {error && <div className="req-error">{error}</div>}

      {/* Modal */}
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

      {/* Loading */}
      {loading ? (
        <div className="req-loading">Loading requisitions…</div>
      ) : (
        <>
          {/* Inventory Summary Cards */}
          <div className="req-inventory-grid">
            <div className={`req-inv-card ${inventory.hasStock ? "req-inv-card--ok" : "req-inv-card--empty"}`}>
              <span className="req-inv-card-label">Total Stock</span>
              <span className="req-inv-card-value">
                {inventory.totalStock.toLocaleString()} tickets
              </span>
              <span className="req-inv-card-sub">
                {formatCurrency(inventory.totalValue)}
              </span>
            </div>

            <div className="req-inv-card">
              <span className="req-inv-card-label">Active Series</span>
              {inventory.activeSeries ? (
                <>
                  <span className="req-inv-card-value">{inventory.activeSeries.series_no}</span>
                  <span className="req-inv-card-sub">
                    {inventory.activeSeries.ticket_form_label || "—"} · {inventory.activeSeries.pcs.toLocaleString()} pcs
                  </span>
                </>
              ) : (
                <span className="req-inv-card-value req-inv-card-value--none">No active series</span>
              )}
            </div>

            {inventory.stockLevel !== "normal" && (
              <div className={`req-inv-card ${inventory.stockLevel === "low" ? "req-inv-card--alert" : "req-inv-card--ok"}`}>
                <span className="req-inv-card-label">Stock Alert</span>
                {inventory.stockLevel === "low" ? (
                  <>
                    <span className="req-inv-card-value req-inv-card-value--warn">
                      {inventory.hasStock ? "LOW STOCK" : "OUT OF STOCK"}
                    </span>
                    <span className="req-inv-card-sub">
                      {inventory.hasStock
                        ? `Only ${inventory.totalStock.toLocaleString()} tickets remaining — below 5,000 threshold`
                        : "New requisition required to resume transactions"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="req-inv-card-value req-inv-card-value--high">HIGH STOCK</span>
                    <span className="req-inv-card-sub">
                      {inventory.totalStock.toLocaleString()} tickets — above 50,000 threshold
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Collections & Deposits by Denomination */}
          <div className="req-table-wrap">
            <div className="req-report-section-header">
              <h3 className="req-report-section-label">COLLECTIONS & DEPOSITS</h3>
              <span className="req-report-section-sub">Click a denomination to view ticket stock details</span>
            </div>
            <table className="req-table">
              <thead>
                <tr>
                  <th>Den.</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {denomOptions.length > 0 ? (
                  denomOptions.map((denom) => {
                    const d = inventory.byDenomination[denom];
                    const isExpanded = expandedDenom === denom;
                    return (
                      <React.Fragment key={denom}>
                        <tr
                          onClick={() => toggleDenom(denom)}
                          style={{ cursor: "pointer" }}
                          className={isExpanded ? "req-row--active" : ""}
                        >
                          <td>
                            <span className={`req-expand-icon ${isExpanded ? "req-expand-icon--open" : ""}`}>&#9654;</span>
                            {denom}
                          </td>
                          <td className="text-right">{d.totalQty.toLocaleString()}</td>
                          <td className="text-right">{formatCurrency(d.totalValue)}</td>
                        </tr>
                        {isExpanded && d.series.length > 0 && (
                          <tr className="req-series-row">
                            <td colSpan={3}>
                              <table className="req-series-table">
                                <thead>
                                  <tr>
                                    <th>Series No.</th>
                                    
                                    <th className="text-right">Beginning</th>
                                    <th className="text-right">Remaining</th>
                                    <th className="text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {d.series.map((ts) => (
                                      <tr key={ts.id}>
                                        <td>{ts.series_no || "—"}</td>
                                        <td className="text-right">{(ts.beginning ?? ts.pcs ?? 0).toLocaleString()}</td>
                                        <td className="text-right">{(ts.remaining ?? ts.pcs ?? 0).toLocaleString()}</td>
                                        <td className="text-right">{formatCurrency(ts.current_value)}</td>
                                      </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "30px 16px" }}>
                      No ticket stock — click "+ New Requisition" to add stock
                    </td>
                  </tr>
                )}
              </tbody>
              {denomOptions.length > 0 && (
                <tfoot>
                  <tr className="req-table-footer">
                    <td><strong>TOTAL</strong></td>
                    <td className="text-right">
                      <strong>{inventory.totalStock.toLocaleString()}</strong>
                    </td>
                    <td className="text-right">
                      <strong>{formatCurrency(inventory.totalValue)}</strong>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Stocking Receipts */}
          {requisitions.length > 0 && (
            <div className="req-table-wrap" style={{ marginTop: 20 }}>
              <h3 className="req-section-heading">Stocking Receipts</h3>
              <table className="req-table">
                <thead>
                  <tr>
                    
                    <th>Date</th>
                    <th>Requested By</th>
                    <th>Approved By</th>
                    <th className="text-right">Total Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions.map((req) => (
                    <React.Fragment key={req.id}>
                      <tr
                        onClick={() => toggleExpand(req.id)}
                        style={{ cursor: "pointer" }}
                      >

                        <td>
                          {new Date(req.date_requested).toLocaleDateString("en-PH", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td>{req.requested_by_name}</td>
                        <td>{req.approved_by_name || "—"}</td>
                        <td className="text-right">
                          {formatCurrency(req.total_value)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="req-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(req.id);
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>

                      {expandedId === req.id &&
                        req.ticket_series &&
                        req.ticket_series.length > 0 && (
                          <tr className="req-series-row">
                            <td colSpan={6}>
                              <table className="req-series-table">
                                <thead>
                                  <tr>
                                    <th>Series No.</th>
                                    <th>Ticket Form</th>
                                    
                                    <th>QTY</th>
                                    <th>Total Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {req.ticket_series.map((ts) => (
                                    <tr key={ts.id}>
                                      <td>{ts.series_no}</td>
                                      <td>{ts.ticket_form_label || "—"}</td>
                                      
                                      <td>{ts.qty}</td>
                                      <td>{formatCurrency(ts.total_value)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Requisition;
