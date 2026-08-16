import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth, requireRole, CAN_EDIT_SETTINGS } from "../_lib/auth.js";

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
      const { data, error } = await supabase
        .from("api_route")
        .select("*")
        .order("origin", { ascending: true });
      if (error) throw error;
      res.status(200).json(data);
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

    if (req.method === "PATCH") {
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
