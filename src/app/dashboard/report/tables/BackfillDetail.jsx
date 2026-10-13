import { useEffect, useState } from "react";
import { DataTable } from "../../../../components/ui/dataTable";
import { apiService } from "../../../../lib/api-service";
import { useFeedback, SkeletonList } from "../../../../components/ui/kit";

const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

// Expanded body of an audit-trail row that came from a backfill: loads the
// BackfillRecord it points at and lists every ticket that batch added.
// LAN-only — BackfillRecord isn't mirrored to Supabase.
export default function BackfillDetail({ id }) {
  const { notify } = useFeedback();
  const [record, setRecord] = useState(null);

  useEffect(() => {
    apiService
      .getBackfillRecord(id)
      .then(setRecord)
      .catch((err) => notify.error({ title: "Couldn't load backfill details", message: err?.message || "Check your connection and try again." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!record) return <SkeletonList rows={5} h={32} />;

  const download = () =>
    apiService.downloadBackfillCsv(record.id, record.csv_filename).catch((err) => notify.error({
      title: "Couldn't download the CSV",
      message: err?.message || "Check your connection and try again.",
      onRetry: download,
    }));

  return (
    <>
      <div className="rpt-muted" style={{ marginBottom: 8 }}>
        {record.ticket_count} ticket(s) · {record.reason}
        {record.has_csv && (
          <button className="rpt-btn rpt-btn--secondary" style={{ marginLeft: 12 }} onClick={download}>Download CSV</button>
        )}
      </div>
      {record.entries?.length > 0 && (
        <DataTable
          columns={["#", "Ticket #", "Time", "Vehicle", "Driver / Route", "Amount"]}
          data={record.entries}
          rowRenderer={(e, i, c) => (
            <tr key={e.ticket_id} className={c.rowClass}>
              <td className={c.cellClass}>{i + 1}</td>
              <td className={c.cellClass}>#{e.ticket_id}</td>
              <td className={c.cellClass}>{e.time?.slice(11)}</td>
              <td className={c.cellClass}>{e.vehicle}</td>
              <td className={c.cellClass}>{e.driver}{e.route ? ` — ${e.route}` : ""}</td>
              <td className={c.cellClass}>{peso(e.amount)}</td>
            </tr>
          )}
        />
      )}
    </>
  );
}
