import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth, requireRole, CAN_EDIT_SETTINGS, hashDjangoPassword, generateTempPassword } from "../_lib/auth.js";

// User is a PULL_MODEL (backend/api/sync/registry.py) — Supabase is its
// source of truth, LAN pulls it down. Restricted to SUPERADMIN in both
// directions (not MANAGER, unlike Route) since staff accounts are more
// sensitive than terminal/pricing config.
//
// No email is sent on create (LAN's flow does, via SMTP configured only on
// Django) — the generated temporary password is returned in the response
// instead, for the superadmin to relay directly.
const SELECT = "id, username, first_name, middle_name, last_name, role, is_active, must_reset_password";

export default async function handler(req, res) {
  let payload;
  try {
    payload = requireAuth(req);
    requireRole(payload, CAN_EDIT_SETTINGS); // whole resource is SUPERADMIN-only, reads included
  } catch (err) {
    res.status(err.status || 401).json({ detail: err.message || "Not authenticated" });
    return;
  }

  const supabase = supabaseAdmin();

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase.from("api_user").select(SELECT).order("username", { ascending: true });
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    if (req.method === "POST") {
      const { username, first_name = "", middle_name = "", last_name = "", role = "PERSONNEL", is_active = true } = req.body || {};
      if (!username || !username.trim()) {
        res.status(400).json({ detail: "username (email) is required" });
        return;
      }
      const tempPassword = generateTempPassword();
      const { data, error } = await supabase
        .from("api_user")
        .insert({
          username: username.trim(),
          first_name,
          middle_name,
          last_name,
          role,
          is_active,
          password: hashDjangoPassword(tempPassword),
          must_reset_password: true,
          is_staff: false,
          is_superuser: false,
        })
        .select(SELECT)
        .single();
      if (error) throw error;
      res.status(201).json({ ...data, generated_password: tempPassword });
      return;
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      const id = req.query.id;
      if (!id) {
        res.status(400).json({ detail: "id query param is required" });
        return;
      }
      const { new_password, ...fields } = req.body || {};
      const updates = { ...fields };
      let tempPassword = null;
      if (new_password) {
        updates.password = hashDjangoPassword(new_password);
        updates.must_reset_password = true;
      }
      const { data, error } = await supabase.from("api_user").update(updates).eq("id", id).select(SELECT).single();
      if (error) throw error;
      res.status(200).json(tempPassword ? { ...data, generated_password: tempPassword } : data);
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        res.status(400).json({ detail: "id query param is required" });
        return;
      }
      const { error } = await supabase.from("api_user").delete().eq("id", id);
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
    console.error("remote/users error:", err);
    res.status(500).json({ detail: "Request failed" });
  }
}
