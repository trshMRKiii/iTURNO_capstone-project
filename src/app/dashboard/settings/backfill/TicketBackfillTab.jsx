import { useState } from "react";
import { useFeedback, SkeletonList } from "../../../../components/ui/kit";
import { IS_REMOTE } from "../../../../lib/api-service";
import { useTicketBackfill } from "./useTicketBackfill";
import BackfillBuilder from "./BackfillBuilder";
import { F_PLATE, F_TICKET_TYPE, F_QUANTITY } from "./fields";

const MODES = [
  { value: "Queue", label: "Queue" },
  { value: "Roaming", label: "Roaming" },
];

export default function TicketBackfillTab() {
  const { report, confirmAction } = useFeedback();
  const {
    wipMode, wipLoading, togglingWip, toggleWipMode,
    vehicles, ticketSeries, submitBusy, submitRows,
    remoteRequests, remoteRequestsLoading,
  } = useTicketBackfill();

  const [mode, setMode] = useState("Queue");
  const isPaused = !!wipMode?.is_active;

  const applyWipMode = async (turningOn) => {
    try {
      await toggleWipMode(turningOn);
      return { success: { title: turningOn ? "Ticket issuance paused" : "Ticket issuance resumed" } };
    } catch (err) {
      console.error("Failed to update WIP mode:", err);
      // err.message already carries the backend's actual reason (apiService.request()
      // extracts it from the response body) — show that instead of a generic line, since
      // whoever's using this screen won't have DevTools open to see the real cause.
      return { error: { title: "Couldn't update issuance", message: err.message || "Nothing was changed. Try again." } };
    }
  };

  const handleToggleWip = () => {
    const turningOn = !wipMode?.is_active;
    if (!turningOn) return applyWipMode(false).then(report);
    return confirmAction({
      title: "Pause ticket issuance?",
      message: "No terminal will be able to check in or dispatch tickets until you resume.",
      confirmLabel: "Pause",
      busyLabel: "Pausing…",
      run: () => applyWipMode(true),
    });
  };

  return (
    <div className="tbf-tab">
      {/* Two pages: the pause gate while issuance is live, the backfill form only while paused. */}
      {!isPaused ? (
        <div className="tbf-gate">
          <span className="tbf-pill tbf-pill--active">{wipLoading ? "…" : "Terminal Process is active"}</span>
          <h4>Pause ticket issuance first</h4>
          <p className="set-rewards-note">
            While paused, terminals can't check in or dispatch. This keeps backfilled ticket
            numbers from clashing with tickets being issued live.
          </p>
          {IS_REMOTE ? (
            <p className="set-rewards-note">Switching issuance on or off only works from the LAN terminal itself.</p>
          ) : (
            <button className="set-add-btn set-add-btn--danger" onClick={handleToggleWip} disabled={wipLoading || togglingWip}>
              Pause issuance &amp; start backfill
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="tbf-wip-section">
            <span className="tbf-pill tbf-pill--wip">Paused</span>
            {!IS_REMOTE && (
              <button className="set-add-btn" onClick={handleToggleWip} disabled={togglingWip}>
                Resume issuance
              </button>
            )}
            {wipMode?.updated_at && (
              <span className="tbf-meta">Paused since {new Date(wipMode.updated_at).toLocaleString()}</span>
            )}
          </div>
          <p className="set-rewards-note">
            Ticket numbers are assigned automatically from the selected Ticket Series — they're never typed in.
          </p>

          <div className="tbf-mode-switch">
            {MODES.map((m) => (
              <button
                key={m.value}
                className={`tbf-mode-btn ${mode === m.value ? "tbf-mode-btn--active" : ""}`}
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Both stay mounted so switching tabs doesn't lose what's been entered. */}
          {MODES.map((m) => (
            <div key={m.value} hidden={mode !== m.value}>
              <BackfillBuilder
                mode={m.value}
                vehicles={vehicles}
                ticketSeries={ticketSeries}
                busy={submitBusy}
                submitRows={submitRows}
              />
            </div>
          ))}
        </>
      )}

      {IS_REMOTE && (
        <div className="tbf-remote-requests">
          <h4>Recent remote backfill requests</h4>
          {remoteRequestsLoading ? (
            <SkeletonList rows={3} h={32} />
          ) : remoteRequests.length === 0 ? (
            <p className="set-rewards-note">No requests queued yet.</p>
          ) : (
            <table className="set-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Ticket Type</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Requested by</th>
                  <th>Submitted</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {remoteRequests.map((r) => (
                  <tr key={r.id} className="set-row">
                    <td className="set-cell-label">{r.payload?.rows ? `${r.payload.rows.length} entries` : r.payload?.[F_PLATE]}</td>
                    <td>{(r.payload?.rows?.[0] || r.payload)?.[F_TICKET_TYPE]}</td>
                    <td>{r.payload?.rows ? r.payload.rows.length : r.payload?.[F_QUANTITY] || 1}</td>
                    <td>{r.status}</td>
                    <td className="set-cell-meta">{r.requested_by_name}</td>
                    <td className="set-cell-meta">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="set-cell-meta">{r.result_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
