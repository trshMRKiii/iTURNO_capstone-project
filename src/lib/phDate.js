// Mirrors the backend idiom (timezone.now() + timedelta(hours=8), see
// backend/api/views/reports.py) so both "PH today" computations can't drift.
export function getPhDateString(daysOffset = 0) {
  const ph = new Date(Date.now() + 8 * 60 * 60 * 1000);
  ph.setUTCDate(ph.getUTCDate() + daysOffset);
  return ph.toISOString().split("T")[0];
}
