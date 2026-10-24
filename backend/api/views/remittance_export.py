import io
from datetime import timedelta
from pathlib import Path

import openpyxl
from django.http import HttpResponse

# The official City Government of San Fernando, La Union "Report of
# Collections and Deposits" form, recreated as an Excel template. We fill
# cells in place rather than generating a document from scratch, so the
# export always matches the official form exactly.
TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent
    / "report_templates"
    / "report_of_collections_and_deposits.xlsx"
)

SHEET1 = "Sheet1"  # A. Collections + B. Remittances/Deposits
SHEET2 = "Sheet2"  # C. Accountability + D. Summary + Certification

# Sheet1 collection rows, one per ticket series collected, before the sheet's
# own TOTAL formula row (33). The template pre-prints four ticket forms in the
# first rows; they are cleared so only the forms actually collected remain.
COLLECTION_ROWS = range(12, 33)
TEMPLATE_TICKET_ROWS = 4

# "B. Remittances/Deposits" denomination rows (col E).
DENOMINATION_ROWS = {1000: 53, 500: 54, 200: 55, 100: 56, 50: 57, 20: 58}
COIN_ROW = 59

# Sheet2 "C. Accountability for Accountable Forms" lists the same rows in the
# same order as Sheet1's collections table.
ACCOUNTABILITY_ROWS = range(8, 49)


def _collection_fields(c):
    """Form name, where the series stood when the day began, the last ticket issued, and the cash collected from it."""
    return c.get("ticket_form_no") or "", _ticket_no(c.get("from_no")), _ticket_no(c.get("to_no")), float(c.get("amount") or 0)


def _ticket_no(value):
    return int(value) if str(value or "").isdigit() else (value or "")


def render_remittance_xlsx(batch, serialized):
    wb = openpyxl.load_workbook(TEMPLATE_PATH)
    sheet1 = wb[SHEET1]
    sheet2 = wb[SHEET2]

    officer_name = serialized.get("prepared_by_name") or serialized.get("issued_by_name") or ""
    report_no = serialized.get("batch_code") or str(serialized.get("id") or "")
    date_str = (
        (batch.issued_at + timedelta(hours=8)).strftime("%B %d, %Y")
        if batch.issued_at else ""
    )

    sheet1["G4"] = date_str
    sheet1["C5"] = officer_name
    sheet1["G5"] = report_no

    for i in range(TEMPLATE_TICKET_ROWS):
        sheet1[f"A{COLLECTION_ROWS[i]}"] = None
        sheet2[f"A{ACCOUNTABILITY_ROWS[i]}"] = None

    collections = serialized.get("collections") or []
    # zip stops at the shorter range, so rows beyond the form's capacity are dropped.
    for c, row, acc_row in zip(collections, COLLECTION_ROWS, ACCOUNTABILITY_ROWS):
        name, from_no, to_no, amount = _collection_fields(c)
        sheet1[f"A{row}"] = name
        sheet1[f"C{row}"] = from_no
        sheet1[f"E{row}"] = to_no
        # The template formats "To" as money; it's a ticket number like "From".
        sheet1[f"E{row}"].number_format = "General"
        sheet1[f"G{row}"] = amount

        # C. Accountability: only the form name is filled in here; the balances
        # need each series' last issued number, which the app's PDF export
        # looks up and this export doesn't.
        sheet2[f"A{acc_row}"] = name

    deposits = serialized.get("deposits") or []
    for i, d in enumerate(deposits):
        row = (
            COIN_ROW if d.get("type") == "coin"
            else DENOMINATION_ROWS.get(int(d.get("denomination") or 0))
        )
        if row is None:
            continue
        if i == 0:
            sheet1["A53"] = officer_name
        sheet1[f"F{row}"] = int(d.get("quantity") or 0)
        sheet1[f"H{row}"] = float(d.get("deposit_amount") or 0)

    # D. Summary (Beginning Balance, Cash/Checks/Total/Less/Balance) is left
    # blank for manual reconciliation on the printed form.
    sheet2["A65"] = officer_name
    sheet2["D65"] = date_str

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def remittance_xlsx_response(batch, serialized):
    buf = render_remittance_xlsx(batch, serialized)
    filename = f"Remittance_{serialized.get('batch_code') or batch.id}.xlsx"
    response = HttpResponse(
        buf.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
