import { useState, useEffect, useMemo } from "react";
import { apiService } from "./api-service";
import { useTerminalPrice } from "./useTerminalPrice";

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

// ─── Custom Hook ──────────────────────────────────────────────────────────────
export function useTicket(userRole = "") {
  const [tickets, setTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [issuanceType, setIssuanceType] = useState("QUEUE");
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
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [vehicleDriverMap, setVehicleDriverMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vehicleDriverMap") || "{}");
    } catch {
      return {};
    }
  });

  const { terminalPrice } = useTerminalPrice();

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

    const isRoam = issuanceType === "ROAM";

    if (!selectedVehicle) {
      setIssueError("Please select a vehicle.");
      return;
    }
    if (!selectedDriver) {
      setIssueError("Please select a driver.");
      return;
    }
    if (isRoam && !selectedSeriesId) {
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

    // Queue check-ins no longer pick a denomination/series or quantity here —
    // that's chosen at Dispatch, where the physical ticket is actually given out.
    if (!isRoam) {
      try {
        setIssuingTicket(true);
        const newTicket = await apiService.createTicket({
          id: `Q-${crypto.randomUUID()}`,
          vehicle_id: selectedVehicle.id,
          driver_id: selectedDriver.id,
          route: selectedVehicle.route_detail?.id || null,
          status: "ISSUED",
          mode: "QUEUE",
          is_verified: false,
        });
        setSuccessMessage(`Vehicle checked into queue (ticket ${newTicket.id}).`);
        fetchTickets();
        fetchVehicles();
        setSelectedVehicle(null);
        setSelectedDriver(null);
        setShowDriverModal(false);
        setTimeout(() => setSuccessMessage(""), 3000);
      } catch (err) {
        setIssueError(err.message || "Error checking in vehicle");
      } finally {
        setIssuingTicket(false);
      }
      return;
    }

    const quantity = Math.max(1, parseInt(ticketQuantity) || 1);

    const series = availableSeries.find((s) => String(s.id) === String(selectedSeriesId));
    if (!series) {
      setIssueError("Selected ticket series not found.");
      return;
    }
    if (quantity > series.pcs) {
      setIssueError(`Only ${series.pcs} ticket(s) remaining in this series.`);
      return;
    }

    const cap = Number(terminalPrice?.amount || 0);
    if (cap > 0 && ticketFee * quantity !== cap) {
      setIssueError(
        `Total collection amount (₱${(ticketFee * quantity).toFixed(2)}) must match the terminal price of ₱${cap.toFixed(2)}.`,
      );
      return;
    }

    try {
      setIssuingTicket(true);
      let nextStartNo = parseInt(series.start_no);
      const issuedIds = [];
      const issuanceGroup = crypto.randomUUID();

      for (let i = 0; i < quantity; i++) {
        const ticketPayload = {
          id: `${nextStartNo}`,
          vehicle_id: selectedVehicle.id,
          driver_id: selectedDriver.id,
          route: selectedVehicle.route_detail?.id || null,
          series_id: parseInt(selectedSeriesId),
          status: "ISSUED",
          mode: "UNLOAD",
          is_verified: false,
          issuance_group: issuanceGroup,
        };
        if (ticketFee > 0) {
          ticketPayload.collection_amount = ticketFee;
        }
        const newTicket = await apiService.createTicket(ticketPayload);
        issuedIds.push(newTicket.id);
        nextStartNo += 1;
      }

      setSuccessMessage(
        quantity > 1
          ? `Tickets ${issuedIds[0]}–${issuedIds[issuedIds.length - 1]} issued successfully.`
          : `Ticket ${issuedIds[0]} issued successfully.`
      );
      fetchTickets();
      fetchVehicles();
      fetchTicketSeries();
      setSelectedVehicle(null);
      setSelectedDriver(null);
      setShowDriverModal(false);
      setTicketQuantity(1);

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
    issuanceType,
    setIssuanceType,
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
    ticketQuantity,
    setTicketQuantity,
    // Actions
    fetchTickets,
    handleRouteChange,
    handleVehicleChange,
    selectVehicleById,
    handleDriverChange,
    handleIssueTicket,
    ticketFee,
    terminalPrice,
  };
}
