import { supabaseAdmin } from "../../_lib/supabaseAdmin.js";
import { requireAuth } from "../../_lib/auth.js";
import { resolveDateRange, phRangeStart, phRangeEnd, phDateKey, inRange } from "../../_lib/dateRange.js";
import { renderRemittanceXlsx } from "../../_lib/remittanceXlsx.js";

// Merges dashboard-stats/dashboard-busiest/report-summary/report-collections/report-chart/
// eod-reconciliation/route-analytics into one function (Vercel Hobby's 12-function cap —
// see api/remote/auth/[action].js for the full explanation). Each mirrors
// the matching Django view in backend/api/views/records.py or reports.py.

function summarize(tickets, fallbackAmount) {
  const count = tickets.length;
  const total = Math.round(
    tickets.reduce((sum, t) => {
      const amt = Number(t.collection_amount);
      return sum + (t.collection_amount != null && amt > 0 ? amt : fallbackAmount);
    }, 0) * 100,
  ) / 100;
  return { count, total };
}

// Ticket.mode -> the dashboard's Queued / Roamed split.
const MODE_KEY = { QUEUE: "queued", UNLOAD: "roamed" };
const HEATMAP_WEEKS = 4;
const DAY_MS = 86400000;
const round2 = (n) => Math.round(n * 100) / 100;
const phDate = (ms) => new Date(ms + 8 * 3600 * 1000);

// PostgREST caps a response at 1000 rows, so page through anything that can grow past that.
async function fetchAll(build) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// One pass over dispatched tickets: the queued/roamed split, the per-hour-of-day
// breakdown and the per-route and per-denomination totals (mirrors _tally in
// backend/api/views/dashboard.py).
const blankHour = (hour) => ({ hour, queued: 0, roamed: 0, queued_total: 0, roamed_total: 0 });

function tally(tickets, fallback) {
  const split = { queued: { count: 0, total: 0 }, roamed: { count: 0, total: 0 } };
  const hourly = Array.from({ length: 24 }, (_, hour) => blankHour(hour));
  const routes = {};
  const forms = {};
  for (const t of tickets) {
    const key = MODE_KEY[t.mode] || "queued";
    const amt = Number(t.collection_amount);
    const amount = t.collection_amount != null && amt > 0 ? amt : fallback;
    split[key].count += 1;
    split[key].total += amount;
    const hourOfDay = phDate(Date.parse(t.dispatched_at)).getUTCHours();
    const routeName = t.route?.origin || "No Route";
    const route = (routes[routeName] ||= {
      name: routeName, queued: 0, roamed: 0, queued_total: 0, roamed_total: 0,
      hourly: Array.from({ length: 24 }, (_, h) => blankHour(h)),
    });
    // Hours and routes keep the queued/roamed split so the page can filter by it.
    for (const row of [hourly[hourOfDay], route.hourly[hourOfDay], route]) {
      row[key] += 1;
      row[`${key}_total`] += amount;
    }
    const formName = t.series?.ticket_form?.name || "Unspecified";
    const form = (forms[formName] ||= { name: formName, count: 0, total: 0 });
    form.count += 1;
    form.total += amount;
  }
  for (const route of Object.values(routes)) {
    route.hourly = route.hourly.filter((h) => h.queued || h.roamed); // only the hours that had tickets
  }
  const routeHours = Object.values(routes).flatMap((route) => route.hourly);
  for (const row of [...Object.values(split), ...hourly, ...Object.values(routes), ...routeHours, ...Object.values(forms)]) {
    for (const field of Object.keys(row)) if (field.endsWith("total")) row[field] = round2(row[field]);
  }
  return { split, hourly, routes, forms };
}

async function dashboardStats(req, res, supabase) {
  const { startDate, endDate, rangeStart, rangeEnd, todayStr } = resolveDateRange(req.query);
  const now = new Date();

  // What the page's "up/down vs ..." compares. Today is set against yesterday up to the same
  // time of day. A longer range that includes today leaves today out of the comparison (it
  // isn't finished, so it can't be set fairly against whole days) and compares whole days with
  // the same number of whole days before them. Any other range is compared whole against the
  // range of the same length just before it. Mirrors dashboard_stats in the Django views.
  const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS) + 1;
  const trimmed = days > 1 && endDate === todayStr;
  const span = trimmed ? days - 1 : days;
  const compareEnd = trimmed ? new Date(rangeEnd.getTime() - DAY_MS) : rangeEnd;
  const shift = span * DAY_MS;
  const previousStart = new Date(rangeStart.getTime() - shift);
  const previousEnd = new Date(Math.min(compareEnd, now) - shift);

  const [tickets, { data: queued, error: qErr }, { data: latestPrice, error: pErr }, { data: routes, error: rErr },
    { data: allSeries, error: sErr }, { data: allPaper, error: ppErr }] = await Promise.all([
    fetchAll(() => supabase.from("api_ticket")
      .select("id,dispatched_at,mode,collection_amount,route:api_route(origin),series:api_ticketseries(ticket_form:api_ticketform(name))")
      .gte("dispatched_at", previousStart.toISOString()).lte("dispatched_at", rangeEnd.toISOString())),
    supabase.from("api_ticket")
      .select("issued_at,vehicle_id,vehicle:api_vehicle(plate_number,is_archived),route:api_route(origin)")
      .eq("status", "QUEUED").order("issued_at", { ascending: true }),
    supabase.from("api_ticketprice").select("amount,effective_date").order("effective_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("api_route").select("origin").eq("is_archived", false).eq("is_active", true),
    supabase.from("api_ticketseries").select("id,start_no,end_no,tickets:api_ticket(id),requisition:api_requisition(is_archived),ticket_form:api_ticketform(name,price)"),
    supabase.from("api_paperissuance").select("series_id,from_no,to_no"),
  ]);
  for (const err of [qErr, pErr, rErr, sErr, ppErr]) if (err) throw err;

  const fallback = latestPrice ? Number(latestPrice.amount) : 0;
  const current = tally(tickets.filter((t) => inRange(t.dispatched_at, rangeStart, rangeEnd)), fallback);
  const previous = tally(tickets.filter((t) => inRange(t.dispatched_at, previousStart, previousEnd)), fallback);
  const compared = trimmed ? tally(tickets.filter((t) => inRange(t.dispatched_at, rangeStart, compareEnd)), fallback) : current;
  // Per-route counts without the hourly detail — what comparing one route needs.
  const flatRoutes = (rows) =>
    Object.fromEntries(Object.entries(rows).map(([name, { queued, roamed, queued_total, roamed_total }]) => [name, { queued, roamed, queued_total, roamed_total }]));

  // Every active route with how many vehicles wait on it, who is first in line and for how long.
  const lines = {};
  for (const t of queued) {
    if (t.vehicle?.is_archived) continue;
    const name = t.route?.origin || "No Route";
    const line = (lines[name] ||= {
      name, vehicles: new Set(), next_plate: t.vehicle?.plate_number ?? null,
      waiting_minutes: Math.floor((now - Date.parse(t.issued_at)) / 60000),
    });
    line.vehicles.add(t.vehicle_id);
  }
  const queueRoutes = [
    ...Object.values(lines).map(({ vehicles, ...line }) => ({ ...line, count: vehicles.size })),
    ...routes.filter((r) => !lines[r.origin]).map((r) => ({ name: r.origin, count: 0, next_plate: null, waiting_minutes: 0 })),
  ];

  const stockByForm = {};
  for (const series of allSeries || []) {
    if (series.requisition?.is_archived) continue;
    const original = Math.max((Number(series.end_no) || 0) - (Number(series.start_no) || 0) + 1, 0);
    const paperUsed = (allPaper || []).filter((p) => p.series_id === series.id)
      .reduce((s, p) => s + (p.to_no - p.from_no + 1), 0);
    const remaining = Math.max(original - (series.tickets || []).length - paperUsed, 0);
    const name = series.ticket_form?.name || "Unspecified";
    const row = (stockByForm[name] ||= { name, remaining: 0, original: 0, amount: 0 });
    row.remaining += remaining;
    row.amount = round2(row.amount + remaining * (Number(series.ticket_form?.price) || 0));
    if (remaining > 0) row.original += original;
  }

  const nowPh = phDate(now.getTime());
  const hour12 = nowPh.getUTCHours() % 12 || 12;
  res.status(200).json({
    start_date: startDate,
    end_date: endDate,
    as_of: endDate === todayStr
      ? {
          hour: nowPh.getUTCHours(),
          label: `${hour12}:${String(nowPh.getUTCMinutes()).padStart(2, "0")} ${nowPh.getUTCHours() < 12 ? "AM" : "PM"}`,
        }
      : null,
    summary: current.split,
    compared: {
      days: span,
      trimmed,
      current: compared.split,
      previous: previous.split,
      // The same two periods per route, to compare a single route against.
      current_routes: flatRoutes(compared.routes),
      previous_routes: flatRoutes(previous.routes),
    },
    hourly: current.hourly,
    collections_by_form: Object.values(current.forms).sort((a, b) => b.total - a.total),
    route_performance: Object.values(current.routes),
    queue_routes: queueRoutes,
    stock_by_form: Object.values(stockByForm),
  });
}

// Average vehicle check-ins per weekday x hour over the last four full weeks (today excluded,
// so every weekday appears exactly four times). Mirrors dashboard_busiest in the Django views,
// except that it reads issued_at: checked_in_at isn't known to exist in Supabase.
async function dashboardBusiest(req, res, supabase) {
  const { todayStr } = resolveDateRange({});
  const day = (offset) => new Date(Date.parse(todayStr) + offset * DAY_MS).toISOString().slice(0, 10);
  const tickets = await fetchAll(() => supabase.from("api_ticket").select("id,issued_at")
    .gte("issued_at", phRangeStart(day(-7 * HEATMAP_WEEKS)).toISOString())
    .lte("issued_at", phRangeEnd(day(-1)).toISOString()));

  const counts = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const t of tickets) {
    const local = phDate(Date.parse(t.issued_at));
    counts[(local.getUTCDay() + 6) % 7][local.getUTCHours()] += 1; // Monday first
  }
  res.status(200).json({ weeks: HEATMAP_WEEKS, grid: counts.map((row) => row.map((n) => round2(n / HEATMAP_WEEKS))) });
}

async function summaryReport(req, res, supabase) {
  const { start_date, end_date } = req.query;
  let query = supabase.from("api_ticket").select("issued_at,collection_amount").eq("status", "COLLECTED");
  if (start_date) query = query.gte("issued_at", phRangeStart(start_date).toISOString());
  if (end_date) query = query.lte("issued_at", phRangeEnd(end_date).toISOString());

  const [{ data: tickets, error: tErr }, { data: latestPrice, error: pErr }] = await Promise.all([
    query,
    supabase.from("api_ticketprice").select("amount,effective_date").order("effective_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (tErr) throw tErr;
  if (pErr) throw pErr;

  const fallbackAmount = latestPrice ? Number(latestPrice.amount) : 0;
  const nowPh = new Date(Date.now() + 8 * 3600 * 1000);
  const todayStr = nowPh.toISOString().slice(0, 10);
  const today = tickets.filter((t) => inRange(t.issued_at, phRangeStart(todayStr), phRangeEnd(todayStr)));

  res.status(200).json({
    today: summarize(today, fallbackAmount),
    grand_total: Math.round(
      tickets.reduce((s, t) => {
        const amt = Number(t.collection_amount);
        return s + (t.collection_amount != null && amt > 0 ? amt : fallbackAmount);
      }, 0) * 100,
    ) / 100,
    total_tickets: tickets.length,
  });
}

async function collectionsReport(req, res, supabase) {
  const { start_date, end_date } = req.query;
  let query = supabase
    .from("api_ticket")
    .select("id, issued_at, status, collection_amount, vehicle:api_vehicle(plate_number), driver:api_driver(first_name,last_name), route:api_route(origin)")
    .eq("status", "COLLECTED")
    .order("issued_at", { ascending: false });
  if (start_date) query = query.gte("issued_at", phRangeStart(start_date).toISOString());
  if (end_date) query = query.lte("issued_at", phRangeEnd(end_date).toISOString());

  const { data, error } = await query;
  if (error) throw error;

  const results = data.map((t) => ({
    id: t.id,
    issued_at: `${phDateKey(t.issued_at)} ${new Date(new Date(t.issued_at).getTime() + 8 * 3600 * 1000).toISOString().slice(11, 16)}`,
    issued_date: phDateKey(t.issued_at),
    driver: t.driver ? `${t.driver.last_name}, ${t.driver.first_name}` : "",
    vehicle: t.vehicle?.plate_number || "",
    route: t.route ? t.route.origin : "",
    collection_amount: Number(t.collection_amount) || 0,
    status: t.status,
  }));
  res.status(200).json({ results, count: results.length });
}

async function chartReport(req, res, supabase) {
  const { start_date, end_date } = req.query;
  let query = supabase.from("api_ticket").select("issued_at,collection_amount").eq("status", "COLLECTED");
  if (start_date) query = query.gte("issued_at", phRangeStart(start_date).toISOString());
  if (end_date) query = query.lte("issued_at", phRangeEnd(end_date).toISOString());

  const [{ data: tickets, error: tErr }, { data: latestPrice, error: pErr }] = await Promise.all([
    query,
    supabase.from("api_ticketprice").select("amount,effective_date").order("effective_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (tErr) throw tErr;
  if (pErr) throw pErr;

  const fallbackAmount = latestPrice ? Number(latestPrice.amount) : 0;
  const daily = {};
  for (const t of tickets) {
    const key = phDateKey(t.issued_at);
    const amt = Number(t.collection_amount);
    const amount = t.collection_amount != null && amt > 0 ? amt : fallbackAmount;
    if (!daily[key]) daily[key] = { date: key, count: 0, total: 0 };
    daily[key].count += 1;
    daily[key].total = Math.round((daily[key].total + amount) * 100) / 100;
  }
  res.status(200).json({ chart_data: Object.values(daily).sort((a, b) => (a.date > b.date ? 1 : -1)) });
}

async function eodReconciliation(req, res, supabase) {
  let dateStr = req.query.date;
  if (!dateStr) dateStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const dayStart = phRangeStart(dateStr).toISOString();
  const dayEnd = phRangeEnd(dateStr).toISOString();

  const [{ data: dispatchedToday, error: dErr }, { data: batchesToday, error: bErr }, { data: openSessions, error: oErr },
    { data: paperToday, error: ppErr }] =
    await Promise.all([
      supabase.from("api_ticket").select("id,collection_amount,series:api_ticketseries(series_no)")
        .in("status", ["DISPATCHED", "COLLECTED"]).gte("dispatched_at", dayStart).lte("dispatched_at", dayEnd),
      supabase.from("api_remittancebatch").select("total_amount").gte("issued_at", dayStart).lte("issued_at", dayEnd),
      supabase.from("api_ticket").select("id,issued_at,vehicle:api_vehicle(plate_number),driver:api_driver(first_name,last_name)")
        .eq("status", "ISSUED").order("issued_at", { ascending: true }),
      supabase.from("api_paperissuance").select("from_no,to_no,series:api_ticketseries(series_no,ticket_form:api_ticketform(price))").eq("used_on", dateStr),
    ]);
  if (ppErr) throw ppErr;
  if (dErr) throw dErr;
  if (bErr) throw bErr;
  if (oErr) throw oErr;

  const checkoutCount = dispatchedToday.length;
  // Paper-issued tickets were remitted at the treasury outside the system: reported, never expected here.
  const paperCount = paperToday.reduce((s, p) => s + (p.to_no - p.from_no + 1), 0);
  const paperAmount = Math.round(paperToday.reduce((s, p) => s + (p.to_no - p.from_no + 1) * (Number(p.series?.ticket_form?.price) || 0), 0) * 100) / 100;
  const expectedCash = Math.round(dispatchedToday.reduce((s, t) => s + (Number(t.collection_amount) || 0), 0) * 100) / 100;
  const actualCash = Math.round((batchesToday || []).reduce((s, b) => s + (Number(b.total_amount) || 0), 0) * 100) / 100;

  const bySeries = {};
  for (const t of dispatchedToday) if (t.series) (bySeries[t.series.series_no] ??= []).push(t.id);
  const ticketNumberGaps = [];
  for (const [seriesNo, ids] of Object.entries(bySeries)) {
    const numbers = ids.map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    if (!numbers.length) continue;
    const missing = [];
    const isPaper = (n) => paperToday.some((p) => p.series?.series_no === seriesNo && n >= p.from_no && n <= p.to_no);
    for (let n = numbers[0]; n <= numbers[numbers.length - 1]; n++) if (!numbers.includes(n) && !isPaper(n)) missing.push(n);
    if (missing.length) ticketNumberGaps.push({ series_no: seriesNo, missing_numbers: missing });
  }

  res.status(200).json({
    date: dateStr,
    checkout_count: checkoutCount,
    paper_count: paperCount,
    paper_amount: paperAmount,
    expected_cash: expectedCash,
    actual_cash: actualCash,
    difference: Math.round((expectedCash - actualCash) * 100) / 100,
    ticket_number_gaps: ticketNumberGaps,
    open_sessions: openSessions.map((t) => ({
      ticket_id: t.id,
      plate_number: t.vehicle?.plate_number ?? null,
      driver: t.driver ? `${t.driver.last_name}, ${t.driver.first_name}` : null,
      issued_at: t.issued_at,
    })),
  });
}

// Per-route tally of who took a queue slot vs. a roaming ticket. Mirrors route_analytics in
// backend/api/views/route_analytics.py: no ?route -> one row per route; ?route -> that route's
// drivers, paginated; ?export -> every route's drivers, flat.
const NO_ROUTE = "No route";

async function routeAnalytics(req, res, supabase) {
  const { start_date, end_date, route, export: exporting } = req.query;
  const term = (req.query.search || "").trim().toLowerCase();
  const tickets = await fetchAll(() => {
    let q = supabase.from("api_ticket")
      .select("mode,driver_id,route:api_route(origin),driver:api_driver(first_name,last_name),vehicle:api_vehicle(plate_number)")
      .neq("status", "CANCELLED");
    if (start_date) q = q.gte("created_at", phRangeStart(start_date).toISOString());
    if (end_date) q = q.lte("created_at", phRangeEnd(end_date).toISOString());
    return q;
  });

  const routes = new Map();
  for (const t of tickets) {
    const kind = { QUEUE: "queue", UNLOAD: "roaming" }[t.mode];
    const routeName = t.route?.origin || NO_ROUTE;
    const name = t.driver ? `${t.driver.last_name}, ${t.driver.first_name}`.trim() : "";
    const plate = t.vehicle?.plate_number;
    if (!kind || (term && ![routeName, name, plate].some((v) => v?.toLowerCase().includes(term)))) continue;
    if (!routes.has(routeName)) routes.set(routeName, { route: routeName, queue: 0, roaming: 0, drivers: new Map() });
    const r = routes.get(routeName);
    r[kind] += 1;
    if (!r.drivers.has(t.driver_id)) r.drivers.set(t.driver_id, { route: routeName, driver: name, plates: new Set(), queue: 0, roaming: 0 });
    const d = r.drivers.get(t.driver_id);
    d[kind] += 1;
    if (plate) d.plates.add(plate);
  }

  const sign = req.query.dir === "asc" ? 1 : -1;
  const sortKey = ["queue", "roaming", "total"].includes(req.query.sort) ? req.query.sort : req.query.sort === "driver" ? "driver" : "total";
  const driversOf = (r, sorted = false) => [...r.drivers.values()]
    .map((d) => ({ ...d, plates: [...d.plates].sort(), total: d.queue + d.roaming }))
    .sort((a, b) => (sorted ? sign * (sortKey === "driver" ? a.driver.localeCompare(b.driver) : a[sortKey] - b[sortKey]) : 0)
      || b.total - a.total || a.driver.localeCompare(b.driver));

  if (exporting) {
    res.status(200).json({ results: [...routes.values()].flatMap(driversOf) });
  } else if (route) {
    const rows = routes.has(route) ? driversOf(routes.get(route), true) : [];
    const size = Math.min(Math.max(parseInt(req.query.page_size, 10) || 25, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    res.status(200).json({
      results: rows.slice((page - 1) * size, page * size),
      count: rows.length,
      page,
      page_size: size,
      total_pages: Math.max(Math.ceil(rows.length / size), 1),
    });
  } else {
    res.status(200).json({
      routes: [...routes.values()]
        .map((r) => ({ route: r.route, queue: r.queue, roaming: r.roaming, total: r.queue + r.roaming, drivers: r.drivers.size }))
        .sort((a, b) => b.total - a.total || a.route.localeCompare(b.route)),
    });
  }
}

async function remittanceXlsx(req, res, supabase) {
  const id = req.query.id;
  if (!id) {
    res.status(400).json({ detail: "id is required" });
    return;
  }

  const { data: batch, error } = await supabase
    .from("api_remittancebatch")
    .select("*, deposits:api_deposit(*), collections:api_collection(*), issued_by:api_user(first_name,last_name,username)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!batch) {
    res.status(404).json({ detail: "Not found" });
    return;
  }

  const buf = await renderRemittanceXlsx(batch);
  const filename = `Remittance_${batch.batch_code || batch.id}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buf);
}

const REPORTS = {
  "dashboard-stats": dashboardStats,
  "dashboard-busiest": dashboardBusiest,
  summary: summaryReport,
  collections: collectionsReport,
  chart: chartReport,
  "eod-reconciliation": eodReconciliation,
  "route-analytics": routeAnalytics,
  "remittance-xlsx": remittanceXlsx,
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }
  try {
    requireAuth(req);
  } catch (err) {
    res.status(err.status || 401).json({ detail: err.message || "Not authenticated" });
    return;
  }

  const run = REPORTS[req.query.report];
  if (!run) {
    res.status(404).json({ detail: `Unknown report: ${req.query.report}` });
    return;
  }

  try {
    await run(req, res, supabaseAdmin());
  } catch (err) {
    console.error(`remote/reports/${req.query.report} error:`, err);
    res.status(500).json({ detail: "Failed to load report" });
  }
}
