import { format } from "date-fns";

/**
 * OperationsService handles core business logic and data transformations.
 * Decouples domain logic from React components (SRP).
 */
export const OperationsService = {
  getShiftBatchName(dateInput, shifts) {
    const date = new Date(dateInput);
    const hour = date.getHours();

    for (const shift of Object.values(shifts || {})) {
      if (hour >= shift.startHour && hour < shift.endHour) {
        return shift.name;
      }
    }
    return "Other";
  },

  //filter para ticketing
  isDriverBusy(driverId, tickets, vehicles) {
    const hasActiveTicket = tickets.some(
      (t) => t.driver?.id === driverId && t.status === "ISSUED",
    );
    const isOnTrip = vehicles.some(
      (v) => v.active_driver === driverId && v.status === "ON_TRIP",
    );
    return hasActiveTicket || isOnTrip;
  },

  isVehicleBusy(vehicleId, tickets) {
    return tickets.some(
      (t) => t.vehicle?.id === vehicleId && t.status === "ISSUED",
    );
  },

  // Returns the effective batch name for a ticket, respecting late issuances.
  // A late ticket (is_late=true) belongs to its intended_batch, not its actual issue time.
  // Prefers the batch key stored on the ticket (set once at creation) so that
  // editing the batch schedule later doesn't reshuffle already-issued tickets.
  getEffectiveBatchName(ticket, shifts) {
    if (ticket.is_late && ticket.intended_batch) {
      return shifts?.[ticket.intended_batch]?.name || ticket.intended_batch;
    }
    if (ticket.batch) {
      return shifts?.[ticket.batch]?.name || ticket.batch;
    }
    return this.getShiftBatchName(ticket.issued_at, shifts);
  },

  calculateBatchStats(tickets, shifts) {
    const activeTickets = tickets.filter((t) => t.status !== "CANCELLED");
    const stats = {};

    Object.entries(shifts || {}).forEach(([key, shift]) => {
      const batchTickets = activeTickets.filter(
        (t) => this.getEffectiveBatchName(t, shifts) === shift.name,
      );
      stats[key] = {
        total: batchTickets.reduce(
          (sum, t) => sum + Number(t.collection_amount || 0),
          0,
        ),
        count: batchTickets.filter((t) => t.status !== "COLLECTED").length,
        pending: batchTickets.filter((t) => !t.is_verified).length,
      };
    });

    stats.totalVerified = activeTickets
      .filter((t) => t.is_verified)
      .reduce((sum, t) => sum + Number(t.collection_amount || 0), 0);

    return stats;
  },

  /**
   * Groups tickets by route and calculates financial summaries for reporting.
   */
  getRouteTallyReport(tickets, vehicles, dateFilter, batchFilter, shifts) {
    const filtered = tickets.filter((t) => {
      if (t.status === "CANCELLED") return false;
      const ticketDateStr = t.issued_at.split("T")[0];
      if (ticketDateStr !== dateFilter) return false;

      if (batchFilter !== "ALL") {
        return this.getEffectiveBatchName(t, shifts) === batchFilter;
      }
      return true;
    });

    const matrix = {};
    const finance = {};

    // Initialize routes
    const allRoutes = Array.from(new Set(vehicles.map((v) => v.route)));
    allRoutes.forEach((r) => {
      matrix[r] = [];
      finance[r] = { trips: 0, revenue: 0 };
    });

    filtered.forEach((t) => {
      const vehicle = vehicles.find((v) => v.id === t.vehicle?.id);
      if (vehicle) {
        matrix[t.route].push({
          id: t.id,
          unit: vehicle.plate_number,
          plate: vehicle.plate_number,
          time: format(new Date(t.issued_at), "h:mm a"),
        });

        finance[t.route].trips += 1;
        finance[t.route].revenue += Number(t.collection_amount || 0);
      }
    });

    return { matrix, finance };
  },
};
