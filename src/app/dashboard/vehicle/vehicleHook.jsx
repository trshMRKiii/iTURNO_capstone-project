import React, { useState, useEffect, useMemo, useRef } from "react";
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
  if (!editing) {
    if (!form.plate_number) errors.plate_number = "Plate number is required.";
    else if (!/^[A-Z]{3}-\d{3,4}$/.test(form.plate_number)) {
      errors.plate_number = "Use the format ABC-1234 (3 letters, then 3–4 digits).";
    }
  }
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

const LETTER = /[A-Z]/;
const DIGIT = /\d/;
export const PLATE_SEGMENTS = [
  { max: 3, char: LETTER, placeholder: "ABC", width: "6rem" },
  { max: 4, char: DIGIT, placeholder: "1234" },
];
export const FRANCHISE_SEGMENTS = [
  { max: 2, char: DIGIT, placeholder: "YY", width: "5rem" },
  { max: 5, char: DIGIT, placeholder: "NNNNN" },
];

// Fixed-length boxes joined by dashes (plate ABC-1234, franchise YY-NNNNN). Each box only
// takes its own kind of character, jumps ahead when full, steps back on Backspace when
// empty, and a pasted value is spread across the boxes. The form value is the dashed string.
export const SegmentedInput = ({ value, onChange, segments, className, label }) => {
  const refs = useRef([]);
  const parts = segments.map((_, i) => (value || "").split("-")[i] || "");
  const emit = (next) => {
    while (next.length && !next[next.length - 1]) next.pop();
    onChange(next.join("-"));
  };
  const clean = (text, seg) => [...text.toUpperCase()].filter((c) => seg.char.test(c)).join("").slice(0, seg.max);

  const handleChange = (i, e) => {
    const text = clean(e.target.value, segments[i]);
    emit(parts.map((p, j) => (j === i ? text : p)));
    if (text.length === segments[i].max) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    let rest = e.clipboardData.getData("text").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!rest) return;
    e.preventDefault();
    const next = segments.map((seg) => {
      let out = "";
      while (rest && out.length < seg.max && seg.char.test(rest[0])) {
        out += rest[0];
        rest = rest.slice(1);
      }
      return out;
    });
    emit(next);
    refs.current[Math.max(next.findLastIndex(Boolean), 0)]?.focus();
  };

  return (
    <div className="veh-segmented">
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span>-</span>}
          <input
            ref={(el) => (refs.current[i] = el)}
            type="text"
            inputMode={seg.char === DIGIT ? "numeric" : "text"}
            autoCapitalize="characters"
            className={className}
            placeholder={seg.placeholder}
            maxLength={seg.max}
            aria-label={`${label} part ${i + 1} of ${segments.length}`}
            style={{ width: seg.width, flex: seg.width ? "none" : 1, textAlign: seg.width ? "center" : undefined }}
            value={parts[i]}
            onChange={(e) => handleChange(i, e)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !parts[i] && i > 0) {
                e.preventDefault();
                refs.current[i - 1]?.focus();
              }
            }}
          />
        </React.Fragment>
      ))}
    </div>
  );
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
  const { notify, confirmAction } = useFeedback();

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

  const handleArchive = (id) => {
    if (vehicles.find((v) => v.id === id)?.status === "QUEUED") {
      notify.error({
        title: "Can't archive this vehicle",
        message: "It's in the queue. Dispatch it or remove it from the queue first.",
      });
      return;
    }
    confirmAction({
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
  };

  // Memoized: vehicle.jsx resets the operator search box whenever this list changes,
  // so a fresh array each render would wipe whatever the user is typing.
  const activeDrivers = useMemo(() => drivers.filter((d) => d.status === "ACTIVE"), [drivers]);

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
