import React, { useState } from "react";
import { parseCsv, downloadCsv } from "../../lib/csv";
import Pager from "../../app/dashboard/report/tables/Pager";
import "../../styles/User.css";
import "../../styles/FormModal.css";

const PAGE_SIZE = 10;
// "Plate Number" / "plate-number" / "PLATE_NUMBER" all become plate_number.
const fieldKey = (header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Two-step CSV import: pick a file → preview every row as validated by the server → confirm.
// `importFn(rows, commit)` must answer { rows: [{ line, outcome, reason, ...fields }], ...extra }.
//   aliases        header spellings other systems export, keyed by the field the API expects
//   requiredField  field whose column must exist, or the file is rejected up front
//   columns        preview table columns: { label, cell(row), className? }
//   doneNote       sentence shown after a successful import (gets the commit response)
export default function CsvImportModal({
  title, noun, aliases, requiredField, template, hint, columns, importFn, previewNote, doneNote, onClose, onImported,
}) {
  const [stage, setStage] = useState("pick"); // pick → preview → done
  const [payload, setPayload] = useState([]);
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const plural = (n) => `${noun}${n === 1 ? "" : "s"}`;
  const fieldOf = Object.fromEntries(Object.entries(aliases).flatMap(([field, names]) => names.map((n) => [n, field])));

  const rowsFromCsv = (text) => {
    const [header = [], ...body] = parseCsv(text);
    const fields = header.map((h) => fieldOf[fieldKey(h)]);
    if (!fields.includes(requiredField)) throw new Error("A required column is missing. Download the template to see the expected headers.");
    const sample = template.rows[1][template.rows[0].findIndex((h) => fieldOf[fieldKey(h)] === requiredField)].toLowerCase();
    const left = body.find((cells) => cells[fields.indexOf(requiredField)]?.trim().toLowerCase() === sample);
    if (left) throw new Error(`Row ${left.line} is the sample from the template. Delete it and choose your file again.`);
    return body.map((cells) => ({ ...Object.fromEntries(fields.map((f, i) => [f, cells[i]?.trim() ?? ""]).filter(([f]) => f)), _line: cells.line }));
  };

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
      if (parsed.length === 0) throw new Error(`The file has a header row but no ${noun}s.`);
      const preview = await importFn(parsed, false);
      setPayload(parsed);
      setRows(preview.rows);
      setPage(1);
      setOnlyIssues(false);
      setStage("preview");
    });
  };

  const confirm = () =>
    run(async () => {
      setResult(await importFn(payload, true));
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
            {stage === "pick" && title}
            {stage === "preview" && (ready ? `Import ${ready} ${plural(ready)}?` : "Nothing to import")}
            {stage === "done" && "Import complete"}
          </h2>
        </div>
        <div className="usr-modal-body">
          {error && <div className="usr-alert">{error}</div>}

          {stage === "pick" && (
            <>
              <label className={`usr-import-drop${busy ? " is-busy" : ""}`}>
                <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} hidden />
                <span className="usr-import-pick">{busy ? "Checking file…" : "Click here to choose your CSV file"}</span>
                <span>You'll review every row before anything is created.</span>
              </label>
              <p className="usr-import-note">{hint}</p>
              <dl className="usr-import-sample">
                {template.rows[0].map((col, i) => (
                  <div key={col}><dt>{col}</dt><dd>{template.rows[1][i]}</dd></div>
                ))}
              </dl>
              <div className="usr-modal-footer">
                <button className="usr-modal-btn usr-modal-btn--download" onClick={() => downloadCsv(template.filename, template.rows)}>
                  Download template
                </button>
                <button className="usr-modal-btn usr-modal-btn--cancel" onClick={close}>Cancel</button>
              </div>
            </>
          )}

          {stage === "preview" && (
            <>
              <p className="usr-import-note">{previewNote(ready, issues)}</p>
              {issues > 0 && (
                <button className="usr-import-filter" onClick={() => { setOnlyIssues(!onlyIssues); setPage(1); }}>
                  {onlyIssues ? "Show all rows" : `Show only the ${issues} skipped`}
                </button>
              )}
              <div className="usr-table-wrap">
                <table className="usr-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      {columns.map((c) => <th key={c.label}>{c.label}</th>)}
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.line} className={r.outcome === "ok" ? "" : "usr-import-row--error"}>
                        <td>{r.line}</td>
                        {columns.map((c) => <td key={c.label} className={c.className}>{c.cell(r) || "—"}</td>)}
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
              <p className="usr-import-note">{doneNote(result)}</p>
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
