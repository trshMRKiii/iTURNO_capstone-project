import { supabaseAdmin } from "../../_lib/supabaseAdmin.js";
import { requireAuth } from "../../_lib/auth.js";
import {
  shapeVehicle,
  shapeDriver,
  shapeTicket,
  shapeRequisition,
  shapeTicketSeries,
  shapeRemittanceBatch,
  shapeRoamingLog,
  shapeAuditLog,
} from "../../_lib/shapes.js";

const VEHICLE_SELECT =
  "*, route:api_route(*), transportation:api_puvtype(id,name), driver_obj:api_driver(id,last_name,first_name)";
const TICKET_SELECT =
  `*, vehicle:api_vehicle(${VEHICLE_SELECT}), driver:api_driver(*), route:api_route(*), ` +
  "series:api_ticketseries(id,series_no,start_no,end_no,ticket_form:api_ticketform(id,name,price))";

// One read-only endpoint for every "view this list" need across the LAN
// dashboard's modules, instead of a bespoke file per resource — each entry
// is just a Supabase select + which query params are allowed as filters.
// Write access for PULL_MODELS (Route, User, pricing, etc.) stays in their
// own dedicated files (e.g. api/remote/routes.js) since those need role
// checks on mutation; this file is GET-only, matching the "view only for
// transactional data" decision.
const RESOURCES = {
  vehicles: {
    table: "api_vehicle",
    select: VEHICLE_SELECT,
    order: { column: "plate_number", ascending: true },
    filters: ["status", "is_archived"],
    shape: (rows) => rows.map(shapeVehicle),
  },
  drivers: {
    table: "api_driver",
    select: "*",
    order: { column: "last_name", ascending: true },
    filters: ["status", "is_archived"],
    shape: (rows) => rows.map(shapeDriver),
  },
  tickets: {
    table: "api_ticket",
    select: TICKET_SELECT,
    order: { column: "issued_at", ascending: false },
    filters: ["status", "mode"],
    limit: 200,
    shape: (rows) => rows.map(shapeTicket),
  },
  "ticket-series": {
    table: "api_ticketseries",
    select: "*, ticket_form:api_ticketform(id,name,price), issued_to:api_user(id,username)",
    order: { column: "created_at", ascending: false },
    filters: ["requisition"],
    shape: (rows) => rows.map(shapeTicketSeries),
  },
  requisitions: {
    table: "api_requisition",
    select: "*, ticket_series:api_ticketseries(*, ticket_form:api_ticketform(id,name,price))",
    order: { column: "date_requested", ascending: false },
    filters: ["is_archived", "status"],
    shape: (rows) => rows.map(shapeRequisition),
  },
  "remittance-batches": {
    table: "api_remittancebatch",
    select: "*, deposits:api_deposit(*), collections:api_collection(*)",
    order: { column: "issued_at", ascending: false },
    filters: ["is_archived", "status"],
    shape: (rows) => rows.map(shapeRemittanceBatch),
  },
  "roaming-logs": {
    table: "api_roaminglog",
    select: "*, vehicle:api_vehicle(id,plate_number), driver:api_driver(id,last_name,first_name), recorded_by:api_user(id,first_name,last_name,username)",
    order: { column: "recorded_at", ascending: false },
    filters: [],
    limit: 200,
    shape: (rows) => rows.map(shapeRoamingLog),
  },
  "audit-logs": {
    table: "api_auditlog",
    select: "*, user:api_user(id,first_name,last_name,username)",
    order: { column: "created_at", ascending: false },
    filters: ["model_name", "action"],
    limit: 200,
    shape: (rows) => rows.map(shapeAuditLog),
  },
  // users, puvtypes, ticket-forms, terminal-price moved to their own
  // dedicated CRUD files (api/remote/users.js etc.) once those became
  // writable — one file per writable resource, matching routes.js.
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ detail: "Method not allowed" });
    return;
  }

  try {
    requireAuth(req);
  } catch (err) {
    res.status(err.status || 401).json({ detail: err.message || "Not authenticated" });
    return;
  }

  const { table: key, page, page_size: pageSize, ...filters } = req.query;
  const resource = RESOURCES[key];
  if (!resource) {
    res.status(404).json({ detail: `Unknown resource: ${key}` });
    return;
  }

  try {
    let query = supabaseAdmin()
      .from(resource.table)
      .select(resource.select, page ? { count: "exact" } : undefined)
      .order(resource.order.column, { ascending: resource.order.ascending });

    for (const field of resource.filters) {
      const value = filters[field];
      if (value === undefined || value === "") continue;
      if (value === "true" || value === "false") {
        query = query.eq(field, value === "true");
      } else if (value.includes(",")) {
        query = query.in(field, value.split(","));
      } else {
        query = query.eq(field, value);
      }
    }

    // Paginated callers (Reports module) pass page/page_size and expect
    // {results, count} back, matching backend/api/views/reports.py's shape
    // — everyone else (Dashboard, Queue, etc.) just wants the plain array.
    if (page) {
      const size = Number(pageSize) || 30;
      const from = (Number(page) - 1) * size;
      query = query.range(from, from + size - 1);
    } else if (resource.limit) {
      query = query.limit(resource.limit);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    if (page) {
      res.status(200).json({ results: resource.shape ? resource.shape(data) : data, count });
      return;
    }

    res.status(200).json(resource.shape ? resource.shape(data) : data);
  } catch (err) {
    console.error(`remote/resource/${key} error:`, err);
    res.status(500).json({ detail: "Failed to load data" });
  }
}
