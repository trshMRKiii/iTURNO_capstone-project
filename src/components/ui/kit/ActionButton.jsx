import React from "react";
import ButtonLabel from "./ButtonLabel";

const VARIANT_CLASS = {
  primary: "ui-primary-btn",
  danger: "ui-danger-btn",
  success: "ui-success-btn",
  secondary: "ui-outline-btn ui-outline-btn--auto",
};

/**
 * Button with the shared working state: while `busy` it is disabled, and after
 * 150 ms it swaps to a spinner and `busyLabel` ("Saving...", "Archiving...").
 *
 * variant: "primary" | "danger" | "success" | "secondary"
 */
function ActionButton({ variant = "primary", busy = false, busyLabel, icon, onClick, disabled = false, type = "button", children }) {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]}${busy ? " ui-btn--busy" : ""}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      <ButtonLabel busy={busy} busyLabel={busyLabel} icon={icon}>{children}</ButtonLabel>
    </button>
  );
}

export default ActionButton;
