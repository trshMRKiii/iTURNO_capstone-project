import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "../../lib/api-service";
import { getPhDateString } from "../../lib/phDate";

function formatCurrency(val) {
  return "₱" + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RemittanceGapBanner({ canViewRemittance }) {
  const [gap, setGap] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!canViewRemittance) return;
    const gapDate = getPhDateString(-1);

    let cancelled = false;
    apiService
      .get(`/report/eod-reconciliation/?date=${gapDate}`)
      .then((data) => {
        if (cancelled || !data) return;
        if (Number(data.difference) !== 0) {
          setGap(data);
          setDismissed(sessionStorage.getItem("remittanceGapDismissedFor") === gapDate);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [canViewRemittance]);

  if (!canViewRemittance || !gap || dismissed) return null;

  const handleFileLate = () => {
    navigate("/dashboard/Remittance", { state: { lateDate: gap.date } });
  };

  const handleDismiss = () => {
    sessionStorage.setItem("remittanceGapDismissedFor", gap.date);
    setDismissed(true);
  };

  return (
    <div className="gnotice gnotice--warning">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="gnotice-text">
        Cash remittance for {gap.date} wasn't fully reconciled — expected {formatCurrency(gap.expected_cash)},
        recorded {formatCurrency(gap.actual_cash)}.
      </span>
      <button type="button" className="gnotice-action" onClick={handleFileLate}>
        File Late Remittance
      </button>
      <button type="button" className="gnotice-dismiss" onClick={handleDismiss} aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
