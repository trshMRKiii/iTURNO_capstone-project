import { useState, useEffect, useMemo, useCallback } from "react";
import { apiService } from "../../lib/api-service";
import { useTerminalPrice } from "../../lib/useTerminalPrice";

const LAST_TICKET_FORM_KEY = "dispatch:lastTicketFormId";

export function useMobileScan() {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [ticketForms, setTicketForms] = useState([]);
  const [ticketSeries, setTicketSeries] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const [scannedVehicle, setScannedVehicle] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [mode, setMode] = useState("QUEUE");
  const [ticketQuantity, setTicketQuantity] = useState(1);

  // Dispatch (check-out) settings — denomination is remembered across sessions,
  // mirroring Dispatch's "Dispatch Settings" panel.
  const [dispatchTicketFormId, setDispatchTicketFormIdState] = useState(
    () => localStorage.getItem(LAST_TICKET_FORM_KEY) || ""
  );
  const setDispatchTicketFormId = (value) => {
    setDispatchTicketFormIdState(value);
    if (value) {
      localStorage.setItem(LAST_TICKET_FORM_KEY, value);
    } else {
      localStorage.removeItem(LAST_TICKET_FORM_KEY);
    }
  };
  const [dispatchQuantity, setDispatchQuantity] = useState(1);

  // Roam settings — same denomination-pick-and-quantity shape as Dispatch;
  // the server draws the physical numbers FIFO (see roamTicket), so Mobile
  // never has to know which series/range is currently active.
  const LAST_ROAM_TICKET_FORM_KEY = "mobile:lastRoamTicketFormId";
  const [roamTicketFormId, setRoamTicketFormIdState] = useState(
    () => localStorage.getItem(LAST_ROAM_TICKET_FORM_KEY) || ""
  );
  const setRoamTicketFormId = (value) => {
    setRoamTicketFormIdState(value);
    if (value) {
      localStorage.setItem(LAST_ROAM_TICKET_FORM_KEY, value);
    } else {
      localStorage.removeItem(LAST_ROAM_TICKET_FORM_KEY);
    }
  };

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [vehicleDriverMap, setVehicleDriverMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vehicleDriverMap") || "{}");
    } catch {
      return {};
    }
  });

  const { terminalPrice } = useTerminalPrice();

  const fetchData = useCallback(async () => {
    const [v, d, tf, s, t] = await Promise.all([
      apiService.getVehicles(),
      apiService.getDrivers(),
      apiService.getTicketForms(),
      apiService.request("/ticket-series/"),
      apiService.getTickets({ status: "QUEUED" }),
    ]);
    setVehicles(v);
    setDrivers(d);
    setTicketForms(tf);
    setTicketSeries(s);
    setTickets(t);
  }, []);

  useEffect(() => {
    fetchData()
      .catch(() => setError("Failed to load data. Check your connection."))
      .finally(() => setLoading(false));
  }, [fetchData]);

  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.status === "ACTIVE"),
    [drivers]
  );

  // Remaining stock per denomination (ticket form) — same computation Dispatch uses
  // to populate its denomination dropdown. `s.remaining` (from the backend) already
  // accounts for tickets issued so far; falling back to the full span only covers
  // series the API hasn't annotated yet.
  const denominationOptions = useMemo(() => {
    return ticketForms
      .map((form) => {
        const remaining = ticketSeries
          .filter((s) => String(s.ticket_form) === String(form.id))
          .reduce((sum, s) => {
            const start = parseInt(s.start_no) || 0;
            const end = parseInt(s.end_no) || 0;
            const total = Math.max(end - start + 1, 0);
            return sum + (s.remaining ?? total);
          }, 0);
        return { ...form, remaining };
      })
      .filter((form) => form.remaining > 0);
  }, [ticketForms, ticketSeries]);

  const ticketFee = useMemo(() => {
    const form = denominationOptions.find((f) => String(f.id) === String(roamTicketFormId));
    return Number(form?.price || 0);
  }, [denominationOptions, roamTicketFormId]);

  // 1-based position of a QUEUED vehicle within its route's FIFO line, or null
  // if it isn't currently queued. Mirrors the ordering dispatch.jsx uses.
  const getQueuePosition = useCallback(
    (vehicle) => {
      if (!vehicle || vehicle.status !== "QUEUED") return null;
      const routeId = vehicle.route_detail?.id ?? vehicle.route ?? null;
      const queueForRoute = vehicles
        .filter(
          (v) =>
            v.status === "QUEUED" &&
            !v.is_archived &&
            (v.route_detail?.id ?? v.route ?? null) === routeId
        )
        .map((v) => {
          const ticket = tickets.find(
            (t) => t.vehicle?.id === v.id && t.status === "QUEUED"
          );
          return {
            id: v.id,
            queuedAt: ticket?.issued_at
              ? new Date(ticket.issued_at).getTime()
              : Number.POSITIVE_INFINITY,
          };
        })
        .sort((a, b) => a.queuedAt - b.queuedAt);

      const idx = queueForRoute.findIndex((v) => v.id === vehicle.id);
      return idx === -1 ? null : idx + 1;
    },
    [vehicles, tickets]
  );

  const queuePosition = useMemo(
    () => getQueuePosition(scannedVehicle),
    [getQueuePosition, scannedVehicle]
  );

  const saveDriverForVehicle = (vehicleId, driverId) => {
    setVehicleDriverMap((prev) => {
      const next = { ...prev, [vehicleId]: driverId };
      localStorage.setItem("vehicleDriverMap", JSON.stringify(next));
      return next;
    });
  };

  const handleQrResult = useCallback(
    (decodedText) => {
      setError(null);
      setResult(null);

      const vehicle = vehicles.find(
        (v) =>
          v.qr_code === decodedText ||
          v.plate_number === decodedText ||
          String(v.id) === decodedText
      );

      if (!vehicle) {
        setError(`No vehicle found for QR: "${decodedText}"`);
        setScannedVehicle(null);
        setSelectedDriver(null);
        return;
      }

      setScannedVehicle(vehicle);
      setMode(vehicle.status === "QUEUED" ? "DISPATCH" : "QUEUE");

      const rememberedDriverId = vehicleDriverMap[vehicle.id];
      const rememberedDriver = rememberedDriverId
        ? drivers.find((d) => d.id === rememberedDriverId && d.status === "ACTIVE")
        : null;

      if (rememberedDriver) {
        setSelectedDriver(rememberedDriver);
      } else if (vehicle.active_driver) {
        setSelectedDriver(
          drivers.find((d) => d.id === vehicle.active_driver) || null
        );
      } else {
        setSelectedDriver(null);
      }
    },
    [vehicles, drivers, vehicleDriverMap]
  );

  const handleDriverChange = (driverId) => {
    const driver = drivers.find((d) => d.id === parseInt(driverId)) || null;
    setSelectedDriver(driver);
    if (scannedVehicle && driver) {
      saveDriverForVehicle(scannedVehicle.id, driver.id);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setResult(null);

    if (!scannedVehicle) return setError("Scan a vehicle QR first.");

    if (mode === "DISPATCH") {
      if (!dispatchTicketFormId) {
        return setError("Select a denomination before dispatching.");
      }
    } else {
      if (!selectedDriver) return setError("Select a driver.");
      if (mode === "ROAM" && !roamTicketFormId) {
        return setError("Select a denomination to issue a ticket.");
      }
      if (selectedDriver.status !== "ACTIVE") {
        return setError("Selected driver is not active.");
      }
    }

    try {
      setSubmitting(true);

      if (mode === "DISPATCH") {
        if (scannedVehicle.status !== "QUEUED") {
          throw new Error("Vehicle is not currently queued.");
        }
        if (getQueuePosition(scannedVehicle) !== 1) {
          throw new Error(
            `This vehicle is #${getQueuePosition(scannedVehicle)} in line — it must be first for its route before dispatching.`
          );
        }

        const quantity = Math.max(1, parseInt(dispatchQuantity) || 1);
        await apiService.dispatchTicket(scannedVehicle.id, {
          ticketFormId: dispatchTicketFormId,
          quantity,
        });

        setResult(`${scannedVehicle.plate_number} dispatched successfully.`);
        await fetchData();
      } else if (mode === "QUEUE") {
        // Check-in only — denomination/quantity are chosen later, at Dispatch.
        if (scannedVehicle.status !== "AVAILABLE") {
          throw new Error(`Vehicle is ${scannedVehicle.status} — cannot check in.`);
        }

        const driverHasActiveTicket = tickets.some(
          (t) => t.driver?.id === selectedDriver.id && t.status === "QUEUED"
        );
        if (driverHasActiveTicket) {
          throw new Error("This driver already has an active ticket.");
        }

        const newTicket = await apiService.createTicket({
          id: `Q-${crypto.randomUUID()}`,
          vehicle_id: scannedVehicle.id,
          driver_id: selectedDriver.id,
          route: scannedVehicle.route_detail?.id || null,
          status: "QUEUED",
          mode: "QUEUE",
          is_verified: false,
        });

        setResult(`Vehicle checked into queue (ticket ${newTicket.id}).`);
        await fetchData();
      } else if (mode === "ROAM") {
        if (scannedVehicle.status !== "AVAILABLE") {
          throw new Error(`Vehicle is ${scannedVehicle.status} — cannot issue ticket.`);
        }

        const quantity = Math.max(1, parseInt(ticketQuantity) || 1);
        const cap = Number(terminalPrice?.amount || 0);
        if (cap > 0 && ticketFee * quantity !== cap) {
          throw new Error(
            `Total collection amount (₱${(ticketFee * quantity).toFixed(2)}) must match the terminal price of ₱${cap.toFixed(2)}.`
          );
        }

        // Server draws the physical numbers FIFO across series (same mechanism
        // Dispatch uses), so stock depletion and numbering stay in sync — see
        // roam_ticket / _consume_series_fifo (backend/api/views/viewsets.py).
        const issued = await apiService.roamTicket(scannedVehicle.id, selectedDriver.id, {
          ticketFormId: roamTicketFormId,
          quantity,
        });
        const issuedIds = issued.map((t) => t.id);

        setResult(
          quantity > 1
            ? `Tickets ${issuedIds[0]}–${issuedIds[issuedIds.length - 1]} issued for ${scannedVehicle.plate_number}`
            : `Ticket ${issuedIds[0]} issued for ${scannedVehicle.plate_number}`
        );
        await fetchData();
      }

      setScannedVehicle(null);
      setSelectedDriver(null);
      setTicketQuantity(1);
    } catch (err) {
      setError(err.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setScannedVehicle(null);
    setSelectedDriver(null);
    setError(null);
    setResult(null);
    setTicketQuantity(1);
  };

  return {
    loading,
    scannedVehicle,
    selectedDriver,
    mode,
    setMode,
    queuePosition,
    roamTicketFormId,
    setRoamTicketFormId,
    ticketQuantity,
    setTicketQuantity,
    activeDrivers,
    ticketFee,
    denominationOptions,
    dispatchTicketFormId,
    setDispatchTicketFormId,
    dispatchQuantity,
    setDispatchQuantity,
    submitting,
    result,
    error,
    handleQrResult,
    handleDriverChange,
    handleSubmit,
    reset,
  };
}
