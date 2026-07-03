import React, { useState, useMemo } from "react";
import { useDriver } from "../../../lib/useDriver";
import { getDriverCode, getDriverDisplayName } from "../../../lib/driver-utils";
import "../../../styles/Driver.css";

function capitalizeWords(value) {
  return value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function Driver({ embedded, searchTerm: externalSearch, onSearchChange, exposeAdd }) {
  const {
    drivers,
    loading,
    error,
    editing,
    isModalOpen,
    form,
    setForm,
    isDriverOnActiveTicket,
    handleSubmit,
    handleEdit,
    handleAdd,
    closeModal,
    handleDelete,
  } = useDriver();

  const [internalSearch, setInternalSearch] = useState("");
  const searchTerm = embedded ? externalSearch : internalSearch;
  const setSearchTerm = embedded ? onSearchChange : setInternalSearch;
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  React.useEffect(() => {
    if (exposeAdd) exposeAdd(handleAdd);
  }, [exposeAdd, handleAdd]);
  const [photoViewOpen, setPhotoViewOpen] = useState(false);
  const [photoBroken, setPhotoBroken] = useState(false);

  const BACKEND_URL =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:8000"
      : `http://${window.location.hostname}:8000`;

  const photoPreview = useMemo(() => {
    setPhotoBroken(false);
    if (form.photo instanceof File) return URL.createObjectURL(form.photo);
    if (typeof form.photo === "string" && form.photo) {
      if (form.photo.startsWith("http")) return form.photo;
      return `${BACKEND_URL}${form.photo}`;
    }
    return null;
  }, [form.photo]);

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

  return (
    <div className="drv-page">
      {/* Header */}
      <div className="drv-header">
        <div className="drv-header-left">
          <div className="drv-header-accent" />
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

      {/* Table card */}
      <div className="drv-card">
        <div className="drv-table-wrap">
          <table className="drv-table">
            <thead>
              <tr>
                {["IWP", "Full Name", "Contact No.", "Address", "Status", "Actions"].map(
                  (h) => (
                    <th key={h}>{h}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="drv-table-state">
                    <div className="drv-loading-dots">
                      <div />
                      <div />
                      <div />
                    </div>
                  </td>
                </tr>
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
                    <td>
                      <span className="drv-code">{getDriverCode(driver)}</span>
                    </td>
                    <td className="drv-td-name">{getDriverDisplayName(driver)}</td>
                    <td className="drv-td-contact">{driver.contact || "—"}</td>
                    <td className="drv-td-contact">
                      {[driver.barangay, driver.city, driver.province]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td>
                      <div className="drv-status-group">
                        <span
                          className={`drv-status ${driver.status === "ACTIVE" ? "drv-status--active" : "drv-status--inactive"}`}
                        >
                          {driver.status === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                        {isDriverOnActiveTicket(driver.id) && (
                          <span className="drv-status drv-status--duty">
                            On Queue
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="drv-actions">
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
                        <button
                          className="drv-btn drv-btn--delete"
                          onClick={() => handleDelete(driver.id)}
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

      {/* Modal */}
      {isModalOpen && (
        <div className="drv-overlay" onClick={closeModal}>
          <div className="drv-modal drv-modal--profile" onClick={(e) => e.stopPropagation()}>
            <div className="drv-modal-header">
              <div className="drv-modal-header-left">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c9a84c"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <h2 className="drv-modal-title">
                  {editing ? "Driver Profile" : "Register New Driver"}
                </h2>
              </div>
              <button
                className="drv-modal-close"
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

            <form onSubmit={handleSubmit} className="drv-modal-body">
              {error && (
                <div className="drv-alert drv-alert--inline">
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

              {/* Profile photo section */}
              <div className="drv-profile-hero">
                <div className="drv-profile-avatar-wrap">
                  {photoPreview && !photoBroken ? (
                    <img
                      className="drv-profile-avatar"
                      src={photoPreview}
                      alt="Driver"
                      onClick={() => setPhotoViewOpen(true)}
                      onError={() => setPhotoBroken(true)}
                      style={{ cursor: "pointer" }}
                    />
                  ) : (
                    <div className="drv-profile-avatar drv-profile-avatar--placeholder">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                  <label className="drv-profile-upload-btn">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) =>
                        setForm({ ...form, photo: e.target.files?.[0] || null })
                      }
                    />
                  </label>
                </div>
                <div className="drv-profile-hero-info">
                  <span className="drv-profile-hero-name">
                    {[form.first_name, form.middle_name, form.last_name]
                      .filter(Boolean)
                      .join(" ") || "New Driver"}
                  </span>
                  <div className="drv-profile-hero-tags">
                    {editing && (
                      <span className="drv-profile-code">{form.code}</span>
                    )}
                    <span className={`drv-status ${form.status === "ACTIVE" ? "drv-status--active" : "drv-status--inactive"}`}>
                      {form.status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div className="drv-profile-section">
                <h3 className="drv-profile-section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Personal Information
                </h3>
                <div className="drv-profile-grid">
                  <div className="drv-field">
                    <label className="drv-label">First Name</label>
                    <input
                      type="text"
                      className="drv-input"
                      placeholder="First name"
                      value={form.first_name}
                      onChange={(e) =>
                        setForm({ ...form, first_name: capitalizeWords(e.target.value) })
                      }
                    />
                  </div>
                  <div className="drv-field">
                    <label className="drv-label">Last Name</label>
                    <input
                      type="text"
                      className="drv-input"
                      placeholder="Last name"
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: capitalizeWords(e.target.value) })}
                    />
                  </div>
                  <div className="drv-field">
                    <label className="drv-label">Middle Name <span className="drv-optional">(optional)</span></label>
                    <input
                      type="text"
                      className="drv-input"
                      placeholder="Middle name"
                      value={form.middle_name || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          middle_name: capitalizeWords(e.target.value) || null,
                        })
                      }
                    />
                  </div>
                  <div className="drv-field">
                    <label className="drv-label">IWP Number</label>
                    <input
                      type="text"
                      className="drv-input"
                      placeholder="e.g. IWP-001"
                      value={form.iwp_number}
                      onChange={(e) =>
                        setForm({ ...form, iwp_number: e.target.value })
                      }
                    />
                  </div>
                  <div className="drv-field">
                    <label className="drv-label">Gender</label>
                    <select
                      className="drv-select"
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    >
                      <option value="">Select gender</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="drv-field">
                    <label className="drv-label">Birthdate</label>
                    <input
                      type="date"
                      className="drv-input"
                      value={form.birthdate}
                      onChange={(e) =>
                        setForm({ ...form, birthdate: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="drv-profile-section">
                <h3 className="drv-profile-section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Address
                </h3>
                <div className="drv-profile-grid">
                  <div className="drv-field">
                    <label className="drv-label">Province</label>
                    <input
                      type="text"
                      className="drv-input"
                      value={form.province}
                      onChange={(e) =>
                        setForm({ ...form, province: e.target.value })
                      }
                    />
                  </div>
                  <div className="drv-field">
                    <label className="drv-label">City</label>
                    <input
                      type="text"
                      className="drv-input"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </div>
                  <div className="drv-field">
                    <label className="drv-label">Barangay</label>
                    <input
                      type="text"
                      className="drv-input"
                      value={form.barangay}
                      onChange={(e) =>
                        setForm({ ...form, barangay: e.target.value })
                      }
                    />
                  </div>
                  <div className="drv-field">
                    <label className="drv-label">Street</label>
                    <input
                      type="text"
                      className="drv-input"
                      value={form.street}
                      onChange={(e) => setForm({ ...form, street: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Contact & Status */}
              <div className="drv-profile-section">
                <h3 className="drv-profile-section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Contact & Status
                </h3>
                <div className="drv-profile-grid">
                  <div className="drv-field">
                    <label className="drv-label">Contact Number</label>
                    <input
                      type="text"
                      className="drv-input"
                      placeholder="e.g. 09XXXXXXXXX"
                      value={form.contact}
                      onChange={(e) =>
                        setForm({ ...form, contact: e.target.value })
                      }
                      pattern="\d{11}"
                      maxLength={11}
                      required
                    />
                  </div>
                  <div className="drv-field">
                    <label className="drv-label">Status</label>
                    <select
                      className="drv-select"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                    {editing &&
                      isDriverOnActiveTicket(editing.id) &&
                      form.status === "INACTIVE" && (
                        <p className="drv-warn-text">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                            <path d="M12 9v4" />
                            <path d="M12 17h.01" />
                          </svg>
                          This driver has an active ticket and cannot be set to
                          Inactive.
                        </p>
                      )}
                  </div>
                </div>
              </div>

              <div className="drv-modal-footer">
                <button
                  type="button"
                  className="drv-modal-btn drv-modal-btn--cancel"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="drv-modal-btn drv-modal-btn--submit"
                >
                  {editing ? "Update Record" : "Register Driver"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {photoViewOpen && photoPreview && !photoBroken && (
        <div className="drv-lightbox" onClick={() => setPhotoViewOpen(false)}>
          <button
            className="drv-lightbox-close"
            onClick={() => setPhotoViewOpen(false)}
            aria-label="Close"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <img
            className="drv-lightbox-img"
            src={photoPreview}
            alt="Driver full photo"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default Driver;
