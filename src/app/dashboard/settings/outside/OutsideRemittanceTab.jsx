import { useCallback, useEffect, useState } from "react";
import { apiService, IS_REMOTE } from "../../../../lib/api-service";
import { getPhDateString } from "../../../../lib/phDate";
import { SkeletonList, useFeedback } from "../../../../components/ui/kit";
import OutsideRemittanceRecords from "./OutsideRemittanceRecords";
import "../../../../styles/OutsideRemittance.css";

const REASONS = [
  ["REMITTED_WITHOUT_SYSTEM", "Remitted without system"],
  ["SYSTEM_DOWN", "System down"],
  ["OTHER", "Other"],
];
const URL = "/report/remittance/external/";
const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errorMessage = (err) => err?.message?.replace(/^Error:\s*/, "") || "Nothing was changed. Check your connection and try again.";
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// For cash that was already handed in outside the system. Pick the ticket series and the ticket
// numbers the paper remittance covered; the system works out the rest:
//  - numbers that are tickets in the system → kept in trip history and reports, no longer counted as cash owed
//  - numbers nobody has used → handed out on paper, reserved as a paper range
function RecordForm() {
  const { confirmAction } = useFeedback();
  const [seriesList, setSeriesList] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [seriesId, setSeriesId] = useState(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [range, setRange] = useState({ from: "", to: "" });
  const [reason, setReason] = useState(REASONS[0][0]);
  const [note, setNote] = useState("");
  const [usedOn, setUsedOn] = useState(getPhDateString()); // when the paper tickets were issued
  const [counted, setCounted] = useState(null); // { key, ...counts } | { key, error } for the last range asked about
  const key = `${seriesId}:${range.from}:${range.to}`;
  const series = seriesList?.find((s) => s.id === seriesId);
  // Typed numbers must be whole numbers inside the booklet, and nothing below the first number that
  // can still be recorded: everything before it is already remitted. "From" can't pass "Up to".
  const lowest = series ? Math.min(...[series.first_no, series.next_free].filter((n) => n != null)) : 0;
  const outside = (v) => v !== "" && !(Number.isInteger(Number(v)) && Number(v) >= lowest && Number(v) <= Number(series.end_no));
  const badFrom = !!series && outside(range.from);
  const badTo = !!series && outside(range.to);
  const reversed = !!range.from && !!range.to && Number(range.from) > Number(range.to);
  const problem = badFrom || badTo
    ? `Use a ticket number from ${lowest} to ${series.end_no}. Tickets before ${lowest} in this booklet are already remitted.`
    : reversed ? "“From” must come before “Up to”." : "";
  const preview = counted?.key === key ? counted : null; // ignore a count made for an older range

  const load = useCallback(() => {
    apiService.request(URL)
      .then((data) => { setSeriesList(Array.isArray(data) ? data : []); setLoadError(""); })
      .catch((err) => { setSeriesList([]); setLoadError(errorMessage(err)); });
  }, []);

  useEffect(() => { if (!IS_REMOTE) load(); }, [load]);

  // Re-count whenever the range changes (after a short pause for typing).
  useEffect(() => {
    if (!seriesId || !range.from || !range.to || problem) return undefined;
    let stale = false;
    const timer = setTimeout(() => {
      apiService.request(URL, { method: "POST", body: JSON.stringify({ series: seriesId, from_no: range.from, to_no: range.to }) })
        .then((res) => !stale && setCounted({ key, ...res }))
        .catch((err) => !stale && setCounted({ key, error: errorMessage(err) }));
    }, 350);
    return () => { stale = true; clearTimeout(timer); };
  }, [seriesId, range, key, problem]);

  if (IS_REMOTE) return <p className="set-rewards-note">This only works from the LAN terminal itself.</p>;
  if (!seriesList) return <SkeletonList rows={3} h={72} />;

  const pick = (s) => {
    setSeriesId(s.id);
    setRange({ from: s.first_no ?? s.next_free ?? "", to: s.last_no ?? "" });
  };
  // Usually only series with tickets waiting matter; the rest (paper-only) are one click away.
  const hasWaiting = seriesList.some((s) => s.count > 0);
  const q = query.trim().toLowerCase();
  const visible = seriesList.filter((s) =>
    (showAll || !hasWaiting || s.count > 0) && `${s.ticket_form} ${s.series_no}`.toLowerCase().includes(q));
  const hiddenCount = seriesList.length - seriesList.filter((s) => s.count > 0).length;
  const total = preview && !preview.error ? preview.total_amount + preview.paper_amount : 0;
  const today = getPhDateString();
  const futureDate = usedOn > today; // the picker is capped at today, but a date can still be typed
  const needsDate = preview?.paper_count > 0; // only paper tickets carry a date
  const dateOk = !needsDate || (usedOn && !futureDate);
  const canSave = preview && !preview.error && preview.ticket_count + preview.paper_count > 0 && dateOk;

  const save = async () => {
    try {
      const res = await apiService.request(URL, {
        method: "POST",
        body: JSON.stringify({ series: seriesId, from_no: range.from, to_no: range.to, reason, note, used_on: usedOn, commit: true }),
      });
      setSeriesId(null);
      setNote("");
      setUsedOn(getPhDateString());
      load();
      return { success: { title: "Saved", message: `${plural(res.ticket_count, "system ticket")} and ${plural(res.paper_count, "paper ticket")} are now recorded as remitted.` } };
    } catch (err) {
      return { error: { title: "Couldn't save", message: errorMessage(err) } };
    }
  };

  const confirm = () => confirmAction({
    title: "Save this outside remittance?",
    message: `${plural(preview.ticket_count, "ticket")} in the system and ${plural(preview.paper_count, "paper ticket")} (${peso(total)} in all) will be recorded as already remitted. This can't be undone from here.`,
    confirmLabel: "Save",
    busyLabel: "Saving...",
    run: save,
  });

  return (
    <div className="otr">
      <section className="otr-step">
        <h3 className="otr-step-title"><span>1</span> Which ticket series?</h3>
        {loadError && <p className="otr-error">{loadError} <button type="button" className="otr-link" onClick={load}>Try again</button></p>}
        {!loadError && seriesList.length === 0 && <p className="otr-empty">No ticket series found.</p>}

        {series ? (
          <div className="otr-picked">
            <div>
              <strong>{series.ticket_form || "Series"}</strong>
              <span className="otr-row-sub">{series.series_no}</span>
            </div>
            <button type="button" className="otr-link" onClick={() => setSeriesId(null)}>Change</button>
          </div>
        ) : (
          <>
            {seriesList.length > 6 && (
              <input className="usr-input" type="search" placeholder="Search by ticket type or series number…" value={query} onChange={(e) => setQuery(e.target.value)} />
            )}
            <div className="otr-rows" role="listbox" aria-label="Ticket series">
              {visible.map((s) => (
                <button key={s.id} type="button" role="option" aria-selected={false} className="otr-row" onClick={() => pick(s)}>
                  <span className="otr-row-main">
                    <strong>{s.ticket_form || "Series"}</strong>
                    <span className="otr-row-sub">{s.series_no}</span>
                  </span>
                  <span className={`otr-row-count ${s.count ? "" : "otr-row-count--none"}`}>
                    {s.count ? `${plural(s.count, "ticket")} waiting` : "Nothing waiting"}
                  </span>
                </button>
              ))}
              {visible.length === 0 && <p className="otr-empty">No series match.</p>}
            </div>
            {hasWaiting && hiddenCount > 0 && (
              <button type="button" className="otr-link otr-toggle" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Only show series with tickets waiting" : `Show ${plural(hiddenCount, "series", "series")} with nothing waiting (for paper-only tickets)`}
              </button>
            )}
          </>
        )}
      </section>

      {series && (
        <section className="otr-step">
          <h3 className="otr-step-title"><span>2</span> Which tickets were remitted?</h3>
          <div className="otr-pickers">
            <label>
              <span className="usr-label">From ticket no.</span>
              <input className="usr-input" type="number" step="1" min={lowest} max={series.end_no} aria-invalid={badFrom || reversed || undefined} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </label>
            <label>
              <span className="usr-label">Up to ticket no.</span>
              <input className="usr-input" type="number" step="1" min={lowest} max={series.end_no} aria-invalid={badTo || reversed || undefined} autoFocus={!!range.from && !range.to} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </label>
          </div>
          <p className="otr-hint">
            {series.count
              ? `Tickets waiting in the system: #${series.first_no} to #${series.last_no}. If paper tickets came after them, raise "Up to" to the last number on the paper remittance.`
              : `Nothing is waiting in the system for this series, so these are paper tickets. Type the last ticket number on the paper remittance.`}
          </p>

          {problem && <p className="otr-hint otr-hint--error">{problem}</p>}
          {!problem && preview?.error && <p className="otr-hint otr-hint--error">{preview.error}</p>}
          {preview && !preview.error && (
            <div className="otr-result">
              <div className="otr-result-total">{peso(total)}</div>
              <div>
                <div>{plural(preview.ticket_count, "ticket")} in the system · {peso(preview.total_amount)}</div>
                <div>{plural(preview.paper_count, "ticket")} on paper · {peso(preview.paper_amount)}</div>
                {preview.skipped > 0 && <div className="otr-hint">{plural(preview.skipped, "number")} in this range already remitted — left out.</div>}
                {!canSave && <div className="otr-hint otr-hint--error">Nothing in this range can be recorded.</div>}
              </div>
            </div>
          )}

          {canSave && (
            <>
              {preview.paper_count > 0 && (
                <label className="otr-note">
                  <span className="usr-label">Date the paper tickets were issued</span>
                  <input className="usr-input" type="date" required max={today} aria-invalid={!usedOn || futureDate || undefined} value={usedOn} onChange={(e) => setUsedOn(e.target.value)} />
                  {(!usedOn || futureDate) && <span className="otr-hint otr-hint--error">{futureDate ? "The date can't be in the future." : "Enter the date."}</span>}
                </label>
              )}
              <label className="otr-note">
                <span className="usr-label">Note (optional)</span>
                <input className="usr-input" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Remitted to treasury at 2:45 PM" />
              </label>
              <details className="otr-list">
                <summary>Reason: {REASONS.find(([v]) => v === reason)[1]}</summary>
                <select className="usr-select" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </details>
              <button type="button" className="set-add-btn set-add-btn--danger otr-submit" onClick={confirm}>
                Save as remitted
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

const VIEWS = [["record", "Record"], ["recorded", "Recorded so far"]];

export default function OutsideRemittanceTab() {
  const [view, setView] = useState("record");
  if (IS_REMOTE) return <p className="set-rewards-note">This only works from the LAN terminal itself.</p>;
  return (
    <div className="otr">
      <div className="tbf-mode-switch">
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" className={`tbf-mode-btn ${view === key ? "tbf-mode-btn--active" : ""}`} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>
      {view === "record" ? <RecordForm /> : <OutsideRemittanceRecords />}
    </div>
  );
}
