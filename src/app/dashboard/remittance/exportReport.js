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

export function downloadCSV(batch) {
  const csv = generateCSVRows(batch);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Remittance_${batch.id}_${batch.issued_at || "report"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function generateReportHTML(batch) {
  const collections = (batch.collections || []).map(getCollectionFields);
  const deposits = (batch.deposits || []).map(getDepositFields);
  const totalCollections = collections.reduce((s, c) => s + c.amount, 0);
  const totalDeposits = deposits.reduce((s, d) => s + d.depositAmount, 0);
  const totalFrom = collections.reduce((s, c) => s + c.from, 0);
  const totalTo = collections.reduce((s, c) => s + c.to, 0);

  const collectionRows = collections.length > 0
    ? collections.map(c => `
      <tr>
        <td>${c.ticketFormNo || "—"}</td>
        <td style="text-align:right">${formatCurrency(c.from)}</td>
        <td style="text-align:right">${formatCurrency(c.to)}</td>
        <td style="text-align:right">${formatCurrency(c.amount)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" style="text-align:center;color:#888">No collections</td></tr>`;

  const depositRows = deposits.length > 0
    ? deposits.map(d => `
      <tr>
        <td>${d.type === "coin" ? "Coins" : d.denomination}</td>
        <td style="text-align:right">${d.quantity.toLocaleString()}</td>
        <td style="text-align:right">${formatCurrency(d.depositAmount)}</td>
      </tr>`).join("")
    : `<tr><td colspan="3" style="text-align:center;color:#888">No deposits</td></tr>`;

  const formRows = collections.length > 0
    ? collections.map(c => `
      <tr>
        <td>${c.ticketFormNo || "—"}</td>
        <td>${c.from}</td><td>—</td><td>—</td>
        <td>—</td><td>—</td><td>—</td>
        <td>${c.amount}</td><td>—</td><td>—</td>
        <td>${c.to}</td><td>—</td><td>—</td>
      </tr>`).join("")
    : `<tr><td colspan="13" style="text-align:center;color:#888">No forms</td></tr>`;

  return `
    <html>
      <head>
        <title>Remittance_${batch.id || ""}</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; padding: 24px; }
          h1, h2, h3 { margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
          th, td { border: 1px solid #999; padding: 4px 6px; font-size: 11px; }
          th { background: #f0f0f0; }
          .title { text-align: center; margin-bottom: 16px; }
          .info-row { display: flex; justify-content: space-between; margin: 4px 0; }
          .cert { display: flex; justify-content: space-between; margin-top: 32px; }
          .cert-box { width: 48%; }
          .sig { margin-top: 40px; border-top: 1px solid #333; padding-top: 4px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="title">
          <h2>REPORT OF COLLECTIONS AND DEPOSITS</h2>
          <div>CITY GOVERNMENT OF SAN FERNANDO, LA UNION</div>
        </div>
        <div class="info-row"><span><strong>FUND:</strong> GENERAL FUND</span><span><strong>Date:</strong> ${batch.issued_at || "—"}</span></div>
        <div class="info-row"><span><strong>Name of Accountable Officer:</strong> ${batch.issued_by_name || "—"}</span><span><strong>Report No.:</strong> ${batch.id || "—"}</span></div>

        <h3>A. COLLECTIONS</h3>
        <p>1. For Collectors</p>
        <table>
          <thead><tr><th>Type (Form No.)</th><th>From</th><th>To</th><th>Amount</th></tr></thead>
          <tbody>${collectionRows}</tbody>
          <tfoot><tr><td><strong>TOTAL</strong></td><td style="text-align:right"><strong>${formatCurrency(totalFrom)}</strong></td><td style="text-align:right"><strong>${formatCurrency(totalTo)}</strong></td><td style="text-align:right"><strong>${formatCurrency(totalCollections)}</strong></td></tr></tfoot>
        </table>

        <h3>B. REMITTANCES / DEPOSITS</h3>
        <table>
          <thead><tr><th>Den.</th><th>Quantity</th><th>Amount</th></tr></thead>
          <tbody>${depositRows}</tbody>
          <tfoot><tr><td><strong>TOTAL DEPOSITS</strong></td><td style="text-align:right"><strong>${deposits.reduce((s, d) => s + d.quantity, 0).toLocaleString()}</strong></td><td style="text-align:right"><strong>${formatCurrency(totalDeposits)}</strong></td></tr></tfoot>
        </table>

        <h3>C. ACCOUNTABILITY FOR ACCOUNTABLE FORMS</h3>
        <table>
          <thead>
            <tr><th rowspan="2">Name of Form & No.</th><th colspan="3" style="text-align:center">Beginning Balance</th><th colspan="3" style="text-align:center">Receipt</th><th colspan="3" style="text-align:center">Issued</th><th colspan="3" style="text-align:center">Ending Balance</th></tr>
            <tr><th>Qty</th><th>From</th><th>To</th><th>Qty</th><th>From</th><th>To</th><th>Qty</th><th>From</th><th>To</th><th>Qty</th><th>From</th><th>To</th></tr>
          </thead>
          <tbody>${formRows}</tbody>
        </table>

        <h3>D. SUMMARY OF COLLECTIONS AND REMITTANCES/DEPOSITS</h3>
        <table>
          <tbody>
            <tr><td>Beginning Balance</td><td style="text-align:right">${formatCurrency(totalFrom)}</td></tr>
            <tr><td>Add: Collections — Cash</td><td style="text-align:right">${formatCurrency(totalCollections)}</td></tr>
            <tr><td>Add: Collections — Checks</td><td style="text-align:right">${formatCurrency(0)}</td></tr>
            <tr><td>Remittance/Deposits</td><td style="text-align:right">${formatCurrency(totalDeposits)}</td></tr>
            <tr><td><strong>Balance</strong></td><td style="text-align:right"><strong>${formatCurrency(totalDeposits)}</strong></td></tr>
          </tbody>
        </table>

        <div class="cert">
          <div class="cert-box">
            <p><strong>CERTIFICATION:</strong></p>
            <p>I hereby certify that the above report of collections and deposits is correct.</p>
            <div class="sig">${batch.issued_by_name || "—"}<br/><small>Name and Signature of Accountable Officer</small></div>
          </div>
          <div class="cert-box">
            <p><strong>VERIFICATION AND ACKNOWLEDGEMENT:</strong></p>
            <p>I hereby certify that the foregoing report of collections has been verified and acknowledge receipt of the above stated amount.</p>
            <div class="sig">_________________________<br/><small>Name and Signature Cashier/Treasurer</small></div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function downloadPDF(batch) {
  const html = generateReportHTML(batch);
  const printWindow = window.open("", "_blank", "width=900,height=1000");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}
