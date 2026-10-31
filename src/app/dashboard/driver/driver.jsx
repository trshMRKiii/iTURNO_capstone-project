import React, { useState } from "react";
import { useDriver } from "./useDriver";
import DriverFormModal from "./DriverFormModal";
import TicketHistoryModal from "../registry/TicketHistoryModal";
import RowMenu from "../registry/RowMenu";
import Pager from "../report/tables/Pager";
import { useTableSort, SortHead } from "../registry/useTableSort";
import { getDriverCode, getDriverDisplayName, getIwpStatus, daysUntilExpiry, expiryLabel } from "./driver-utils";
import { SkeletonRows, HistoryIcon, ArchiveIcon, EditIcon } from "../../../components/ui/kit";
import { exportDriversPDF } from "../registry/registryExport";
import "../../../styles/Driver.css";
import "../../../styles/FormModal.css";
import { useCanModifyFleet } from "../../../lib/useCanModifyFleet";

const SORT_GETTERS = {
  "Full Name": getDriverDisplayName,
  IWP: (d) => d.iwp_number || getDriverCode(d),
  "IWP Status": (d) =>
    d.status !== "ACTIVE"
      ? "Inactive"
      : getIwpStatus(d) === "expired"
        ? "IWP Expired"
        : daysUntilExpiry(d.iwp_expiration_date) !== null
          ? "Expiring Soon"
          : "Active",
};

function Driver({ embedded, searchTerm: externalSearch, onSearchChange, exposeAdd, exposeExportPDF }) {
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

  const [internalSearch, setInternalSearch] = useState("");
  const searchTerm = embedded ? externalSearch : internalSearch;
  const setSearchTerm = embedded ? onSearchChange : setInternalSearch;
  const [currentPage, setCurrentPage] = useState(1);
  const [historyDriver, setHistoryDriver] = useState(null);
  const PAGE_SIZE = 10;

  React.useEffect(() => {
    if (exposeAdd) exposeAdd(handleAdd);
  }, [exposeAdd, handleAdd]);
  const [statusFilter, setStatusFilter] = useState("");
  const statusOptions = [...new Set(drivers.map(SORT_GETTERS["IWP Status"]))].sort();
  const filteredDrivers = drivers.filter((d) => {
    if (statusFilter && SORT_GETTERS["IWP Status"](d) !== statusFilter) return false;
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

  const { sorted: sortedDrivers, sort, onSort } = useTableSort(filteredDrivers, SORT_GETTERS);
  const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDrivers = sortedDrivers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  React.useEffect(() => {
    if (exposeExportPDF) exposeExportPDF(() => exportDriversPDF(sortedDrivers));
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

      <div className="veh-filters">
        <select
          className="veh-filter"
          aria-label="Filter by IWP Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {statusFilter && (
          <button className="veh-filter-clear" onClick={() => setStatusFilter("")}>Clear filters</button>
        )}
      </div>

      {/* Table card */}
      <div className="drv-card">
        <div className="drv-table-wrap">
          <table className="drv-table">
            <thead>
              <tr>
                {["Full Name", "Contact No.", "Address", "IWP", "IWP Status", "Actions"].map((h) => (
                  <SortHead key={h} label={h} sortable={!!SORT_GETTERS[h]} sort={sort} onSort={onSort} />
                ))}
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
                        ) : driver.status === "ACTIVE" && daysUntilExpiry(driver.iwp_expiration_date) !== null ? (
                          <span className="drv-status drv-status--warn" title={`IWP expires ${driver.iwp_expiration_date}`}>
                            {expiryLabel(daysUntilExpiry(driver.iwp_expiration_date))}
                          </span>
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
                        <RowMenu
                          items={[
                            { label: "Edit", icon: <EditIcon size={14} />, onClick: () => handleEdit(driver), hidden: !canModify },
                            { label: "History", icon: <HistoryIcon size={14} />, onClick: () => setHistoryDriver(driver) },
                            { label: "Archive", icon: <ArchiveIcon size={14} />, onClick: () => handleArchive(driver.id), danger: true, hidden: !canModify },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && (
          <Pager page={safePage} totalPages={totalPages} count={filteredDrivers.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
        )}
      </div>

      {historyDriver && (
        <TicketHistoryModal driver={historyDriver} onClose={() => setHistoryDriver(null)} />
      )}

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

