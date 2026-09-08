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

// Mirrors TicketSeries._get_tickets_issued (backend/api/serializers.py:331) —
// counts real Ticket rows per series instead of trusting a stored balance,
// so remote's stock figures actually reflect tickets issued via LAN and
// pushed to Supabase (see api/sync/push.py).
async function getTicketStatsBySeries(seriesIds) {
  const ids = [...new Set(seriesIds)].filter((id) => id != null);
  if (!ids.length) return {};

  const { data, error } = await supabaseAdmin()
    .from("api_ticket")
    .select("series_id, issued_at")
    .in("series_id", ids);
  if (error) throw error;

  // Django's TIME_ZONE is UTC (backend/backend/settings.py), so "today"
  // for the beginning-of-day balance is the UTC calendar day.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const stats = {};
  for (const row of data) {
    const entry = stats[row.series_id] || { totalIssued: 0, issuedBeforeToday: 0 };
    entry.totalIssued += 1;
    if (row.issued_at && new Date(row.issued_at) < todayStart) entry.issuedBeforeToday += 1;
    stats[row.series_id] = entry;
  }
  return stats;
}

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
    // Mirrors TicketViewSet.get_queryset's start_date/end_date (backend/api/views/viewsets.py:246-257),
    // which filters created_at against Philippine-time day boundaries (backend/api/views/helpers.py) —
    // match that offset here so a date picked in the UI returns the same rows on LAN and remote.
    dateField: "created_at",
    limit: 200,
    shape: (rows) => rows.map(shapeTicket),
  },
  "ticket-series": {
    table: "api_ticketseries",
    select: "*, ticket_form:api_ticketform(id,name,price), issued_to:api_user(id,username)",
    order: { column: "created_at", ascending: false },
    filters: ["requisition"],
    withTicketStats: true,
    shape: (rows, stats) => rows.map((s) => shapeTicketSeries(s, stats[s.id])),
  },
  requisitions: {
    table: "api_requisition",
    select: "*, ticket_series:api_ticketseries(*, ticket_form:api_ticketform(id,name,price))",
    order: { column: "date_requested", ascending: false },
    filters: ["is_archived", "status"],
    withTicketStats: true,
    shape: (rows, stats) => rows.map((r) => shapeRequisition(r, stats)),
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

    if (resource.dateField) {
      const { start_date: startDate, end_date: endDate } = filters;
      if (startDate) query = query.gte(resource.dateField, `${startDate}T00:00:00+08:00`);
      if (endDate) query = query.lte(resource.dateField, `${endDate}T23:59:59.999+08:00`);
    }

    // Mirrors TicketViewSet.get_queryset's `search` (backend/api/views/viewsets.py) —
    // Ticket ID / Vehicle / Driver / Issued By, the columns the Collection Log
    // table actually shows, plus the same fuzzy status-substring shortcut.
    // vehicle/driver live on joined tables, which supabase-js's .or() can't
    // reach directly, so resolve matching ids first and OR those in by id.
    if (key === "tickets" && filters.search?.trim()) {
      // PostgREST's or=() DSL treats "," and "()" as syntax — strip them from
      // user input so a search term can't break out of this filter expression.
      const term = filters.search.trim().replace(/[,()]/g, "");
      if (term) {
        const like = `%${term}%`;
        const [{ data: vehicleMatches, error: vehicleErr }, { data: driverMatches, error: driverErr }] =
          await Promise.all([
            supabaseAdmin().from("api_vehicle").select("id").ilike("plate_number", like),
            supabaseAdmin().from("api_driver").select("id").or(`first_name.ilike.${like},last_name.ilike.${like}`),
          ]);
        if (vehicleErr) throw vehicleErr;
        if (driverErr) throw driverErr;

        const orParts = [`id.ilike.${like}`, `active_user_name.ilike.${like}`];
        if (vehicleMatches?.length) orParts.push(`vehicle_id.in.(${vehicleMatches.map((v) => v.id).join(",")})`);
        if (driverMatches?.length) orParts.push(`driver_id.in.(${driverMatches.map((d) => d.id).join(",")})`);

        // Prefix match, mirrors TicketViewSet.get_queryset (backend/api/views/viewsets.py)
        // — matching a short substring anywhere in the word (the old ".includes") let
        // e.g. "an" or "el" flood results with every cancelled ticket.
        const lowered = term.toLowerCase();
        if (lowered.length >= 3 && "cancelled".startsWith(lowered)) orParts.push("status.eq.CANCELLED");
        if (lowered.length >= 3 && "collected".startsWith(lowered)) orParts.push("status.neq.CANCELLED");

        query = query.or(orParts.join(","));
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

    let stats = {};
    if (resource.withTicketStats) {
      const seriesIds = key === "requisitions"
        ? data.flatMap((r) => (r.ticket_series || []).map((s) => s.id))
        : data.map((s) => s.id);
      stats = await getTicketStatsBySeries(seriesIds);
    }

    if (page) {
      res.status(200).json({ results: resource.shape ? resource.shape(data, stats) : data, count });
      return;
    }

    res.status(200).json(resource.shape ? resource.shape(data, stats) : data);
  } catch (err) {
    console.error(`remote/resource/${key} error:`, err);
    res.status(500).json({ detail: "Failed to load data" });
  }
}
