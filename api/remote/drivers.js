import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAuth, requireRole, CAN_EDIT_SETTINGS } from "../_lib/auth.js";

// PATCH-only — same reasoning as api/remote/vehicles.js. Excludes status
// and is_archived (affects whether this driver can be assigned during live
// LAN check-ins) — everything else here is registry/paperwork detail.
const EDITABLE_FIELDS = [
  "iwp_number", "first_name", "middle_name", "last_name", "gender", "birthdate",
  "province", "city", "barangay", "street", "contact", "qr_code",
];

export default async function handler(req, res) {
  if (req.method !== "PATCH" && req.method !== "PUT") {
    res.status(405).json({ detail: "Method not allowed — use /resource/drivers to read" });
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

    const { data, error } = await supabaseAdmin().from("api_driver").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error("remote/drivers error:", err);
    res.status(500).json({ detail: "Request failed" });
  }
}
