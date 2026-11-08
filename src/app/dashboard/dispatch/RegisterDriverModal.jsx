import { useState } from "react";
import { apiService } from "../../../lib/api-service";
import { focusFirstError } from "../../../lib/focusFirstError";
import DriverFormModal from "../driver/DriverFormModal";
import { buildDriverPayload, normalizeDriverForm, validateDriverForm } from "../driver/driver-utils";
import "../../../styles/Driver.css";

// The full Register Driver form, opened from the Dispatch board for a kiosk "Unregistered
// driver" entry. Saving registers the driver and hands them back to be attached to the vehicle.
export default function RegisterDriverModal({ onRegistered, onClose }) {
  const [form, setForm] = useState(() => normalizeDriverForm());
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(validateDriverForm(form)).length > 0) {
      setSubmitAttempted(true);
      focusFirstError(".drv-modal");
      setError("Please fill in the highlighted fields.");
      return;
    }
    try {
      onRegistered(await apiService.createDriver(buildDriverPayload(form)));
    } catch (err) {
      setError(err.message || "Couldn't register the driver.");
    }
  };

  return (
    <DriverFormModal
      form={form}
      setForm={setForm}
      fieldErrors={submitAttempted ? validateDriverForm(form) : {}}
      error={error}
      editing={null}
      hasActiveTicket={false}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  );
}
