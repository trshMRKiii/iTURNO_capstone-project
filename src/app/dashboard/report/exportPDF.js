const peso = (n) => {
  const num = parseFloat(n);
  if (isNaN(num)) return "₱0.00";
  return (
    "₱" +
    num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

/**
 * Export collections data as a printable PDF receipt
 * @param {Array} collections - Collection records to export
 * @param {Object} filters - Filter state (batch, startDate, endDate)
 */
export function exportPDF(collections, filters) {
  const batchLabel =
    filters.batch === "batch1"
      ? "Batch 1 (AM)"
      : filters.batch === "batch2"
        ? "Batch 2 (PM)"
        : "All Batches";

  const dateRange =
    filters.startDate && filters.endDate
      ? `${filters.startDate} to ${filters.endDate}`
      : filters.startDate
        ? `From ${filters.startDate}`
        : filters.endDate
          ? `Until ${filters.endDate}`
          : "All Time";

  const now = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  const totalAmt = collections.reduce(
    (s, r) => s + Number(r.collection_amount || 0),
    0,
  );

  // Group by date then by batch for receipt rows
  const byDate = {};
  collections.forEach((r) => {
    const d = r.issued_date || r.issued_at.split(" ")[0];
    if (!byDate[d]) byDate[d] = { batch1: [], batch2: [] };
    if (r.batch === "Batch 1") byDate[d].batch1.push(r);
    else byDate[d].batch2.push(r);
  });

  const receiptRows = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, batches]) => {
      let rows = "";
      if (batches.batch1.length > 0) {
        const total = batches.batch1.reduce(
          (s, r) => s + Number(r.collection_amount || 0),
          0,
        );
        rows += `<tr><td>${date}</td><td>Batch 1 (AM)</td><td style="text-align:center">${batches.batch1.length}</td><td style="text-align:right">${peso(total)}</td></tr>`;
      }
      if (batches.batch2.length > 0) {
        const total = batches.batch2.reduce(
          (s, r) => s + Number(r.collection_amount || 0),
          0,
        );
        rows += `<tr><td>${date}</td><td>Batch 2 (PM)</td><td style="text-align:center">${batches.batch2.length}</td><td style="text-align:right">${peso(total)}</td></tr>`;
      }
      return rows;
    })
    .join("");

  const html = `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="utf-8"/>
  <title>Collection Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; display: flex; justify-content: center; padding: 40px 20px; background: #f5f5f5; }
    .receipt { background: #fff; width: 420px; padding: 32px 28px; border: 1px solid #ddd; }
    .receipt-header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 16px; margin-bottom: 16px; }
    .receipt-header h2 { font-size: 16px; letter-spacing: 1px; text-transform: uppercase; }
    .receipt-header p { font-size: 11px; color: #666; margin-top: 4px; }
    .meta { margin-bottom: 16px; font-size: 12px; color: #444; }
    .meta span { display: block; margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
    th { border-bottom: 1px solid #222; padding: 6px 4px; text-align: left; font-size: 11px; text-transform: uppercase; }
    td { padding: 7px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
    .total-row { border-top: 2px solid #222; font-weight: bold; font-size: 13px; }
    .total-row td { padding-top: 10px; border-bottom: none; }
    .footer { text-align: center; font-size: 10px; color: #999; border-top: 2px dashed #ccc; padding-top: 12px; margin-top: 4px; }
  </style>
  </head>
  <body>
  <div class="receipt">
    <div class="receipt-header">
      <h2>🚌 Collection Receipt</h2>
      <p>Jeepney Management System</p>
      <p>Printed: ${now}</p>
    </div>
    <div class="meta">
      <span><strong>Period:</strong> ${dateRange}</span>
      <span><strong>Filter:</strong> ${batchLabel}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Batch</th>
          <th style="text-align:center">Tickets</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${receiptRows || '<tr><td colspan="4" style="text-align:center;color:#999;padding:16px">No records</td></tr>'}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="2">TOTAL</td>
          <td style="text-align:center">${collections.length}</td>
          <td style="text-align:right">${peso(totalAmt)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="footer">System-generated receipt — not an official document</div>
  </div>
  </body>
  </html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w)
    setTimeout(() => {
      w.focus();
      w.print();
    }, 500);
  URL.revokeObjectURL(url);
}

/**
 * Export tabular data (array of plain objects) as a printable PDF.
 * Opens the document in a new tab; the user clicks "Print / Save as PDF" when ready.
 * @param {Array<Object>} data - Rows to export; object keys become column headers
 * @param {string} title - Heading shown at the top of the document
 */
export function exportTablePDF(data, title = "Report") {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const now = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });

  const headerRow = headers.map((h) => `<th>${h}</th>`).join("");
  const bodyRows = data
    .map(
      (row) =>
        `<tr>${headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 32px; }
    h2 { font-size: 16px; margin-bottom: 4px; }
    p.meta { font-size: 11px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f1f5f9; border-bottom: 2px solid #222; padding: 6px 8px; text-align: left; text-transform: uppercase; font-size: 10px; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) td { background: #fafafa; }
    .print-btn { margin-bottom: 16px; padding: 8px 16px; border: none; border-radius: 6px; background: #166534; color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
    .print-btn:hover { opacity: 0.85; }
    @media print { .print-btn { display: none; } }
  </style>
  </head>
  <body>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    <h2>${title}</h2>
    <p class="meta">Printed: ${now} &middot; ${data.length} records</p>
    <table>
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </body>
  </html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
