import { useState, useEffect, useRef } from "react";
import { apiService } from "../../../lib/api-service";
import { focusFirstError } from "../../../lib/focusFirstError";
import { useFeedback } from "../../../components/ui/kit";

export const DESTINATION = "San Fernando";

const EMPTY_FORM = {
  plate_number: "",
  route: "",
  transportation_id: "",
  franchise_number: "",
  franchise_expiration_date: "",
  operator_address: "",
  qr_code: "",
  status: "AVAILABLE",
  owner_driver: null,
};

export const STATUS_COLOR = {
  AVAILABLE: "veh-status--available",
  QUEUED: "veh-status--queued",
};

export const STATUS_LABEL = {
  AVAILABLE: "Active",
  QUEUED: "Queued",
};

// Drives the sidebar checklist; `fields` are the required keys in each section.
export const VEHICLE_SECTIONS = [
  { title: "Vehicle information", fields: ["transportation_id", "plate_number", "franchise_number", "franchise_expiration_date"] },
  { title: "Route", fields: ["route", "owner_driver"] },
];

const validateVehicleForm =(form, editing, routeMode, newOrigin) => {
  const errors = {};
  if (routeMode === "select" ? !form.route : !newOrigin.trim()) {
    errors.route = routeMode === "select" ? "Please select a route." : "Please enter a route origin.";
  }
  if (!editing && !form.plate_number.trim()) errors.plate_number = "Plate number is required.";
  if (!form.transportation_id) errors.transportation_id = "Transportation type is required.";
  if (!form.franchise_number) errors.franchise_number = "Franchise number is required.";
  else if (!/^\d{2}-\d{5}$/.test(form.franchise_number)) {
    errors.franchise_number = "Use the format YY-NNNNN (7 digits).";
  }
  if (!form.franchise_expiration_date) {
    errors.franchise_expiration_date = "Franchise expiration date is required.";
  }
  if (!form.owner_driver) errors.owner_driver = "Operator name is required.";
  return errors;
};

// Formats free-typed input into LLL-1234 as the user types, auto-inserting the dash.
export const formatPlateNumber = (value) => {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const letters = clean.slice(0, 3).replace(/[0-9]/g, "");
  const digits = clean.slice(letters.length, letters.length + 4).replace(/[^0-9]/g, "");
  if (!letters) return "";
  return digits ? `${letters}-${digits}` : letters;
};

// Builds a display address string from a driver's location fields.
export const buildDriverAddress = (driver) => {
  if (!driver) return "";
  return [driver.street, driver.barangay, driver.city, driver.province]
    .filter(Boolean)
    .join(", ");
};

// field wrapper for modal
export const Field = ({ label, required, optional, children }) => (
  <div className="veh-field">
    <label className="veh-label">
      {label}
      {required && <span className="veh-required"> *</span>}
      {optional && <span className="veh-optional"> (optional)</span>}
    </label>
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
  <Field label="Route" required>
    {routeMode === "select" && (
      <>
        <select
          className={`veh-select${routeError ? " veh-input--error" : ""}`}
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
            className={`veh-input${routeError ? " veh-input--error" : ""}`}
            placeholder="e.g. Lingsat"
            value={newOrigin}
            style={{ textTransform: "uppercase" }}
            onChange={(e) => setNewOrigin(e.target.value.toUpperCase())}
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
  const initialFormRef = useRef(EMPTY_FORM);
  const [routeMode, setRouteMode] = useState("select");
  const [newOrigin, setNewOrigin] = useState("");
  const [routeError, setRouteError] = useState("");

  // Validates on the fly only after a failed submit, so a field's error clears once it's filled in.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Always-on validation drives the sidebar checklist and progress bar.
  const liveErrors = validateVehicleForm(form, editing, routeMode, newOrigin);
  const fieldErrors = submitAttempted ? liveErrors : {};
  const { confirmAction } = useFeedback();

  useEffect(() => {
    fetchDrivers();
    fetchRoutes();
    fetchTransportationTypes();
    fetchVehicles();
  }, []);

  const fetchDrivers = async () => {
    try {
      setError(null);
      const data = await apiService.getDrivers({ is_archived: "false" });
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
      const data = await apiService.getVehicles({ is_archived: "false" });
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

    const origin = newOrigin.trim().toUpperCase();
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
    if (Object.keys(validateVehicleForm(form, editing, routeMode, newOrigin)).length > 0) {
      setSubmitAttempted(true);
      focusFirstError(".veh-modal");
      return;
    }
    confirmAction({
      title: editing ? "Update vehicle?" : "Register vehicle?",
      confirmLabel: editing ? "Save changes" : "Register",
      busyLabel: "Saving…",
      tone: "primary",
      run: async () => {
        try {
          // Resolved here (not before the confirm dialog) so a cancelled confirm doesn't leave a stray new route,
          // and so a failed route create is reported instead of silently blocking the save.
          const { routeId, err } = await resolveRouteId();
          if (err) {
            setRouteError(err);
            return { error: { title: "Route problem", message: err } };
          }
          const plate = form.plate_number.replace(/\s+/g, "").toUpperCase();
          const qrCode = editing
            ? form.qr_code
            : `QR-${plate}-${Date.now().toString(36).toUpperCase()}`;

          const payload = {
            plate_number: form.plate_number,
            route: routeId,
            transportation_id: form.transportation_id || null,
            franchise_number: form.franchise_number,
            franchise_expiration_date: form.franchise_expiration_date || null,
            operator_address: form.operator_address,
            qr_code: qrCode,
            status: form.status,
            owner_driver: form.owner_driver || null,
          };

          if (editing) {
            await apiService.updateVehicle(editing.id, payload);
          } else {
            await apiService.createVehicle(payload);
          }

          fetchVehicles();
          resetModal();
          return { success: { title: editing ? "Vehicle updated" : "Vehicle registered", message: `${payload.plate_number} was saved.` } };
        } catch (err) {
          setError(err.message);
          return { error: { title: "Couldn't save vehicle", message: err.message || "Nothing was changed. Try again." } };
        }
      },
    });
  };

  const handleEdit = (vehicle) => {
    setEditing(vehicle);
    const editForm = {
      plate_number: vehicle.plate_number,
      route: vehicle.route || "",
      transportation_id: vehicle.transportation_id || "",
      franchise_number: vehicle.franchise_number || "",
      franchise_expiration_date: vehicle.franchise_expiration_date || "",
      operator_address: vehicle.operator_address || "",
      qr_code: vehicle.qr_code || "",
      status: vehicle.status,
      owner_driver: vehicle.owner_driver,
    };
    initialFormRef.current = editForm;
    setForm(editForm);
    setRouteMode("select");
    setNewOrigin("");
    setRouteError("");
    setSubmitAttempted(false);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    initialFormRef.current = EMPTY_FORM;
    setForm(EMPTY_FORM);
    setRouteMode("select");
    setNewOrigin("");
    setRouteError("");
    setSubmitAttempted(false);
    setIsModalOpen(true);
  };

  const resetModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setRouteMode("select");
    setNewOrigin("");
    setRouteError("");
  };

  const isDirty = () =>
    JSON.stringify(form) !== JSON.stringify(initialFormRef.current) || newOrigin.trim() !== "";

  // Closing with unsaved input asks first; resetModal closes without asking (used after a save).
  const closeModal = () => {
    if (!isDirty()) return resetModal();
    return confirmAction({
      title: editing ? "Discard changes?" : "Discard registration?",
      message: editing ? "Your edits haven't been saved and will be lost." : "What you've entered won't be saved.",
      confirmLabel: "Discard",
      busyLabel: "Discarding…",
      run: async () => { resetModal(); return null; },
    });
  };

  const handleArchive = (id) => confirmAction({
    title: "Archive this vehicle?",
    message: "You can restore it from Settings → Archive.",
    confirmLabel: "Archive",
    busyLabel: "Archiving…",
    run: async () => {
      try {
        await apiService.patch(`/vehicles/${id}/`, { is_archived: true });
        fetchVehicles();
        return { success: { title: "Vehicle archived", message: "It's now in Settings → Archive." } };
      } catch (err) {
        setError(err.message);
        return { error: { title: "Couldn't archive vehicle", message: err.message || "Nothing was changed. Try again." } };
      }
    },
  });

  const activeDrivers = drivers.filter((d) => d.status === "ACTIVE");

  return {
    vehicles,
    drivers,
    routes,
    activeDrivers,
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
    fieldErrors,
    liveErrors,
    selectedRoute,
    transportationTypes,
    handleSubmit,
    handleEdit,
    handleAdd,
    closeModal,
    handleArchive,
  };
}
