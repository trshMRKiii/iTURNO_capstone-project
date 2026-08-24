import React, { useRef } from "react";
import { printRemittanceReport } from "./exportRemittancePDF";
import { apiService } from "../../../lib/api-service";

function formatCurrency(val) {
  return "₱" + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The official form shows "-" for zero/blank amounts rather than "₱0.00".
function formatAmount(val) {
  const n = Number(val || 0);
  return n === 0 ? "-" : formatCurrency(n);
}

function formatDate(val) {
  if (!val) return "—";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return val;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
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

function BlankRows({ count, cols }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={`blank-${i}`}>
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j}>&nbsp;</td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function ViewRemittance({ batch, onClose }) {
  const reportRef = useRef(null);

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
            <button
              className="rem-btn rem-btn--export"
              onClick={() =>
                apiService
                  .downloadRemittanceXlsx(batch.id, `Remittance_${batch.batch_code || batch.id}.xlsx`)
                  .catch(() => alert("Failed to export the official form. Please try again."))
              }
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Export Excel (.xlsx)
            </button>
            <button className="rem-btn rem-btn--export" onClick={() => printRemittanceReport(reportRef.current, batch)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print / Export PDF
            </button>
            <button className="rem-modal-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="rem-modal-body rem-report" ref={reportRef}>
          {/* Report Title */}
          <div className="rem-report-title">
            <strong>REPORT OF COLLECTIONS AND DEPOSITS</strong>
            <span>CITY GOVERNMENT OF SAN FERNANDO, LA UNION</span>
          </div>

          {/* Batch Info */}
          <div className="rem-report-info">
            <div className="rem-report-info-row">
              <span><strong>FUND:</strong> GENERAL FUND</span>
              <span><strong>Date:</strong> {formatDate(batch.issued_at)}</span>
            </div>
            <div className="rem-report-info-row">
              <span><strong>Name of Accountable Officer:</strong> {batch.issued_by_name || "—"}</span>
              <span><strong>Report No.:</strong> {batch.batch_code || batch.id || "—"}</span>
            </div>
          </div>

          {/* Section A */}
          <h3 className="rem-report-section">A. COLLECTIONS</h3>
          <p className="rem-report-sub">1. For Collectors</p>
          <table className="rem-report-table">
            <thead>
              <tr>
                <th rowSpan={2}>Type (Form No.)</th>
                <th colSpan={2} style={{ textAlign: "center" }}>Cash Tickets</th>
                <th rowSpan={2} style={{ textAlign: "right" }}>Amount</th>
              </tr>
              <tr>
                <th style={{ textAlign: "right" }}>From</th>
                <th style={{ textAlign: "right" }}>To</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c, i) => (
                <tr key={i}>
                  <td>{c.ticketFormNo || "—"}</td>
                  <td style={{ textAlign: "right" }}>{formatAmount(c.from)}</td>
                  <td style={{ textAlign: "right" }}>{formatAmount(c.to)}</td>
                  <td style={{ textAlign: "right" }}>{formatAmount(c.amount)}</td>
                </tr>
              ))}
              <BlankRows count={3} cols={4} />
            </tbody>
            <tfoot>
              <tr>
                <td><strong>TOTAL</strong></td>
                <td style={{ textAlign: "right" }}><strong>{formatAmount(totalFrom)}</strong></td>
                <td style={{ textAlign: "right" }}><strong>{formatAmount(totalTo)}</strong></td>
                <td style={{ textAlign: "right" }}><strong>{formatAmount(totalCollections)}</strong></td>
              </tr>
            </tfoot>
          </table>

          <p className="rem-report-sub">2. For Liquidating Officers/Treasurers</p>
          <table className="rem-report-table">
            <thead>
              <tr>
                <th>Name of Accountable Officer</th>
                <th>Report No.</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <BlankRows count={3} cols={3} />
            </tbody>
          </table>

          {/* Section B */}
          <h3 className="rem-report-section">B. REMITTANCES / DEPOSITS</h3>
          <table className="rem-report-table">
            <thead>
              <tr>
                <th rowSpan={2}>Accountable Officer/Bank</th>
                <th colSpan={2} style={{ textAlign: "center" }}>Reference</th>
                <th rowSpan={2} style={{ textAlign: "right" }}>Amount</th>
              </tr>
              <tr>
                <th>Den.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d, i) => (
                <tr key={i}>
                  <td>{i === 0 ? (batch.issued_by_name || "—") : ""}</td>
                  <td>{d.type === "coin" ? "C" : d.denomination}</td>
                  <td style={{ textAlign: "right" }}>{d.quantity > 0 ? d.quantity : ""}</td>
                  <td style={{ textAlign: "right" }}>{formatAmount(d.depositAmount)}</td>
                </tr>
              ))}
              <BlankRows count={2} cols={4} />
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}><strong>TOTAL</strong></td>
                <td style={{ textAlign: "right" }}><strong>{formatAmount(totalDeposits)}</strong></td>
              </tr>
            </tfoot>
          </table>

          {/* Section C */}
          <h3 className="rem-report-section">C. ACCOUNTABILITY FOR ACCOUNTABLE FORMS</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="rem-report-table rem-report-table--dense">
              <thead>
                <tr>
                  <th rowSpan={3}>Name of Form & No.</th>
                  <th colSpan={3} style={{ textAlign: "center" }}>Beginning Balance</th>
                  <th colSpan={3} style={{ textAlign: "center" }}>Receipt</th>
                  <th colSpan={3} style={{ textAlign: "center" }}>Issued</th>
                  <th colSpan={3} style={{ textAlign: "center" }}>Ending Balance</th>
                </tr>
                <tr>
                  <th rowSpan={2}>Qty</th><th colSpan={2} style={{ textAlign: "center" }}>Cash Tickets</th>
                  <th rowSpan={2}>Qty</th><th colSpan={2} style={{ textAlign: "center" }}>Cash Tickets</th>
                  <th rowSpan={2}>Qty</th><th colSpan={2} style={{ textAlign: "center" }}>Cash Tickets</th>
                  <th rowSpan={2}>Qty</th><th colSpan={2} style={{ textAlign: "center" }}>Cash Tickets</th>
                </tr>
                <tr>
                  <th>From</th><th>To</th>
                  <th>From</th><th>To</th>
                  <th>From</th><th>To</th>
                  <th>From</th><th>To</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((c, i) => (
                  <tr key={i}>
                    <td>{c.ticketFormNo || "—"}</td>
                    <td></td><td>{formatAmount(c.from)}</td><td></td>
                    <td></td><td></td><td></td>
                    <td></td><td>{formatAmount(c.amount)}</td><td></td>
                    <td></td><td>{formatAmount(c.to)}</td><td></td>
                  </tr>
                ))}
                <BlankRows count={2} cols={13} />
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>TOTAL</strong></td>
                  <td></td><td style={{ textAlign: "right" }}><strong>{formatAmount(totalFrom)}</strong></td><td></td>
                  <td>-</td><td></td><td></td>
                  <td></td><td style={{ textAlign: "right" }}><strong>{formatAmount(totalCollections)}</strong></td><td></td>
                  <td></td><td style={{ textAlign: "right" }}><strong>{formatAmount(totalTo)}</strong></td><td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Section D */}
          <h3 className="rem-report-section">D. SUMMARY OF COLLECTIONS AND REMITTANCES/DEPOSITS</h3>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <table className="rem-report-table rem-report-table--summary">
              <tbody>
                <tr><td>Beginning Balance</td><td style={{ textAlign: "right" }}>{formatAmount(totalFrom)}</td></tr>
                <tr><td>Add: Collections</td><td></td></tr>
                <tr><td style={{ paddingLeft: 20 }}>Cash</td><td></td></tr>
                <tr><td style={{ paddingLeft: 20 }}>Checks</td><td></td></tr>
                <tr><td>Total</td><td></td></tr>
                <tr><td>Less: Remittance/Deposits to Cashier/<br />&nbsp;&nbsp;&nbsp;Treasurer/Depository Bank</td><td></td></tr>
                <tr className="rem-report-row--bold"><td>Balance</td><td></td></tr>
              </tbody>
            </table>

            <table className="rem-report-table" style={{ flex: 1, minWidth: 260 }}>
              <thead>
                <tr>
                  <th colSpan={3}>List of Checks</th>
                </tr>
                <tr>
                  <th>Check No.</th>
                  <th>Payee</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <BlankRows count={3} cols={3} />
              </tbody>
            </table>
          </div>
          <p className="rem-report-sub" style={{ textAlign: "right" }}><em>Note: Use Additional Sheet if Necessary</em></p>

          {/* Certification */}
          <div className="rem-report-cert">
            <div className="rem-report-cert-box">
              <p className="rem-report-cert-label">CERTIFICATION:</p>
              <div className="rem-report-sig">
                <strong>{batch.issued_by_name || "—"}</strong>
                <span>Name and Signature of Accountable Officer</span>
              </div>
            </div>
            <div className="rem-report-cert-box">
              <p className="rem-report-cert-label">VERIFICATION AND ACKNOWLEDGEMENT:</p>
              <p className="rem-report-cert-text">
                I hereby certify that the foregoing report of collections has been
                verified and acknowledge receipt of the above stated amount.
              </p>
              <div className="rem-report-sig">
                <strong>MYLA D. ORTEGA</strong>
                <span>Name and Signature Cashier/Treasurer</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
