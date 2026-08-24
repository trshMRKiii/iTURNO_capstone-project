// Plain-English field names, shared by the CSV template/column guide and the
// manual-entry form's submitted payload — both funnel through the same
// backend resolver (backend/api/views/backfill.py), which expects these
// exact keys. Keep the two files' constants in sync if either changes.
export const F_TICKET_ID = "Ticket Number";
export const F_PLATE = "Vehicle Plate Number";
export const F_DRIVER_IWP = "Driver IWP Number";
export const F_DRIVER_LAST = "Driver Last Name";
export const F_DRIVER_FIRST = "Driver First Name";
export const F_ROUTE = "Route";
export const F_TICKET_TYPE = "Ticket Type";
export const F_AMOUNT = "Amount";
export const F_ISSUED_AT = "Date and Time Issued";
export const F_STAFF_EMAIL = "Staff Email";
export const F_MODE = "Mode";
export const F_NOTES = "Notes";
