import { useState, useEffect, useRef } from "react";
import { apiService } from "../../../lib/api-service";
import { focusFirstError } from "../../../lib/focusFirstError";
import { useFeedback } from "../../../components/ui/kit";
import { buildDriverPayload, normalizeDriverForm, validateDriverForm } from "./driver-utils";

const EMPTY_FORM = {
  first_name: "",
  middle_name: "",
  last_name: "",
  iwp_number: "",
  iwp_expiration_date: "",
  gender: "",
  birthdate: "",
  province: "La Union",
  city: "",
  barangay: "",
  street: "",
  contact: "",
  status: "ACTIVE",
  is_archived: false,
  photo: null,
};

// Field defined OUTSIDE component to prevent remount (fixes input deselect bug)
export const Field = ({ label, children }) => (
  <div>
    <label
      className="block text-xs font-semibold uppercase tracking-wider mb-1"
      style={{ color: "#1a2744" }}
    >
      {label}
    </label>
    {children}
  </div>
);

export const inputCls =
  "w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2";

export function useDriver() {
  const [drivers, setDrivers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Only starts validating on the fly once a submit attempt has failed —
  // recomputed on every render so a field's error clears the moment it's filled in.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const initialFormRef = useRef(EMPTY_FORM);

  const fieldErrors = submitAttempted ? validateDriverForm(form) : {};

  const { notify, confirmAction } = useFeedback();

  useEffect(() => {
    fetchDrivers();
    fetchTickets();
  }, []);

  const fetchDrivers = async () => {
    try {
      const data = await apiService.getDrivers({ is_archived: "false" });
      setDrivers((data || []).map(normalizeDriverForm));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTickets = async () => {
    try {
      const data = await apiService.getTickets({ status: "QUEUED" });
      setTickets(data);
    } catch {
      /* non-critical */
    }
  };

  // Check if driver has an active (QUEUED) ticket
  const isDriverOnActiveTicket = (driverId) =>
    tickets.some((t) => t.driver?.id === driverId && t.status === "QUEUED");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateDriverForm(form);
    if (Object.keys(errors).length > 0) {
      setSubmitAttempted(true);
      focusFirstError(".drv-modal");
      setError("Please fill in the highlighted fields.");
      return;
    }
    // Guard: cannot set INACTIVE if driver has an active ticket
    if (
      editing &&
      form.status === "INACTIVE" &&
      isDriverOnActiveTicket(editing.id)
    ) {
      setError(
        "Cannot set driver to Inactive — this driver has an active ticket. Resolve the ticket first.",
      );
      return;
    }
    confirmAction({
      title: editing ? "Update driver?" : "Register driver?",
      confirmLabel: editing ? "Save changes" : "Register",
      busyLabel: "Saving…",
      tone: "primary",
      run: async () => {
        try {
          const payload = buildDriverPayload({ ...form, qr_code: form.iwp_number.trim() });
          if (editing) {
            await apiService.updateDriver(editing.id, payload);
          } else {
            await apiService.createDriver(payload);
          }
          fetchDrivers();
          resetModal();
          return { success: { title: editing ? "Driver updated" : "Driver registered", message: `${form.first_name} ${form.last_name} was saved.` } };
        } catch (err) {
          setError(err.message);
          return { error: { title: "Couldn't save driver", message: err.message || "Nothing was changed. Try again." } };
        }
      },
    });
  };

  const handleEdit = (driver) => {
    setEditing(driver);
    initialFormRef.current = normalizeDriverForm(driver);
    setForm(initialFormRef.current);
    setSubmitAttempted(false);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    initialFormRef.current = EMPTY_FORM;
    setForm(EMPTY_FORM);
    setSubmitAttempted(false);
    setIsModalOpen(true);
  };

  const resetModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setSubmitAttempted(false);
  };

  const isDirty = () => JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

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
    if (isDriverOnActiveTicket(id)) {
      notify.error({
        title: "Can't archive this driver",
        message: "They have an active ticket. Resolve the ticket first.",
      });
      return;
    }
    confirmAction({
      title: "Archive this driver?",
      message: "You can restore them from Settings → Archive.",
      confirmLabel: "Archive",
      busyLabel: "Archiving…",
      run: async () => {
        try {
          await apiService.patch(`/drivers/${id}/`, { is_archived: true });
          fetchDrivers();
          return { success: { title: "Driver archived", message: "They're now in Settings → Archive." } };
        } catch (err) {
          setError(err.message);
          return { error: { title: "Couldn't archive driver", message: err.message || "Nothing was changed. Try again." } };
        }
      },
    });
  };

  return {
    drivers,
    loading,
    error,
    fieldErrors,
    editing,
    isModalOpen,
    form,
    setForm,
    isDriverOnActiveTicket,
    handleSubmit,
    handleEdit,
    handleAdd,
    closeModal,
    handleArchive,
  };
}
