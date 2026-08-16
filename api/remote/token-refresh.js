import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { verifyToken, signAccessToken } from "../_lib/auth.js";

// Mirrors Django's POST /api/token/refresh/ contract — {refresh} in,
// {access} out — matching apiService.refreshToken()'s expectations.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }

  const { refresh } = req.body || {};
  if (!refresh) {
    res.status(400).json({ detail: "refresh is required" });
    return;
  }

  let payload;
  try {
    payload = verifyToken(refresh);
  } catch {
    res.status(401).json({ detail: "Refresh token invalid or expired" });
    return;
  }
  if (payload.type !== "refresh") {
    res.status(401).json({ detail: "Not a refresh token" });
    return;
  }

  try {
    // Re-fetch rather than trust the token's own claims, so a role change
    // or deactivation since the refresh token was issued takes effect
    // immediately instead of surviving until the refresh token expires.
    const { data: user, error } = await supabaseAdmin()
      .from("api_user")
      .select("id, username, role, is_active")
      .eq("id", payload.sub)
      .maybeSingle();

    if (error) throw error;
    if (!user || !user.is_active) {
      res.status(401).json({ detail: "Account no longer active" });
      return;
    }

    res.status(200).json({ access: signAccessToken(user) });
  } catch (err) {
    console.error("remote/token-refresh error:", err);
    res.status(500).json({ detail: "Refresh failed" });
  }
}
