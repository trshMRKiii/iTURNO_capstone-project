import React, { useState } from "react";
import { apiService } from "../../../lib/api-service";
import { parseCsv, downloadCsv } from "../../../lib/csv";
import Pager from "../report/tables/Pager";
import "../../../styles/User.css";
import "../../../styles/FormModal.css";

const PAGE_SIZE = 10;
const TEMPLATE = [
  ["email", "first_name", "middle_name", "last_name", "role"],
  ["juan.delacruz@example.com", "Juan", "Reyes", "Dela Cruz", "Personnel"],
];

// Header spellings other systems commonly export, keyed by the field the API expects.
const HEADER_ALIASES = {
  username: ["username", "email", "email_address", "username_email"],
  first_name: ["first_name", "firstname", "given_name"],
  middle_name: ["middle_name", "middlename", "middle"],
  last_name: ["last_name", "lastname", "surname", "family_name"],
  role: ["role", "position"],
};
const FIELD_OF = Object.fromEntries(
  Object.entries(HEADER_ALIASES).flatMap(([field, names]) => names.map((n) => [n, field])),
);

function rowsFromCsv(text) {
  const [header = [], ...body] = parseCsv(text);
  const fields = header.map((h) => FIELD_OF[h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")]);
  if (!fields.includes("username")) throw new Error("No email column found. Download the template to see the expected headers.");
  return body.map((cells) => Object.fromEntries(fields.map((f, i) => [f, cells[i]?.trim() ?? ""]).filter(([f]) => f)));
}

const nameOf = (r) => [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ");

export default function ImportUsersModal({ onClose, onImported }) {
  const [stage, setStage] = useState("pick"); // pick → preview → done
  const [payload, setPayload] = useState([]);
  const [rows, setRows] = useState([]);
  const [created, setCreated] = useState({ count: 0, queued: 0 });
  const [page, setPage] = useState(1);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const close = () => !busy && onClose();

  const run = async (task) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err.message || "Something went wrong. Nothing was imported.");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    run(async () => {
      const parsed = rowsFromCsv(await file.text());
      if (parsed.length === 0) throw new Error("The file has a header row but no accounts.");
      const result = await apiService.importUsers(parsed, false);
      setPayload(parsed);
      setRows(result.rows);
      setPage(1);
      setOnlyIssues(false);
      setStage("preview");
    });
  };

  const confirm = () =>
    run(async () => {
      const result = await apiService.importUsers(payload, true);
      setCreated({ count: result.created, queued: result.emails_queued });
      setStage("done");
      onImported();
    });

  const ready = rows.filter((r) => r.outcome === "ok").length;
  const issues = rows.length - ready;
  const shown = onlyIssues ? rows.filter((r) => r.outcome !== "ok") : rows;
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="usr-overlay" onClick={close}>
      <div className="usr-modal usr-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="usr-modal-header">
          <h2 className="usr-modal-title">
            {stage === "pick" && "Import staff accounts"}
            {stage === "preview" && (ready ? `Import ${ready} account${ready === 1 ? "" : "s"}?` : "Nothing to import")}
            {stage === "done" && "Import complete"}
          </h2>
        </div>
        <div className="usr-modal-body">
          {error && <div className="usr-alert">{error}</div>}

          {stage === "pick" && (
            <>
              <label className={`usr-import-drop${busy ? " is-busy" : ""}`}>
                <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} hidden />
                <strong>{busy ? "Checking file…" : "Choose a CSV file"}</strong>
                <span>You'll review every row before anything is created.</span>
              </label>
              <p className="usr-import-note">
                Columns: <b>email</b>, <b>first_name</b>, <b>last_name</b> are required; <b>middle_name</b> and <b>role</b> (Personnel,
                Supervisor or Manager — blank means Personnel) are optional. Admin accounts can't be imported.
              </p>
              <div className="usr-modal-footer">
                <button className="usr-modal-btn usr-modal-btn--cancel" onClick={() => downloadCsv("staff-import-template.csv", TEMPLATE)}>
                  Download template
                </button>
                <button className="usr-modal-btn usr-modal-btn--cancel" onClick={close}>Cancel</button>
              </div>
            </>
          )}

          {stage === "preview" && (
            <>
              <p className="usr-import-note">
                {ready} ready{issues ? ` · ${issues} will be skipped` : ""}. Each new account is emailed a temporary password and must
                choose its own on first sign-in. This creates real accounts.
              </p>
              {issues > 0 && (
                <button className="usr-import-filter" onClick={() => { setOnlyIssues(!onlyIssues); setPage(1); }}>
                  {onlyIssues ? "Show all rows" : `Show only the ${issues} skipped`}
                </button>
              )}
              <div className="usr-table-wrap">
                <table className="usr-table">
                  <thead>
                    <tr><th>Row</th><th>Name</th><th>Email</th><th>Role</th><th>Result</th></tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.line} className={r.outcome === "ok" ? "" : "usr-import-row--error"}>
                        <td>{r.line}</td>
                        <td>{nameOf(r) || "—"}</td>
                        <td className="usr-td-email">{r.username || "—"}</td>
                        <td className="usr-import-role">{r.role.toLowerCase()}</td>
                        <td>{r.outcome === "ok" ? <span className="usr-status usr-status--active">Ready</span> : r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={page} totalPages={Math.max(1, Math.ceil(shown.length / PAGE_SIZE))} count={shown.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
              <div className="usr-modal-footer">
                <button className="usr-modal-btn usr-modal-btn--cancel" onClick={() => setStage("pick")} disabled={busy}>Back</button>
                <button className="usr-modal-btn usr-modal-btn--submit" onClick={confirm} disabled={busy || ready === 0}>
                  {busy ? "Importing…" : `Confirm & Import ${ready}`}
                </button>
              </div>
            </>
          )}

          {stage === "done" && (
            <>
              <p className="usr-import-note">
                {created.count} account{created.count === 1 ? "" : "s"} created.
                {created.queued > 0
                  ? ` ${created.queued} login email${created.queued === 1 ? " is" : "s are"} queued and will be sent automatically once the mail service or system is back online.`
                  : " Their login emails have been sent."}
              </p>
              <div className="usr-modal-footer">
                <button className="usr-modal-btn usr-modal-btn--submit" onClick={onClose}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
