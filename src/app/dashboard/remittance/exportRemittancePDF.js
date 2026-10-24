import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { apiService } from "../../../lib/api-service";

// Fills the official "Report of Collections and Deposits" form: the two blank
// PDF pages in /public/report_templates (the Excel form exported to PDF) are
// loaded and the batch's values are stamped into their cells, so the output
// matches the Excel form exactly. Coordinates are in PDF points measured from
// the top-left of the page; each table is described by its first row's top
// edge and row pitch, taken from the template's ruling lines.
//
// The template ships with four ticket forms (Cash Tickets@2/3/5/10) printed in
// its collection rows; those are erased so the rows list only the forms (and
// ticket series) the batch actually collected, as named in Settings.

// The accountable officer on the form is the supervisor who prepared the batch (older batches predate that, so fall back to who keyed them in).
export const officerName = (batch) => batch.prepared_by_name || batch.issued_by_name || "";

const PAGE_H = 792;
const SIZE = 8;
const MIN_SIZE = 5;
const PAD = 2.5;

// ---- Page 1 (A. Collections, B. Remittances/Deposits) ----
const P1 = {
  date: { x: 490, top: 85.9, bottom: 96.6 },
  officer: { x: 176, top: 96.6, bottom: 107.3 },
  reportNo: { x: 490, top: 96.6, bottom: 107.3 },
  collections: { top: 171.4, pitch: 10.67, rows: 21, totalTop: 395.7 },
  collectionCols: { type: [42.7, 174.4], from: [174.4, 337.1], to: [337.1, 488.1], amount: [488.1, 567.6] },
  seriesHeader: { top: 150.4, bottom: 161.1, erase: [300, 363] },
  deposits: { top: 609.3, pitch: 10.67, totalTop: 705.5 },
  depositCols: { officer: 44.5, qty: [428.8, 488.1], amount: [523.3, 567.6], amountSplit: 523.9 },
};
// The template prints a two-line title on both pages (~y54-74). It is painted over on both; page 1 gets the city
// seal on top with the city line and then the form title beneath it, page 2 carries no header.
const HEADER = { erase: [200, 412], old: { top: 54, bottom: 75 }, sealTop: 6, sealSize: 42, city: { top: 51, bottom: 61 }, title: { top: 62, bottom: 72 } };
const TEMPLATE_TICKET_ROWS = 4; // rows pre-printed with a ticket form name, on both pages
const TYPE_LABEL_X = 83.8;
const DENOMINATION_ROWS = { 1000: 0, 500: 1, 200: 2, 100: 3, 50: 4, 20: 5 };
const COIN_ROW = 6;

// ---- Page 2 (C. Accountability, D. Summary, Certification) ----
const P2 = {
  rows: { top: 124.8, pitch: 10.1, count: 41, totalTop: 538.1 },
  nameX: 20,
  beginning: { qty: [112, 147.3], range: [147.3, 239.9] },
  receipt: { qty: [240.2, 273.0], range: [273.0, 356.2] },
  issued: { qty: [356.5, 384.0], range: [384.0, 470.0] },
  ending: { qty: [470.3, 503.1], range: [503.1, 586.3] },
  // D. Summary: rows from Beginning Balance down; the template's "20" (of a year) sits beside the first.
  summary: { cols: [112, 240.3], lines: [306.3, 416.9], top: 558.3, pitch: 10.08, year: [240.8, 252], yearX: 241.6 },
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

function formatDate(val) {
  const d = val ? new Date(val) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" });
}

// Writes `text` into the cell spanning rows [top, bottom] — left/center/right
// aligned within the column range [x0, x1], vertically centered. Text too wide
// for the cell shrinks to fit (down to MIN_SIZE) instead of running over its lines.
function makeWriter(page, fonts) {
  return (text, { x0, x1, top, bottom, align = "center", bold = false }) => {
    if (text === "" || text == null) return;
    const font = bold ? fonts.bold : fonts.regular;
    const str = String(text);
    const natural = font.widthOfTextAtSize(str, SIZE);
    const room = x1 - x0 - 2 * PAD;
    const size = natural > room ? Math.max((SIZE * room) / natural, MIN_SIZE) : SIZE;
    const width = (natural * size) / SIZE;
    const x = align === "left" ? x0 : align === "right" ? x1 - PAD - width : (x0 + x1) / 2 - width / 2;
    const baselineTop = (top + bottom) / 2 + size * 0.35;
    page.drawText(str, { x, y: PAGE_H - baselineTop, size, font, color: rgb(0, 0, 0) });
  };
}

function rowSpan(table, i) {
  const top = table.top + i * table.pitch;
  return { top, bottom: top + table.pitch };
}

// Paints a cell's interior white (leaving its ruling lines) to remove text baked into the template.
function erase(page, x0, x1, { top, bottom }) {
  page.drawRectangle({ x: x0, y: PAGE_H - bottom + 1, width: x1 - x0, height: bottom - top - 2, color: rgb(1, 1, 1) });
}

const ticketRange = (r) => (r && r.qty > 0 ? `${r.from} - ${r.to}` : "");

function clearHeader(page) {
  erase(page, HEADER.erase[0], HEADER.erase[1], HEADER.old);
}

function drawHeader(page, fonts, seal) {
  const write = makeWriter(page, fonts);
  const h = HEADER;
  clearHeader(page);
  page.drawImage(seal, { x: (612 - h.sealSize) / 2, y: PAGE_H - h.sealTop - h.sealSize, width: h.sealSize, height: h.sealSize });
  write("CITY GOVERNMENT OF SAN FERNANDO, LA UNION", { x0: 0, x1: 612, ...h.city, bold: true });
  write("REPORT OF COLLECTIONS AND DEPOSITS", { x0: 0, x1: 612, ...h.title, bold: true });
}

function drawPage1(page, fonts, batch, collections, deposits) {
  const write = makeWriter(page, fonts);
  const officer = officerName(batch);

  write(formatDate(batch.issued_at), { x0: P1.date.x, x1: 567.6, ...P1.date, align: "left" });
  write(officer, { x0: P1.officer.x, x1: 428, ...P1.officer, align: "left" });
  write(batch.batch_code || String(batch.id || ""), { x0: P1.reportNo.x, x1: 567.6, ...P1.reportNo, align: "left" });

  // From/To hold the first and last ticket number collected from each series, so
  // two series of the same form are two rows. The header over them reads "Ticket Series".
  const { collectionCols: cc, seriesHeader: sh } = P1;
  erase(page, sh.erase[0], sh.erase[1], sh);
  write("Ticket Series", { x0: cc.from[0], x1: cc.to[1], top: sh.top, bottom: sh.bottom, bold: true });

  for (let i = 0; i < TEMPLATE_TICKET_ROWS; i++) erase(page, cc.type[0] + 1, cc.type[1] - 1, rowSpan(P1.collections, i));
  collections.slice(0, P1.collections.rows).forEach((c, i) => {
    const row = rowSpan(P1.collections, i);
    write(c.name, { x0: TYPE_LABEL_X, x1: cc.type[1], ...row, align: "left" });
    write(c.from ? general(c.from) : "", { x0: cc.from[0], x1: cc.from[1], ...row });
    write(c.to ? general(c.to) : "", { x0: cc.to[0], x1: cc.to[1], ...row });
    write(c.amount === 0 ? "-" : money(c.amount), { x0: cc.amount[0], x1: cc.amount[1], ...row });
  });

  const total = { top: P1.collections.totalTop, bottom: P1.collections.totalTop + P1.collections.pitch, align: "right", bold: true };
  write(money(sum(collections, "amount")), { x0: cc.amount[0], x1: cc.amount[1], ...total });

  // The template has an officer name baked into the first deposit row; paint
  // over it so the real name replaces it.
  const first = rowSpan(P1.deposits, 0);
  erase(page, 44, 164, first);
  write(officer, { x0: P1.depositCols.officer, x1: 337, ...first, align: "left" });

  const dc = P1.depositCols;
  // The template splits the Amount column in two below its header; the deposit amount is a single column,
  // so paint over the divider from the first deposit row through Total.
  const depositRows = Math.round((P1.deposits.totalTop - P1.deposits.top) / P1.deposits.pitch) + 1;
  for (let i = 0; i < depositRows; i++) {
    const { top, bottom } = rowSpan(P1.deposits, i);
    // Rules are ~0.7pt thick: stay between them so the horizontal lines keep crossing the column.
    page.drawRectangle({ x: dc.amountSplit - 0.8, y: PAGE_H - bottom + 0.1, width: 1.6, height: bottom - top - 0.9, color: rgb(1, 1, 1) });
  }
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

function drawPage2(page, fonts, batch, rows, cash, cashierName) {
  const write = makeWriter(page, fonts);
  const officer = officerName(batch);

  for (let i = 0; i < TEMPLATE_TICKET_ROWS; i++) erase(page, P2.nameX - 0.5, 111.5, rowSpan(P2.rows, i));
  const balances = [["beginning", P2.beginning], ["received", P2.receipt], ["issued", P2.issued], ["ending", P2.ending]];
  rows.slice(0, P2.rows.count).forEach((r, i) => {
    const row = rowSpan(P2.rows, i);
    write(r.name, { x0: P2.nameX, x1: 111.7, ...row, align: "left" });
    balances.forEach(([key, col]) => {
      if (!(r[key]?.qty > 0)) return;
      write(general(r[key].qty), { x0: col.qty[0], x1: col.qty[1], ...row });
      write(ticketRange(r[key]), { x0: col.range[0], x1: col.range[1], ...row });
    });
  });

  const total = { top: P2.rows.totalTop, bottom: P2.rows.totalTop + P2.rows.pitch, align: "right" };
  balances.forEach(([key, col]) => {
    const qty = rows.reduce((s, r) => s + (r[key]?.qty || 0), 0);
    write(qty ? general(qty) : key === "received" ? "0" : "", { x0: col.qty[0], x1: col.qty[1], ...total });
  });

  // Beginning Balance is the cash value of all ticket forms on hand before the day; Cash is what is being
  // remitted, and Total is Cash plus any checks (none are recorded, so it equals Cash).
  const sm = P2.summary;
  // Standard PDF fonts have no peso sign, so amounts are prefixed with "P" as the template itself does.
  const peso = (n) => `P ${money(n)}`;
  const beginningValue = rows.reduce((s, r) => s + (r.beginningValue || 0), 0);
  write(beginningValue ? peso(beginningValue) : "", { x0: sm.cols[0], x1: sm.cols[1], ...rowSpan(sm, 0) });
  if (cash) {
    // Cash and Total go on the underlines to the right of their labels.
    write(peso(cash), { x0: sm.lines[0], x1: sm.lines[1], ...rowSpan(sm, 2) });
    write(peso(cash), { x0: sm.lines[0], x1: sm.lines[1], ...rowSpan(sm, 4) });
  }
  erase(page, sm.year[0], sm.year[1], rowSpan(sm, 0));
  write(batchDay(batch).slice(0, 4), { x0: sm.yearX, x1: sm.yearX + 23, ...rowSpan(sm, 0), align: "left" });

  const { cert } = P2;
  const certRow = { top: cert.top, bottom: cert.bottom };
  write(officer, { x0: cert.officer[0], x1: cert.officer[1], ...certRow });
  write(formatDate(batch.issued_at), { x0: cert.date[0], x1: cert.date[1], ...certRow });
  write(cashierName, { x0: cert.cashier[0], x1: cert.cashier[1], ...certRow, bold: true });
}

function sum(rows, key) {
  return rows.reduce((s, r) => s + r[key], 0);
}

// A collection row is one ticket series of one form: where the series stood when the day began (From), where it
// stands now (To: the next unused number, equal to From if nothing was issued), and the cash collected from it.
// A form with no series in use has blank numbers. Accepts both the saved shape (from_no/to_no) and the create form's (from/to).
export function normalizeCollection(c) {
  return {
    name: c.ticket_form_no || c.ticketFormNo || "",
    from: Number(c.from_no || c.from || 0),
    to: Number(c.to_no || c.to || 0),
    amount: Number(c.amount || 0),
  };
}

export async function loadSeries() {
  try {
    const data = await apiService.request("/ticket-series/");
    return Array.isArray(data) ? data : data?.results || [];
  } catch (err) {
    console.error("Failed to load ticket series for the accountability section:", err);
    return [];
  }
}

// The Manila calendar day (YYYY-MM-DD) of a timestamp, and the day a batch covers.
export const phDay = (iso) => new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
export const batchDay = (batch) => batch.covers_date || phDay(batch.issued_at);

// C. Accountability, in ticket numbers. A row's series is the one holding its From number; the series' last
// number then gives the balance at the start of the day (From..end), what was issued (From..To-1) and what is
// left (To..end). A series nothing was issued from has the same beginning and ending balance. A series
// recorded on `day` itself had no beginning balance: it is Receipt (its whole range) instead.
export function accountabilityRows(collections, series, day) {
  return collections.map((c) => {
    const s = c.from && series.find((x) => Number(x.start_no) <= c.from && c.from <= Number(x.end_no));
    if (!s) return { name: c.name }; // no series in use, or an older batch
    const [start, end] = [Number(s.start_no), Number(s.end_no)];
    const row = {
      name: c.name,
      issued: { qty: c.to - c.from, from: c.from, to: c.to - 1 },
      ending: { qty: end - c.to + 1, from: c.to, to: end },
    };
    if (s.created_at && phDay(s.created_at) === day) return { ...row, received: { qty: end - start + 1, from: start, to: end } };
    return { ...row, beginning: { qty: end - c.from + 1, from: c.from, to: end }, beginningValue: (end - c.from + 1) * Number(s.ticket_form_price || 0) };
  });
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
  const [page1Doc, page2Doc, series] = await Promise.all([loadTemplate("remittance_page1.pdf"), loadTemplate("remittance_page2.pdf"), loadSeries()]);
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const [page1] = await doc.copyPages(page1Doc, [0]);
  const [page2] = await doc.copyPages(page2Doc, [0]);
  doc.addPage(page1);
  doc.addPage(page2);

  const seal = await doc.embedPng(await (await fetch("/report_templates/seal.png")).arrayBuffer());
  drawHeader(page1, fonts, seal);
  clearHeader(page2);

  const collections = (batch.collections || []).map(normalizeCollection);
  const deposits = (batch.deposits || []).map(normalizeDeposit);
  drawPage1(page1, fonts, batch, collections, deposits);
  drawPage2(page2, fonts, batch, accountabilityRows(collections, series, batchDay(batch)), sum(deposits, "depositAmount"), cashierName);
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
