import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth, requireRole, CAN_EDIT_SETTINGS } from "../_lib/auth.js";

// PATCH-only — reading vehicles already works well via
// /api/remote/resource/vehicles (with full route/driver/PUV-type shaping).
// This exists solely so SUPERADMIN can fix registry details (plate number
// typos, contact/franchise info, route assignment) remotely.
//
// Deliberately excludes status, active_driver, and is_archived — those
// change constantly during live LAN dispatch/queue operations, and Vehicle
// is a PUSH_MODEL (LAN-authoritative, one-way mirror — see
// backend/api/sync/registry.py). Editing those fields here could silently
// collide with a real dispatch happening on the LAN at the same moment,
// and Vehicle has no pull path back to the LAN at all, so this endpoint
// only ever touches fields that don't affect live operations.
const EDITABLE_FIELDS = ["plate_number", "transportation_id", "franchise_number", "route", "operator_address", "qr_code"];

export default async function handler(req, res) {
  if (req.method !== "PATCH" && req.method !== "PUT") {
    res.status(405).json({ detail: "Method not allowed — use /resource/vehicles to read" });
    return;
  }

  let payload;
  try {
    payload = requireAuth(req);
    requireRole(payload, CAN_EDIT_SETTINGS);
  } catch (err) {
    res.status(err.status || 401).json({ detail: err.message || "Not authenticated" });
    return;
  }

  const id = req.query.id;
  if (!id) {
    res.status(400).json({ detail: "id query param is required" });
    return;
  }

  const requested = Object.keys(req.body || {});
  const disallowed = requested.filter((f) => !EDITABLE_FIELDS.includes(f));
  if (disallowed.length) {
    res.status(403).json({
      detail: `These fields can't be edited remotely (LAN-only, live operational state): ${disallowed.join(", ")}`,
    });
    return;
  }

  try {
    const updates = {};
    for (const f of EDITABLE_FIELDS) if (f in (req.body || {})) updates[f] = req.body[f];

    const { data, error } = await supabaseAdmin().from("api_vehicle").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error("remote/vehicles error:", err);
    res.status(500).json({ detail: "Request failed" });
  }
}
