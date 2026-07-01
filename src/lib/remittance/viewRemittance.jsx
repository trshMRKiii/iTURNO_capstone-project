import React from "react";
import { downloadCSV, downloadPDF } from "./exportReport";

function formatCurrency(val) {
  return "₱" + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCollectionFields(c) {
  const ticketFormNo = c.ticket_form_no || c.ticketFormNo || "";
  const from = Number(c.from_no || c.from || 0);
  const amount = Number(c.amount || 0);
  const to = from - amount;
  return { ticketFormNo, from, to, amount };
}

function getDepositFields(d) {
  const depositAmount = Number(d.deposit_amount || d.depositAmount || 0);
  return {
    type: d.type || "bill",
    denomination: d.denomination || 0,
    quantity: Number(d.quantity || 0),
    depositAmount,
  };
}

export default function ViewRemittance({ batch, onClose }) {
  if (!batch) return null;

  const collections = (batch.collections || []).map(getCollectionFields);
  const deposits = (batch.deposits || []).map(getDepositFields);
  const totalCollections = collections.reduce((s, c) => s + c.amount, 0);
  const totalDeposits = deposits.reduce((s, d) => s + d.depositAmount, 0);

  const totalFrom = collections.reduce((s, c) => s + c.from, 0);
  const totalTo = collections.reduce((s, c) => s + c.to, 0);

  return (
    <div className="rem-overlay" onClick={onClose}>
      <div className="rem-modal" style={{ maxWidth: 960 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="rem-modal-header">
          <div className="rem-modal-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <h2 className="rem-modal-title">Report of Collections and Deposits</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="rem-btn rem-btn--export" onClick={() => downloadCSV(batch)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </button>
            <button className="rem-btn rem-btn--export" onClick={() => downloadPDF(batch)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Export PDF
            </button>
            <button className="rem-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="rem-modal-body rem-report">
          {/* Report Title */}
          <div className="rem-report-title">
            <strong>REPORT OF COLLECTIONS AND DEPOSITS</strong>
            <span>CITY GOVERNMENT OF SAN FERNANDO, LA UNION</span>
          </div>

          {/* Batch Info */}
          <div className="rem-report-info">
            <div className="rem-report-info-row">
              <span><strong>FUND:</strong> GENERAL FUND</span>
              <span><strong>Date:</strong> {batch.issued_at || "—"}</span>
            </div>
            <div className="rem-report-info-row">
              <span><strong>Name of Accountable Officer:</strong> {batch.issued_by_name || "—"}</span>
              <span><strong>Report No.:</strong> {batch.id || "—"}</span>
            </div>
          </div>

          {/* Section A */}
          <h3 className="rem-report-section">A. COLLECTIONS</h3>
          <p className="rem-report-sub">1. For Collectors</p>
          <table className="rem-report-table">
            <thead>
              <tr>
                <th>Type (Form No.)</th>
                <th style={{ textAlign: "right" }}>From</th>
                <th style={{ textAlign: "right" }}>To</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {collections.length > 0 ? collections.map((c, i) => (
                <tr key={i}>
                  <td>{c.ticketFormNo || "—"}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(c.from)}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(c.to)}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(c.amount)}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)" }}>No collections</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>TOTAL</strong></td>
                <td style={{ textAlign: "right" }}>
                  <strong>{formatCurrency(totalFrom)}</strong>
                </td>
                <td style={{ textAlign: "right" }}>
                  <strong>{formatCurrency(totalTo)}</strong>
                </td>
                <td style={{ textAlign: "right" }}><strong>{formatCurrency(totalCollections)}</strong></td>
              </tr>
            </tfoot>
          </table>

          {/* Section B */}
          <h3 className="rem-report-section">B. REMITTANCES / DEPOSITS</h3>
          <table className="rem-report-table">
            <thead>
              <tr>
                <th>Den.</th>
                <th style={{ textAlign: "right" }}>Quantity</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {deposits.length > 0 ? deposits.map((d, i) => (
                <tr key={i}>
                  <td>{d.type === "coin" ? "Coins" : d.denomination}</td>
                  <td style={{ textAlign: "right" }}>{d.quantity.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(d.depositAmount)}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--text-secondary)" }}>No deposits</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>TOTAL DEPOSITS</strong></td>
                <td style={{ textAlign: "right" }}>
                  <strong>{deposits.reduce((s, d) => s + d.quantity, 0).toLocaleString()}</strong>
                </td>
                <td style={{ textAlign: "right" }}><strong>{formatCurrency(totalDeposits)}</strong></td>
              </tr>
            </tfoot>
          </table>

          {/* Section C */}
          <h3 className="rem-report-section">C. ACCOUNTABILITY FOR ACCOUNTABLE FORMS</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="rem-report-table rem-report-table--dense">
              <thead>
                <tr>
                  <th rowSpan={2}>Name of Form & No.</th>
                  <th colSpan={3} style={{ textAlign: "center" }}>Beginning Balance</th>
                  <th colSpan={3} style={{ textAlign: "center" }}>Receipt</th>
                  <th colSpan={3} style={{ textAlign: "center" }}>Issued</th>
                  <th colSpan={3} style={{ textAlign: "center" }}>Ending Balance</th>
                </tr>
                <tr>
                  <th>Qty</th><th>From</th><th>To</th>
                  <th>Qty</th><th>From</th><th>To</th>
                  <th>Qty</th><th>From</th><th>To</th>
                  <th>Qty</th><th>From</th><th>To</th>
                </tr>
              </thead>
              <tbody>
                {collections.length > 0 ? collections.map((c, i) => (
                  <tr key={i}>
                    <td>{c.ticketFormNo || "—"}</td>
                    <td>{c.from}</td><td>—</td><td>—</td>
                    <td>—</td><td>—</td><td>—</td>
                    <td>{c.amount}</td><td>—</td><td>—</td>
                    <td>{c.to}</td><td>—</td><td>—</td>
                  </tr>
                )) : (
                  <tr><td colSpan={13} style={{ textAlign: "center", color: "var(--text-secondary)" }}>No forms</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Section D */}
          <h3 className="rem-report-section">D. SUMMARY OF COLLECTIONS AND REMITTANCES/DEPOSITS</h3>
          <table className="rem-report-table rem-report-table--summary">
            <tbody>
              <tr><td>Beginning Balance</td><td style={{ textAlign: "right" }}>{formatCurrency(totalFrom)}</td></tr>
              <tr><td>Add: Collections — Cash</td><td style={{ textAlign: "right" }}>{formatCurrency(totalCollections)}</td></tr>
              <tr><td>Add: Collections — Checks</td><td style={{ textAlign: "right" }}>{formatCurrency(0)}</td></tr>
              <tr><td>Remittance/Deposits</td><td style={{ textAlign: "right" }}>{formatCurrency(totalDeposits)}</td></tr>
              <tr className="rem-report-row--bold"><td>Balance</td><td style={{ textAlign: "right" }}>{formatCurrency(totalDeposits)}</td></tr>
            </tbody>
          </table>

          {/* Certification */}
          <div className="rem-report-cert">
            <div className="rem-report-cert-box">
              <p className="rem-report-cert-label">CERTIFICATION:</p>
              <p className="rem-report-cert-text">I hereby certify that the above report of collections and deposits is correct.</p>
              <div className="rem-report-sig">
                <strong>{batch.issued_by_name || "—"}</strong>
                <span>Name and Signature of Accountable Officer</span>
              </div>
            </div>
            <div className="rem-report-cert-box">
              <p className="rem-report-cert-label">VERIFICATION AND ACKNOWLEDGEMENT:</p>
              <p className="rem-report-cert-text">I hereby certify that the foregoing report of collections has been verified and acknowledge receipt of the above stated amount.</p>
              <div className="rem-report-sig">
                <strong>_________________________</strong>
                <span>Name and Signature Cashier/Treasurer</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
