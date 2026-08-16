import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth, requireRole, CAN_EDIT_SETTINGS } from "../_lib/auth.js";
import { resolveDateRange, inRange } from "../_lib/dateRange.js";

// Route is one of PULL_MODELS (backend/api/sync/registry.py) — Supabase is
// its source of truth, LAN pulls it down. Writing here is exactly what the
// LAN's pull cycle expects to eventually see, same as if admin/manager had
// edited it through some other Supabase-facing tool.
//
// This is the first of the settings/records resources wired up remotely;
// TicketPrice, TerminalPrice, TicketForm, PUVType, and User management
// follow the same shape and are a straightforward follow-up, not built yet.
export default async function handler(req, res) {
  let payload;
  try {
    payload = requireAuth(req);
  } catch (err) {
    res.status(err.status || 401).json({ detail: err.message || "Not authenticated" });
    return;
  }

  const supabase = supabaseAdmin();

  try {
    if (req.method === "GET") {
      // Matches serializers.py's SECOND RouteSerializer (the one actually
      // used for standalone /routes/ list requests — see api/_lib/shapes.js
      // for the note on why there are two same-named classes in that file)
      // — full_name/checked_in_today/revenue_in_range are computed, not
      // stored columns, same logic as RouteSerializer.get_checked_in_today
      // / get_revenue_in_range.
      const { rangeStart, rangeEnd } = resolveDateRange(req.query);
      const [{ data: routes, error: rErr }, { data: tickets, error: tErr }] = await Promise.all([
        supabase.from("api_route").select("*").order("origin", { ascending: true }),
        supabase.from("api_ticket").select("route_id,vehicle_id,collection_amount,issued_at,dispatched_at"),
      ]);
      if (rErr) throw rErr;
      if (tErr) throw tErr;

      const shaped = routes.map((r) => {
        const routeTickets = (tickets || []).filter(
          (t) => t.route_id === r.id && inRange(t.issued_at, rangeStart, rangeEnd),
        );
        const revenueTickets = routeTickets.filter((t) => t.dispatched_at);
        return {
          id: r.id,
          origin: r.origin,
          is_active: r.is_active,
          created_at: r.created_at,
          updated_at: r.updated_at,
          full_name: `${r.origin} - San Fernando`,
          checked_in_today: new Set(routeTickets.map((t) => t.vehicle_id)).size,
          revenue_in_range: Math.round(
            revenueTickets.reduce((s, t) => s + (Number(t.collection_amount) || 0), 0) * 100,
          ) / 100,
        };
      });
      res.status(200).json(shaped);
      return;
    }

    // Everything past this point mutates data — MANAGER/ADMIN only.
    requireRole(payload, CAN_EDIT_SETTINGS);

    if (req.method === "POST") {
      const { origin, is_active = true } = req.body || {};
      if (!origin || !origin.trim()) {
        res.status(400).json({ detail: "origin is required" });
        return;
      }
      const { data, error } = await supabase
        .from("api_route")
        .insert({ origin: origin.trim(), is_active })
        .select()
        .single();
      if (error) throw error;
      res.status(201).json(data);
      return;
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      const id = req.query.id;
      if (!id) {
        res.status(400).json({ detail: "id query param is required" });
        return;
      }
      const { data, error } = await supabase
        .from("api_route")
        .update(req.body || {})
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        res.status(400).json({ detail: "id query param is required" });
        return;
      }
      const { error } = await supabase.from("api_route").delete().eq("id", id);
      if (error) throw error;
      res.status(204).end();
      return;
    }

    res.status(405).json({ detail: "Method not allowed" });
  } catch (err) {
    if (err.status) {
      res.status(err.status).json({ detail: err.message });
      return;
    }
    console.error("remote/routes error:", err);
    res.status(500).json({ detail: "Request failed" });
  }
}
