import {
  RouteField,
  Field,
  useVehicle,
  STATUS_COLOR,
  STATUS_LABEL,
  DESTINATION,
} from "../../../lib/vehicle/vehicleHook";
import VehicleModal from "../../../lib/vehicle/vehicleModal";

import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import "../../../styles/Vehicle.css";

function Vehicle({ embedded, searchTerm: externalSearch, onSearchChange, exposeAdd, exposeExportQR }) {
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
    selectedRoute,
    activeDrivers,
    transportationTypes,
    routes,
    handleSubmit,
    handleEdit,
    handleAdd,
    closeModal,
    handleDelete,
  } = useVehicle();

  const [internalSearch, setInternalSearch] = useState("");
  const searchTerm = embedded ? externalSearch : internalSearch;
  const setSearchTerm = embedded ? onSearchChange : setInternalSearch;
  const [ledgerVehicle, setLedgerVehicle] = useState(null);

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
  });

  const filteredVehicles = vehicles.filter((v) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      (v.plate_number || "").toLowerCase().includes(q) ||
      (v.franchise_number || "").toLowerCase().includes(q) ||
      (v.qr_code || "").toLowerCase().includes(q) ||
      (v.route_detail?.full_name || "").toLowerCase().includes(q) ||
      (v.route_detail?.origin || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="veh-page">
      {/* Header */}
      <div className="veh-header">
        <div className="veh-header-left">
          <div className="veh-header-accent" />
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

      {error && (
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
                  "QR Code",
                  "Active Driver",
                  "Status",
                  "Actions",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="veh-table-state">
                    <div className="veh-loading-dots">
                      <div />
                      <div />
                      <div />
                    </div>
                  </td>
                </tr>
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
                filteredVehicles.map((vehicle) => (
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
                    <td className="veh-td-route">
                      {vehicle.qr_code || (
                        <span className="veh-na">—</span>
                      )}
                    </td>
                    <td className="veh-td-driver">
                      {vehicle.active_driver_name || (
                        <span className="veh-na">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`veh-status ${STATUS_COLOR[vehicle.status] || "veh-status--default"}`}
                      >
                        {STATUS_LABEL[vehicle.status] || vehicle.status}
                      </span>
                    </td>
                    <td>
                      <div className="veh-actions">
                        <button
                          className="veh-btn veh-btn--edit"
                          onClick={() => handleEdit(vehicle)}
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
                        <button
                          className="veh-btn veh-btn--history"
                          onClick={() => setLedgerVehicle(vehicle)}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                          History
                        </button>
                        <button
                          className="veh-btn veh-btn--delete"
                          onClick={() => handleDelete(vehicle.id)}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="veh-overlay" onClick={closeModal}>
          <div className="veh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="veh-modal-header">
              <div className="veh-modal-header-left">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c9a84c"
                  strokeWidth="2"
                >
                  <rect x="1" y="3" width="15" height="13" rx="1" />
                  <path d="M16 8h4l3 3v5h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
                <h2 className="veh-modal-title">
                  {editing ? "Edit Vehicle Record" : "Register New Vehicle"}
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

            <form onSubmit={handleSubmit} className="veh-modal-body">
              {!editing && (
                <Field label="Plate Number">
                  <input
                    type="text"
                    className="veh-input"
                    placeholder="e.g. ABC 1234"
                    value={form.plate_number}
                    onChange={(e) =>
                      setForm({ ...form, plate_number: e.target.value })
                    }
                    required
                  />
                </Field>
              )}

              <RouteField
                routes={routes}
                form={form}
                setForm={setForm}
                routeMode={routeMode}
                setRouteMode={setRouteMode}
                newOrigin={newOrigin}
                setNewOrigin={setNewOrigin}
                routeError={routeError}
                editing={editing}
                selectedRoute={selectedRoute}
                destination={DESTINATION}
              />

              <Field label="Transportation Type">
                <select
                  className="veh-select"
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
              </Field>

              <Field label="Franchise Number">
                <input
                  type="text"
                  className="veh-input"
                  placeholder="e.g. FR-001"
                  value={form.franchise_number}
                  onChange={(e) =>
                    setForm({ ...form, franchise_number: e.target.value })
                  }
                />
              </Field>

              <Field label="Operator Address">
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

              {editing && form.qr_code && (
                <Field label="Vehicle QR Code">
                  <div className="veh-qr-display">
                    <QRCodeSVG
                      value={form.qr_code}
                      size={160}
                      level="H"
                      includeMargin
                    />
                    <span className="veh-qr-label">{form.qr_code}</span>
                  </div>
                </Field>
              )}

              <Field label="Status">
                <select
                  className="veh-select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="MAINTENANCE">Under Maintenance</option>
                </select>
              </Field>

              <Field label="Active Driver (Optional)">
                <select
                  className="veh-select"
                  value={form.active_driver || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      active_driver: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">— None / Unassigned —</option>
                  {activeDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <p className="veh-field-hint">Only active drivers are shown.</p>
              </Field>

              <div className="veh-modal-footer">
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
                  {editing ? "Update Record" : "Register Vehicle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ledgerVehicle && (
        <VehicleModal
          vehicle={ledgerVehicle}
          onClose={() => setLedgerVehicle(null)}
        />
      )}
    </div>
  );
}

export default Vehicle;
