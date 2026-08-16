import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth } from "../_lib/auth.js";

// Mirrors Django's GET /api/current-user/ shape closely enough for the
// existing welcome-toast code in handleLogin() to work unchanged.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }

  let payload;
  try {
    payload = requireAuth(req);
  } catch (err) {
    res.status(err.status || 401).json({ detail: err.message || "Not authenticated" });
    return;
  }

  try {
    const { data: user, error } = await supabaseAdmin()
      .from("api_user")
      .select("id, username, first_name, last_name, middle_name, role, is_active")
      .eq("id", payload.sub)
      .maybeSingle();

    if (error) throw error;
    if (!user || !user.is_active) {
      res.status(401).json({ detail: "Account no longer active" });
      return;
    }

    res.status(200).json(user);
  } catch (err) {
    console.error("remote/current-user error:", err);
    res.status(500).json({ detail: "Failed to load user" });
  }
}
