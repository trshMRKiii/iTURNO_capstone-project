import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

// Mirrors backend/api/views/remittance_export.py's render_remittance_xlsx
// exactly (same template, same cell mapping) so the remote export produces
// an identical "Report of Collections and Deposits" form.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "report_templates", "report_of_collections_and_deposits.xlsx");

const FIXED_COLLECTION_ROWS = { "Cash Tickets@2": 12, "Cash Tickets@3": 13, "Cash Tickets@5": 14, "Cash Tickets@10": 15 };
const EXTRA_COLLECTION_ROWS = range(16, 33);

const DENOMINATION_ROWS = { 1000: 53, 500: 54, 200: 55, 100: 56, 50: 57, 20: 58 };
const COIN_ROW = 59;

const FIXED_ACCOUNTABILITY_ROWS = { "Cash Tickets@2": 8, "Cash Tickets@3": 9, "Cash Tickets@5": 10, "Cash Tickets@10": 11 };
const EXTRA_ACCOUNTABILITY_ROWS = range(12, 49);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function range(start, end) {
  return Array.from({ length: end - start }, (_, i) => start + i);
}

function phLongDate(isoString) {
  const d = new Date(new Date(isoString).getTime() + 8 * 3600 * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}, ${d.getUTCFullYear()}`;
}

function collectionFields(c) {
  const fromNo = Number(c.from_no) || 0;
  const amount = Number(c.amount) || 0;
  return [c.ticket_form_no || "", fromNo, fromNo - amount, amount];
}

export async function renderRemittanceXlsx(batch) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const sheet1 = wb.getWorksheet("Sheet1");
  const sheet2 = wb.getWorksheet("Sheet2");

  const issuedBy = batch.issued_by;
  const officerName = issuedBy
    ? `${issuedBy.first_name || ""} ${issuedBy.last_name || ""}`.trim() || issuedBy.username || ""
    : "";
  const reportNo = batch.batch_code || String(batch.id ?? "");
  const dateStr = batch.issued_at ? phLongDate(batch.issued_at) : "";

  sheet1.getCell("G4").value = dateStr;
  sheet1.getCell("C5").value = officerName;
  sheet1.getCell("G5").value = reportNo;

  const collections = batch.collections || [];
  let extraIdx = 0;
  let extraAccIdx = 0;

  for (const c of collections) {
    const [name, fromNo, toNo, amount] = collectionFields(c);

    let row = FIXED_COLLECTION_ROWS[name];
    if (row === undefined) {
      row = EXTRA_COLLECTION_ROWS[extraIdx++];
      if (row !== undefined) sheet1.getCell(`A${row}`).value = name;
    }
    if (row !== undefined) {
      sheet1.getCell(`C${row}`).value = fromNo;
      // Template gives "From" (C) no number format but "To" (E) a 2-decimal
      // money format, even though both are ticket numbers, not currency —
      // match E to C's plain format so the pair reads consistently.
      const toCell = sheet1.getCell(`E${row}`);
      toCell.value = toNo;
      toCell.numFmt = "General";
      sheet1.getCell(`G${row}`).value = amount;
    }

    let accRow = FIXED_ACCOUNTABILITY_ROWS[name];
    if (accRow === undefined) {
      accRow = EXTRA_ACCOUNTABILITY_ROWS[extraAccIdx++];
      if (accRow !== undefined) sheet2.getCell(`A${accRow}`).value = name;
    }
    if (accRow !== undefined) {
      sheet2.getCell(`C${accRow}`).value = fromNo;
      sheet2.getCell(`I${accRow}`).value = amount;
      sheet2.getCell(`L${accRow}`).value = toNo;
    }
  }

  const deposits = batch.deposits || [];
  deposits.forEach((d, i) => {
    const row = d.type === "coin" ? COIN_ROW : DENOMINATION_ROWS[Number(d.denomination) || 0];
    if (row === undefined) return;
    if (i === 0) sheet1.getCell("A53").value = officerName;
    sheet1.getCell(`F${row}`).value = Number(d.quantity) || 0;
    sheet1.getCell(`H${row}`).value = Number(d.deposit_amount) || 0;
  });

  const totalFrom = collections.reduce((sum, c) => sum + collectionFields(c)[1], 0);

  sheet2.getCell("B51").value = totalFrom;
  sheet2.getCell("A65").value = officerName;
  sheet2.getCell("D65").value = dateStr;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
