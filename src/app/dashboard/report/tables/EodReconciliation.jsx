import { peso, today } from "../reportHook";

export default function EodReconciliation({
  eodDate,
  setEodDate,
  eod,
  eodLoading,
}) {
  const checkoutCount = eod?.checkout_count ?? 0;
  const expectedCash = eod?.expected_cash ?? 0;
  const actualCash = eod?.actual_cash ?? 0;

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <span className="rpt-card-title">End-of-Day Reconciliation</span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="date"
            className="rpt-date-input"
            value={eodDate}
            max={today}
            onChange={(e) => setEodDate(e.target.value)}
          />
        </div>
      </div>

      <div className="rpt-summary-row">
        <div className="rpt-summary-card">
          <span className="rpt-summary-label">Check-outs</span>
          <div className="rpt-summary-count">{eodLoading ? "…" : checkoutCount}</div>
        </div>
        <div className="rpt-summary-card">
          <span className="rpt-summary-label">Expected Cash</span>
          <div className="rpt-summary-total">{eodLoading ? "…" : peso(expectedCash)}</div>
        </div>
        <div className="rpt-summary-card">
          <span className="rpt-summary-label">Actual Cash (Remitted)</span>
          <div className="rpt-summary-total">{eodLoading ? "…" : peso(actualCash)}</div>
        </div>
      </div>
    </div>
  );
}
