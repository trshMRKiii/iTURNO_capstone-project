import React, { useState } from "react";
import { useToast, useConfirm } from "../../../../components/ui/ToastConfirmContext";
import { useTicketBackfill } from "./useTicketBackfill";
import BackfillResults from "./BackfillResults";
import {
  F_TICKET_ID, F_PLATE, F_DRIVER_IWP, F_DRIVER_LAST, F_DRIVER_FIRST,
  F_ROUTE, F_TICKET_TYPE, F_AMOUNT, F_ISSUED_AT, F_STAFF_EMAIL, F_MODE, F_NOTES,
} from "./fields";

function toBackendDateTime(localDateTimeValue) {
  // <input type="datetime-local"> gives "YYYY-MM-DDTHH:MM" — backend wants
  // "YYYY-MM-DD HH:MM" (see backend/api/views/backfill.py _parse_ph_datetime).
  if (!localDateTimeValue) return "";
  return localDateTimeValue.replace("T", " ");
}

const CSV_TEMPLATE_HEADER = [
  F_TICKET_ID, F_PLATE, F_DRIVER_IWP, F_DRIVER_LAST, F_DRIVER_FIRST,
  F_ROUTE, F_TICKET_TYPE, F_AMOUNT, F_ISSUED_AT, F_STAFF_EMAIL, F_MODE, F_NOTES,
];

// The example lives only on-screen (the guide table below), not in the
// downloaded file — a filled-in row 2 in the actual template invites someone
// unfamiliar with spreadsheets to leave it there and start typing in row 3,
// or edit it in place instead of replacing it. The download is header-only.
const CSV_COLUMN_REFERENCE = [
  { name: F_TICKET_ID, required: true, example: "1001", note: "The physical ticket number written on the paper ticket. If it's already in the system, that row is skipped, not an error." },
  { name: F_PLATE, required: true, example: "ABC-123", note: "Must match a vehicle's plate number exactly." },
  { name: F_DRIVER_IWP, required: true, example: "12345", note: "The driver's IWP Number (same as on the Fleet & Driver page)." },
  { name: F_DRIVER_LAST, required: true, example: "Dela Cruz", note: "Used together with the IWP Number to find the driver." },
  { name: F_DRIVER_FIRST, required: false, example: "Juan", note: "Only needed if that IWP Number + last name matches more than one driver." },
  { name: F_ROUTE, required: false, example: "San Fernando", note: "Just the origin town — leave blank if unknown." },
  { name: F_TICKET_TYPE, required: false, example: "Cash Tickets@10", note: "The ticket type name — used to set the price if Amount is blank." },
  { name: F_AMOUNT, required: false, example: "10.00", note: "The peso amount collected. If given, it overrides Ticket Type's price." },
  { name: F_ISSUED_AT, required: false, example: "2026-08-20 09:15", note: "When the paper ticket was actually issued. Format: YYYY-MM-DD HH:MM (24-hour clock). Leave blank to use right now." },
  { name: F_STAFF_EMAIL, required: false, example: "(leave blank)", note: "The login email of the staff member who issued it. Leave blank to label it \"Paper Backfill\"." },
  { name: F_MODE, required: false, example: "Queue", note: "Queue or Roaming (matches the Queue Management page). Leave blank for Queue." },
  { name: F_NOTES, required: false, example: "system outage 2026-08-20", note: "Any free-text note." },
];

function downloadCsvTemplate() {
  const csv = CSV_TEMPLATE_HEADER.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ticket_backfill_template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function TicketBackfillTab() {
  const showToast = useToast();
  const showConfirm = useConfirm();
  const {
    wipMode, wipLoading, togglingWip, toggleWipMode,
    vehicles, drivers, routes, ticketForms,
    manualRow, manualPreview, manualBusy, updateManualField, resetManualRow, previewManualRow, confirmManualRow,
    csvFile, setCsvFile, csvReport, csvBusy, previewCsv, importCsv, resetCsv,
  } = useTicketBackfill();

  const [mode, setMode] = useState("manual");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [driverSearch, setDriverSearch] = useState("");
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const [issuedAtLocal, setIssuedAtLocal] = useState("");

  const vehicleResults = vehicles.filter((v) =>
    v.plate_number?.toLowerCase().includes(vehicleSearch.toLowerCase())
  ).slice(0, 20);
  const driverResults = drivers.filter((d) =>
    d.name?.toLowerCase().includes(driverSearch.toLowerCase())
  ).slice(0, 20);

  const handleSelectVehicle = (vehicle) => {
    updateManualField(F_PLATE, vehicle.plate_number);
    setVehicleSearch(vehicle.plate_number);
    setShowVehicleDropdown(false);
  };

  const handleSelectDriver = (driver) => {
    updateManualField(F_DRIVER_IWP, driver.iwp_number);
    updateManualField(F_DRIVER_LAST, driver.last_name);
    updateManualField(F_DRIVER_FIRST, driver.first_name);
    setDriverSearch(driver.name);
    setShowDriverDropdown(false);
  };

  const handleClearManualForm = () => {
    resetManualRow();
    setVehicleSearch("");
    setDriverSearch("");
    setIssuedAtLocal("");
  };

  const handleIssuedAtChange = (value) => {
    setIssuedAtLocal(value);
    updateManualField(F_ISSUED_AT, toBackendDateTime(value));
  };

  const handleToggleWip = async () => {
    const turningOn = !wipMode?.is_active;
    if (turningOn) {
      const ok = await showConfirm(
        "Switch to WIP? No terminal will be able to check in or dispatch tickets until you switch back to Active."
      );
      if (!ok) return;
    }
    try {
      await toggleWipMode(turningOn);
      showToast(turningOn ? "Switched to WIP" : "Switched to Active", "success");
    } catch (err) {
      console.error("Failed to update WIP mode:", err);
      // err.message already carries the backend's actual reason (apiService.request()
      // extracts it from the response body) — show that instead of a generic line, since
      // whoever's using this screen won't have DevTools open to see the real cause.
      showToast(err.message || "Failed to update WIP mode", "info");
    }
  };

  const handlePreviewManual = async () => {
    try {
      const result = await previewManualRow();
      if (result.outcome !== "ok") {
        showToast(result.reason || "Row could not be validated", "info");
      }
    } catch (err) {
      console.error("Failed to preview manual entry:", err);
      showToast(err.message || "Failed to preview this entry", "info");
    }
  };

  const handleConfirmManual = async () => {
    const ok = await showConfirm(`Add ticket #${manualRow[F_TICKET_ID]}? This creates a real record.`);
    if (!ok) return;
    try {
      const result = await confirmManualRow();
      if (result.outcome === "ok") {
        showToast(`Ticket #${result.ticket_id} added`, "success");
        setVehicleSearch("");
        setDriverSearch("");
        setIssuedAtLocal("");
      } else {
        showToast(result.reason || "Could not add this ticket", "info");
      }
    } catch (err) {
      console.error("Failed to add manual entry:", err);
      showToast(err.message || "Failed to add this ticket", "info");
    }
  };

  const handlePreviewCsv = async () => {
    try {
      await previewCsv();
    } catch (err) {
      console.error("Failed to preview CSV:", err);
      showToast(err.message || "Failed to preview this file", "info");
    }
  };

  const handleImportCsv = async () => {
    const ok = await showConfirm(
      `Import ${csvReport?.imported_count ?? 0} ticket(s) from this file? Duplicates and invalid rows are skipped automatically.`
    );
    if (!ok) return;
    try {
      const result = await importCsv();
      showToast(`Imported ${result.imported_count} ticket(s)`, "success");
    } catch (err) {
      console.error("Failed to import CSV:", err);
      showToast(err.message || "Failed to import this file", "info");
    }
  };

  return (
    <div className="tbf-tab">
      {/* WIP status */}
      <div className="tbf-wip-section">
        <span className={`tbf-pill ${wipMode?.is_active ? "tbf-pill--wip" : "tbf-pill--active"}`}>
          {wipLoading ? "…" : wipMode?.is_active ? "WIP" : "Active"}
        </span>
        <button className="set-add-btn" onClick={handleToggleWip} disabled={wipLoading || togglingWip}>
          {wipMode?.is_active ? "Switch to Active" : "Switch to WIP"}
        </button>
        {wipMode?.updated_at && (
          <span className="tbf-meta">Last changed {new Date(wipMode.updated_at).toLocaleString()}</span>
        )}
      </div>
      <p className="set-rewards-note">
        WIP pauses ticket issuance system-wide — every terminal is blocked from checking in or
        dispatching tickets while WIP is on. Use it while backfilling paper tickets below, then
        switch back to Active when done. Use a ticket-numbering scheme for paper backfills that
        won't collide with your active ticket series ranges.
      </p>

      {!wipLoading && !wipMode?.is_active && (
        <div className="tbf-nudge">
          <span>Currently Active — consider switching to WIP before importing to avoid collisions with live ticket issuance.</span>
          <button className="set-add-btn" onClick={handleToggleWip} disabled={togglingWip}>Switch to WIP</button>
        </div>
      )}

      {/* Mode switch */}
      <div className="tbf-mode-switch">
        <button
          className={`tbf-mode-btn ${mode === "manual" ? "tbf-mode-btn--active" : ""}`}
          onClick={() => setMode("manual")}
        >
          Single Entry
        </button>
        <button
          className={`tbf-mode-btn ${mode === "csv" ? "tbf-mode-btn--active" : ""}`}
          onClick={() => setMode("csv")}
        >
          CSV Upload
        </button>
      </div>

      {mode === "manual" && (
        <div className="tbf-manual-form">
          <div className="set-add-row">
            <label className="set-field">
              <span className="set-field-label">Ticket Number *</span>
              <input
                className="set-input"
                value={manualRow[F_TICKET_ID]}
                onChange={(e) => updateManualField(F_TICKET_ID, e.target.value)}
                placeholder="Physical ticket number"
              />
            </label>

            <label className="set-field tbf-searchable">
              <span className="set-field-label">Vehicle Plate Number *</span>
              <input
                className="set-input"
                value={vehicleSearch}
                onChange={(e) => {
                  // Keep the field synced to whatever's typed, not just an actual
                  // dropdown pick — otherwise a typo or a missed selection submits an
                  // EMPTY value, and the resulting "Vehicle not found: ...=''" error
                  // doesn't match what the user still sees sitting in this box.
                  setVehicleSearch(e.target.value);
                  setShowVehicleDropdown(true);
                  updateManualField(F_PLATE, e.target.value);
                }}
                onFocus={() => setShowVehicleDropdown(true)}
                placeholder="Search plate number..."
              />
              {showVehicleDropdown && vehicleSearch && (
                <div className="tbf-dropdown">
                  {vehicleResults.length === 0 ? (
                    <div className="tbf-dropdown-empty">No matches</div>
                  ) : vehicleResults.map((v) => (
                    <div
                      key={v.id}
                      className="tbf-dropdown-item"
                      // Without this, mousedown briefly blurs the still-focused input,
                      // which fires onFocus again right after the click sets
                      // showVehicleDropdown(false) — silently reopening the dropdown and
                      // leaving a stale item there to trip up the next field's selector.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectVehicle(v)}
                    >
                      {v.plate_number}
                    </div>
                  ))}
                </div>
              )}
            </label>

            <label className="set-field tbf-searchable">
              <span className="set-field-label">Driver *</span>
              <input
                className="set-input"
                value={driverSearch}
                onChange={(e) => {
                  // Same reasoning as the vehicle field above — keep the submitted
                  // value in sync with what's visibly typed, not just a confirmed pick.
                  setDriverSearch(e.target.value);
                  setShowDriverDropdown(true);
                  updateManualField(F_DRIVER_LAST, e.target.value);
                }}
                onFocus={() => setShowDriverDropdown(true)}
                placeholder="Search driver name..."
              />
              {showDriverDropdown && driverSearch && (
                <div className="tbf-dropdown">
                  {driverResults.length === 0 ? (
                    <div className="tbf-dropdown-empty">No matches</div>
                  ) : driverResults.map((d) => (
                    <div
                      key={d.id}
                      className="tbf-dropdown-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectDriver(d)}
                    >
                      {d.name} {d.iwp_number ? `(${d.iwp_number})` : ""}
                    </div>
                  ))}
                </div>
              )}
            </label>
          </div>

          <div className="set-add-row">
            <label className="set-field">
              <span className="set-field-label">Route</span>
              <select
                className="set-input"
                value={manualRow[F_ROUTE]}
                onChange={(e) => updateManualField(F_ROUTE, e.target.value)}
              >
                <option value="">— none —</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.origin}>{r.full_name || r.origin}</option>
                ))}
              </select>
            </label>

            <label className="set-field">
              <span className="set-field-label">Ticket Type</span>
              <select
                className="set-input"
                value={manualRow[F_TICKET_TYPE]}
                onChange={(e) => updateManualField(F_TICKET_TYPE, e.target.value)}
              >
                <option value="">— use amount below —</option>
                {ticketForms.map((tf) => (
                  <option key={tf.id} value={tf.name}>{tf.name} (₱{Number(tf.price).toFixed(2)})</option>
                ))}
              </select>
            </label>

            <label className="set-field">
              <span className="set-field-label">Amount (₱)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="set-input"
                value={manualRow[F_AMOUNT]}
                onChange={(e) => updateManualField(F_AMOUNT, e.target.value)}
                placeholder="Overrides Ticket Type's price"
              />
            </label>
          </div>

          <div className="set-add-row">
            <label className="set-field">
              <span className="set-field-label">Date and Time Issued (when the paper ticket was actually issued)</span>
              <input
                type="datetime-local"
                className="set-input"
                value={issuedAtLocal}
                onChange={(e) => handleIssuedAtChange(e.target.value)}
              />
            </label>
            <label className="set-field">
              <span className="set-field-label">Notes</span>
              <input
                className="set-input"
                value={manualRow[F_NOTES]}
                onChange={(e) => updateManualField(F_NOTES, e.target.value)}
                placeholder="e.g. system outage 2026-08-20"
              />
            </label>
          </div>

          {manualPreview && manualPreview.outcome === "ok" && (
            <div className="tbf-preview-line">
              Will {manualPreview.committed ? "record" : "create"} ticket #{manualPreview.ticket_id} for{" "}
              {manualPreview.vehicle} / {manualPreview.driver}
              {manualPreview.route ? ` on ${manualPreview.route}` : ""} —{" "}
              {manualPreview.collection_amount != null ? `₱${manualPreview.collection_amount.toFixed(2)}` : "auto-priced"}
            </div>
          )}

          <div className="set-add-row">
            <button className="set-add-btn" onClick={handlePreviewManual} disabled={manualBusy || !manualRow[F_TICKET_ID]}>
              Preview
            </button>
            <button
              className="set-add-btn"
              onClick={handleConfirmManual}
              disabled={manualBusy || !manualPreview || manualPreview.outcome !== "ok"}
            >
              Confirm & Add
            </button>
            <button className="set-delete-btn" onClick={handleClearManualForm} disabled={manualBusy}>
              Clear
            </button>
          </div>
        </div>
      )}

      {mode === "csv" && (
        <div className="tbf-csv-form">
          <div className="set-add-row">
            <button className="set-add-btn" onClick={downloadCsvTemplate} type="button">
              Download CSV Template
            </button>
            <span className="tbf-meta">Required: {F_TICKET_ID}, {F_PLATE}, {F_DRIVER_IWP}, {F_DRIVER_LAST}. See the column guide below.</span>
          </div>

          <div className="set-add-row">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => { setCsvFile(e.target.files?.[0] || null); }}
            />
            <button className="set-add-btn" onClick={handlePreviewCsv} disabled={csvBusy || !csvFile}>
              Preview Import
            </button>
            <button
              className="set-add-btn"
              onClick={handleImportCsv}
              disabled={csvBusy || !csvReport?.dry_run || csvReport.imported_count === 0}
              title={!csvReport?.dry_run ? "Run Preview Import first" : undefined}
            >
              {csvReport?.dry_run
                ? `Confirm & Import ${csvReport.imported_count} Ticket(s)`
                : "Confirm & Import (preview first)"}
            </button>
            {csvReport && !csvReport.dry_run && (
              <button className="set-delete-btn" onClick={resetCsv} disabled={csvBusy}>
                Start New Import
              </button>
            )}
          </div>

          <BackfillResults report={csvReport} />

          <div className="tbf-csv-reference">
            <h4>CSV column guide</h4>
            <p className="set-rewards-note">
              The downloaded template only has the header row — here's an example of what a
              filled-in row looks like for each column.
            </p>
            <table className="set-table">
              <thead>
                <tr><th>Column</th><th>Required</th><th>Example</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {CSV_COLUMN_REFERENCE.map((col) => (
                  <tr key={col.name}>
                    <td className="set-cell-label">{col.name}</td>
                    <td>{col.required ? "Yes" : "Optional"}</td>
                    <td className="tbf-example-cell">{col.example}</td>
                    <td>{col.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
