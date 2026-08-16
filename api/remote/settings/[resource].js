import { supabaseAdmin } from "../../_lib/supabaseAdmin.js";
import {
  requireAuth,
  requireRole,
  CAN_EDIT_SETTINGS,
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

const RESOURCES = {
  routes: routesResource,
  users: usersResource,
  "ticket-forms": simpleCrud("api_ticketform", { createFields: ["name", "price"], requiredField: "name" }),
  "puv-types": simpleCrud("api_puvtype", { createFields: ["name"], requiredField: "name" }),
  "terminal-price": terminalPriceResource,
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
