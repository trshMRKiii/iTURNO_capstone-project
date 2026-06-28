import React from "react";

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

function generateCSVRows(batch) {
  const rows = [];
  const add = (...cols) => rows.push(cols.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));

  add("REPORT OF COLLECTIONS AND DEPOSITS");
  add("CITY GOVERNMENT OF SAN FERNANDO, LA UNION");
  add("");
  add("FUND:", "GENERAL FUND", "", "Date:", batch.issued_at || "");
  add("Name of Accountable Officer:", batch.issued_by_name || "", "", "Report No.:", batch.id || "");
  add("");

  // Section A - Collections
  add("A. COLLECTIONS");
  add("1. For Collectors");
  add("Type (Form No.)", "From", "To", "Amount");
  const collections = (batch.collections || []).map(getCollectionFields);
  collections.forEach(c => {
    add(c.ticketFormNo, c.from, c.to, c.amount);
  });
  const totalCollections = collections.reduce((s, c) => s + c.amount, 0);
  const totalFrom = collections.reduce((s, c) => s + c.from, 0);
  const totalTo = collections.reduce((s, c) => s + c.to, 0);
  add("TOTAL", totalFrom, totalTo, totalCollections);
  add("");

  // Section B - Remittances/Deposits
  add("B. REMITTANCES/DEPOSITS");
  add("Den.", "Quantity", "Amount");
  const deposits = (batch.deposits || []).map(getDepositFields);
  deposits.forEach(d => {
    const label = d.type === "coin" ? "Coins" : d.denomination;
    add(label, d.quantity, d.depositAmount);
  });
  const totalDeposits = deposits.reduce((s, d) => s + d.depositAmount, 0);
  add("TOTAL DEPOSITS", "", totalDeposits);
  add("");

  // Section C - Accountability for Accountable Forms
  add("C. ACCOUNTABILITY FOR ACCOUNTABLE FORMS");
  add("Name of Form & No.", "Beg. Bal Qty", "Beg. From", "Beg. To", "Receipt Qty", "Rec. From", "Rec. To", "Issued Qty", "Iss. From", "Iss. To", "End Qty", "End From", "End To");
  collections.forEach(c => {
    add(c.ticketFormNo, c.from, "", "", "", "", "", c.amount, "", "", c.to, "", "");
  });
  add("");

  // Section D - Summary
  add("D. SUMMARY OF COLLECTIONS AND REMITTANCES/DEPOSITS");
  add("Beginning Balance", totalFrom);
  add("Add: Collections - Cash", totalCollections);
  add("Add: Collections - Checks", 0);
  add("Remittance/Deposits", totalDeposits);
  add("Balance", totalDeposits);
  add("");

  // Certification
  add("CERTIFICATION");
  add("Prepared By:", batch.issued_by_name || "");
  add("Verified By:", "");

  return rows.join("\n");
}

function downloadCSV(batch) {
  const csv = generateCSVRows(batch);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Remittance_${batch.id}_${batch.issued_at || "report"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
                  <td style={{ textAlign: "right" }}>{c.from.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{c.to.toLocaleString()}</td>
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
                  <strong>{totalFrom.toLocaleString()}</strong>
                </td>
                <td style={{ textAlign: "right" }}>
                  <strong>{totalTo.toLocaleString()}</strong>
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
              <tr><td>Beginning Balance</td><td style={{ textAlign: "right" }}>{totalFrom.toLocaleString()}</td></tr>
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
