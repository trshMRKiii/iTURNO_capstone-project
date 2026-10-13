import React, { useState } from "react";
import { useFeedback } from "../../../../components/ui/kit";
import { IS_REMOTE } from "../../../../lib/api-service";
import { focusFirstError } from "../../../../lib/focusFirstError";
import "../../../../styles/FormModal.css";
import {
  F_PLATE, F_TICKET_TYPE, F_SERIES, F_QUANTITY, F_ISSUED_AT, F_MODE, F_NOTES,
} from "./fields";

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h).padStart(2, "0"),
  label: `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`,
}));

let slotSeq = 0;
const newSlot = (hour) => ({ id: ++slotSeq, hour, plates: [] });

// Each entry is one trip, collected like a live dispatch: enough tickets of the picked
// series to add up to the vehicle type's terminal price (UV P40 = 4 x P10 tickets).
// Mirrors backfill.py's _resolve_batch; null = the series can't make that price.
function ticketsPerTrip(vehicle, series) {
  const terminal = Math.round(Number(vehicle.terminal_price) * 100);
  const price = Math.round(Number(series?.ticket_form_price) * 100);
  if (!terminal || !price || terminal % price) return null;
  return terminal / price;
}

function VehiclePicker({ vehicles, series, onAdd, invalid }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const results = vehicles
    .filter((v) => v.plate_number?.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 30);

  // Why a vehicle can't be added (shown in place of its driver), or "" if it can.
  const note = (v) => {
    if (!v.owner_driver_name) return "no registered owner";
    if (!Number(v.terminal_price)) return "no vehicle type / terminal price";
    if (series && ticketsPerTrip(v, series) === null) {
      return `${v.transportation_name} ₱${Number(v.terminal_price).toFixed(0)} doesn't fit this series`;
    }
    return "";
  };

  return (
    <div className="tbf-searchable">
      <input
        className={`set-input${invalid ? " set-input--error" : ""}`}
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Search plate number — click to add in order (same plate can repeat)"
      />
      {open && (
        <div className="tbf-dropdown">
          {results.length === 0 ? (
            <div className="tbf-dropdown-empty">No matches</div>
          ) : results.map((v) => (
            <div
              key={v.id}
              className={`tbf-dropdown-item ${note(v) ? "tbf-dropdown-item--disabled" : ""}`}
              // Keeps the input focused so the list stays open for picking several in a row.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => !note(v) && onAdd(v.plate_number)}
            >
              {v.plate_number} — {note(v) || `${v.owner_driver_name}${series ? ` · ${ticketsPerTrip(v, series)} ticket(s)` : ""}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BackfillBuilder({ mode, vehicles, ticketSeries, busy, submitRows }) {
  const { notify, report, confirmAction } = useFeedback();

  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [seriesId, setSeriesId] = useState("");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState(() => [newSlot("07")]);
  // Results shown in the confirm modal (LAN only): the dry-run before saving, or
  // what failed after a save. Null = modal closed.
  const [review, setReview] = useState(null);
  const [showErrors, setShowErrors] = useState(false);

  const editSlot = (id, fn) => setSlots((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));

  // Each hour can only be used by one time block — add vehicles to the existing
  // block instead of making a second one for the same time.
  const usedHours = new Set(slots.map((s) => s.hour));
  const addSlot = () => {
    const lastHour = Number(slots[slots.length - 1]?.hour ?? 6);
    const free = HOURS.find((h) => Number(h.value) > lastHour && !usedHours.has(h.value))
      || HOURS.find((h) => !usedHours.has(h.value));
    if (free) setSlots((prev) => [...prev, newSlot(free.value)]);
  };

  const series = ticketSeries.find((t) => String(t.id) === seriesId);
  const rows = slots.flatMap((s) =>
    // One row per entry, in the order picked — tickets are numbered in the order
    // they're saved, so FVT, VSZ, FVT stays that sequence (not FVT ×2, VSZ).
    s.plates.map((plate) => ({
      [F_PLATE]: plate,
      [F_TICKET_TYPE]: series?.ticket_form_label || "",
      [F_SERIES]: seriesId,
      [F_QUANTITY]: "", // blank = the backend fills the trip to the terminal price
      [F_ISSUED_AT]: `${date} ${s.hour}:00`,
      [F_MODE]: mode,
      [F_NOTES]: notes.trim(),
    }))
  );
  const vehicleByPlate = new Map(vehicles.map((v) => [v.plate_number, v]));
  const ticketsFor = (plate) => (series && vehicleByPlate.get(plate) ? ticketsPerTrip(vehicleByPlate.get(plate), series) : null) ?? 1;
  const totalTickets = rows.reduce((sum, r) => sum + ticketsFor(r[F_PLATE]), 0);
  // Buttons stay clickable so a click on an incomplete form says what's missing
  // (and the fields turn red) instead of doing nothing.
  const missing = [
    !date && "Date",
    !series && "Ticket Series",
    !notes.trim() && "Notes",
    slots.some((s) => s.plates.length === 0) && "at least one vehicle in every time",
  ].filter(Boolean);
  const invalid = (isBad) => (showErrors && isBad ? " set-input--error" : "");
  const incomplete = () => {
    if (missing.length === 0) return false;
    setShowErrors(true);
    focusFirstError(".tbf-manual-form");
    notify.error({ title: "Still needed", message: missing.join(", ") });
    return true;
  };

  const reset = () => {
    setSlots([newSlot("07")]);
    setNotes("");
    setReview(null);
    setShowErrors(false);
  };

  const commit = async () => {
    const results = await submitRows(rows, true);
    if (results.every((r) => r.outcome === "ok")) {
      reset();
      return IS_REMOTE
        ? { success: { title: "Backfill queued", message: `${totalTickets} ticket(s) will be created on the LAN terminal's next sync.` } }
        : { success: { title: "Tickets added", message: `${totalTickets} ticket(s) were added.` } };
    }
    // Saved all-or-nothing, so nothing was added and the form is left as it was.
    setReview(results);
    return { error: { title: "Nothing was saved", message: "Fix the entries marked in red." } };
  };

  const handleConfirm = async () => {
    if (incomplete()) return;
    if (IS_REMOTE) {
      confirmAction({
        title: `Queue ${totalTickets} ticket(s)?`,
        message: "The LAN terminal creates them on its next sync.",
        confirmLabel: "Queue",
        busyLabel: "Queuing…",
        tone: "primary",
        run: commit,
      });
      return;
    }
    setReview(await submitRows(rows, false));
  };

  const reviewOk = review?.every((r) => r.outcome === "ok");

  return (
    <div className="tbf-manual-form">
      <div className="set-add-row">
        <label className="set-field">
          <span className="set-field-label">Date *</span>
          <input type="date" className={`set-input${invalid(!date)}`} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="set-field">
          <span className="set-field-label">Ticket Series *</span>
          <select className={`set-input${invalid(!series)}`} value={seriesId} onChange={(e) => setSeriesId(e.target.value)}>
            <option value="">— select —</option>
            {ticketSeries.filter((t) => t.remaining > 0).map((t) => (
              <option key={t.id} value={t.id}>
                {t.series_no} — {t.ticket_form_label} (₱{Number(t.ticket_form_price).toFixed(2)}) · {t.remaining} left
              </option>
            ))}
          </select>
        </label>
        <label className="set-field">
          <span className="set-field-label">Notes *</span>
          <input
            className={`set-input${invalid(!notes.trim())}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this is being backfilled, e.g. system outage"
          />
        </label>
      </div>

      {slots.map((slot, i) => (
        <div className="tbf-slot" key={slot.id}>
          <div className="tbf-slot-head">
            <label className="set-field">
              <span className="set-field-label">Time {i + 1} *</span>
              <select
                className="set-input"
                value={slot.hour}
                onChange={(e) => editSlot(slot.id, (s) => ({ ...s, hour: e.target.value }))}
              >
                {HOURS.map((h) => (
                  <option key={h.value} value={h.value} disabled={h.value !== slot.hour && usedHours.has(h.value)}>
                    {h.label}{h.value !== slot.hour && usedHours.has(h.value) ? " (already added)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {slots.length > 1 && (
              <button
                className="set-delete-btn"
                onClick={() => setSlots((prev) => prev.filter((s) => s.id !== slot.id))}
              >
                Remove time
              </button>
            )}
          </div>

          <VehiclePicker
            series={series}
            invalid={showErrors && slot.plates.length === 0}
            vehicles={vehicles}
            onAdd={(plate) => editSlot(slot.id, (s) => ({ ...s, plates: [...s.plates, plate] }))}
          />

          <div className="tbf-chips">
            {slot.plates.map((plate, idx) => (
              <span className="tbf-chip" key={idx}>
                <span className="tbf-chip-no">{idx + 1}</span>
                {plate}{series ? <span className="tbf-meta"> · {ticketsFor(plate)} ticket(s)</span> : null}
                <button
                  type="button"
                  title="Remove"
                  onClick={() => editSlot(slot.id, (s) => ({ ...s, plates: s.plates.filter((_, i) => i !== idx) }))}
                >
                  ×
                </button>
              </span>
            ))}
            {slot.plates.length === 0 && <span className="tbf-meta">No vehicles added for this time yet.</span>}
          </div>
        </div>
      ))}

      <div className="set-add-row">
        <button className="tbf-plain-btn" onClick={addSlot} disabled={usedHours.size >= HOURS.length}>+ Add another time</button>
      </div>

      <div className="set-add-row">
        <button
          className="set-add-btn"
          onClick={handleConfirm}
          disabled={busy}
        >
          {IS_REMOTE ? "Queue for Backfill" : `Confirm & Add${totalTickets ? ` ${totalTickets} ticket(s)` : ""}`}
        </button>
        <button className="set-delete-btn" onClick={reset} disabled={busy}>Clear</button>
      </div>

      {review && (
        <div className="usr-overlay" onClick={() => !busy && setReview(null)}>
          <div className="usr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="usr-modal-header">
              <h2 className="usr-modal-title">{reviewOk ? `Add ${review.reduce((n, r) => n + (r.ticket_ids?.length || 0), 0)} ticket(s)?` : "Some entries need fixing"}</h2>
            </div>
            <div className="usr-modal-body">
              <p className="set-rewards-note">
                {mode} · {date} · Series {series?.series_no}. {reviewOk
                  ? "This creates real records, numbered in this order."
                  : "Fix the entries in red in the form, then confirm again."}
              </p>
              <table className="set-table">
                <thead>
                  <tr><th>Time</th><th>Ticket #</th><th>Vehicle</th><th>Driver / Route</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {review.map((r, i) => (
                    <tr key={i} className={r.outcome === "ok" ? "" : "tbf-row--error"}>
                      <td>{r.row[F_ISSUED_AT].slice(11)}</td>
                      <td>{r.outcome === "ok" ? `#${r.ticket_ids?.join(", #") ?? "?"}` : "—"}</td>
                      <td className="set-cell-label">{r.row[F_PLATE]}</td>
                      {r.outcome === "ok" ? (
                        <>
                          <td>{r.driver}{r.route ? ` — ${r.route}` : ""}</td>
                          <td>₱{r.total_amount.toFixed(2)}</td>
                        </>
                      ) : (
                        <td colSpan={2}>{r.reason}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="usr-modal-footer">
                <button className="usr-modal-btn usr-modal-btn--cancel" onClick={() => setReview(null)} disabled={busy}>
                  {reviewOk ? "Cancel" : "Close"}
                </button>
                {reviewOk && (
                  <button
                    className="usr-modal-btn usr-modal-btn--submit"
                    disabled={busy}
                    onClick={async () => { setReview(null); report(await commit()); }}
                  >
                    Confirm & Add
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
