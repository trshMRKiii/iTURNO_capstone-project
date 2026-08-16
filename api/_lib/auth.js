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
  return jwt.verify(token, getSecret());
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
