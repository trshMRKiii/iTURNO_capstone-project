import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth } from "../_lib/auth.js";

// Read-only view into the LAN's mirrored transactions (Ticket is a
// PUSH_MODEL — backend/api/sync/registry.py — LAN is authoritative, this
// table is purely a mirror). Any logged-in role can view; there's no write
// path here on purpose, matching "remote is read-only except settings".
//
// Capped at 50 most-recent rows per request rather than the whole table —
// Supabase's free-tier egress budget is the thing to protect against a
// dashboard that gets left open and auto-refreshing (see prior discussion
// on Supabase free-tier sizing).
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
    const { data, error } = await supabaseAdmin()
      .from("api_ticket")
      .select(
        "id, status, mode, collection_amount, issued_at, dispatched_at, active_user_name, " +
          "vehicle:api_vehicle(plate_number), driver:api_driver(first_name,last_name), route:api_route(origin)",
      )
      .order("issued_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error("remote/tickets error:", err);
    res.status(500).json({ detail: "Failed to load tickets" });
  }
}
