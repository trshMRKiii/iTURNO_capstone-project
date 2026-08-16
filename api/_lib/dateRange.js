// Shared PH-timezone (UTC+8) date-range resolution, matching
// backend/api/views/helpers.py's parse_date_start/parse_date_end and the
// "default to today, clamp future end to today" logic used by both
// dashboard_stats and RouteSerializer._get_range() in serializers.py.
export function resolveDateRange(query) {
  const nowPh = new Date(Date.now() + 8 * 3600 * 1000);
  const todayStr = nowPh.toISOString().slice(0, 10);

  let startDate = query.start_date || todayStr;
  let endDate = query.end_date || todayStr;
  if (endDate > todayStr) endDate = todayStr;
  if (startDate > endDate) startDate = endDate;

  return { startDate, endDate, rangeStart: phRangeStart(startDate), rangeEnd: phRangeEnd(endDate), todayStr };
}

export function phRangeStart(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 8 * 3600 * 1000);
}

export function phRangeEnd(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - 8 * 3600 * 1000);
}

export function phDateKey(isoString) {
  const d = new Date(new Date(isoString).getTime() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export function inRange(iso, start, end) {
  return Boolean(iso) && new Date(iso) >= start && new Date(iso) <= end;
}
