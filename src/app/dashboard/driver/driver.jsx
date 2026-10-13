import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import { useDriver } from "./useDriver";
import DriverFormModal from "./DriverFormModal";
import { getDriverCode, getDriverDisplayName, getIwpStatus } from "./driver-utils";
import { useFeedback, SkeletonRows } from "../../../components/ui/kit";
import { exportDriversPDF } from "../registry/registryExport";
import "../../../styles/Driver.css";
import "../../../styles/FormModal.css";
import { useCanModifyFleet } from "../../../lib/useCanModifyFleet";

function Driver({ embedded, searchTerm: externalSearch, onSearchChange, exposeAdd, exposeExportQR, exposeExportPDF }) {
  const {
    drivers,
    loading,
    error,
    fieldErrors,
    editing,
    isModalOpen,
    form,
    setForm,
    isDriverOnActiveTicket,
    handleSubmit,
    handleEdit,
    handleAdd,
    closeModal,
    handleArchive,
  } = useDriver();
  const canModify = useCanModifyFleet();

  const { notify } = useFeedback();
  const [internalSearch, setInternalSearch] = useState("");
  const searchTerm = embedded ? externalSearch : internalSearch;
  const setSearchTerm = embedded ? onSearchChange : setInternalSearch;
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  React.useEffect(() => {
    if (exposeAdd) exposeAdd(handleAdd);
  }, [exposeAdd, handleAdd]);
  const filteredDrivers = drivers.filter((d) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;

    const haystack = [
      getDriverCode(d),
      getDriverDisplayName(d),
      d.contact,
      d.iwp_number,
      d.first_name,
      d.middle_name,
      d.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDrivers = filteredDrivers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const exportQR = () => {
    const toExport = filteredDrivers.filter((d) => d.qr_code);
    if (!toExport.length) {
      notify.error({
        title: "No QR codes to export",
        message: "Drivers registered before this feature don't have a QR code yet — edit and re-save them to generate one.",
      });
      return;
    }

    const items = toExport.map((d) => {
      const svgStr = renderToStaticMarkup(
        <QRCodeSVG value={d.qr_code} size={140} level="H" includeMargin />
      );
      return `<div class="qr-item">
        ${svgStr}
        <div class="qr-plate">${getDriverDisplayName(d)}</div>
        <div class="qr-code">${d.qr_code}</div>
        ${d.iwp_number ? `<div class="qr-route">${d.iwp_number}</div>` : ""}
      </div>`;
    }).join("");

    const now = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Driver QR Codes</title>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; background: #fff; }
  h2 { font-size: 16px; margin-bottom: 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 16px; }
  .toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
  .print-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 20px; background: #1a2744; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .print-btn:hover { background: #2d3e5f; }
  .grid { display: flex; flex-wrap: wrap; gap: 20px; }
  .qr-item { border: 1px solid #ddd; border-radius: 6px; padding: 12px; text-align: center; width: 180px; break-inside: avoid; }
  .qr-item svg { display: block; margin: 0 auto; }
  .qr-plate { font-weight: bold; font-size: 13px; margin-top: 8px; }
  .qr-code { font-size: 10px; color: #555; margin-top: 2px; word-break: break-all; }
  .qr-route { font-size: 10px; color: #888; margin-top: 2px; }
  @media print { .toolbar { display: none; } body { margin: 12px; } }
</style>
</head><body>
<div class="toolbar">
  <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
  <span style="font-size:12px;color:#666;">${toExport.length} driver(s) &nbsp;|&nbsp; ${now}${searchTerm ? ` &nbsp;|&nbsp; Filter: "${searchTerm}"` : ""}</span>
</div>
<h2>Driver QR Codes</h2>
<div class="grid">${items}</div>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) {
      notify.error({
        title: "Popup blocked",
        message: "Allow popups for this site, then try the QR export again.",
        onRetry: exportQR,
      });
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  React.useEffect(() => {
    if (exposeExportQR) exposeExportQR(exportQR);
    if (exposeExportPDF) exposeExportPDF(() => exportDriversPDF(filteredDrivers));
  });

  return (
    <div className="drv-page">
      {/* Header */}
      <div className="drv-header">
        <div className="drv-header-left">
          <div>
            <h1 className="drv-title">Driver Registry</h1>
            <p className="drv-subtitle">
              Manage registered drivers and duty status
            </p>
          </div>
        </div>
        <div className="drv-header-right">
          <div className="drv-search-wrap">
            <svg className="drv-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="drv-search"
              placeholder="Search by code or name…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="drv-add-btn" onClick={handleAdd}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Register Driver
          </button>
          {!embedded && (
            <button className="drv-export-qr-btn" onClick={exportQR} title="Export QR codes for filtered drivers">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="3" height="3" rx="0.5" />
                <rect x="18" y="14" width="3" height="3" rx="0.5" />
                <rect x="14" y="18" width="3" height="3" rx="0.5" />
                <rect x="18" y="18" width="3" height="3" rx="0.5" />
              </svg>
              Export QR
            </button>
          )}
        </div>
      </div>

      {error && !isModalOpen && (
        <div className="drv-alert">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {/* Table card */}
      <div className="drv-card">
        <div className="drv-table-wrap">
          <table className="drv-table">
            <thead>
              <tr>
                {["Full Name", "Contact No.", "Address", "IWP", "IWP Status", "Actions"].map(
                  (h) => (
                    <th key={h}>{h}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={6} />
              ) : filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="drv-table-state">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      opacity="0.3"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>
                      {drivers.length === 0
                        ? "No driver records found"
                        : `No results for "${searchTerm}"`}
                    </span>
                  </td>
                </tr>
              ) : (
                paginatedDrivers.map((driver) => (
                  <tr key={driver.id} className="drv-row">
                    <td className="drv-td-name">{getDriverDisplayName(driver)}</td>
                    <td className="drv-td-contact">{driver.contact || "—"}</td>
                    <td className="drv-td-contact">
                      {[driver.barangay, driver.city, driver.province]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td>
                      <span className="drv-code">{/^\d{12}$/.test(driver.iwp_number || "")
                          ? driver.iwp_number.replace(/(\d{4})(?=\d)/g, "$1-")
                          : getDriverCode(driver)}</span>
                    </td>
                    <td>
                      <div className="drv-status-group">
                        {driver.status === "ACTIVE" && getIwpStatus(driver) === "expired" ? (
                          <span className="drv-status drv-status--expired">IWP Expired</span>
                        ) : (
                          <span
                            className={`drv-status ${driver.status === "ACTIVE" ? "drv-status--active" : "drv-status--inactive"}`}
                          >
                            {driver.status === "ACTIVE" ? "Active" : "Inactive"}
                          </span>
                        )}
                        {isDriverOnActiveTicket(driver.id) && (
                          <span className="drv-status drv-status--duty">
                            On Queue
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="drv-actions">
                        {canModify && (
<button
                          className="drv-btn drv-btn--edit"
                          onClick={() => handleEdit(driver)}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit
                        </button>
)}
                        {canModify && (
<button
                          className="drv-btn drv-btn--delete"
                          onClick={() => handleArchive(driver.id)}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <rect x="3" y="4" width="18" height="4" rx="1" />
                            <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                            <path d="M10 12h4" />
                          </svg>
                          Archive
                        </button>
)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filteredDrivers.length > 0 && totalPages > 1 && (
          <div className="drv-pagination">
            <button
              className="drv-page-btn"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
            >
              Prev
            </button>
            <span className="drv-page-info">
              Page {safePage} of {totalPages}
            </span>
            <button
              className="drv-page-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <DriverFormModal
          form={form}
          setForm={setForm}
          fieldErrors={fieldErrors}
          error={error}
          editing={editing}
          hasActiveTicket={!!editing && isDriverOnActiveTicket(editing.id)}
          onSubmit={handleSubmit}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

export default Driver;

