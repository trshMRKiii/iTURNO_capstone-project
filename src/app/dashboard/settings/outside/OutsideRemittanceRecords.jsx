import { useCallback, useEffect, useState } from "react";
import { apiService } from "../../../../lib/api-service";
import { SkeletonList, useFeedback } from "../../../../components/ui/kit";

const URL = "/report/remittance/external/";
const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d) => new Date(`${d}T00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
const errorMessage = (err) => err?.message?.replace(/^Error:\s*/, "") || "Nothing was changed. Check your connection and try again.";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Everything recorded outside the system that hasn't been folded into a real remittance, newest
// first, so a mistake can be taken back. Undoing a "marked as remitted" makes those tickets count
// as cash still to remit again; undoing a paper range frees its numbers for the system.
export default function OutsideRemittanceRecords() {
  const { confirmAction } = useFeedback();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiService.request(`${URL}records/`)
      .then((res) => { setData(res); setError(""); })
      .catch((err) => { setData({ batches: [], paper: [] }); setError(errorMessage(err)); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) return <SkeletonList rows={3} h={56} />;

  const rows = [
    ...data.batches.map((b) => ({
      key: `b${b.id}`, date: b.covers_date,
      title: `${plural(b.ticket_count, "ticket")} in the system · #${b.from_no}–#${b.to_no}`,
      sub: `${b.batch_code} · marked as already remitted`, amount: b.total_amount,
      label: "Undo", path: `${URL}${b.id}/`,
      confirm: {
        title: "Undo this outside remittance?",
        message: `${plural(b.ticket_count, "ticket")} (${peso(b.total_amount)}) will count as cash still to remit again. Nothing is deleted.`,
        done: "Outside remittance undone",
      },
    })),
    ...data.paper.map((p) => ({
      key: `p${p.id}`, date: p.used_on,
      title: `${plural(p.count, "paper ticket")} · ${p.from_no}–${p.to_no}`,
      sub: `Series ${p.series_no} · issued on paper`, amount: Number(p.amount),
      label: "Undo", path: `/paper-issuances/${p.id}/`,
      confirm: {
        title: "Undo this paper range?",
        message: `Numbers ${p.from_no}–${p.to_no} will no longer count as paper tickets and will be available to the system again.`,
        done: "Paper range undone",
      },
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const undo = (row) => confirmAction({
    title: row.confirm.title,
    message: row.confirm.message,
    confirmLabel: row.label,
    busyLabel: "Working...",
    run: async () => {
      try {
        await apiService.request(row.path, { method: "DELETE" });
        load();
        return { success: { title: row.confirm.done } };
      } catch (err) {
        return { error: { title: "Couldn't do that", message: errorMessage(err) } };
      }
    },
  });

  return (
    <section className="otr-step">
      {error && <p className="otr-error">{error} <button type="button" className="otr-link" onClick={load}>Try again</button></p>}
      {!error && rows.length === 0 && <p className="otr-empty">Nothing has been recorded outside the system.</p>}
      {rows.length > 0 && (
        <div className="otr-rows">
          {rows.map((r) => (
            <div key={r.key} className="otr-row otr-row--static">
              <span className="otr-row-main">
                <strong>{r.title}</strong>
                <span className="otr-row-sub">{day(r.date)} · {r.sub}</span>
              </span>
              <span className="otr-row-actions">
                <span className="otr-row-count">{peso(r.amount)}</span>
                <button type="button" className="otr-undo" onClick={() => undo(r)}>{r.label}</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
