import React, { useEffect, useState } from "react";
import { apiService } from "../../lib/api-service";

export default function WipModeBanner() {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getWipMode()
      .then((data) => {
        if (!cancelled) setIsActive(!!data?.is_active);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isActive) return null;

  return (
    <div className="gnotice gnotice--wip">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="gnotice-text">
        Ticket issuance is paused (WIP) — check-ins and dispatches are temporarily unavailable.
      </span>
    </div>
  );
}
