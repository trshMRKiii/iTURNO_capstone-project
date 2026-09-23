import crypto from "crypto";
import jwt from "jsonwebtoken";

// Matches Django's default PasswordHasher (pbkdf2_sha256) exactly, so remote
// login can verify against the SAME password already sitting in api_user —
// no second account system, no separate remote password to manage.
// Format: pbkdf2_sha256$<iterations>$<salt>$<base64 hash>
export function verifyDjangoPassword(password, encoded) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const [, iterationsStr, salt, expectedHash] = parts;
  const iterations = parseInt(iterationsStr, 10);
  if (!iterations || !salt || !expectedHash) return false;

  const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const computedHash = derived.toString("base64");

  const a = Buffer.from(computedHash);
  const b = Buffer.from(expectedHash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const SALT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomAlphanumeric(length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += SALT_CHARS[bytes[i] % SALT_CHARS.length];
  return out;
}

// Inverse of verifyDjangoPassword — produces a hash Django can verify too,
// for creating accounts / resetting passwords remotely. Same iteration
// count Django's current default uses (see a real stored hash's prefix to
// confirm if this hasher's default ever changes).
export function hashDjangoPassword(password, iterations = 1200000) {
  const salt = randomAlphanumeric(12);
  const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2_sha256$${iterations}$${salt}$${derived.toString("base64")}`;
}

// For the temporary password shown to a superadmin when creating a user
// remotely (no SMTP configured here, so no welcome email like the LAN
// flow sends — the password is returned in the API response instead).
export function generateTempPassword() {
  return randomAlphanumeric(12);
}

function getSecret() {
  const secret = process.env.REMOTE_JWT_SECRET;
  if (!secret) throw new Error("REMOTE_JWT_SECRET is not configured");
  return secret;
}

// Separate from REMOTE_JWT_SECRET (login/session tokens, Node-only) because
// password-reset and email-verification links can be issued by EITHER this
// file or backend/api/tokens.py (same shared secret, same JWT shape on both
// sides) — whichever side sent the email, the link always opens the Vercel
// deployment (see settings.PUBLIC_APP_URL), so this side has to be able to
// verify a token Django signed just as often as one signed here.
function getEmailLinkSecret() {
  const secret = process.env.EMAIL_LINK_SECRET;
  if (!secret) throw new Error("EMAIL_LINK_SECRET is not configured");
  return secret;
}

// Mirrors SIMPLE_JWT's lifetimes in backend/backend/settings.py so remote
// sessions behave the same as LAN ones.
export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), username: user.username, role: user.role },
    getSecret(),
    { expiresIn: "5m" },
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user.id), type: "refresh" },
    getSecret(),
    { expiresIn: "1d" },
  );
}

export function verifyToken(token) {
  // Pin the algorithm — every token this app issues is HS256 (see sign* below); accepting
  // whatever `alg` the token claims would reopen algorithm-confusion attacks if an
  // asymmetric key ever gets introduced alongside this shared secret.
  return jwt.verify(token, getSecret(), { algorithms: ["HS256"] });
}

// A syntactically valid pbkdf2_sha256 hash that no real password will ever match, used
// to make login() do the same amount of work (a full PBKDF2 derivation) whether the
// username exists or not — otherwise response timing alone reveals valid usernames.
export const DUMMY_PASSWORD_HASH = hashDjangoPassword(randomAlphanumeric(24));

function verifyEmailLinkToken(token) {
  // Same algorithm pin as verifyToken above, but against EMAIL_LINK_SECRET —
  // this token may have been signed by Django (api/tokens.py) instead of here.
  return jwt.verify(token, getEmailLinkSecret(), { algorithms: ["HS256"] });
}

// Password-reset token: a signed JWT that self-invalidates once used, sharable
// with Django's sign_password_reset_token (backend/api/tokens.py) via the same
// EMAIL_LINK_SECRET — either side can issue one, either side can verify it.
// Binding a fragment of the *current* password hash into the payload means the
// token stops verifying the moment the password actually changes, without
// needing a DB-side used/unused flag. 3-day expiry matches Django's
// PASSWORD_RESET_TIMEOUT default.
export function signPasswordResetToken(user) {
  return jwt.sign(
    { sub: String(user.id), type: "password-reset", pwd: String(user.password).slice(-12) },
    getEmailLinkSecret(),
    { expiresIn: "3d" },
  );
}

export function verifyPasswordResetToken(token, user) {
  const payload = verifyEmailLinkToken(token);
  if (payload.type !== "password-reset") throw new Error("Not a password-reset token");
  if (payload.sub !== String(user.id)) throw new Error("Token does not match user");
  if (payload.pwd !== String(user.password).slice(-12)) throw new Error("Token already used");
  return payload;
}

// Email-verification token: same shared-secret scheme as above, mirrored by
// Django's sign_email_verification_token/verify_email_verification_token.
// No extra binding needed to self-invalidate — verifyEmail (api/remote/auth/
// [action].js) and Django's verify_email both reject outright once
// email_verified is already true, before the token is even checked. 30-day
// expiry matches the invite email's copy and expire_stale_unverified_accounts.
export function signEmailVerificationToken(user) {
  return jwt.sign(
    { sub: String(user.id), type: "email-verification" },
    getEmailLinkSecret(),
    { expiresIn: "30d" },
  );
}

export function verifyEmailVerificationToken(token, user) {
  const payload = verifyEmailLinkToken(token);
  if (payload.type !== "email-verification") throw new Error("Not an email-verification token");
  if (payload.sub !== String(user.id)) throw new Error("Token does not match user");
  return payload;
}

// Role constants match the *stored* choice values in api.models.User.ROLE_CHOICES
// (backend/api/models.py) — the "Admin" label (migration 0043) is display-only,
// the stored value is still SUPERADMIN.
export const ROLES = {
  PERSONNEL: "PERSONNEL",
  SUPERVISOR: "SUPERVISOR",
  MANAGER: "MANAGER",
  ADMIN: "SUPERADMIN",
};
// Everything writable remotely (Route, User, TicketPrice, TerminalPrice,
// TicketForm, PUVType, and the registry-only fields on Vehicle/Driver) is
// restricted to SUPERADMIN — deliberately narrower than "any manager" per
// the user's explicit call for this category of remote write access.
export const CAN_EDIT_SETTINGS = [ROLES.ADMIN];

// Matches IsSupervisorOrAdminForWrite (backend/api/views/viewsets.py) and the
// frontend's canManageBackfill check — backfill submission is a step down
// from full settings access, open to supervisors too.
export const CAN_BACKFILL = [ROLES.ADMIN, ROLES.SUPERVISOR];

// Pulls the Bearer token off the request and verifies it. Throws a plain
// object with a `status` so handlers can just catch and respond.
export function requireAuth(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw { status: 401, message: "Not authenticated" };
  try {
    return verifyToken(token);
  } catch {
    throw { status: 401, message: "Invalid or expired token" };
  }
}

export function requireRole(payload, allowedRoles) {
  if (!allowedRoles.includes(payload.role)) {
    throw { status: 403, message: "Not permitted for this role" };
  }
}
