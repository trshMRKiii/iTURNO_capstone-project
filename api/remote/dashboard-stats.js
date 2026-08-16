import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth } from "../_lib/auth.js";
import { resolveDateRange, phRangeStart, phDateKey, inRange } from "../_lib/dateRange.js";

// Replicates backend/api/views/records.py:dashboard_stats() — same fields,
// same PH-timezone date-range logic, same "today widens the chart to 7
// days" behavior — computed here in JS against the mirrored Supabase data
// since the tables involved are small enough (dozens-hundreds of rows) to
// just fetch and aggregate rather than needing a Postgres function.
const TICKET_STATUSES = ["ISSUED", "DISPATCHED", "COLLECTED", "CANCELLED", "RETURNED"];
const VEHICLE_STATUSES = ["AVAILABLE", "DISPATCHED", "MAINTENANCE", "QUEUED"];

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

  try {
    const supabase = supabaseAdmin();
    const { startDate, endDate, rangeStart, rangeEnd, todayStr } = resolveDateRange(req.query);

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
      const chartStart = phRangeStart(
        new Date(new Date(todayStr).getTime() - 6 * 86400000).toISOString().slice(0, 10),
      );
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
    const chartData = Object.values(daily).sort((a, b) => (a.date > b.date ? 1 : -1));

    const ticketStatusBreakdown = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));
    for (const t of rangeIssued) ticketStatusBreakdown[t.status] = (ticketStatusBreakdown[t.status] || 0) + 1;

    const fleetStatus = Object.fromEntries(VEHICLE_STATUSES.map((s) => [s, 0]));
    for (const v of allVehicles) if (!v.is_archived) fleetStatus[v.status] = (fleetStatus[v.status] || 0) + 1;

    let ticketStockRemaining = 0;
    for (const series of allSeries || []) {
      if (series.requisition?.is_archived) continue; // active (non-archived) requisitions only
      const original = Math.max((Number(series.end_no) || 0) - (Number(series.start_no) || 0) + 1, 0);
      const issuedCount = (series.tickets || []).length;
      ticketStockRemaining += Math.max(original - issuedCount, 0);
    }

    res.status(200).json({
      today_total: summarize(rangeDispatched, fallbackAmount),
      total_tickets: allTickets.length,
      total_dispatched: allTickets.filter((t) => t.dispatched_at).length,
      total_revenue: Math.round(
        rangeDispatched.reduce((s, t) => s + (Number(t.collection_amount) || 0), 0) * 100,
      ) / 100,
      active_vehicles: new Set(rangeIssued.map((t) => t.vehicle_id)).size,
      active_drivers: new Set(rangeIssued.map((t) => t.driver_id)).size,
      start_date: startDate,
      end_date: endDate,
      chart_data: chartData,
      ticket_status_breakdown: ticketStatusBreakdown,
      fleet_status: fleetStatus,
      ticket_stock_remaining: ticketStockRemaining,
    });
  } catch (err) {
    console.error("remote/dashboard-stats error:", err);
    res.status(500).json({ detail: "Failed to load dashboard stats" });
  }
}
