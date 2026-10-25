import { useState, useEffect, useMemo } from "react";
import { apiService } from "../../../lib/api-service";
import { getPhDateString } from "../../../lib/phDate";
import { useQueueSocket } from "../../../lib/useQueueSocket";
import { getExpiryStatus, getIwpStatus } from "../driver/driver-utils";
export const statusColor = {
  QUEUED: "queue-status--queued",
  COLLECTED: "queue-status--collected"
};
export const getTicketDisplayId = (ticket) => ticket?.queue_code || String(ticket?.id || "").replace(/^TICKET-/i, "");
export const ticketsNeeded = (vehicle, fee) => {
  const cap = Number(vehicle?.terminal_price || 0);
  return cap > 0 && fee > 0 && cap % fee === 0 ? cap / fee : 1;
};
export function useQueue(userRole = "") {
  const [tickets, setTickets] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [issuanceType, setIssuanceType] = useState("QUEUE");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [issuingTicket, setIssuingTicket] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [issueError, setIssueError] = useState("");
  const [ticketSeries, setTicketSeries] = useState([]);
  const [chosenSeriesId, setSelectedSeriesId] = useState(
    () => localStorage.getItem("lastSelectedSeriesId") || ""
  );
  const [seriesOverrideId, setSeriesOverrideId] = useState("");
  const [vehicleDriverMap, setVehicleDriverMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vehicleDriverMap") || "{}");
    } catch {
      return {};
    }
  });
  const fetchTickets = async () => {
    try {
      const today = getPhDateString();
      setTickets(await apiService.getTickets({ start_date: today, end_date: today }));
    } catch {
    }
  };
  const fetchVehicles = async () => {
    try {
      setVehicles(await apiService.getVehicles({ is_archived: "false" }));
    } catch {
    }
  };
  const fetchDrivers = async () => {
    try {
      setDrivers(await apiService.getDrivers({ is_archived: "false" }));
    } catch {
    }
  };
  const fetchTicketSeries = async () => {
    try {
      const data = await apiService.request("/ticket-series/");
      setTicketSeries(data);
    } catch {
    }
  };
  useEffect(() => {
    fetchTickets();
    fetchVehicles();
    fetchDrivers();
    fetchTicketSeries();
  }, []);
  const refreshQueueState = () => {
    fetchTickets();
    fetchVehicles();
    fetchTicketSeries();
  };
  useQueueSocket(refreshQueueState);
  const updateSelectedSeriesId = (id) => {
    setSelectedSeriesId(id);
    setSeriesOverrideId("");
    localStorage.setItem("lastSelectedSeriesId", id);
  };
  const saveDriverForVehicle = (vehicleId, driverId) => {
    setVehicleDriverMap((prev) => {
      const next = { ...prev, [vehicleId]: driverId };
      localStorage.setItem("vehicleDriverMap", JSON.stringify(next));
      return next;
    });
  };
  const resolveDriver = (vehicle) => {
    const rememberedDriver = vehicleDriverMap[vehicle.id] ? drivers.find((d) => d.id === vehicleDriverMap[vehicle.id] && d.status === "ACTIVE") : null;
    return rememberedDriver || vehicle.active_driver && drivers.find((d) => d.id === vehicle.active_driver) || null;
  };
  const selectVehicleById = (vehicleId) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    setSelectedVehicle(vehicle || null);
    setIssueError("");
    setSelectedDriver(vehicle ? resolveDriver(vehicle) : null);
  };
  const handleVehicleChange = (e) => {
    selectVehicleById(parseInt(e.target.value));
  };
  const handleDriverChange = (driverId) => {
    const driver = drivers.find((d) => d.id === driverId) || null;
    setSelectedDriver(driver);
    setShowDriverModal(false);
    if (selectedVehicle && driver) {
      saveDriverForVehicle(selectedVehicle.id, driver.id);
    }
  };
  const driverHasActiveTicket = (driver) => !!driver && tickets.some((t) => t.driver?.id === driver.id && t.status === "QUEUED");
  const handleIssueTicket = async (recipes) => {
    const vehicle = selectedVehicle;
    const driver = selectedDriver;
    setSuccessMessage("");
    setIssueError("");
    const fail = (error) => {
      setIssueError(error);
      return { error };
    };
    const isRoam = issuanceType === "ROAM";
    if (!vehicle) {
      return fail("Please select a vehicle.");
    }
    if (!driver) {
      return fail("Please select a driver.");
    }
    if (isRoam && !selectedSeriesId) {
      return fail("Please select a ticket form / series.");
    }
    if (driverHasActiveTicket(driver)) {
      return fail("This driver already has an active ticket.");
    }
    if (vehicle.status !== "AVAILABLE") {
      return fail(`Vehicle is currently ${vehicle.status} and cannot be ticketed.`);
    }
    if (driver.status !== "ACTIVE") {
      return fail("Selected driver is not active and cannot be assigned.");
    }
    if (getExpiryStatus(vehicle.franchise_expiration_date) === "expired") {
      return fail(`${vehicle.plate_number}'s franchise has expired \u2014 renew it before checking in.`);
    }
    if (getIwpStatus(driver) === "expired") {
      return fail("Selected driver's IWP has expired \u2014 renew it before checking in.");
    }
    if (!isRoam) {
      try {
        setIssuingTicket(true);
        const newTicket = await apiService.createTicket({
          id: `Q-${crypto.randomUUID()}`,
          vehicle_id: vehicle.id,
          driver_id: driver.id,
          route: vehicle.route_detail?.id || null,
          status: "QUEUED",
          mode: "QUEUE",
          is_verified: false
        });
        setSuccessMessage("Vehicle checked into queue.");
        fetchTickets();
        fetchVehicles();
        setSelectedVehicle(null);
        setSelectedDriver(null);
        setShowDriverModal(false);
        setTimeout(() => setSuccessMessage(""), 3e3);
        return { ticket: newTicket };
      } catch (err) {
        return fail(err.message || "Error checking in vehicle");
      } finally {
        setIssuingTicket(false);
      }
    }
    const plan = issuePlan(recipes);
    if (plan.some(({ series }) => !series)) {
      return fail("Selected ticket series not found.");
    }
    const short = plan.find(({ series, quantity: q }) => q > series.pcs);
    if (short) {
      return fail(`Only ${short.series.pcs} ticket(s) remaining in ${short.series.ticket_form_label || "this series"}.`);
    }
    const cap = Number(vehicle.terminal_price || 0);
    const total = plan.reduce((sum, { series, quantity: q }) => sum + Number(series.ticket_form_price || 0) * q, 0);
    if (cap > 0 && total !== cap) {
      return fail(`The ${vehicle.transportation_name} terminal price of \u20B1${cap.toFixed(2)} isn't a multiple of this ticket form's \u20B1${ticketFee.toFixed(2)} \u2014 pick a different ticket form.`);
    }
    try {
      setIssuingTicket(true);
      const issuedIds = [];
      const issuedTickets = [];
      const issuanceGroup = crypto.randomUUID();
      for (const { series, quantity: q } of plan) {
        const fee = Number(series.ticket_form_price || 0);
        let nextStartNo = parseInt(series.start_no);
        for (let i = 0; i < q; i++) {
          const ticketPayload = {
            id: `${nextStartNo}`,
            vehicle_id: vehicle.id,
            driver_id: driver.id,
            route: vehicle.route_detail?.id || null,
            series_id: parseInt(series.id),
            // Roam pays the toll on the spot — the backend always issues these
            // as COLLECTED/verified regardless of what's sent here (see the
            // is_roam branch in TicketSerializer.create()).
            status: "COLLECTED",
            mode: "UNLOAD",
            is_verified: true,
            issuance_group: issuanceGroup
          };
          if (fee > 0) {
            ticketPayload.collection_amount = fee;
          }
          const newTicket = await apiService.createTicket(ticketPayload);
          issuedIds.push(newTicket.id);
          issuedTickets.push(newTicket);
          nextStartNo += 1;
        }
      }
      setSuccessMessage(
        issuedIds.length > 1 ? `Tickets ${plan.length > 1 ? issuedIds.join(", ") : `${issuedIds[0]}\u2013${issuedIds[issuedIds.length - 1]}`} issued successfully.` : `Ticket ${issuedIds[0]} issued successfully.`
      );
      fetchTickets();
      fetchVehicles();
      fetchTicketSeries();
      setSelectedVehicle(null);
      setSelectedDriver(null);
      setShowDriverModal(false);
      setTimeout(() => setSuccessMessage(""), 3e3);
      return { ticket: issuedTickets[0] };
    } catch (err) {
      return fail(err.message || "Error issuing ticket");
    } finally {
      setIssuingTicket(false);
    }
  };
  const availableVehicles = useMemo(
    () => vehicles.filter((v) => v.status === "AVAILABLE"),
    [vehicles]
  );
  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.status === "ACTIVE"),
    [drivers]
  );
  const availableSeries = useMemo(() => {
    return ticketSeries.map((s) => ({
      ...s,
      pcs: s.remaining ?? 0
    })).filter((s) => s.pcs > 0 && s.requisition_status !== "PENDING").sort(
      (a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0)
    );
  }, [ticketSeries]);
  const denominations = useMemo(() => {
    const seen = /* @__PURE__ */ new Set();
    return availableSeries.filter((s) => {
      const key = s.ticket_form_label || "Unspecified";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [availableSeries]);
  const forms = useMemo(() => {
    const byId = /* @__PURE__ */ new Map();
    ticketSeries.forEach((s) => {
      if (s.ticket_form) byId.set(s.ticket_form, { id: s.ticket_form, label: s.ticket_form_label, price: Number(s.ticket_form_price || 0) });
    });
    return [...byId.values()];
  }, [ticketSeries]);
  const exhaustedLabel = useMemo(() => {
    const chosen = ticketSeries.find((s) => String(s.id) === String(chosenSeriesId));
    const label = chosen?.ticket_form_label || "Unspecified";
    return chosen && !denominations.some((s) => (s.ticket_form_label || "Unspecified") === label) ? label : "";
  }, [ticketSeries, denominations, chosenSeriesId]);
  const selectedSeriesId = useMemo(() => {
    const chosen = availableSeries.find((s) => String(s.id) === String(chosenSeriesId));
    if (!chosen) return denominations[0] ? String(denominations[0].id) : "";
    const label = chosen.ticket_form_label || "Unspecified";
    const override = availableSeries.find((s) => String(s.id) === String(seriesOverrideId));
    if (override && (override.ticket_form_label || "Unspecified") === label) return String(override.id);
    const head = denominations.find((s) => (s.ticket_form_label || "Unspecified") === label);
    return String(head.id);
  }, [availableSeries, denominations, chosenSeriesId, seriesOverrideId]);
  const ticketFee = useMemo(() => {
    const series = availableSeries.find((s) => String(s.id) === String(selectedSeriesId));
    return Number(series?.ticket_form_price || 0);
  }, [availableSeries, selectedSeriesId]);
  const issuePlan = (recipes = {}) => {
    const recipe = recipes[String(Number(selectedVehicle?.terminal_price || 0))] ?? [];
    const mixed = recipe.map(({ form, qty }) => ({ series: denominations.find((s) => s.ticket_form === form), quantity: qty }));
    if (mixed.length > 0 && mixed.every(({ series, quantity }) => series && quantity <= series.pcs)) return mixed;
    return [{
      series: availableSeries.find((s) => String(s.id) === String(selectedSeriesId)),
      quantity: ticketsNeeded(selectedVehicle, ticketFee)
    }];
  };
  return {
    // State
    tickets,
    vehicles,
    drivers,
    issuanceType,
    setIssuanceType,
    selectedVehicle,
    setSelectedVehicle,
    selectedDriver,
    setSelectedDriver,
    showDriverModal,
    setShowDriverModal,
    issuingTicket,
    successMessage,
    issueError,
    // Computed
    availableVehicles,
    activeDrivers,
    availableSeries: denominations,
    allSeries: availableSeries,
    forms,
    exhaustedLabel,
    setSeriesOverrideId,
    selectedSeriesId,
    setSelectedSeriesId: updateSelectedSeriesId,
    issuePlan,
    // Actions
    fetchTickets,
    fetchTicketSeries,
    refreshQueueState,
    handleVehicleChange,
    selectVehicleById,
    resolveDriver,
    handleDriverChange,
    handleIssueTicket,
    driverHasActiveTicket,
    ticketFee
  };
}
