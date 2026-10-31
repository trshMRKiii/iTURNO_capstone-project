import {
  RouteField,
  Field,
  useVehicle,
  VEHICLE_SECTIONS,
  STATUS_COLOR,
  STATUS_LABEL,
  DESTINATION,
  SegmentedInput,
  PLATE_SEGMENTS,
  FRANCHISE_SEGMENTS,
  buildDriverAddress,
} from "./vehicleHook";
import TicketHistoryModal from "../registry/TicketHistoryModal";
import RowMenu from "../registry/RowMenu";
import Pager from "../report/tables/Pager";
import { useTableSort, SortHead } from "../registry/useTableSort";
import { getExpiryStatus, daysUntilExpiry, expiryLabel } from "../driver/driver-utils";
import { exportVehiclesPDF } from "../registry/registryExport";

import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import "../../../styles/Vehicle.css";
import "../../../styles/FormModal.css";
import { useCanModifyFleet } from "../../../lib/useCanModifyFleet";
import { SkeletonRows, HistoryIcon, ArchiveIcon, EditIcon } from "../../../components/ui/kit";

const SORT_GETTERS = {
  Route: (v) => v.route_detail?.full_name,
  Transportation: (v) => v.transportation_name,
  "Franchise #": (v) => v.franchise_number,
  "Operator Name": (v) => v.owner_driver_name,
  "Franchise Status": (v) =>
    v.status === "AVAILABLE" && getExpiryStatus(v.franchise_expiration_date) === "expired"
      ? "Franchise Expired"
      : v.status === "AVAILABLE" && daysUntilExpiry(v.franchise_expiration_date) !== null
        ? "Expiring Soon"
        : STATUS_LABEL[v.status] || v.status,
};

function Vehicle({ embedded, searchTerm: externalSearch, onSearchChange, exposeAdd, exposeExportQR, exposeExportPDF }) {
  const {
    vehicles,
    loading,
    error,
    editing,
    isModalOpen,
    form,
    setForm,
    routeMode,
    setRouteMode,
    newOrigin,
    setNewOrigin,
    routeError,
    fieldErrors,
    liveErrors,
    selectedRoute,
    activeDrivers,
    transportationTypes,
    routes,
    handleSubmit,
    handleEdit,
    handleAdd,
    closeModal,
    handleArchive,
  } = useVehicle();
  const canModify = useCanModifyFleet();

  const [internalSearch, setInternalSearch] = useState("");
  const searchTerm = embedded ? externalSearch : internalSearch;
  const setSearchTerm = embedded ? onSearchChange : setInternalSearch;
  const [ledgerVehicle, setLedgerVehicle] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [operatorSearch, setOperatorSearch] = useState("");
  const [showOperatorList, setShowOperatorList] = useState(false);

  const selectedOperator = activeDrivers.find((d) => d.id === form.owner_driver);
  // While the box still shows the chosen name, list everyone so another operator can be picked;
  // once the text is edited, filter by what was typed.
  const operatorQuery = operatorSearch.toLowerCase().trim();
  const showAllOperators = !operatorQuery || (selectedOperator && operatorSearch === selectedOperator.name);
  const filteredDrivers = activeDrivers.filter((d) =>
    showAllOperators || (d.name || "").toLowerCase().includes(operatorQuery)
  );

  // Plate number is fixed once registered, so it only counts while adding.
  const requiredKeys = VEHICLE_SECTIONS.flatMap((s) => s.fields).filter(
    (k) => editing || k !== "plate_number",
  );
  const doneCount = requiredKeys.filter((k) => !liveErrors[k]).length;
  const previewType = transportationTypes.find((t) => t.id === form.transportation_id)?.name;
  const previewRoute = routes.find((r) => r.id === form.route)?.full_name;

  const errCls = (base, name) => (fieldErrors[name] ? `${base} veh-input--error` : base);
  const FieldError = ({ name }) =>
    fieldErrors[name] ? <p className="veh-field-error">{fieldErrors[name]}</p> : null;

  const selectOperator = (driver) => {
    setForm({
      ...form,
      owner_driver: driver ? driver.id : null,
      operator_address: driver
        ? buildDriverAddress(driver)
        : form.operator_address,
    });
    setOperatorSearch(driver ? driver.name : "");
    setShowOperatorList(false);
  };

  React.useEffect(() => {
    if (isModalOpen) {
      const current = activeDrivers.find((d) => d.id === form.owner_driver);
      setOperatorSearch(current ? current.name : "");
    }
  }, [isModalOpen, form.owner_driver, activeDrivers]);

  const exportQR = () => {
    const toExport = filteredVehicles.filter((v) => v.qr_code);
    if (!toExport.length) return;

    const items = toExport.map((v) => {
      const svgStr = renderToStaticMarkup(
        <QRCodeSVG value={v.qr_code} size={140} level="H" includeMargin />
      );
      return `<div class="qr-item">
        ${svgStr}
        <div class="qr-plate">${v.plate_number || ""}</div>
        <div class="qr-code">${v.qr_code}</div>
        ${v.route_detail?.full_name ? `<div class="qr-route">${v.route_detail.full_name}</div>` : ""}
      </div>`;
    }).join("");

    const now = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Vehicle QR Codes</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; margin: 24px; background: #fff; }
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
  <span style="font-size:12px;color:#666;">${toExport.length} vehicle(s) &nbsp;|&nbsp; ${now}${searchTerm ? ` &nbsp;|&nbsp; Filter: "${searchTerm}"` : ""}</span>
</div>
<h2>Vehicle QR Codes</h2>
<div class="grid">${items}</div>
</body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  React.useEffect(() => {
    if (exposeAdd) exposeAdd(handleAdd);
  }, [exposeAdd, handleAdd]);

  React.useEffect(() => {
    if (exposeExportQR) exposeExportQR(exportQR);
    if (exposeExportPDF) exposeExportPDF(() => exportVehiclesPDF(sortedVehicles));
  });

  const [filters, setFilters] = useState({ Route: "", Transportation: "", "Franchise Status": "" });
  const filterOptions = Object.fromEntries(
    Object.keys(filters).map((k) => [k, [...new Set(vehicles.map(SORT_GETTERS[k]).filter(Boolean))].sort()]),
  );
  const filteredVehicles = vehicles.filter((v) => {
    if (Object.entries(filters).some(([k, val]) => val && SORT_GETTERS[k](v) !== val)) return false;
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      (v.plate_number || "").toLowerCase().includes(q) ||
      (v.franchise_number || "").toLowerCase().includes(q) ||
      (v.qr_code || "").toLowerCase().includes(q) ||
      (v.route_detail?.full_name || "").toLowerCase().includes(q) ||
      (v.route_detail?.origin || "").toLowerCase().includes(q) ||
      (v.status || "").toLowerCase().includes(q) ||
      (STATUS_LABEL[v.status] || "").toLowerCase().includes(q)
    );
  });

  const { sorted: sortedVehicles, sort, onSort } = useTableSort(filteredVehicles, SORT_GETTERS);
  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedVehicles = sortedVehicles.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters]);

  return (
    <div className="veh-page">
      {/* Header */}
      <div className="veh-header">
        <div className="veh-header-left">
          <div>
            <h1 className="veh-title">Vehicle Registry</h1>
            <p className="veh-subtitle">
              Manage registered vehicles and driver assignments
            </p>
          </div>
        </div>
        <div className="veh-header-right">
          <div className="veh-search-wrap">
            <svg className="veh-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="veh-search"
              placeholder="Search by plate or route…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="veh-add-btn" onClick={handleAdd}>
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
            Register Vehicle
          </button>
          <button className="veh-export-qr-btn" onClick={exportQR} title="Export QR codes for filtered vehicles">
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
        </div>
      </div>

      {error && !isModalOpen && (
        <div className="veh-alert">
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
        {Object.keys(filters).map((k) => (
          <select
            key={k}
            className="veh-filter"
            aria-label={`Filter by ${k}`}
            value={filters[k]}
            onChange={(e) => setFilters({ ...filters, [k]: e.target.value })}
          >
            <option value="">All {k === "Franchise Status" ? "statuses" : k === "Route" ? "routes" : "transport types"}</option>
            {filterOptions[k].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        {Object.values(filters).some(Boolean) && (
          <button
            className="veh-filter-clear"
            onClick={() => setFilters({ Route: "", Transportation: "", "Franchise Status": "" })}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="veh-card">
        <div className="veh-table-wrap">
          <table className="veh-table">
            <thead>
              <tr>
                {[
                  "Plate Number",
                  "Route",
                  "Transportation",
                  "Franchise #",
                  "Operator Name",
                  "Franchise Status",
                  "Actions",
                ].map((h) => (
                  <SortHead key={h} label={h} sortable={!!SORT_GETTERS[h]} sort={sort} onSort={onSort} />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={6} />
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan="6" className="veh-table-state">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      opacity="0.3"
                    >
                      <rect x="1" y="3" width="15" height="13" rx="1" />
                      <path d="M16 8h4l3 3v5h-7V8z" />
                      <circle cx="5.5" cy="18.5" r="2.5" />
                      <circle cx="18.5" cy="18.5" r="2.5" />
                    </svg>
                    <span>
                      {vehicles.length === 0
                        ? "No vehicle records found"
                        : `No results for "${searchTerm}"`}
                    </span>
                  </td>
                </tr>
              ) : (
                paginatedVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="veh-row">
                    <td>
                      <span className="veh-plate">{vehicle.plate_number}</span>
                    </td>
                    <td className="veh-td-route">
                      {vehicle.route_detail ? (
                        vehicle.route_detail.full_name
                      ) : (
                        <span className="veh-na">No route</span>
                      )}
                    </td>
                    <td className="veh-td-route">
                      {vehicle.transportation_name || vehicle.transportation_id || (
                        <span className="veh-na">—</span>
                      )}
                    </td>
                    <td className="veh-td-route">
                      {vehicle.franchise_number || (
                        <span className="veh-na">—</span>
                      )}
                    </td>
                    
                    <td className="veh-td-driver">
                      {vehicle.owner_driver_name || (
                        <span className="veh-na">Unassigned</span>
                      )}
                    </td>
                    <td>
                      {vehicle.status === "AVAILABLE" && getExpiryStatus(vehicle.franchise_expiration_date) === "expired" ? (
                        <span className="veh-status veh-status--expired">Franchise Expired</span>
                      ) : vehicle.status === "AVAILABLE" && daysUntilExpiry(vehicle.franchise_expiration_date) !== null ? (
                        <span className="veh-status veh-status--warn" title={`Franchise expires ${vehicle.franchise_expiration_date}`}>
                          {expiryLabel(daysUntilExpiry(vehicle.franchise_expiration_date))}
                        </span>
                      ) : (
                        <span
                          className={`veh-status ${STATUS_COLOR[vehicle.status] || "veh-status--default"}`}
                        >
                          {STATUS_LABEL[vehicle.status] || vehicle.status}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="veh-actions">
                        <RowMenu
                          items={[
                            { label: "Edit", icon: <EditIcon size={14} />, onClick: () => handleEdit(vehicle), hidden: !canModify },
                            { label: "History", icon: <HistoryIcon size={14} />, onClick: () => setLedgerVehicle(vehicle) },
                            { label: "Archive", icon: <ArchiveIcon size={14} />, onClick: () => handleArchive(vehicle.id), danger: true, hidden: !canModify },
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
          <Pager page={safePage} totalPages={totalPages} count={filteredVehicles.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="veh-overlay" onClick={closeModal}>
          <div className="veh-modal veh-modal--registry" onClick={(e) => e.stopPropagation()}>
            <div className="veh-modal-header">
              <div className="veh-modal-header-left">
                <h2 className="veh-modal-title">
                  {editing ? "Vehicle profile" : "Register new vehicle"}
                </h2>
              </div>
              <button
                className="veh-modal-close"
                onClick={closeModal}
                aria-label="Close"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="veh-modal-form">
              <div className="veh-modal-split">
                <aside className="veh-side">
                  <div className="veh-preview">
                    <span className="veh-preview-tag">Preview</span>
                    <strong className="veh-preview-name">{form.plate_number || "New vehicle"}</strong>
                    {previewType && <span className="veh-preview-line">{previewType}</span>}
                    {previewRoute && <span className="veh-preview-line">{previewRoute}</span>}
                    {form.franchise_number && (
                      <span className="veh-preview-line veh-preview-mono">Franchise {form.franchise_number}</span>
                    )}
                  </div>

                  <ul className="veh-checklist">
                    {VEHICLE_SECTIONS.map((section) => {
                      const missing = section.fields.filter(
                        (k) => (editing || k !== "plate_number") && liveErrors[k],
                      ).length;
                      return (
                        <li key={section.title} className="veh-check">
                          <span className={`veh-check-icon${missing ? " veh-check-icon--todo" : ""}`}>
                            {missing ? "!" : "✓"}
                          </span>
                          <span>
                            <strong>{section.title}</strong>
                            <small className={missing ? "veh-check-todo" : ""}>
                              {missing
                                ? `${missing} field${missing === 1 ? "" : "s"} need${missing === 1 ? "s" : ""} attention`
                                : "Complete"}
                            </small>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </aside>

                <div className="veh-main">

              {/* Vehicle Information */}
              <div className="veh-profile-section">
                <h3 className="veh-section-title">
                  <span className="veh-section-num">1</span>
                  Vehicle information
                </h3>
                <div className="veh-profile-grid">
                  <Field label="Transportation type" required>
                    <select
                      className={errCls("veh-select", "transportation_id")}
                      value={form.transportation_id || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          transportation_id: e.target.value ? Number(e.target.value) : "",
                        })
                      }
                    >
                      <option value="">— Select type —</option>
                      {transportationTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                    <FieldError name="transportation_id" />
                  </Field>
                  {!editing && (
                    <Field label="Plate number" required>
                      <SegmentedInput
                        label="Plate number"
                        segments={PLATE_SEGMENTS}
                        className={errCls("veh-input", "plate_number")}
                        value={form.plate_number}
                        onChange={(plate_number) => setForm({ ...form, plate_number })}
                      />
                      <FieldError name="plate_number" />
                      {!fieldErrors.plate_number && <p className="veh-field-hint">3 letters, then 3–4 digits. Can't be changed after registering.</p>}
                    </Field>
                  )}
                  <Field label="Franchise number" required>
                    <SegmentedInput
                      label="Franchise number"
                      segments={FRANCHISE_SEGMENTS}
                      className={errCls("veh-input", "franchise_number")}
                      value={form.franchise_number}
                      onChange={(franchise_number) => setForm({ ...form, franchise_number })}
                    />
                    <FieldError name="franchise_number" />
                    {!fieldErrors.franchise_number && <p className="veh-field-hint">Format YY-NNNNN (7 digits).</p>}
                  </Field>
                  <Field label="Franchise expiration date" required>
                    <input
                      type="date"
                      className={errCls("veh-input", "franchise_expiration_date")}
                      value={form.franchise_expiration_date || ""}
                      onChange={(e) =>
                        setForm({ ...form, franchise_expiration_date: e.target.value })
                      }
                    />
                    <FieldError name="franchise_expiration_date" />
                  </Field>
                </div>
              </div>

              {/* Route & Assignment */}
              <div className="veh-profile-section">
                <h3 className="veh-section-title">
                  <span className="veh-section-num">2</span>
                  Route
                </h3>
                <RouteField
                  routes={routes}
                  form={form}
                  setForm={setForm}
                  routeMode={routeMode}
                  setRouteMode={setRouteMode}
                  newOrigin={newOrigin}
                  setNewOrigin={setNewOrigin}
                  routeError={routeError || fieldErrors.route}
                  editing={editing}
                  selectedRoute={selectedRoute}
                  destination={DESTINATION}
                />
                <div className="veh-profile-grid">
                  <Field label="Operator name" required>
                    <div className="veh-operator-search-wrap">
                      <input
                        type="text"
                        className={errCls("veh-input", "owner_driver")}
                        placeholder="Search operator by name…"
                        value={operatorSearch}
                        onChange={(e) => {
                          setOperatorSearch(e.target.value);
                          setShowOperatorList(true);
                        }}
                        onFocus={(e) => {
                          e.target.select();
                          setShowOperatorList(true);
                        }}
                        onBlur={() =>
                          setTimeout(() => {
                            setShowOperatorList(false);
                            // Unpicked text isn't a selection: snap back to the chosen operator (or empty).
                            setOperatorSearch(selectedOperator ? selectedOperator.name : "");
                          }, 150)
                        }
                      />
                      {showOperatorList && (
                        <ul className="veh-operator-list">
                          <li
                            className="veh-operator-option veh-operator-option--none"
                            onMouseDown={() => selectOperator(null)}
                          >
                            — None / Unassigned —
                          </li>
                          {filteredDrivers.length === 0 ? (
                            <li className="veh-operator-empty">No matching operators</li>
                          ) : (
                            filteredDrivers.map((d) => (
                              <li
                                key={d.id}
                                className={`veh-operator-option ${d.id === form.owner_driver ? "veh-operator-option--active" : ""}`}
                                onMouseDown={() => selectOperator(d)}
                              >
                                {d.name}
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </div>
                    <FieldError name="owner_driver" />
                    <p className="veh-field-hint">Only active drivers are shown.</p>
                  </Field>
                  <Field label="Operator address" optional>
                    <input
                      type="text"
                      className="veh-input"
                      placeholder="e.g. Brgy. X, City"
                      value={form.operator_address}
                      onChange={(e) =>
                        setForm({ ...form, operator_address: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>

              {editing && form.qr_code && (
                <div className="veh-profile-section">
                  <h3 className="veh-section-title">Vehicle QR code</h3>
                  <div className="veh-qr-display">
                    <QRCodeSVG
                      value={form.qr_code}
                      size={160}
                      level="H"
                      includeMargin
                    />
                    <span className="veh-qr-label">{form.qr_code}</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="veh-alert veh-alert--inline">
                  <svg
                    width="13"
                    height="13"
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

                </div>
              </div>

              <div className="veh-modal-footer veh-modal-footer--registry">
                <div className="veh-progress">
                  <div className="veh-progress-bar">
                    <span style={{ transform: `scaleX(${doneCount / requiredKeys.length})` }} />
                  </div>
                  <small>{doneCount} of {requiredKeys.length} required fields done</small>
                </div>
                <button
                  type="button"
                  className="veh-modal-btn veh-modal-btn--cancel"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="veh-modal-btn veh-modal-btn--submit"
                >
                  {editing ? "Save changes" : "Register vehicle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ledgerVehicle && (
        <TicketHistoryModal
          vehicle={ledgerVehicle}
          onClose={() => setLedgerVehicle(null)}
        />
      )}
    </div>
  );
}

export default Vehicle;
