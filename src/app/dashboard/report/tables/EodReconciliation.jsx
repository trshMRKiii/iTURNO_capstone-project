import { peso, getToday } from "../reportHook";
import { Skel } from "../../../../components/ui/kit";
import PaperNotice from "../../../../components/notices/PaperNotice";

export default function EodReconciliation({
  eodDate,
  setEodDate,
  eod,
  eodLoading,
}) {
  const checkoutCount = eod?.checkout_count ?? 0;
  const expectedCash = eod?.expected_cash ?? 0;

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
            max={getToday()}
            onChange={(e) => setEodDate(e.target.value)}
          />
        </div>
      </div>

      <div className="rpt-summary-row">
        <div className="rpt-summary-card">
          <span className="rpt-summary-label">Check-outs</span>
          <div className="rpt-summary-count">{eodLoading ? <Skel w={60} h={22} /> : checkoutCount}</div>
        </div>
        <div className="rpt-summary-card">
          <span className="rpt-summary-label">Expected Cash</span>
          <div className="rpt-summary-total">{eodLoading ? <Skel w={120} h={22} /> : peso(expectedCash)}</div>
        </div>
      </div>
      {!eodLoading && <PaperNotice count={eod?.paper_count} amount={eod?.paper_amount} />}
    </div>
  );
}
