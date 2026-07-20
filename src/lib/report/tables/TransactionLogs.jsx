import { DataTable } from "../../../components/ui/dataTable";
import { useState } from "react";
import ReportTableModal from "./ReportTableModal";
import { exportCSV } from "../reportHook";
import { exportTablePDF } from "../exportPDF";

const LOG_COLUMNS = ["Timestamp", "Ticket ID", "Action", "Driver", "Vehicle", "Route", "User"];
const ROAMING_COLUMNS = ["Ticket ID", "Time", "Vehicle", "Driver", "Issued By", "Verified"];

const formatTime = (dateString) => {
  try {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "N/A";
  }
};

export default function TransactionLogs({
  filteredLogs,
  STATUS_COLORS,
  roaming = [],
}) {
  const [activeTab, setActiveTab] = useState("logs");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");

  const searchedLogs = filteredLogs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [l.timestamp, l.ticket_id, l.action, l.driver, l.vehicle, l.route, l.user]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });

  const searchedRoaming = roaming.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [t.id, t.vehicle?.plate_number, t.driver?.name, t.active_user_name]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });

  const isLogs = activeTab === "logs";
  const searched = isLogs ? searchedLogs : searchedRoaming;
  const preview = searched.slice(0, 5);

  const handleExportLogsCSV = () =>
    exportCSV(
      searchedLogs.map((l) => ({
        Timestamp: l.timestamp,
        "Ticket ID": l.ticket_id,
        Action: l.action,
        Driver: l.driver,
        Vehicle: l.vehicle,
        Route: l.route,
        "Amount (PHP)": l.amount,
        User: l.user,
      })),
      `transaction_logs_${Date.now()}.csv`,
    );

  const handleExportRoamingCSV = () =>
    exportCSV(
      searchedRoaming.map((t) => ({
        "Ticket ID": t.id,
        Time: formatTime(t.issued_at),
        Vehicle: t.vehicle?.plate_number || "",
        Driver: t.driver?.name || "",
        "Issued By": t.active_user_name || "",
        Verified: t.status === "CANCELLED" ? "Cancelled" : t.is_verified ? "Verified" : "Pending",
      })),
      `roaming_logs_${Date.now()}.csv`,
    );

  const handleExportLogsPDF = () =>
    exportTablePDF(
      searchedLogs.map((l) => ({
        Timestamp: l.timestamp,
        "Ticket ID": l.ticket_id,
        Action: l.action,
        Driver: l.driver,
        Vehicle: l.vehicle,
        Route: l.route,
        "Amount (PHP)": l.amount,
        User: l.user,
      })),
      "Transaction Logs",
    );

  const handleExportRoamingPDF = () =>
    exportTablePDF(
      searchedRoaming.map((t) => ({
        "Ticket ID": t.id,
        Time: formatTime(t.issued_at),
        Vehicle: t.vehicle?.plate_number || "",
        Driver: t.driver?.name || "",
        "Issued By": t.active_user_name || "",
        Verified: t.status === "CANCELLED" ? "Cancelled" : t.is_verified ? "Verified" : "Pending",
      })),
      "Roaming Logs",
    );

  const modalSearchedLogs = searchedLogs.filter((l) => {
    if (!modalSearch) return true;
    const q = modalSearch.toLowerCase();
    return [l.timestamp, l.ticket_id, l.action, l.driver, l.vehicle, l.route, l.user]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });

  const modalSearchedRoaming = searchedRoaming.filter((t) => {
    if (!modalSearch) return true;
    const q = modalSearch.toLowerCase();
    return [t.id, t.vehicle?.plate_number, t.driver?.name, t.active_user_name]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });

  const modalData = isLogs ? modalSearchedLogs : modalSearchedRoaming;

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setModalSearch("");
    setShowModal(false);
  };

  const renderLogRow = (l, idx, { rowClass, cellClass }) => (
    <tr key={l.id + idx} className={rowClass}>
      <td className={`${cellClass} rpt-mono rpt-muted`}>{l.timestamp}</td>
      <td className={`${cellClass} rpt-mono`}>{l.ticket_id}</td>
      <td className={cellClass}>
        <span
          className="rpt-action-pill"
          style={{
            background: `${STATUS_COLORS[l.action] || "#64748b"}22`,
            color: STATUS_COLORS[l.action] || "#64748b",
          }}
        >
          {l.action}
        </span>
      </td>
      <td className={cellClass}>{l.driver}</td>
      <td className={cellClass}><span className="rpt-plate">{l.vehicle}</span></td>
      <td className={cellClass}>{l.route}</td>
      <td className={`${cellClass} rpt-muted`}>{l.user}</td>
    </tr>
  );

  const renderRoamingRow = (t, idx, { rowClass, cellClass }) => (
    <tr key={t.id} className={rowClass}>
      <td className={`${cellClass} rpt-mono`}>{String(t.id).replace(/^TICKET-/i, "")}</td>
      <td className={`${cellClass} rpt-mono rpt-muted`}>{formatTime(t.issued_at)}</td>
      <td className={cellClass}>
        {t.vehicle?.plate_number ? (
          <span className="rpt-plate">{t.vehicle.plate_number}</span>
        ) : (
          <span className="rpt-na">—</span>
        )}
      </td>
      <td className={cellClass}>{t.driver?.name || <span className="rpt-na">—</span>}</td>
      <td className={cellClass}>{t.active_user_name || <span className="rpt-na">—</span>}</td>
      <td className={cellClass}>
        <span
          className="rpt-action-pill"
          style={{
            background: `${STATUS_COLORS[t.status === "CANCELLED" ? "CANCELLED" : t.is_verified ? "COLLECTED" : "ISSUED"] || "#64748b"}22`,
            color: STATUS_COLORS[t.status === "CANCELLED" ? "CANCELLED" : t.is_verified ? "COLLECTED" : "ISSUED"] || "#64748b",
          }}
        >
          {t.status === "CANCELLED" ? "Cancelled" : t.is_verified ? "Verified" : "Pending"}
        </span>
      </td>
    </tr>
  );

  return (
    <div className="rpt-card rpt-section">
      <div className="rpt-card-header">
        <div className="rpt-card-header-left">
          <div className="rpt-tab-group">
            <button
              className={`rpt-tab ${isLogs ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("logs")}
            >
              Transaction Logs
            </button>
            <button
              className={`rpt-tab ${!isLogs ? "rpt-tab--active" : ""}`}
              onClick={() => handleTabChange("roaming")}
            >
              Roaming Logs
            </button>
          </div>
          <span className="rpt-record-count">
            {preview.length} of {searched.length} records
          </span>
        </div>
        <div className="rpt-card-header-actions">
          <input
            type="text"
            className="rpt-search-input"
            placeholder={isLogs ? "Search logs…" : "Search roaming…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {searched.length > 5 && (
            <button
              className="rpt-btn rpt-btn--secondary"
              onClick={() => setShowModal(true)}
            >
              View All
            </button>
          )}
          <button
            className="rpt-btn-export rpt-btn-export--green"
            onClick={isLogs ? handleExportLogsCSV : handleExportRoamingCSV}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button
            className="rpt-btn-export rpt-btn-export--red"
            onClick={isLogs ? handleExportLogsPDF : handleExportRoamingPDF}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {isLogs ? (
        <DataTable columns={LOG_COLUMNS} data={preview} rowRenderer={renderLogRow} />
      ) : (
        <DataTable columns={ROAMING_COLUMNS} data={preview} rowRenderer={renderRoamingRow} />
      )}

      {showModal && (
        <ReportTableModal
          title={isLogs ? "Transaction Logs" : "Roaming Logs"}
          subtitle={isLogs ? "Full ticket activity history" : "Full roaming vehicle activity history"}
          count={modalData.length}
          onClose={() => { setShowModal(false); setModalSearch(""); }}
          searchValue={modalSearch}
          onSearchChange={setModalSearch}
          searchPlaceholder={isLogs ? "Search logs…" : "Search roaming…"}
        >
          {isLogs ? (
            <DataTable columns={LOG_COLUMNS} data={modalData} rowRenderer={renderLogRow} />
          ) : (
            <DataTable columns={ROAMING_COLUMNS} data={modalData} rowRenderer={renderRoamingRow} />
          )}
        </ReportTableModal>
      )}
    </div>
  );
}
