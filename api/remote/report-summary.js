import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth } from "../_lib/auth.js";
import { phRangeStart, phRangeEnd, inRange } from "../_lib/dateRange.js";

// Mirrors backend/api/views/reports.py:report_summary() — COLLECTED
// tickets only (filter_collected in helpers.py), optionally date-bounded
// by start_date/end_date (no default range, unlike dashboard-stats).
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
    const { start_date, end_date } = req.query;

    let query = supabase
      .from("api_ticket")
      .select("issued_at,collection_amount")
      .eq("status", "COLLECTED");
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
    const todayStart = phRangeStart(todayStr);
    const todayEnd = phRangeEnd(todayStr);
    const today = tickets.filter((t) => inRange(t.issued_at, todayStart, todayEnd));

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
  } catch (err) {
    console.error("remote/report-summary error:", err);
    res.status(500).json({ detail: "Failed to load report summary" });
  }
}
