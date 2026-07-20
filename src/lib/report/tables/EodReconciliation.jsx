import { DataTable } from "../../../components/ui/dataTable";
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
  const difference = eod?.difference ?? 0;
  const gaps = eod?.ticket_number_gaps || [];
  const openSessions = eod?.open_sessions || [];

  const renderGapRow = (g, idx, { rowClass, cellClass }) => (
    <tr key={`${g.series_no}-${idx}`} className={rowClass}>
      <td className={`${cellClass} rpt-bold`}>{g.series_no || "—"}</td>
      <td className={cellClass}>{g.missing_numbers.join(", ")}</td>
      <td className={cellClass}>{g.missing_numbers.length}</td>
    </tr>
  );

  const renderOpenSessionRow = (t, idx, { rowClass, cellClass }) => (
    <tr key={t.ticket_id} className={rowClass}>
      <td className={cellClass}>
        <span className="rpt-plate">{t.ticket_id}</span>
      </td>
      <td className={cellClass}>
        {t.plate_number || <span className="rpt-na">—</span>}
      </td>
      <td className={cellClass}>
        {t.driver || <span className="rpt-na">—</span>}
      </td>
      <td className={cellClass}>
        {t.issued_at ? new Date(t.issued_at).toLocaleString() : "—"}
      </td>
    </tr>
  );

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
        <div className="rpt-summary-card">
          <span className="rpt-summary-label">Difference</span>
          <div
            className="rpt-summary-total"
            style={{ color: !eodLoading && difference !== 0 ? "#dc2626" : undefined }}
          >
            {eodLoading ? "…" : peso(difference)}
          </div>
        </div>
      </div>

      <p className="rpt-record-count" style={{ marginTop: "4px" }}>
        Open Sessions Requiring Resolution ({openSessions.length}) —{" "}
        <a href="/dashboard/dispatch">resolve via Dispatch → Cancel</a>
      </p>
      <DataTable
        columns={["Ticket ID", "Plate Number", "Driver", "Checked In"]}
        data={openSessions}
        rowRenderer={renderOpenSessionRow}
      />

      <p className="rpt-record-count" style={{ marginTop: "16px" }}>
        Ticket Number Gaps
      </p>
      <DataTable
        columns={["Series No.", "Missing Numbers", "Count"]}
        data={gaps}
        rowRenderer={renderGapRow}
      />
    </div>
  );
}
