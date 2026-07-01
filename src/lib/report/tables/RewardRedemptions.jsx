import { useState } from "react";
import { DataTable } from "../../../components/ui/dataTable";
import { peso } from "../reportHook";
import ReportTableModal from "./ReportTableModal";

const COLUMNS = ["Date", "Driver", "Points Redeemed", "Peso Value", "Status", "Approved By"];

export default function RewardRedemptions({
  redemptions,
  redemptionsTotal,
  handleExportRedemptionsCSV,
  handleExportRedemptionsPDF,
}) {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");

  const searched = redemptions.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.driver_name, r.status].some(
      (val) => val && String(val).toLowerCase().includes(q),
    );
  });

  const preview = searched.slice(0, 5);

  const modalSearched = searched.filter((r) => {
    if (!modalSearch) return true;
    const q = modalSearch.toLowerCase();
    return [r.driver_name, r.status].some(
      (val) => val && String(val).toLowerCase().includes(q),
    );
  });

  const renderRow = (r, idx, { rowClass, cellClass }) => (
    <tr key={r.id} className={rowClass}>
      <td className={cellClass}>{r.created_at ? r.created_at.slice(0, 10) : "—"}</td>
      <td className={`${cellClass} rpt-bold`}>{r.driver_name || "—"}</td>
      <td className={cellClass}>{r.points_redeemed}</td>
      <td className={cellClass}>{peso(r.peso_value)}</td>
      <td className={cellClass}>{r.status}</td>
      <td className={cellClass}>{r.approved_by_name || <span className="rpt-na">—</span>}</td>
    </tr>
  );

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <span className="rpt-card-title">Reward Redemptions</span>
          <span className="rpt-record-count">
            {preview.length} of {redemptionsTotal} records
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder="Search redemptions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {redemptionsTotal > 5 && (
            <button className="rpt-btn rpt-btn--secondary" onClick={() => setShowModal(true)}>
              View All
            </button>
          )}
          <button className="rpt-btn-export rpt-btn-export--green" onClick={handleExportRedemptionsCSV}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button className="rpt-btn-export rpt-btn-export--red" onClick={handleExportRedemptionsPDF}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      <DataTable columns={COLUMNS} data={preview} rowRenderer={renderRow} />

      {showModal && (
        <ReportTableModal
          title="Reward Redemptions"
          subtitle="Complete history of driver reward redemptions"
          count={modalSearched.length}
          onClose={() => { setShowModal(false); setModalSearch(""); }}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder="Search redemptions…"
        >
          <DataTable columns={COLUMNS} data={modalSearched} rowRenderer={renderRow} />
        </ReportTableModal>
      )}
    </div>
  );
}
