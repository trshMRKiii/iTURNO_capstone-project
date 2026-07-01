const peso = (n) =>
  "₱" +
  Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Generate and open a printable PDF receipt for a single reward redemption.
 * @param {Object} redemption - Redemption record (points_redeemed, peso_value, status, created_at, approved_by_name)
 * @param {Object} driver - Driver info (first_name, last_name, iwp_number)
 */
export function exportRewardReceipt(redemption, driver) {
  const now = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  const redeemedDate = new Date(redemption.created_at).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const html = `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="utf-8"/>
  <title>Redemption Receipt</title>
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
    .print-btn { display: block; margin: 0 auto 16px; padding: 8px 16px; border: none; border-radius: 6px; background: #166534; color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
    .print-btn:hover { opacity: 0.85; }
    @media print { .print-btn { display: none; } body { background: #fff; padding: 0; } .receipt { border: none; } }
  </style>
  </head>
  <body>
  <div class="receipt">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    <div class="receipt-header">
      <h2>Reward Redemption Receipt</h2>
      <p>Jeepney Management System</p>
      <p>Printed: ${now}</p>
    </div>
    <div class="meta">
      <span><strong>Driver:</strong> ${driver.last_name}, ${driver.first_name}</span>
      <span><strong>IWP Number:</strong> ${driver.iwp_number || "—"}</span>
      <span><strong>Redemption Date:</strong> ${redeemedDate}</span>
      <span><strong>Status:</strong> ${redemption.status}</span>
      <span><strong>Approved By:</strong> ${redemption.approved_by_name || "—"}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Points Redeemed</td>
          <td style="text-align:right">-${Number(redemption.points_redeemed).toLocaleString()}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td>PESO VALUE</td>
          <td style="text-align:right">${peso(redemption.peso_value)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="footer">System-generated receipt — not an official document</div>
  </div>
  </body>
  </html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
