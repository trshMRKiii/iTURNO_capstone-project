// CSS for the .rem-report-* classes (see src/styles/Remittance.css), copied
// so the print window renders the exact same markup without depending on the
// app's bundled stylesheet. var(--x) placeholders are resolved at print time
// against the live page's computed values, so it matches whatever theme
// (light/dark) was actually on screen.
const REPORT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 28px; background: var(--bg-surface); }
  .rem-report { display: flex; flex-direction: column; gap: 14px; }
  .rem-report-title { text-align: center; display: flex; flex-direction: column; gap: 2px; font-size: 14px; color: var(--text-primary); padding-bottom: 10px; border-bottom: 2px solid var(--text-primary); }
  .rem-report-title span { font-size: 12px; color: var(--text-secondary); }
  .rem-report-info { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-primary); }
  .rem-report-info-row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .rem-report-section { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-primary); margin: 6px 0 0; padding: 6px 0; border-bottom: 1px solid var(--border); }
  .rem-report-sub { font-size: 11px; color: var(--text-secondary); margin: 0; font-style: italic; }
  .rem-report-table { width: 100%; border-collapse: collapse; font-size: 12.5px; border: 1px solid var(--border); }
  .rem-report-table th { padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border); white-space: nowrap; }
  .rem-report-table td { padding: 7px 10px; border: 1px solid var(--border-soft); color: var(--text-primary); }
  .rem-report-table tfoot td { background: var(--bg-hover); font-weight: 700; border-top: 2px solid var(--border); }
  .rem-report-table--dense th, .rem-report-table--dense td { padding: 5px 6px; font-size: 11px; }
  .rem-report-table--summary { max-width: 500px; }
  .rem-report-table--summary td:first-child { font-size: 12px; }
  .rem-report-row--bold td { font-weight: 700; border-top: 2px solid var(--border); }
  .rem-report-cert { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; padding-top: 14px; border-top: 2px solid var(--text-primary); }
  .rem-report-cert-box { display: flex; flex-direction: column; gap: 8px; }
  .rem-report-cert-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); margin: 0; }
  .rem-report-cert-text { font-size: 11.5px; color: var(--text-secondary); margin: 0; line-height: 1.4; }
  .rem-report-sig { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: 24px; text-align: center; }
  .rem-report-sig strong { font-size: 13px; color: var(--text-primary); }
  .rem-report-sig span { font-size: 10px; color: var(--text-secondary); border-top: 1px solid var(--border); padding-top: 4px; }
  .print-btn { margin-bottom: 16px; padding: 8px 16px; border: none; border-radius: 6px; background: #166534; color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
  .print-btn:hover { opacity: 0.85; }
  @media print { .print-btn { display: none; } body { padding: 0; } }
`;

const THEME_VARS = ["--text-primary", "--text-secondary", "--border", "--border-soft", "--bg-hover", "--bg-surface"];

// Prints the exact same "Report of Collections and Deposits" markup shown in
// ViewRemittance — not a re-approximated copy — by cloning its live DOM node
// (reportEl, the .rem-report container) into a standalone print window. Opens
// the print dialog, where the user can print it, save it as a PDF, or cancel.
export function printRemittanceReport(reportEl, batch) {
  if (!reportEl) return;

  const computed = getComputedStyle(document.documentElement);
  const vars = THEME_VARS.map((name) => `${name}: ${computed.getPropertyValue(name).trim() || "#000"};`).join("\n");

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Remittance_${batch.batch_code || batch.id}</title>
    <style>
      :root { ${vars} }
      ${REPORT_STYLES}
    </style>
  </head>
  <body>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    ${reportEl.outerHTML}
  </body>
  </html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Your browser blocked the print popup. Please allow popups for this site and try again.");
    return;
  }
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    win.focus();
    win.print();
  }, 500);
}
