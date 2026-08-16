import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth } from "../_lib/auth.js";
import { phRangeStart, phRangeEnd, phDateKey } from "../_lib/dateRange.js";

// Mirrors backend/api/views/reports.py:report_daily_chart().
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
  } catch (err) {
    console.error("remote/report-chart error:", err);
    res.status(500).json({ detail: "Failed to load chart data" });
  }
}
