import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { verifyDjangoPassword, signAccessToken, signRefreshToken } from "../_lib/auth.js";

// Mirrors Django's POST /api/token/ (SimpleJWT TokenObtainPairView) contract
// — {username, password} in, {access, refresh} out — so the existing
// handleLogin() in src/lib/api-service.js works against this unchanged.
// Verifies against the SAME api_user row/password already mirrored to
// Supabase by the LAN sync engine (backend/api/sync/) — no separate remote
// account system.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ detail: "username and password are required" });
    return;
  }

  try {
    const { data: user, error } = await supabaseAdmin()
      .from("api_user")
      .select("id, username, password, role, first_name, last_name, is_active")
      .eq("username", username)
      .maybeSingle();

    if (error) throw error;

    if (!user || !user.is_active || !verifyDjangoPassword(password, user.password)) {
      res.status(401).json({ detail: "No active account found with the given credentials" });
      return;
    }

    res.status(200).json({
      access: signAccessToken(user),
      refresh: signRefreshToken(user),
    });
  } catch (err) {
    console.error("remote/token error:", err);
    res.status(500).json({ detail: "Login failed" });
  }
}
