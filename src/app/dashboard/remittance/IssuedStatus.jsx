import { peso } from "../report/reportHook";
import PaperNotice from "../../../components/notices/PaperNotice";
import "../../../components/ui/kit";

// "2026-06-05" -> "Jun 5"; parsed as a local date so the day never shifts by timezone.
const formatDay = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function IssuedStatus({ date, isLate, data, loading }) {
  const label = isLate ? `Issued Last ${formatDay(date)}` : "Issued Today";
  // Only what's still unremitted: once recorded batches cover the expected cash, nothing is left to file.
  const pending = Number(data?.difference) > 0;
  // Batches record cash, not ticket ids, so the unremitted share of the day's tickets is estimated from the cash left.
  const count = pending ? Math.round(Number(data.checkout_count) * Number(data.difference) / Number(data.expected_cash)) : 0;

  return (
    <>
      <div className="rpt-summary-row rem-issued">
        <div className="rpt-summary-card">
          <span className="rpt-summary-label">{label}</span>
          <div className="rpt-summary-count">{loading ? <span className="ui-skel" style={{ width: 80, height: 22 }} /> : <>{count} <span className="rem-count-unit">{count === 1 ? "ticket" : "tickets"}</span></>}</div>
        </div>
        <div className="rpt-summary-card">
          <span className="rpt-summary-label">Cash to Remit</span>
          <div className="rpt-summary-total">{loading ? <span className="ui-skel" style={{ width: 120, height: 22 }} /> : peso(pending ? data.difference : 0)}</div>
        </div>
      </div>
      {!loading && <PaperNotice count={data?.paper_count} amount={data?.paper_amount} />}
    </>
  );
}
