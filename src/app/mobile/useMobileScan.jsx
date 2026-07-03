import { useState, useEffect, useMemo, useCallback } from "react";
import { apiService } from "../../lib/api-service";

export function useMobileScan() {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [ticketSeries, setTicketSeries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [scannedVehicle, setScannedVehicle] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [mode, setMode] = useState("QUEUE");
  const [selectedSeriesId, setSelectedSeriesId] = useState(
    () => localStorage.getItem("lastSelectedSeriesId") || ""
  );
  const [ticketQuantity, setTicketQuantity] = useState(1);
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

  useEffect(() => {
    Promise.all([
      apiService.getVehicles(),
      apiService.getDrivers(),
      apiService.request("/ticket-series/"),
    ])
      .then(([v, d, s]) => {
        setVehicles(v);
        setDrivers(d);
        setTicketSeries(s);
      })
      .catch(() => setError("Failed to load data. Check your connection."))
      .finally(() => setLoading(false));
  }, []);

  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.status === "ACTIVE"),
    [drivers]
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
      if (vehicle.status === "QUEUED") {
        setMode("QUEUE");
      }

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
    if (!selectedDriver) return setError("Select a driver.");

    if (mode === "QUEUE" && !selectedSeriesId) {
      return setError("Select a ticket series for queue mode.");
    }

    if (selectedDriver.status !== "ACTIVE") {
      return setError("Selected driver is not active.");
    }

    try {
      setSubmitting(true);

      if (mode === "ROAM") {
        if (scannedVehicle.status === "QUEUED") {
          throw new Error("Vehicle is already in the queue — cannot log roaming.");
        }

        const log = await apiService.createRoamingLog({
          vehicle: scannedVehicle.id,
          driver: selectedDriver.id,
          notes: "Recorded via mobile QR scan",
        });
        setResult(`Roaming log #${log.id} recorded for ${scannedVehicle.plate_number}`);
      } else {
        if (!["AVAILABLE", "DISPATCHED"].includes(scannedVehicle.status)) {
          throw new Error(`Vehicle is ${scannedVehicle.status} — cannot issue ticket.`);
        }

        const series = availableSeries.find((s) => String(s.id) === String(selectedSeriesId));
        if (!series) throw new Error("Selected series not found or depleted.");

        const quantity = Math.max(1, parseInt(ticketQuantity) || 1);
        if (quantity > series.pcs) {
          throw new Error(`Only ${series.pcs} ticket(s) remaining in this series.`);
        }

        let nextStartNo = parseInt(series.start_no);
        const issuedIds = [];
        for (let i = 0; i < quantity; i++) {
          const payload = {
            id: `${nextStartNo}`,
            vehicle_id: scannedVehicle.id,
            driver_id: selectedDriver.id,
            route: scannedVehicle.route_detail?.id || null,
            series_id: parseInt(selectedSeriesId),
            status: "ISSUED",
            is_verified: false,
          };
          if (ticketFee > 0) payload.collection_amount = ticketFee;

          const ticket = await apiService.createTicket(payload);
          issuedIds.push(ticket.id);
          nextStartNo += 1;
        }

        await apiService.patch(`/vehicles/${scannedVehicle.id}/`, {
          status: "QUEUED",
        });

        setResult(
          quantity > 1
            ? `Tickets ${issuedIds[0]}–${issuedIds[issuedIds.length - 1]} issued for ${scannedVehicle.plate_number}`
            : `Ticket ${issuedIds[0]} issued for ${scannedVehicle.plate_number}`
        );

        const freshSeries = await apiService.request("/ticket-series/");
        setTicketSeries(freshSeries);
        const freshVehicles = await apiService.getVehicles();
        setVehicles(freshVehicles);
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
    selectedSeriesId,
    setSelectedSeriesId,
    ticketQuantity,
    setTicketQuantity,
    activeDrivers,
    availableSeries,
    ticketFee,
    submitting,
    result,
    error,
    handleQrResult,
    handleDriverChange,
    handleSubmit,
    reset,
  };
}
