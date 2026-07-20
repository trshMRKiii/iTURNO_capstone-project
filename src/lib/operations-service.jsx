import { format } from "date-fns";

/**
 * OperationsService handles core business logic and data transformations.
 * Decouples domain logic from React components (SRP).
 */
export const OperationsService = {
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

  /**
   * Groups tickets by route and calculates financial summaries for reporting.
   */
  getRouteTallyReport(tickets, vehicles, dateFilter) {
    const filtered = tickets.filter((t) => {
      if (t.status === "CANCELLED") return false;
      const ticketDateStr = t.issued_at.split("T")[0];
      return ticketDateStr === dateFilter;
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
