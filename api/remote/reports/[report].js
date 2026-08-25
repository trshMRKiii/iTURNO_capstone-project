import { supabaseAdmin } from "../../_lib/supabaseAdmin.js";
import { requireAuth } from "../../_lib/auth.js";
import { resolveDateRange, phRangeStart, phRangeEnd, phDateKey, inRange } from "../../_lib/dateRange.js";
import { renderRemittanceXlsx } from "../../_lib/remittanceXlsx.js";

// Merges dashboard-stats/report-summary/report-collections/report-chart/
// eod-reconciliation into one function (Vercel Hobby's 12-function cap —
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

async function dashboardStats(req, res, supabase) {
  const { startDate, endDate, rangeStart, rangeEnd, todayStr } = resolveDateRange(req.query);
  const TICKET_STATUSES = ["ISSUED", "DISPATCHED", "COLLECTED", "CANCELLED", "RETURNED"];
  const VEHICLE_STATUSES = ["AVAILABLE", "DISPATCHED", "MAINTENANCE", "QUEUED"];

  const [{ data: allTickets, error: tErr }, { data: allVehicles, error: vErr },
    { data: latestPrice, error: pErr }, { data: allSeries, error: sErr }] = await Promise.all([
    supabase.from("api_ticket").select("id,vehicle_id,driver_id,status,collection_amount,issued_at,dispatched_at"),
    supabase.from("api_vehicle").select("id,status,is_archived"),
    supabase.from("api_ticketprice").select("amount,effective_date").order("effective_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("api_ticketseries").select("start_no,end_no,tickets:api_ticket(id),requisition:api_requisition(is_archived)"),
  ]);
  if (tErr) throw tErr;
  if (vErr) throw vErr;
  if (pErr) throw pErr;
  if (sErr) throw sErr;

  const fallbackAmount = latestPrice ? Number(latestPrice.amount) : 0;
  const rangeDispatched = allTickets.filter((t) => inRange(t.dispatched_at, rangeStart, rangeEnd));
  const rangeIssued = allTickets.filter((t) => inRange(t.issued_at, rangeStart, rangeEnd));

  let chartTickets = rangeDispatched;
  if (startDate === endDate && endDate === todayStr) {
    const chartStart = phRangeStart(new Date(new Date(todayStr).getTime() - 6 * 86400000).toISOString().slice(0, 10));
    chartTickets = allTickets.filter((t) => inRange(t.dispatched_at, chartStart, rangeEnd));
  }
  const daily = {};
  for (const t of chartTickets) {
    const key = phDateKey(t.dispatched_at);
    const amt = Number(t.collection_amount);
    const amount = t.collection_amount != null && amt > 0 ? amt : fallbackAmount;
    if (!daily[key]) daily[key] = { date: key, count: 0, total: 0 };
    daily[key].count += 1;
    daily[key].total = Math.round((daily[key].total + amount) * 100) / 100;
  }

  const ticketStatusBreakdown = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));
  for (const t of rangeIssued) ticketStatusBreakdown[t.status] = (ticketStatusBreakdown[t.status] || 0) + 1;

  const fleetStatus = Object.fromEntries(VEHICLE_STATUSES.map((s) => [s, 0]));
  for (const v of allVehicles) if (!v.is_archived) fleetStatus[v.status] = (fleetStatus[v.status] || 0) + 1;

  let ticketStockRemaining = 0;
  for (const series of allSeries || []) {
    if (series.requisition?.is_archived) continue;
    const original = Math.max((Number(series.end_no) || 0) - (Number(series.start_no) || 0) + 1, 0);
    ticketStockRemaining += Math.max(original - (series.tickets || []).length, 0);
  }

  res.status(200).json({
    today_total: summarize(rangeDispatched, fallbackAmount),
    total_tickets: allTickets.length,
    total_dispatched: allTickets.filter((t) => t.dispatched_at).length,
    total_revenue: Math.round(rangeDispatched.reduce((s, t) => s + (Number(t.collection_amount) || 0), 0) * 100) / 100,
    active_vehicles: new Set(rangeIssued.map((t) => t.vehicle_id)).size,
    active_drivers: new Set(rangeIssued.map((t) => t.driver_id)).size,
    start_date: startDate,
    end_date: endDate,
    chart_data: Object.values(daily).sort((a, b) => (a.date > b.date ? 1 : -1)),
    ticket_status_breakdown: ticketStatusBreakdown,
    fleet_status: fleetStatus,
    ticket_stock_remaining: ticketStockRemaining,
  });
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
    route: t.route ? `${t.route.origin} - San Fernando` : "",
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

  const [{ data: dispatchedToday, error: dErr }, { data: batchesToday, error: bErr }, { data: openSessions, error: oErr }] =
    await Promise.all([
      supabase.from("api_ticket").select("id,collection_amount,series:api_ticketseries(series_no)")
        .in("status", ["DISPATCHED", "COLLECTED"]).gte("dispatched_at", dayStart).lte("dispatched_at", dayEnd),
      supabase.from("api_remittancebatch").select("total_amount").gte("issued_at", dayStart).lte("issued_at", dayEnd),
      supabase.from("api_ticket").select("id,issued_at,vehicle:api_vehicle(plate_number),driver:api_driver(first_name,last_name)")
        .eq("status", "ISSUED").order("issued_at", { ascending: true }),
    ]);
  if (dErr) throw dErr;
  if (bErr) throw bErr;
  if (oErr) throw oErr;

  const checkoutCount = dispatchedToday.length;
  const expectedCash = Math.round(dispatchedToday.reduce((s, t) => s + (Number(t.collection_amount) || 0), 0) * 100) / 100;
  const actualCash = Math.round((batchesToday || []).reduce((s, b) => s + (Number(b.total_amount) || 0), 0) * 100) / 100;

  const bySeries = {};
  for (const t of dispatchedToday) if (t.series) (bySeries[t.series.series_no] ??= []).push(t.id);
  const ticketNumberGaps = [];
  for (const [seriesNo, ids] of Object.entries(bySeries)) {
    const numbers = ids.map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    if (!numbers.length) continue;
    const missing = [];
    for (let n = numbers[0]; n <= numbers[numbers.length - 1]; n++) if (!numbers.includes(n)) missing.push(n);
    if (missing.length) ticketNumberGaps.push({ series_no: seriesNo, missing_numbers: missing });
  }

  res.status(200).json({
    date: dateStr,
    checkout_count: checkoutCount,
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
  summary: summaryReport,
  collections: collectionsReport,
  chart: chartReport,
  "eod-reconciliation": eodReconciliation,
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
