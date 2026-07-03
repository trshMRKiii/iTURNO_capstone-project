import { useState, useEffect } from "react";
import { apiService } from "./api-service";
import { useConfirm, useToast } from "../components/ui/ToastConfirmContext";
import { buildDriverPayload, normalizeDriverForm } from "./driver-utils";

const EMPTY_FORM = {
  first_name: "",
  middle_name: "",
  last_name: "",
  iwp_number: "",
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
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const showConfirm = useConfirm();
  const showToast = useToast();

  useEffect(() => {
    fetchDrivers();
    fetchTickets();
  }, []);

  const fetchDrivers = async () => {
    try {
      const data = await apiService.getDrivers();
      setDrivers((data || []).map(normalizeDriverForm));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTickets = async () => {
    try {
      const data = await apiService.getTickets();
      setTickets(data);
    } catch {
      /* non-critical */
    }
  };

  // Check if driver has an active (ISSUED or DISPATCHED) ticket
  const isDriverOnActiveTicket = (driverId) =>
    tickets.some((t) => t.driver?.id === driverId && t.status === "ISSUED");

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    const confirmMsg = editing ? "Confirm update?" : "Confirm registry?";
    const confirmed = await showConfirm(confirmMsg);
    if (!confirmed) return;
    try {
      const payload = buildDriverPayload(form);
      if (editing) {
        await apiService.updateDriver(editing.id, payload);
      } else {
        await apiService.createDriver(payload);
      }
      fetchDrivers();
      closeModal();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (driver) => {
    setEditing(driver);
    setForm(normalizeDriverForm(driver));
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const handleDelete = async (id) => {
    if (isDriverOnActiveTicket(id)) {
      showToast(
        "Cannot delete this driver — they have an active ticket. Resolve the ticket first.",
        "info",
      );
      return;
    }
    const confirmed = await showConfirm("Are you sure you want to remove this driver record?");
    if (!confirmed) return;
    try {
      await apiService.deleteDriver(id);
      fetchDrivers();
      showToast("Driver record deleted successfully");
    } catch (err) {
      setError(err.message);
      showToast(err.message || "Failed to delete driver", "info");
    }
  };

  return {
    drivers,
    loading,
    error,
    editing,
    isModalOpen,
    form,
    setForm,
    isDriverOnActiveTicket,
    handleSubmit,
    handleEdit,
    handleAdd,
    closeModal,
    handleDelete,
  };
}
