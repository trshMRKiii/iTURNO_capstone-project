import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth } from "../_lib/auth.js";
import { phRangeStart, phRangeEnd, phDateKey } from "../_lib/dateRange.js";

// Mirrors backend/api/views/reports.py:report_collections() — COLLECTED
// tickets, flattened to display rows (this feeds a report table, not the
// nested Ticket shape).
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
      .select(
        "id, issued_at, status, collection_amount, " +
          "vehicle:api_vehicle(plate_number), driver:api_driver(first_name,last_name), route:api_route(origin)",
      )
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
  } catch (err) {
    console.error("remote/report-collections error:", err);
    res.status(500).json({ detail: "Failed to load collections report" });
  }
}
