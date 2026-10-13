import React, { useState } from "react";
import { apiService, IS_REMOTE } from "../../lib/api-service";
import { publishWipMode, useWipMode } from "../../lib/useWipMode";
import { useFeedback } from "../ui/kit";

export default function WipModeBanner() {
  const { wipMode } = useWipMode();
  const { report, confirmAction } = useFeedback();
  const [busy, setBusy] = useState(false);

  if (!wipMode?.is_active) return null;

  const resume = async () => {
    setBusy(true);
    try {
      const updated = await apiService.updateWipMode(false);
      publishWipMode(updated);
      return { success: { title: "Ticket issuance resumed" } };
    } catch (err) {
      return { error: { title: "Couldn't resume issuance", message: err.message || "Nothing was changed. Try again." } };
    } finally {
      setBusy(false);
    }
  };

  const handleResume = () =>
    confirmAction({
      title: "Resume ticket issuance?",
      message: "Terminals will be able to check in and dispatch tickets again.",
      confirmLabel: "Resume Process",
      tone: "success",
      busyLabel: "Resuming…",
      run: resume,
    });

  return (
    <div className="gnotice gnotice--wip">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="gnotice-text gnotice-text--inline">
        Ticket issuance is paused (WIP) — check-ins and dispatches are temporarily unavailable.
      </span>
      {!IS_REMOTE && (
        <button type="button" className="gnotice-action gnotice-action--resume" onClick={handleResume} disabled={busy}>
          Resume Process
        </button>
      )}
    </div>
  );
}
