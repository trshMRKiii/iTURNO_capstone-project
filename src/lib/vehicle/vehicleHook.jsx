import { useState, useEffect } from "react";
import { apiService } from "../api-service";
import { useConfirm } from "../../components/ui/ToastConfirmContext";

export const DESTINATION = "San Fernando";

const EMPTY_FORM = {
  plate_number: "",
  route: "",
  transportation_id: "",
  franchise_number: "",
  operator_address: "",
  qr_code: "",
  status: "AVAILABLE",
  active_driver: null,
};

export const STATUS_COLOR = {
  AVAILABLE: "veh-status--available",
  ON_TRIP: "veh-status--trip",
  MAINTENANCE: "veh-status--maintenance",
};

export const STATUS_LABEL = {
  AVAILABLE: "Available",
  ON_TRIP: "On Trip",
  MAINTENANCE: "Under Maintenance",
};

// field wrapper for modal
export const Field = ({ label, children }) => (
  <div className="veh-field">
    <label className="veh-label">{label}</label>
    {children}
  </div>
);

// Route selection/input block used inside the vehicle form.
export const RouteField = ({
  routes,
  form,
  setForm,
  routeMode,
  setRouteMode,
  newOrigin,
  setNewOrigin,
  routeError,
  editing,
  selectedRoute,
  destination = DESTINATION,
}) => (
  <Field label="Route">
    {routeMode === "select" && (
      <>
        <select
          className="veh-select"
          value={form.route}
          onChange={(e) =>
            setForm({
              ...form,
              route: e.target.value ? Number(e.target.value) : "",
            })
          }
        >
          <option value="">— Select a route —</option>
          {routes
            .filter((r) => r.is_active)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
        </select>
        <div className="veh-route-actions">
          <button
            type="button"
            className="veh-text-btn veh-text-btn--navy"
            onClick={() => {
              setRouteMode("new");
              setNewOrigin("");
            }}
          >
            + Add new route
          </button>
          {editing && form.route && (
            <button
              type="button"
              className="veh-text-btn veh-text-btn--gold"
              onClick={() => {
                setRouteMode("edit");
                setNewOrigin(selectedRoute?.origin ?? "");
              }}
            >
              Edit this route's origin
            </button>
          )}
        </div>
      </>
    )}

    {(routeMode === "new" || routeMode === "edit") && (
      <>
        <div className="veh-route-input-row">
          <input
            type="text"
            className="veh-input"
            placeholder="e.g. Lingsat"
            value={newOrigin}
            onChange={(e) => setNewOrigin(e.target.value)}
            autoFocus
          />
          <span className="veh-route-dest">— {destination}</span>
        </div>
        <p className="veh-field-hint">
          Destination is always <strong>{destination}</strong>. Enter the origin
          only.
        </p>
        <button
          type="button"
          className="veh-text-btn veh-text-btn--navy"
          onClick={() => {
            setRouteMode("select");
            setNewOrigin("");
          }}
        >
          ← {routeMode === "edit" ? "Cancel edit" : "Back to route list"}
        </button>
      </>
    )}

    {routeError && <p className="veh-field-error">{routeError}</p>}
  </Field>
);

// Custom hook for vehicle modal state, API calls, and CRUD behavior.
export function useVehicle() {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [transportationTypes, setTransportationTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [routeMode, setRouteMode] = useState("select");
  const [newOrigin, setNewOrigin] = useState("");
  const [routeError, setRouteError] = useState("");

  const showConfirm = useConfirm();

  useEffect(() => {
    fetchDrivers();
    fetchRoutes();
    fetchTransportationTypes();
    fetchVehicles();
  }, []);

  const fetchDrivers = async () => {
    try {
      setError(null);
      const data = await apiService.getDrivers();
      setDrivers(data);
    } catch (err) {
      console.error(err.message);
    }
  };

  const fetchRoutes = async () => {
    try {
      const data = await apiService.getRoutes();
      setRoutes(data);
    } catch (err) {
      console.error(err.message);
    }
  };

  const fetchTransportationTypes = async () => {
    try {
      const data = await apiService.getPUVTypes();
      setTransportationTypes(data);
    } catch (err) {
      console.error(err.message);
    }
  };

  const fetchVehicles = async () => {
    try {
      const data = await apiService.getVehicles();
      setVehicles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Find the currently selected route object for the active route id.
  const selectedRoute = routes.find(
    (r) => r.id === Number(form.route) || r.id === form.route,
  );

  const resolveRouteId = async () => {
    if (routeMode === "select") {
      if (!form.route) return { routeId: null, err: "Please select a route." };
      return { routeId: form.route, err: null };
    }

    const origin = newOrigin.trim();
    if (!origin) return { routeId: null, err: "Please enter a route origin." };

    if (routeMode === "new") {
      const existing = routes.find(
        (r) => r.origin.toLowerCase() === origin.toLowerCase(),
      );
      if (existing) return { routeId: existing.id, err: null };
      const created = await apiService.createRoute({ origin });
      setRoutes((prev) => [...prev, created]);
      return { routeId: created.id, err: null };
    }

    if (routeMode === "edit") {
      const existing = routes.find(
        (r) =>
          r.origin.toLowerCase() === origin.toLowerCase() &&
          Number(r.id) !== Number(form.route),
      );
      if (existing) return { routeId: existing.id, err: null };
      const updated = await apiService.updateRoute(Number(form.route), {
        origin,
      });
      setRoutes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      return { routeId: updated.id, err: null };
    }

    return { routeId: null, err: "Unknown route mode." };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setRouteError("");
    const { routeId, err } = await resolveRouteId();
    if (err) {
      setRouteError(err);
      return;
    }

    const confirmMsg = editing ? "Confirm update?" : "Confirm registry?";
    const confirmed = await showConfirm(confirmMsg);
    if (!confirmed) return;

    try {
      const plate = form.plate_number.replace(/\s+/g, "").toUpperCase();
      const qrCode = editing
        ? form.qr_code
        : `QR-${plate}-${Date.now().toString(36).toUpperCase()}`;

      const payload = {
        plate_number: form.plate_number,
        route: routeId,
        transportation_id: form.transportation_id || null,
        franchise_number: form.franchise_number,
        operator_address: form.operator_address,
        qr_code: qrCode,
        status: form.status,
        active_driver: form.active_driver || null,
      };

      if (editing) {
        await apiService.updateVehicle(editing.id, payload);
      } else {
        await apiService.createVehicle(payload);
      }

      fetchVehicles();
      closeModal();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (vehicle) => {
    setEditing(vehicle);
    setForm({
      plate_number: vehicle.plate_number,
      route: vehicle.route || "",
      transportation_id: vehicle.transportation_id || "",
      franchise_number: vehicle.franchise_number || "",
      operator_address: vehicle.operator_address || "",
      qr_code: vehicle.qr_code || "",
      status: vehicle.status,
      active_driver: vehicle.active_driver,
    });
    setRouteMode("select");
    setNewOrigin("");
    setRouteError("");
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setRouteMode("select");
    setNewOrigin("");
    setRouteError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setRouteMode("select");
    setNewOrigin("");
    setRouteError("");
  };

  const handleDelete = async (id) => {
    const confirmed = await showConfirm("Are you sure you want to delete this vehicle record?");
    if (!confirmed) return;
    try {
      await apiService.deleteVehicle(id);
      fetchVehicles();
    } catch (err) {
      setError(err.message);
    }
  };

  const activeDrivers = drivers.filter((d) => d.status === "ACTIVE");

  return {
    vehicles,
    drivers,
    routes,
    loading,
    error,
    editing,
    isModalOpen,
    form,
    setForm,
    routeMode,
    setRouteMode,
    newOrigin,
    setNewOrigin,
    routeError,
    selectedRoute,
    activeDrivers,
    transportationTypes,
    handleSubmit,
    handleEdit,
    handleAdd,
    closeModal,
    handleDelete,
  };
}
