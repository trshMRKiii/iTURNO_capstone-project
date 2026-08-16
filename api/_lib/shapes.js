// Reshapes raw Supabase rows into the same JSON shape Django's DRF
// serializers (backend/api/serializers.py) produce, so the existing React
// components — built against the Django API — can be reused unmodified for
// remote reads. Supabase/PostgREST can embed FK relationships but can't
// compute concatenated names or cross-table aggregates, so those are
// filled in here in JS.
//
// Kept intentionally close to serializers.py's field names/logic — if that
// file changes, this needs the matching update.

export function shapeRouteDetail(r) {
  // Matches the RouteSerializer Vehicle/Ticket's route_detail actually use
  // (serializers.py:61 — shadowed everywhere else by a second same-named
  // class at serializers.py:215, but Vehicle's `route_detail = RouteSerializer(...)`
  // bound to the first one at class-definition time, before the shadow).
  if (!r) return null;
  return {
    id: r.id,
    origin: r.origin,
    full_name: `${r.origin} - San Fernando`,
    destination: "San Fernando",
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function shapeDriver(d) {
  if (!d) return null;
  return {
    id: d.id,
    iwp_number: d.iwp_number,
    last_name: d.last_name,
    first_name: d.first_name,
    middle_name: d.middle_name,
    gender: d.gender,
    birthdate: d.birthdate,
    province: d.province,
    city: d.city,
    barangay: d.barangay,
    street: d.street,
    photo: d.photo || null, // relative path — LAN-only media server, won't render remotely
    contact: d.contact,
    qr_code: d.qr_code,
    status: d.status,
    is_archived: d.is_archived,
    created_at: d.created_at,
    updated_at: d.updated_at,
    name: `${d.last_name}, ${d.first_name}`.trim(),
  };
}

export function shapeVehicle(v) {
  if (!v) return null;
  const driver = v.driver_obj;
  return {
    id: v.id,
    plate_number: v.plate_number,
    transportation_id: v.transportation?.id ?? v.transportation_id ?? null,
    transportation_name: v.transportation?.name ?? null,
    franchise_number: v.franchise_number,
    route: v.route?.id ?? v.route ?? null,
    route_detail: shapeRouteDetail(v.route),
    operator_address: v.operator_address,
    qr_code: v.qr_code,
    status: v.status,
    active_driver: driver?.id ?? v.active_driver ?? null,
    active_driver_name: driver ? `${driver.last_name}, ${driver.first_name}`.trim() : null,
    is_archived: v.is_archived,
    created_at: v.created_at,
    updated_at: v.updated_at,
  };
}

export function shapeTicket(t) {
  if (!t) return null;
  return {
    id: t.id,
    vehicle: shapeVehicle(t.vehicle),
    driver: shapeDriver(t.driver),
    active_user: t.active_user_id ?? null,
    active_user_name: t.active_user_name || null, // real column now, see Ticket.save() in models.py
    route: t.route?.id ?? t.route ?? null,
    route_name: t.route ? `${t.route.origin} - San Fernando` : "",
    mode: t.mode,
    series: t.series
      ? {
          id: t.series.id,
          series_no: t.series.series_no,
          ticket_form: t.series.ticket_form?.id ?? null,
          ticket_form_label: t.series.ticket_form?.name ?? null,
          ticket_form_price: t.series.ticket_form?.price ?? null,
          start_no: t.series.start_no,
          end_no: t.series.end_no,
        }
      : null,
    remittance_batch: t.remittance_batch,
    status: t.status,
    collection_amount: t.collection_amount,
    is_verified: t.is_verified,
    issued_at: t.issued_at,
    dispatched_at: t.dispatched_at,
    nullified_at: t.nullified_at,
    reason: t.reason,
    issuance_group: t.issuance_group,
    queue_code: t.queue_code,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

export function shapeRoutesWithStats(routes, tickets) {
  // Mirrors RouteSerializer.get_checked_in_today / get_revenue_in_range
  // (serializers.py:253-264) — distinct vehicles checked in within the date
  // range, and total collected on tickets dispatched within it.
  return routes.map((r) => {
    const routeTickets = tickets.filter((t) => t.route === r.id);
    const checked_in_today = new Set(routeTickets.map((t) => t.vehicle)).size;
    const revenue_in_range = routeTickets
      .filter((t) => t.dispatched_at)
      .reduce((sum, t) => sum + (Number(t.collection_amount) || 0), 0);
    return {
      id: r.id,
      origin: r.origin,
      is_active: r.is_active,
      created_at: r.created_at,
      updated_at: r.updated_at,
      full_name: `${r.origin} - San Fernando`,
      checked_in_today,
      revenue_in_range: Math.round(revenue_in_range * 100) / 100,
    };
  });
}

export function shapeRequisition(r) {
  if (!r) return null;
  return {
    id: r.id,
    date_requested: r.date_requested,
    requested_by: r.requested_by,
    requested_by_name: r.requested_by_name || null,
    approved_by_name: r.approved_by_name,
    status: r.status,
    total_value: r.total_value,
    is_archived: r.is_archived,
    ticket_series: (r.ticket_series || []).map(shapeTicketSeries),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function shapeTicketSeries(s) {
  if (!s) return null;
  const originalPcs = Math.max((Number(s.end_no) || 0) - (Number(s.start_no) || 0) + 1, 0);
  return {
    id: s.id,
    series_no: s.series_no,
    ticket_form: s.ticket_form?.id ?? s.ticket_form ?? null,
    ticket_form_label: s.ticket_form?.name ?? null,
    ticket_form_price: s.ticket_form?.price ?? null,
    pad_no: s.pad_no,
    box_no: s.box_no,
    start_no: s.start_no,
    end_no: s.end_no,
    unit_value: s.unit_value,
    total_value: s.total_value,
    requisition: s.requisition,
    issued_to: s.issued_to?.id ?? s.issued_to ?? null,
    issued_to_name: s.issued_to?.username ?? null,
    date_issued: s.date_issued,
    // beginning/remaining (serializers.py:304-319) need "tickets issued
    // before today" / "total tickets issued" against this series, which
    // isn't practical to compute generically here — left at the original
    // pcs count as a reasonable approximation, not exact parity.
    beginning: originalPcs,
    remaining: originalPcs,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

export function shapeRemittanceBatch(b) {
  if (!b) return null;
  return {
    ...b,
    deposits: b.deposits || [],
    collections: b.collections || [],
    issued_by_name: b.issued_by_name_computed || null,
  };
}

export function shapeRoamingLog(l) {
  if (!l) return null;
  return {
    id: l.id,
    vehicle: l.vehicle?.id ?? l.vehicle ?? null,
    vehicle_plate: l.vehicle?.plate_number ?? null,
    driver: l.driver?.id ?? l.driver ?? null,
    driver_name: l.driver ? `${l.driver.last_name}, ${l.driver.first_name}`.trim() : null,
    recorded_by: l.recorded_by?.id ?? l.recorded_by ?? null,
    recorded_by_name: l.recorded_by
      ? (`${l.recorded_by.first_name} ${l.recorded_by.last_name}`.trim() || l.recorded_by.username)
      : null,
    notes: l.notes,
    recorded_at: l.recorded_at,
  };
}

export function shapeAuditLog(a) {
  if (!a) return null;
  return {
    id: a.id,
    user: a.user?.id ?? a.user ?? null,
    user_name: a.user
      ? (`${a.user.first_name} ${a.user.last_name}`.trim() || a.user.username)
      : "System",
    action: a.action,
    model_name: a.model_name,
    object_id: a.object_id,
    object_repr: a.object_repr,
    changes: a.changes,
    created_at: a.created_at,
  };
}
