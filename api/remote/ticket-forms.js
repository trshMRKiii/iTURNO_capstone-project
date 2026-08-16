import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth, requireRole, CAN_EDIT_SETTINGS } from "../_lib/auth.js";

// TicketForm is a PULL_MODEL — same pattern as api/remote/routes.js.
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
      const { data, error } = await supabase.from("api_ticketform").select("*").order("name", { ascending: true });
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    requireRole(payload, CAN_EDIT_SETTINGS);

    if (req.method === "POST") {
      const { name, price = 0 } = req.body || {};
      if (!name || !name.trim()) {
        res.status(400).json({ detail: "name is required" });
        return;
      }
      const { data, error } = await supabase.from("api_ticketform").insert({ name: name.trim(), price }).select().single();
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
      const { data, error } = await supabase.from("api_ticketform").update(req.body || {}).eq("id", id).select().single();
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
      const { error } = await supabase.from("api_ticketform").delete().eq("id", id);
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
    console.error("remote/ticket-forms error:", err);
    res.status(500).json({ detail: "Request failed" });
  }
}
