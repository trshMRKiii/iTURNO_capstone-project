import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth, requireRole, CAN_EDIT_SETTINGS } from "../_lib/auth.js";

// TerminalPrice is a singleton (TerminalPrice.get_solo() in models.py always
// operates on pk=1) — GET creates it with amount=0 if missing, matching
// get_or_create; PATCH/PUT updates that same row. No POST/DELETE — there's
// only ever one row.
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
      let { data, error } = await supabase.from("api_terminalprice").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      if (!data) {
        ({ data, error } = await supabase.from("api_terminalprice").insert({ id: 1, amount: 0 }).select().single());
        if (error) throw error;
      }
      res.status(200).json(data);
      return;
    }

    requireRole(payload, CAN_EDIT_SETTINGS);

    if (req.method === "PATCH" || req.method === "PUT") {
      const { data, error } = await supabase
        .from("api_terminalprice")
        .upsert({ id: 1, ...(req.body || {}) })
        .select()
        .single();
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    res.status(405).json({ detail: "Method not allowed" });
  } catch (err) {
    if (err.status) {
      res.status(err.status).json({ detail: err.message });
      return;
    }
    console.error("remote/terminal-price error:", err);
    res.status(500).json({ detail: "Request failed" });
  }
}
