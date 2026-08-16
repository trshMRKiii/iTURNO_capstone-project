import { supabaseAdmin } from "../../_lib/supabaseAdmin.js";
import { requireAuth, requireRole, CAN_EDIT_SETTINGS } from "../../_lib/auth.js";

// Merges vehicles/drivers into one function (Vercel Hobby's 12-function
// cap — see api/remote/auth/[action].js). PATCH-only — reading already
// works well via /api/remote/resource/vehicles|drivers (full shaping).
//
// Both are PUSH_MODELS (LAN-authoritative, one-way mirror — see
// backend/api/sync/registry.py), so each only allows editing fields that
// don't affect live LAN dispatch/queue operations: status, active_driver,
// is_archived stay LAN-only, everything else (registry/paperwork detail)
// is fair game for SUPERADMIN remotely.
const RESOURCES = {
  vehicles: {
    table: "api_vehicle",
    editableFields: ["plate_number", "transportation_id", "franchise_number", "route", "operator_address", "qr_code"],
  },
  drivers: {
    table: "api_driver",
    editableFields: [
      "iwp_number", "first_name", "middle_name", "last_name", "gender", "birthdate",
      "province", "city", "barangay", "street", "contact", "qr_code",
    ],
  },
};

export default async function handler(req, res) {
  if (req.method !== "PATCH" && req.method !== "PUT") {
    res.status(405).json({ detail: "Method not allowed — use /resource/vehicles or /resource/drivers to read" });
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

  const resource = RESOURCES[req.query.resource];
  if (!resource) {
    res.status(404).json({ detail: `Unknown registry resource: ${req.query.resource}` });
    return;
  }

  const id = req.query.id;
  if (!id) {
    res.status(400).json({ detail: "id query param is required" });
    return;
  }

  // The LAN edit forms always submit the whole record (status, is_archived,
  // etc. included) even when only e.g. contact changed — rejecting the
  // request outright just because a LAN-only field is *present* would block
  // every remote edit through this form, not just attempts to actually
  // change status/active_driver. So: silently keep only the allowed fields
  // rather than erroring on the disallowed ones being present.
  const updates = {};
  for (const f of resource.editableFields) if (f in (req.body || {})) updates[f] = req.body[f];

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ detail: "No editable fields were submitted" });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin().from(resource.table).update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error(`remote/registry/${req.query.resource} error:`, err);
    res.status(500).json({ detail: "Request failed" });
  }
}
