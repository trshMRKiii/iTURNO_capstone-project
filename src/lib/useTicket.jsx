import { useState, useEffect, useMemo } from "react";
import { OperationsService } from "./operations-service";
import { SHIFTS } from "./constants";
import { apiService } from "./api-service";
import { useShifts } from "./useShifts";

// ─── Constants ─────────────────────────────────────────────────────────────────
export const statusColor = {
  ISSUED: "ticket-status--issued",
  DISPATCHED: "ticket-status--dispatched",
  COLLECTED: "ticket-status--collected",
  CANCELLED: "ticket-status--cancelled",
  RETURNED: "ticket-status--returned",
};

// ─── Helper Functions ────────────────────────────────────────────────────────
export const formatTime = (dateString) => {
  try {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "N/A";
  }
};

// Returns the current batch ("Batch 1" | "Batch 2" | null)
export const getCurrentBatch = (shifts = SHIFTS) => {
  const hour = new Date().getHours();
  const activeShifts = Object.keys(shifts || {}).length ? shifts : SHIFTS;
  for (const shift of Object.values(activeShifts)) {
    if (hour >= shift.startHour && hour < shift.endHour) {
      return shift.name;
    }
  }
  return null;
};

// Returns true if this vehicle already has a non-cancelled ticket in Batch 1 today
export const hadBatch1TicketToday = (vehicleId, tickets, shifts = SHIFTS) => {
  const todayStr = new Date().toISOString().split("T")[0];
  const activeShifts = Object.keys(shifts || {}).length ? shifts : SHIFTS;
  const batch1Name =
    activeShifts.BATCH_1?.name || Object.values(activeShifts)[0]?.name;
  return tickets.some((t) => {
    if (t.vehicle?.id !== vehicleId) return false;
    if (t.status === "CANCELLED") return false;
    const ticketDate = t.issued_at?.split("T")[0];
    return (
      ticketDate === todayStr &&
      OperationsService.getShiftBatchName(t.issued_at, activeShifts) ===
        batch1Name
    );
  });
};

// ─── Custom Hook ──────────────────────────────────────────────────────────────
export function useTicket(userRole = "") {
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [issuingTicket, setIssuingTicket] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [issueError, setIssueError] = useState("");

  const [ticketSeries, setTicketSeries] = useState([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState(
    () => localStorage.getItem("lastSelectedSeriesId") || ""
  );
  const [vehicleDriverMap, setVehicleDriverMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vehicleDriverMap") || "{}");
    } catch {
      return {};
    }
  });

  const { shifts: scheduleShifts } = useShifts();

  // Fetch data
  const fetchTickets = async () => {
    try {
      setLoading(true);
      setTickets(await apiService.getTickets());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      setVehicles(await apiService.getVehicles());
    } catch {
      /* silent */
    }
  };

  const fetchDrivers = async () => {
    try {
      setDrivers(await apiService.getDrivers());
    } catch {
      /* silent */
    }
  };

  const fetchTicketSeries = async () => {
    try {
      const data = await apiService.request("/ticket-series/");
      setTicketSeries(data);
    } catch {
      /* silent */
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchTickets();
    fetchVehicles();
    fetchDrivers();
    fetchTicketSeries();
  }, []);

  // Filter and sort tickets based on search term
  useEffect(() => {
    const filtered = tickets.filter(
      (t) =>
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.vehicle?.plate_number || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (t.driver?.name || "").toLowerCase().includes(searchTerm.toLowerCase()),
    );
    const sorted = filtered.sort(
      (a, b) => new Date(b.issued_at) - new Date(a.issued_at),
    );
    setFilteredTickets(sorted.slice(0, 10));
  }, [searchTerm, tickets]);

  const updateSelectedSeriesId = (id) => {
    setSelectedSeriesId(id);
    localStorage.setItem("lastSelectedSeriesId", id);
  };

  const saveDriverForVehicle = (vehicleId, driverId) => {
    setVehicleDriverMap((prev) => {
      const next = { ...prev, [vehicleId]: driverId };
      localStorage.setItem("vehicleDriverMap", JSON.stringify(next));
      return next;
    });
  };

  // Route change handler
  const handleRouteChange = (e) => {
    setSelectedRouteId(e.target.value);
    setSelectedVehicle(null);
    setSelectedDriver(null);
    setIssueError("");
  };

  // Vehicle change handler
  const selectVehicleById = (vehicleId) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    setSelectedVehicle(vehicle || null);

    setIssueError("");
    if (vehicle) {
      const rememberedDriverId = vehicleDriverMap[vehicle.id];
      const rememberedDriver = rememberedDriverId
        ? drivers.find((d) => d.id === rememberedDriverId && d.status === "ACTIVE")
        : null;

      if (rememberedDriver) {
        setSelectedDriver(rememberedDriver);
      } else if (vehicle.active_driver) {
        setSelectedDriver(
          drivers.find((d) => d.id === vehicle.active_driver) || null,
        );
      } else {
        setSelectedDriver(null);
      }
    } else {
      setSelectedDriver(null);
    }
  };

  const handleVehicleChange = (e) => {
    selectVehicleById(parseInt(e.target.value));
  };

  // Driver change handler
  const handleDriverChange = (driverId) => {
    const driver = drivers.find((d) => d.id === driverId) || null;
    setSelectedDriver(driver);
    setShowDriverModal(false);
    if (selectedVehicle && driver) {
      saveDriverForVehicle(selectedVehicle.id, driver.id);
    }
  };

  // Issue ticket handler
  const handleIssueTicket = async () => {
    setSuccessMessage("");
    setIssueError("");

    if (!selectedVehicle) {
      setIssueError("Please select a vehicle.");
      return;
    }
    if (!selectedDriver) {
      setIssueError("Please select a driver.");
      return;
    }
    if (!selectedSeriesId) {
      setIssueError("Please select a ticket form / series.");
      return;
    }

    const driverHasActiveTicket = tickets.some(
      (t) =>
        t.driver?.id === selectedDriver.id && ["ISSUED"].includes(t.status),
    );

    if (driverHasActiveTicket) {
      setIssueError("This driver already has an active ticket.");
      return;
    }

    // Vehicle must be AVAILABLE
    if (!["AVAILABLE", "DISPATCHED"].includes(selectedVehicle.status)) {
      setIssueError(
        `Vehicle is currently ${selectedVehicle.status} and cannot be ticketed.`,
      );
      return;
    }

    // Driver must be ACTIVE
    if (selectedDriver.status !== "ACTIVE") {
      setIssueError("Selected driver is not active and cannot be assigned.");
      return;
    }

    try {
      setIssuingTicket(true);
      const series = availableSeries.find((s) => String(s.id) === String(selectedSeriesId));
      const ticketId = `${series.start_no}`;

      const ticketPayload = {
        id: ticketId,
        vehicle_id: selectedVehicle.id,
        driver_id: selectedDriver.id,
        route: selectedVehicle.route_detail?.id || null,
        series_id: parseInt(selectedSeriesId),
        status: "ISSUED",
        is_verified: false,
      };
      if (ticketFee > 0) {
        ticketPayload.collection_amount = ticketFee;
      }
      const newTicket = await apiService.createTicket(ticketPayload);

      await apiService.patch(`/vehicles/${selectedVehicle.id}/`, {
        status: "QUEUED",
      });

      setSuccessMessage(`Ticket ${newTicket.id} issued successfully.`);
      fetchTickets();
      fetchVehicles();
      fetchTicketSeries();
      setSelectedVehicle(null);
      setSelectedDriver(null);
      setShowDriverModal(false);

      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setIssueError(err.message || "Error issuing ticket");
    } finally {
      setIssuingTicket(false);
    }
  };

  // Computed values
  const routes = useMemo(() => {
    const map = new Map();
    vehicles.forEach((v) => {
      if (v.route_detail?.id != null && !map.has(v.route_detail.id)) {
        map.set(v.route_detail.id, v.route_detail);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.full_name || "").localeCompare(b.full_name || ""),
    );
  }, [vehicles]);

  const availableVehicles = useMemo(
    () =>
      vehicles.filter(
        (v) =>
          ["AVAILABLE", "DISPATCHED"].includes(v.status) &&
          (!selectedRouteId || String(v.route_detail?.id) === String(selectedRouteId)),
      ),
    [vehicles, selectedRouteId],
  );

  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.status === "ACTIVE"),
    [drivers],
  );

  const availableSeries = useMemo(() => {
    return ticketSeries
      .map((s) => ({
        ...s,
        pcs: (parseInt(s.end_no) || 0) - (parseInt(s.start_no) || 0) + 1,
      }))
      .filter((s) => s.pcs > 0)
      .sort((a, b) => (parseInt(a.start_no) || 0) - (parseInt(b.start_no) || 0));
  }, [ticketSeries]);

  const ticketFee = useMemo(() => {
    const series = availableSeries.find((s) => String(s.id) === String(selectedSeriesId));
    return Number(series?.ticket_form_price || 0);
  }, [availableSeries, selectedSeriesId]);

  return {
    // State
    tickets,
    filteredTickets,
    searchTerm,
    setSearchTerm,
    loading,
    error,
    vehicles,
    drivers,
    selectedRouteId,
    setSelectedRouteId,
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
    routes,
    availableVehicles,
    activeDrivers,
    availableSeries,
    selectedSeriesId,
    setSelectedSeriesId: updateSelectedSeriesId,
    // Actions
    fetchTickets,
    handleRouteChange,
    handleVehicleChange,
    selectVehicleById,
    handleDriverChange,
    handleIssueTicket,
    ticketFee,
  };
}
