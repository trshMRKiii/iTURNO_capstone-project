import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Fills the official "Report of Collections and Deposits" form: the two blank
// PDF pages in /public/report_templates (the Excel form exported to PDF) are
// loaded and the batch's values are stamped into their cells, so the output
// matches the Excel form exactly. Coordinates are in PDF points measured from
// the top-left of the page; each table is described by its first row's top
// edge and row pitch, taken from the template's ruling lines.

// The accountable officer on the form is the supervisor who prepared the batch (older batches predate that, so fall back to who keyed them in).
export const officerName = (batch) => batch.prepared_by_name || batch.issued_by_name || "";

const PAGE_H = 792;
const SIZE = 8;
const PAD = 2.5;

// ---- Page 1 (A. Collections, B. Remittances/Deposits) ----
const P1 = {
  date: { x: 490, top: 85.9, bottom: 96.6 },
  officer: { x: 176, top: 96.6, bottom: 107.3 },
  reportNo: { x: 490, top: 96.6, bottom: 107.3 },
  collections: { top: 171.4, pitch: 10.67, rows: 21, totalTop: 395.7 },
  collectionCols: { type: [42.7, 174.4], from: [174.4, 337.1], to: [337.1, 488.1], amount: [488.1, 567.6] },
  deposits: { top: 609.3, pitch: 10.67, totalTop: 705.5 },
  depositCols: { officer: 44.5, qty: [428.8, 488.1], amount: [523.3, 567.6] },
};
const FIXED_TICKET_ROWS = ["Cash Tickets@2", "Cash Tickets@3", "Cash Tickets@5", "Cash Tickets@10"];
const DENOMINATION_ROWS = { 1000: 0, 500: 1, 200: 2, 100: 3, 50: 4, 20: 5 };
const COIN_ROW = 6;

// ---- Page 2 (C. Accountability, D. Summary, Certification) ----
const P2 = {
  rows: { top: 124.8, pitch: 10.1, count: 41, totalTop: 538.1 },
  nameX: 20,
  beginning: [147.3, 239.9],
  receipt: [273.0, 356.2],
  issued: [384.0, 470.0],
  ending: [503.1, 586.3],
  summaryBalance: { cols: [112, 240.3], top: 558.3, bottom: 568.4 },
  cert: { top: 699.5, bottom: 709.5, officer: [18.2, 188.2], date: [188.2, 273.0], cashier: [273.0, 503.1] },
};

async function loadTemplate(name) {
  const res = await fetch(`/report_templates/${name}`);
  if (!res.ok) throw new Error(`Missing report template ${name} (HTTP ${res.status})`);
  return PDFDocument.load(await res.arrayBuffer());
}

// Whole numbers plain, otherwise 2 decimals — how Excel's General format shows them.
function general(n) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function money(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function whole(n) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatDate(val) {
  const d = val ? new Date(val) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" });
}

// Writes `text` into the cell spanning rows [top, bottom] — left/center/right
// aligned within the column range [x0, x1], vertically centered.
function makeWriter(page, fonts) {
  return (text, { x0, x1, top, bottom, align = "center", bold = false }) => {
    if (text === "" || text == null) return;
    const font = bold ? fonts.bold : fonts.regular;
    const str = String(text);
    const width = font.widthOfTextAtSize(str, SIZE);
    const x = align === "left" ? x0 : align === "right" ? x1 - PAD - width : (x0 + x1) / 2 - width / 2;
    const baselineTop = (top + bottom) / 2 + SIZE * 0.35;
    page.drawText(str, { x, y: PAGE_H - baselineTop, size: SIZE, font, color: rgb(0, 0, 0) });
  };
}

function rowSpan(table, i) {
  const top = table.top + i * table.pitch;
  return { top, bottom: top + table.pitch };
}

function drawPage1(page, fonts, batch, collections, deposits) {
  const write = makeWriter(page, fonts);
  const officer = officerName(batch);

  write(formatDate(batch.issued_at), { x0: P1.date.x, x1: 567.6, ...P1.date, align: "left" });
  write(officer, { x0: P1.officer.x, x1: 428, ...P1.officer, align: "left" });
  write(batch.batch_code || String(batch.id || ""), { x0: P1.reportNo.x, x1: 567.6, ...P1.reportNo, align: "left" });

  const { collectionCols: cc } = P1;
  let nextExtra = FIXED_TICKET_ROWS.length;
  collections.forEach((c) => {
    let i = FIXED_TICKET_ROWS.indexOf(c.name);
    if (i < 0) {
      if (nextExtra >= P1.collections.rows) return;
      i = nextExtra++;
      write(c.name, { x0: cc.type[0], x1: cc.type[1], ...rowSpan(P1.collections, i) });
    }
    const row = rowSpan(P1.collections, i);
    write(general(c.from), { x0: cc.from[0], x1: cc.from[1], ...row });
    write(money(c.to), { x0: cc.to[0], x1: cc.to[1], ...row });
    write(c.amount === 0 ? "-" : money(c.amount), { x0: cc.amount[0], x1: cc.amount[1], ...row });
  });

  const total = { top: P1.collections.totalTop, bottom: P1.collections.totalTop + P1.collections.pitch, align: "right", bold: true };
  write(whole(sum(collections, "from")), { x0: cc.from[0], x1: cc.from[1], ...total });
  write(whole(sum(collections, "to")), { x0: cc.to[0], x1: cc.to[1], ...total });
  write(money(sum(collections, "amount")), { x0: cc.amount[0], x1: cc.amount[1], ...total });

  // The template has an officer name baked into the first deposit row; paint
  // over it so the real name replaces it.
  const first = rowSpan(P1.deposits, 0);
  page.drawRectangle({ x: 44, y: PAGE_H - first.bottom + 1, width: 120, height: P1.deposits.pitch - 2, color: rgb(1, 1, 1) });
  write(officer, { x0: P1.depositCols.officer, x1: 337, ...first, align: "left" });

  const dc = P1.depositCols;
  deposits.forEach((d) => {
    const i = d.type === "coin" ? COIN_ROW : DENOMINATION_ROWS[d.denomination];
    if (i === undefined) return;
    const row = rowSpan(P1.deposits, i);
    write(general(d.quantity), { x0: dc.qty[0], x1: dc.qty[1], ...row, align: "right" });
    write(general(d.depositAmount), { x0: dc.amount[0], x1: dc.amount[1], ...row, align: "right" });
  });
  write(general(sum(deposits, "depositAmount")), {
    x0: dc.amount[0], x1: dc.amount[1], top: P1.deposits.totalTop, bottom: P1.deposits.totalTop + P1.deposits.pitch, align: "right", bold: true,
  });
}

function drawPage2(page, fonts, batch, collections, cashierName) {
  const write = makeWriter(page, fonts);
  const officer = officerName(batch);
  const totalFrom = sum(collections, "from");

  let nextExtra = FIXED_TICKET_ROWS.length;
  collections.forEach((c) => {
    let i = FIXED_TICKET_ROWS.indexOf(c.name);
    if (i < 0) {
      if (nextExtra >= P2.rows.count) return;
      i = nextExtra++;
      write(c.name, { x0: P2.nameX, x1: 111.7, ...rowSpan(P2.rows, i), align: "left" });
    }
    const row = rowSpan(P2.rows, i);
    write(general(c.from), { x0: P2.beginning[0], x1: P2.beginning[1], ...row });
    write(general(c.amount), { x0: P2.issued[0], x1: P2.issued[1], ...row });
    write(general(c.to), { x0: P2.ending[0], x1: P2.ending[1], ...row });
  });

  const total = { top: P2.rows.totalTop, bottom: P2.rows.totalTop + P2.rows.pitch, align: "right" };
  write(general(totalFrom), { x0: P2.beginning[0], x1: P2.beginning[1], ...total });
  write("0", { x0: P2.receipt[0], x1: P2.receipt[1], ...total });
  write(general(sum(collections, "amount")), { x0: P2.issued[0], x1: P2.issued[1], ...total });
  write(general(sum(collections, "to")), { x0: P2.ending[0], x1: P2.ending[1], ...total });

  const sb = P2.summaryBalance;
  write(general(totalFrom), { x0: sb.cols[0], x1: sb.cols[1], top: sb.top, bottom: sb.bottom });

  const { cert } = P2;
  const certRow = { top: cert.top, bottom: cert.bottom };
  write(officer, { x0: cert.officer[0], x1: cert.officer[1], ...certRow });
  write(formatDate(batch.issued_at), { x0: cert.date[0], x1: cert.date[1], ...certRow });
  write(cashierName, { x0: cert.cashier[0], x1: cert.cashier[1], ...certRow, bold: true });
}

function sum(rows, key) {
  return rows.reduce((s, r) => s + r[key], 0);
}

// Same derivation as ViewRemittance / the xlsx export: To = From - Amount.
function normalizeCollection(c) {
  const from = Number(c.from_no || c.from || 0);
  const amount = Number(c.amount || 0);
  return { name: c.ticket_form_no || c.ticketFormNo || "", from, to: from - amount, amount };
}

function normalizeDeposit(d) {
  return {
    type: d.type || "bill",
    denomination: Number(d.denomination || 0),
    quantity: Number(d.quantity || 0),
    depositAmount: Number(d.deposit_amount || d.depositAmount || 0),
  };
}

export async function buildRemittancePDF(batch, cashierName) {
  const [page1Doc, page2Doc] = await Promise.all([loadTemplate("remittance_page1.pdf"), loadTemplate("remittance_page2.pdf")]);
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const [page1] = await doc.copyPages(page1Doc, [0]);
  const [page2] = await doc.copyPages(page2Doc, [0]);
  doc.addPage(page1);
  doc.addPage(page2);

  const collections = (batch.collections || []).map(normalizeCollection);
  const deposits = (batch.deposits || []).map(normalizeDeposit);
  drawPage1(page1, fonts, batch, collections, deposits);
  drawPage2(page2, fonts, batch, collections, cashierName);
  return doc.save();
}

export async function downloadRemittancePDF(batch, cashierName) {
  const bytes = await buildRemittancePDF(batch, cashierName);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Remittance_${batch.batch_code || batch.id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
