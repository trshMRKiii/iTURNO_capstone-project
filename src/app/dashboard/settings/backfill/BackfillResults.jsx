import React from "react";

export default function BackfillResults({ report }) {
  if (!report) return null;

  return (
    <div className="tbf-results">
      <div className="tbf-results-summary">
        {report.dry_run && <span className="tbf-badge tbf-badge--preview">Preview — nothing saved yet</span>}
        <span>Total {report.total_rows}</span>
        <span className="tbf-results-ok">Imported {report.imported_count}</span>
        <span className="tbf-results-skip">Duplicates skipped {report.skipped_count}</span>
        <span className="tbf-results-error">Errors {report.error_count}</span>
      </div>

      {report.errors?.length > 0 && (
        <table className="set-table tbf-results-table">
          <thead>
            <tr><th>Row</th><th>Ticket ID</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {report.errors.map((e, i) => (
              <tr key={i} className="tbf-row--error">
                <td>{e.row}</td><td>{e.ticket_id}</td><td>{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {report.skipped?.length > 0 && (
        <table className="set-table tbf-results-table">
          <thead>
            <tr><th>Row</th><th>Ticket ID</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {report.skipped.map((s, i) => (
              <tr key={i} className="tbf-row--skip">
                <td>{s.row}</td><td>{s.ticket_id}</td><td>{s.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {report.imported?.length > 0 && (
        <table className="set-table tbf-results-table">
          <thead>
            <tr><th>Row</th><th>Ticket ID</th><th>Vehicle</th><th>Driver</th></tr>
          </thead>
          <tbody>
            {report.imported.map((r, i) => (
              <tr key={i} className="tbf-row--ok">
                <td>{r.row}</td><td>{r.ticket_id}</td><td>{r.vehicle}</td><td>{r.driver}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
