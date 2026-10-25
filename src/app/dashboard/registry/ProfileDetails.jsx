import { useEffect, useState } from "react";
import { apiService } from "../../../lib/api-service";
import { SkeletonRows } from "../../../components/ui/kit";
import { getExpiryStatus, daysUntilExpiry, formatIwp } from "../driver/driver-utils";

const fmtDate = (v) =>
  v ? new Date(v.length === 10 ? `${v}T00:00` : v).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtStamp = (v) =>
  v ? new Date(v).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Fields worth calling out in the change history, per record type.
const TRACKED = {
  Driver: [
    ["iwp_number", "IWP number", formatIwp],
    ["iwp_expiration_date", "IWP expiration", fmtDate],
    ["status", "Status", (v) => (v === "ACTIVE" ? "Active" : "Inactive")],
    ["contact", "Contact no."],
  ],
  Vehicle: [
    ["franchise_number", "Franchise #"],
    ["franchise_expiration_date", "Franchise expiration", fmtDate],
  ],
};

// Turn the saved form payloads (oldest first) into "field: old → new" events.
const buildEvents = (logs, model) => {
  const known = {};
  return [...logs].reverse().map((log) => {
    const changes = log.changes || {};
    const lines = [];
    for (const [key, label, fmt = (v) => v] of TRACKED[model]) {
      if (changes[key] === undefined || changes[key] === null) continue;
      const next = String(changes[key]);
      if (log.action === "CREATE") lines.push(`${label}: ${fmt(next) || "—"}`);
      else if (next !== known[key]) lines.push(known[key] === undefined ? `${label}: ${fmt(next) || "—"}` : `${label}: ${fmt(known[key]) || "—"} → ${fmt(next) || "—"}`);
      known[key] = next;
    }
    return { ...log, lines };
  }).reverse();
};

const ACTION_LABEL = { CREATE: "Registered", UPDATE: "Updated", DELETE: "Deleted" };

function ProfileDetails({ model, subject }) {
  const isDriver = model === "Driver";
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiService.getAuditLogs({ model_name: model, object_id: subject.id })
      .then((d) => !cancelled && setLogs(d.logs || []))
      .catch(() => !cancelled && setLogs([]));
    return () => { cancelled = true; };
  }, [model, subject.id]);

  const expiry = isDriver ? subject.iwp_expiration_date : subject.franchise_expiration_date;
  const left = daysUntilExpiry(expiry);
  const expState = getExpiryStatus(expiry);
  const expNote = expState === "expired" ? "Expired" : left !== null ? (left === 0 ? "Expires today" : `${left} day${left === 1 ? "" : "s"} left`) : expState === "valid" ? "Valid" : "No date on file";
  const expClass = expState === "expired" ? "veh-status--expired" : left !== null ? "veh-status--warn" : "veh-status--default";

  const events = logs ? buildEvents(logs, model) : [];
  const summary = [
    `${isDriver ? "IWP" : "Franchise"} ${(isDriver ? formatIwp(subject.iwp_number) : subject.franchise_number) || "—"}`,
    `expires ${fmtDate(expiry)}`,
  ].join(" · ");

  return (
    <div className="veh-ledger-body">
      <div className="veh-ledger-summary">
        <span>
          {summary} <span className={`veh-status ${expClass}`}>{expNote}</span>
        </span>
        <span>Registered {fmtStamp(subject.created_at)} · Last updated {fmtStamp(subject.updated_at)}</span>
      </div>
      <div className="veh-table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
        <table className="veh-table">
          <thead>
            <tr>
              {["Date", "Action", "By", "Details"].map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {logs === null ? (
              <SkeletonRows cols={4} />
            ) : events.length === 0 ? (
              <tr><td colSpan="4" className="veh-table-state"><span>No changes recorded</span></td></tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="veh-row">
                  <td className="veh-td-route">{fmtStamp(e.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{ACTION_LABEL[e.action] || e.action}</td>
                  <td>{e.user_name}</td>
                  <td className="veh-td-route">
                    {e.lines.length
                      ? e.lines.map((l) => <div key={l}>{l}</div>)
                      : <span className="veh-na">Other details edited</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProfileDetails;
