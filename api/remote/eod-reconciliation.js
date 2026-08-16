import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth } from "../_lib/auth.js";
import { phRangeStart, phRangeEnd } from "../_lib/dateRange.js";

// Mirrors backend/api/views/reports.py:eod_reconciliation().
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
    let dateStr = req.query.date;
    if (!dateStr) {
      dateStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    }
    const dayStart = phRangeStart(dateStr).toISOString();
    const dayEnd = phRangeEnd(dateStr).toISOString();

    const [{ data: dispatchedToday, error: dErr }, { data: batchesToday, error: bErr }, { data: openSessions, error: oErr }] =
      await Promise.all([
        supabase
          .from("api_ticket")
          .select("id,collection_amount,series:api_ticketseries(series_no)")
          .in("status", ["DISPATCHED", "COLLECTED"])
          .gte("dispatched_at", dayStart)
          .lte("dispatched_at", dayEnd),
        supabase.from("api_remittancebatch").select("total_amount").gte("issued_at", dayStart).lte("issued_at", dayEnd),
        supabase
          .from("api_ticket")
          .select("id,issued_at,vehicle:api_vehicle(plate_number),driver:api_driver(first_name,last_name)")
          .eq("status", "ISSUED")
          .order("issued_at", { ascending: true }),
      ]);
    if (dErr) throw dErr;
    if (bErr) throw bErr;
    if (oErr) throw oErr;

    const checkoutCount = dispatchedToday.length;
    const expectedCash = Math.round(dispatchedToday.reduce((s, t) => s + (Number(t.collection_amount) || 0), 0) * 100) / 100;
    const actualCash = Math.round((batchesToday || []).reduce((s, b) => s + (Number(b.total_amount) || 0), 0) * 100) / 100;

    // Same numeric-gap-in-series-of-ticket-ids check as the Django view —
    // only meaningful for series using numeric ticket IDs.
    const bySeries = {};
    for (const t of dispatchedToday) {
      if (t.series) (bySeries[t.series.series_no] ??= []).push(t.id);
    }
    const ticketNumberGaps = [];
    for (const [seriesNo, ids] of Object.entries(bySeries)) {
      const numbers = ids.map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
      if (!numbers.length) continue;
      const missing = [];
      for (let n = numbers[0]; n <= numbers[numbers.length - 1]; n++) {
        if (!numbers.includes(n)) missing.push(n);
      }
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
  } catch (err) {
    console.error("remote/eod-reconciliation error:", err);
    res.status(500).json({ detail: "Failed to load EOD reconciliation" });
  }
}
