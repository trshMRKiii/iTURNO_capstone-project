import { supabaseAdmin } from "../../_lib/supabaseAdmin.js";
import {
  requireAuth,
  verifyDjangoPassword,
  hashDjangoPassword,
  signAccessToken,
  signRefreshToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
  verifyToken,
  DUMMY_PASSWORD_HASH,
} from "../../_lib/auth.js";
import { sendPasswordResetEmail } from "../../_lib/mailer.js";

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
    // Always run the full PBKDF2 verification, even for an unknown username — a real
    // account's hash if the user exists, a dummy one otherwise — so response time
    // doesn't leak which usernames are registered.
    const passwordOk = verifyDjangoPassword(password, user ? user.password : DUMMY_PASSWORD_HASH);
    if (!user || !user.is_active || !passwordOk) {
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

// Mirrors backend/api/views/auth.py's forgot_password/reset_password, minus
// Django's PasswordResetTokenGenerator (needs Django's SECRET_KEY/hasher —
// see signPasswordResetToken in api/_lib/auth.js for the JWT-based
// equivalent). Same "respond the same way either way" behavior so this
// can't be used to probe which emails are registered.
async function forgotPassword(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) {
    res.status(400).json({ detail: "Email is required." });
    return;
  }
  try {
    // ilike (not eq) to match Django's username__iexact case-insensitive lookup
    // in backend/api/views/auth.py — escape % and _ first so they can't be used
    // as SQL LIKE wildcards to match unintended accounts.
    const escapedEmail = email.replace(/[%_\\]/g, "\\$&");
    const { data: user, error } = await supabaseAdmin()
      .from("api_user")
      .select("id, username, password, first_name, is_active")
      .ilike("username", escapedEmail)
      .maybeSingle();
    if (error) throw error;

    if (user && user.is_active) {
      const token = signPasswordResetToken(user);
      const resetLink = `https://${req.headers.host}/reset-password?uid=${user.id}&token=${token}`;
      await sendPasswordResetEmail(user.username, user.first_name || user.username, resetLink);
    }
  } catch (err) {
    console.error("remote/auth/forgot-password error:", err);
    // Fall through to the same generic response — never reveal server-side failures here.
  }
  res.status(200).json({ detail: "If an account exists for that email, a reset link has been sent." });
}

async function resetPasswordRemote(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }
  const { uid, token, new_password: newPassword } = req.body || {};
  if (!uid || !token || !newPassword) {
    res.status(400).json({ detail: "Missing required fields." });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ detail: "Password must be at least 8 characters." });
    return;
  }
  try {
    const { data: user, error } = await supabaseAdmin()
      .from("api_user")
      .select("id, password")
      .eq("id", uid)
      .maybeSingle();
    if (error) throw error;
    if (!user) {
      res.status(400).json({ detail: "Invalid or expired reset link." });
      return;
    }

    verifyPasswordResetToken(token, user);

    const { error: updateError } = await supabaseAdmin()
      .from("api_user")
      .update({ password: hashDjangoPassword(newPassword) })
      .eq("id", uid);
    if (updateError) throw updateError;

    res.status(200).json({ detail: "Password has been reset successfully." });
  } catch (err) {
    if (err?.message?.includes("Token") || err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
      res.status(400).json({ detail: "Invalid or expired reset link." });
      return;
    }
    console.error("remote/auth/reset-password error:", err);
    res.status(500).json({ detail: "Failed to reset password." });
  }
}

const ACTIONS = {
  token: login,
  "token-refresh": refresh,
  "current-user": me,
  "forgot-password": forgotPassword,
  "reset-password": resetPasswordRemote,
};

export default async function handler(req, res) {
  const action = ACTIONS[req.query.action];
  if (!action) {
    res.status(404).json({ detail: `Unknown auth action: ${req.query.action}` });
    return;
  }
  await action(req, res);
}
