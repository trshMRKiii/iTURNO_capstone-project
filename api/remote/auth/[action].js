import { supabaseAdmin } from "../../_lib/supabaseAdmin.js";
import {
  requireAuth,
  verifyDjangoPassword,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from "../../_lib/auth.js";

// Merges token/token-refresh/current-user into one function, dispatched by
// the [action] URL segment — Vercel's Hobby plan caps a deployment at 12
// Serverless Functions total, and every top-level file under api/ counts
// separately, so anything logically grouped gets one dynamic-route file
// instead (see also resource/[table].js, reports/[report].js,
// settings/[resource].js, registry/[resource].js).
async function login(req, res) {
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
    res.status(200).json({ access: signAccessToken(user), refresh: signRefreshToken(user) });
  } catch (err) {
    console.error("remote/auth/token error:", err);
    res.status(500).json({ detail: "Login failed" });
  }
}

async function refresh(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }
  const { refresh: refreshToken } = req.body || {};
  if (!refreshToken) {
    res.status(400).json({ detail: "refresh is required" });
    return;
  }
  let payload;
  try {
    payload = verifyToken(refreshToken);
  } catch {
    res.status(401).json({ detail: "Refresh token invalid or expired" });
    return;
  }
  if (payload.type !== "refresh") {
    res.status(401).json({ detail: "Not a refresh token" });
    return;
  }
  try {
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
    console.error("remote/auth/refresh error:", err);
    res.status(500).json({ detail: "Refresh failed" });
  }
}

async function me(req, res) {
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
    console.error("remote/auth/me error:", err);
    res.status(500).json({ detail: "Failed to load user" });
  }
}

const ACTIONS = { token: login, "token-refresh": refresh, "current-user": me };

export default async function handler(req, res) {
  const action = ACTIONS[req.query.action];
  if (!action) {
    res.status(404).json({ detail: `Unknown auth action: ${req.query.action}` });
    return;
  }
  await action(req, res);
}
