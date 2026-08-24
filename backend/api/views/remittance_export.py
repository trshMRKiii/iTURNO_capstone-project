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

# Rows on Sheet1 pre-labeled with these exact ticket types (col A, merged A:B).
FIXED_COLLECTION_ROWS = {
    "Cash Tickets@2": 12,
    "Cash Tickets@3": 13,
    "Cash Tickets@5": 14,
    "Cash Tickets@10": 15,
}
# Blank rows available for any collection type not in FIXED_COLLECTION_ROWS,
# before the sheet's own TOTAL formula row (33).
EXTRA_COLLECTION_ROWS = range(16, 33)

# "B. Remittances/Deposits" denomination rows (col E).
DENOMINATION_ROWS = {1000: 53, 500: 54, 200: 55, 100: 56, 50: 57, 20: 58}
COIN_ROW = 59

# Sheet2 "C. Accountability for Accountable Forms" mirrors the same ticket
# types, in the same order, as Sheet1's collections table.
FIXED_ACCOUNTABILITY_ROWS = {
    "Cash Tickets@2": 8,
    "Cash Tickets@3": 9,
    "Cash Tickets@5": 10,
    "Cash Tickets@10": 11,
}
EXTRA_ACCOUNTABILITY_ROWS = range(12, 49)


def _collection_fields(c):
    from_no = float(c.get("from_no") or 0)
    amount = float(c.get("amount") or 0)
    return c.get("ticket_form_no") or "", from_no, from_no - amount, amount


def render_remittance_xlsx(batch, serialized):
    wb = openpyxl.load_workbook(TEMPLATE_PATH)
    sheet1 = wb[SHEET1]
    sheet2 = wb[SHEET2]

    officer_name = serialized.get("issued_by_name") or ""
    report_no = serialized.get("batch_code") or str(serialized.get("id") or "")
    date_str = (
        (batch.issued_at + timedelta(hours=8)).strftime("%B %d, %Y")
        if batch.issued_at else ""
    )

    sheet1["G4"] = date_str
    sheet1["C5"] = officer_name
    sheet1["G5"] = report_no

    collections = serialized.get("collections") or []
    extra_rows = iter(EXTRA_COLLECTION_ROWS)
    extra_accountability_rows = iter(EXTRA_ACCOUNTABILITY_ROWS)
    for c in collections:
        name, from_no, to_no, amount = _collection_fields(c)

        row = FIXED_COLLECTION_ROWS.get(name)
        if row is None:
            row = next(extra_rows, None)
            if row is not None:
                sheet1[f"A{row}"] = name
        if row is not None:
            sheet1[f"C{row}"] = from_no
            sheet1[f"E{row}"] = to_no
            sheet1[f"G{row}"] = amount

        # C. Accountability: Beginning Balance / Issued / Ending Balance are
        # this same row's From / Amount / To from A. — carried into the
        # "Cash Tickets" From sub-cell of each group so the sheet's own
        # SUM(...) totals for that group pick them up automatically.
        acc_row = FIXED_ACCOUNTABILITY_ROWS.get(name)
        if acc_row is None:
            acc_row = next(extra_accountability_rows, None)
            if acc_row is not None:
                sheet2[f"A{acc_row}"] = name
        if acc_row is not None:
            sheet2[f"C{acc_row}"] = from_no
            sheet2[f"I{acc_row}"] = amount
            sheet2[f"L{acc_row}"] = to_no

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

    total_from = sum(_collection_fields(c)[1] for c in collections)

    # D. Summary: only Beginning Balance is filled in — it carries the same
    # figure as C.'s Beginning Balance total. Cash/Checks/Total/Less/Balance
    # are left blank for manual reconciliation on the printed form.
    sheet2["B51"] = total_from

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
