import { supabaseAdmin } from "../../_lib/supabaseAdmin.js";
import {
  requireAuth,
  requireRole,
  CAN_EDIT_SETTINGS,
  CAN_BACKFILL,
  hashDjangoPassword,
  generateTempPassword,
} from "../../_lib/auth.js";
import { resolveDateRange, inRange } from "../../_lib/dateRange.js";

// Merges routes/users/ticket-forms/puv-types/terminal-price into one
// function (Vercel Hobby's 12-function cap — see api/remote/auth/[action].js).
// All writable, all SUPERADMIN-only (CAN_EDIT_SETTINGS). Route is the only
// one with public read access; the rest require SUPERADMIN even to view.

async function routesResource(req, res, supabase, payload) {
  if (req.method === "GET") {
    const { rangeStart, rangeEnd } = resolveDateRange(req.query);
    const [{ data: routes, error: rErr }, { data: tickets, error: tErr }] = await Promise.all([
      supabase.from("api_route").select("*").order("origin", { ascending: true }),
      supabase.from("api_ticket").select("route_id,vehicle_id,collection_amount,issued_at,dispatched_at"),
    ]);
    if (rErr) throw rErr;
    if (tErr) throw tErr;
    const shaped = routes.map((r) => {
      const routeTickets = (tickets || []).filter((t) => t.route_id === r.id && inRange(t.issued_at, rangeStart, rangeEnd));
      const revenueTickets = routeTickets.filter((t) => t.dispatched_at);
      return {
        id: r.id, origin: r.origin, is_active: r.is_active, created_at: r.created_at, updated_at: r.updated_at,
        full_name: `${r.origin} - San Fernando`,
        checked_in_today: new Set(routeTickets.map((t) => t.vehicle_id)).size,
        revenue_in_range: Math.round(revenueTickets.reduce((s, t) => s + (Number(t.collection_amount) || 0), 0) * 100) / 100,
      };
    });
    res.status(200).json(shaped);
    return;
  }

  requireRole(payload, CAN_EDIT_SETTINGS);

  if (req.method === "POST") {
    const { origin, is_active = true } = req.body || {};
    if (!origin || !origin.trim()) return void res.status(400).json({ detail: "origin is required" });
    const { data, error } = await supabase.from("api_route").insert({ origin: origin.trim(), is_active }).select().single();
    if (error) throw error;
    res.status(201).json(data);
    return;
  }
  if (req.method === "PATCH" || req.method === "PUT") {
    const id = req.query.id;
    if (!id) return void res.status(400).json({ detail: "id query param is required" });
    const { data, error } = await supabase.from("api_route").update(req.body || {}).eq("id", id).select().single();
    if (error) throw error;
    res.status(200).json(data);
    return;
  }
  if (req.method === "DELETE") {
    const id = req.query.id;
    if (!id) return void res.status(400).json({ detail: "id query param is required" });
    const { error } = await supabase.from("api_route").delete().eq("id", id);
    if (error) throw error;
    res.status(204).end();
    return;
  }
  res.status(405).json({ detail: "Method not allowed" });
}

async function usersResource(req, res, supabase, payload) {
  requireRole(payload, CAN_EDIT_SETTINGS); // whole resource is SUPERADMIN-only, reads included
  const SELECT = "id, username, first_name, middle_name, last_name, role, is_active, must_reset_password";

  if (req.method === "GET") {
    const { data, error } = await supabase.from("api_user").select(SELECT).order("username", { ascending: true });
    if (error) throw error;
    res.status(200).json(data);
    return;
  }
  if (req.method === "POST") {
    const { username, first_name = "", middle_name = "", last_name = "", role = "PERSONNEL", is_active = true } = req.body || {};
    if (!username || !username.trim()) return void res.status(400).json({ detail: "username (email) is required" });
    const tempPassword = generateTempPassword();
    const { data, error } = await supabase
      .from("api_user")
      .insert({
        username: username.trim(), first_name, middle_name, last_name, role, is_active,
        password: hashDjangoPassword(tempPassword), must_reset_password: true, is_staff: false, is_superuser: false,
      })
      .select(SELECT).single();
    if (error) throw error;
    res.status(201).json({ ...data, generated_password: tempPassword });
    return;
  }
  if (req.method === "PATCH" || req.method === "PUT") {
    const id = req.query.id;
    if (!id) return void res.status(400).json({ detail: "id query param is required" });
    const { new_password, ...fields } = req.body || {};
    const updates = { ...fields };
    if (new_password) {
      updates.password = hashDjangoPassword(new_password);
      updates.must_reset_password = true;
    }
    const { data, error } = await supabase.from("api_user").update(updates).eq("id", id).select(SELECT).single();
    if (error) throw error;
    res.status(200).json(data);
    return;
  }
  if (req.method === "DELETE") {
    const id = req.query.id;
    if (!id) return void res.status(400).json({ detail: "id query param is required" });
    const { error } = await supabase.from("api_user").delete().eq("id", id);
    if (error) throw error;
    res.status(204).end();
    return;
  }
  res.status(405).json({ detail: "Method not allowed" });
}

function simpleCrud(table, { createFields, requiredField = "name" }) {
  return async (req, res, supabase, payload) => {
    if (req.method === "GET") {
      const { data, error } = await supabase.from(table).select("*").order(requiredField, { ascending: true });
      if (error) throw error;
      res.status(200).json(data);
      return;
    }

    requireRole(payload, CAN_EDIT_SETTINGS);

    if (req.method === "POST") {
      const body = req.body || {};
      if (!body[requiredField] || !String(body[requiredField]).trim()) {
        res.status(400).json({ detail: `${requiredField} is required` });
        return;
      }
      const insert = Object.fromEntries(createFields.map((f) => [f, body[f]]));
      const { data, error } = await supabase.from(table).insert(insert).select().single();
      if (error) throw error;
      res.status(201).json(data);
      return;
    }
    if (req.method === "PATCH" || req.method === "PUT") {
      const id = req.query.id;
      if (!id) return void res.status(400).json({ detail: "id query param is required" });
      const { data, error } = await supabase.from(table).update(req.body || {}).eq("id", id).select().single();
      if (error) throw error;
      res.status(200).json(data);
      return;
    }
    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return void res.status(400).json({ detail: "id query param is required" });
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      res.status(204).end();
      return;
    }
    res.status(405).json({ detail: "Method not allowed" });
  };
}

async function terminalPriceResource(req, res, supabase, payload) {
  if (req.method === "GET") {
    let { data, error } = await supabase.from("api_terminalprice").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (!data) {
      ({ data, error } = await supabase.from("api_terminalprice").insert({ id: 1, amount: 0 }).select().single());
      if (error) throw error;
    }
    res.status(200).json(data);
    return;
  }

  requireRole(payload, CAN_EDIT_SETTINGS);

  if (req.method === "PATCH" || req.method === "PUT") {
    const { data, error } = await supabase.from("api_terminalprice").upsert({ id: 1, ...(req.body || {}) }).select().single();
    if (error) throw error;
    res.status(200).json(data);
    return;
  }
  res.status(405).json({ detail: "Method not allowed" });
}

async function wipModeResource(req, res, supabase) {
  // Read-only remotely by design — see WipMode's docstring in
  // backend/api/models.py. Anyone authenticated can check it (it just gates
  // whether the backfill form below is usable), no role check needed.
  if (req.method !== "GET") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }
  const { data, error } = await supabase.from("api_wipmode").select("is_active,updated_at").eq("id", 1).maybeSingle();
  if (error) throw error;
  res.status(200).json(data || { is_active: false, updated_at: null });
}

// Keys match F_TICKET_ID etc. in backend/api/views/backfill.py and
// src/app/dashboard/settings/backfill/fields.js — same required set as
// backfill.py's REQUIRED_FIELDS, checked here only so a malformed remote
// submission fails fast instead of silently sitting PENDING until the LAN's
// next sync cycle rejects it.
const BACKFILL_REQUIRED = ["Ticket Number", "Vehicle Plate Number", "Driver IWP Number", "Driver Last Name"];

async function backfillResource(req, res, supabase, payload) {
  requireRole(payload, CAN_BACKFILL);

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("api_remotebackfillrequest")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.status(200).json(data);
    return;
  }

  if (req.method === "POST") {
    const { data: wip, error: wipErr } = await supabase.from("api_wipmode").select("is_active").eq("id", 1).maybeSingle();
    if (wipErr) throw wipErr;
    if (!wip?.is_active) {
      res.status(409).json({ detail: "Switch the LAN terminal to WIP mode before backfilling remotely." });
      return;
    }

    const row = req.body || {};
    const missing = BACKFILL_REQUIRED.filter((f) => !String(row[f] || "").trim());
    if (missing.length) {
      res.status(400).json({ detail: `Missing required field(s): ${missing.join(", ")}` });
      return;
    }

    const { data, error } = await supabase
      .from("api_remotebackfillrequest")
      .insert({
        payload: row,
        ticket_id: String(row["Ticket Number"]).trim(),
        requested_by_name: payload.username || "",
        status: "PENDING",
      })
      .select()
      .single();
    if (error) throw error;
    // Normalized to look like backfill.py's {outcome, ...} response so the
    // frontend's existing success-check (result.outcome === "ok") still
    // works without a remote-specific branch there — see useTicketBackfill.
    res.status(201).json({ outcome: "ok", queued: true, ticket_id: data.ticket_id, status: data.status, id: data.id });
    return;
  }

  res.status(405).json({ detail: "Method not allowed" });
}

const RESOURCES = {
  routes: routesResource,
  users: usersResource,
  "ticket-forms": simpleCrud("api_ticketform", { createFields: ["name", "price"], requiredField: "name" }),
  "puv-types": simpleCrud("api_puvtype", { createFields: ["name"], requiredField: "name" }),
  "terminal-price": terminalPriceResource,
  "wip-mode": wipModeResource,
  backfill: backfillResource,
};

export default async function handler(req, res) {
  let payload;
  try {
    payload = requireAuth(req);
  } catch (err) {
    res.status(err.status || 401).json({ detail: err.message || "Not authenticated" });
    return;
  }

  const run = RESOURCES[req.query.resource];
  if (!run) {
    res.status(404).json({ detail: `Unknown settings resource: ${req.query.resource}` });
    return;
  }

  try {
    await run(req, res, supabaseAdmin(), payload);
  } catch (err) {
    if (err.status) {
      res.status(err.status).json({ detail: err.message });
      return;
    }
    console.error(`remote/settings/${req.query.resource} error:`, err);
    res.status(500).json({ detail: "Request failed" });
  }
}
