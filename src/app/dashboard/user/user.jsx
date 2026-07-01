import React, { useState, useEffect } from "react";
import { apiService } from "../../../lib/api-service";
import { useConfirm, useToast } from "../../../components/ui/ToastConfirmContext";
import "../../../styles/User.css";

const EMPTY_FORM = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  role: "PERSONNEL",
  is_active: true,
};

const ROLE_CLASS = {
  MANAGER: "usr-role--manager",
  SUPERVISOR: "usr-role--supervisor",
  PERSONNEL: "usr-role--personnel",
  ADMIN: "usr-role--admin",
};

const Field = ({ label, children }) => (
  <div className="usr-field">
    <label className="usr-label">{label}</label>
    {children}
  </div>
);

const inputCls = "usr-input";

function User() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [searchTerm, setSearchTerm] = useState("");

  const showConfirm = useConfirm();
  const showToast = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setError(null);
      const data = await apiService.getUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const UNIQUE_ROLES = ["ADMIN", "SUPERVISOR", "MANAGER"];

  const handleSubmit = async (e) => {
    e.preventDefault();

    const role = form.role;
    const isActive = !!form.is_active;

    // Check if this role requires uniqueness and the new account will be active
    let conflictingUser = null;
    if (UNIQUE_ROLES.includes(role) && isActive) {
      conflictingUser = users.find(
        (u) =>
          u.role === role &&
          u.is_active &&
          (!editing || u.id !== editing.id),
      );
    }

    let confirmMsg = editing ? "Confirm update?" : "Confirm registry?";
    if (conflictingUser) {
      confirmMsg = `There is already an active ${role.charAt(0) + role.slice(1).toLowerCase()} (${conflictingUser.first_name} ${conflictingUser.last_name}). Proceeding will set them to Inactive. Continue?`;
    }

    const confirmed = await showConfirm(confirmMsg);
    if (!confirmed) return;

    try {
      // Deactivate the conflicting user first
      if (conflictingUser) {
        await apiService.updateUser(conflictingUser.id, {
          ...conflictingUser,
          is_active: false,
        });
      }

      const payload = {
        username: form.username || "",
        email: form.email || "",
        first_name: form.first_name || "",
        last_name: form.last_name || "",
        role: form.role || "PERSONNEL",
        is_active: isActive,
      };
      if (form.password && form.password.trim() !== "")
        payload.password = form.password;
      const userData = editing
        ? await apiService.updateUser(editing.id, payload)
        : await apiService.createUser(payload);
      if (!userData) throw new Error("Failed to save user");
      fetchUsers();
      closeModal();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEdit = (user) => {
    setEditing(user);
    setForm({
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      password: "",
      role: user.role,
      is_active: user.is_active,
    });
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleDelete = async (id) => {
    const confirmed = await showConfirm("Are you sure you want to remove this staff account?");
    if (!confirmed) return;
    try {
      await apiService.deleteUser(id);
      fetchUsers();
      showToast("Staff account deleted successfully");
    } catch (err) {
      setError(err.message);
      showToast(err.message || "Failed to delete staff account", "info");
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      (`${u.first_name} ${u.last_name}`).toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="usr-page">
      {/* Header */}
      <div className="usr-header">
        <div className="usr-header-left">
          <div className="usr-header-accent" />
          <div>
            <h1 className="usr-title">Staff Registry</h1>
            <p className="usr-subtitle">
              Manage system accounts and personnel roles
            </p>
          </div>
        </div>
        <div className="usr-header-right">
          <div className="usr-search-wrap">
            <svg className="usr-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="usr-search"
              placeholder="Search by name or role…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="usr-add-btn" onClick={handleAdd}>
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
            Add Staff Account
          </button>
        </div>
      </div>

      {error && (
        <div className="usr-alert">
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
      <div className="usr-card">
        <div className="usr-table-wrap">
          <table className="usr-table">
            <thead>
              <tr>
                {[
                  
                  "Full Name",
                  "Email Address",
                  "Role",
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
                  <td colSpan="6" className="usr-table-state">
                    <div className="usr-loading-dots">
                      <div />
                      <div />
                      <div />
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="usr-table-state">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      opacity="0.3"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>
                      {users.length === 0
                        ? "No staff accounts found"
                        : `No results for "${searchTerm}"`}
                    </span>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="usr-row">
                   
                    <td className="usr-td-name">
                      {user.first_name} {user.last_name}
                    </td>
                    <td className="usr-td-email">{user.email}</td>
                    <td>
                      <span
                        className={`usr-role ${ROLE_CLASS[user.role] || "usr-role--personnel"}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`usr-status ${user.is_active ? "usr-status--active" : "usr-status--inactive"}`}
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="usr-actions">
                        <button
                          className="usr-btn usr-btn--edit"
                          onClick={() => handleEdit(user)}
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
                          className="usr-btn usr-btn--delete"
                          onClick={() => handleDelete(user.id)}
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
        <div className="usr-overlay" onClick={closeModal}>
          <div className="usr-modal usr-modal--profile" onClick={(e) => e.stopPropagation()}>
            <div className="usr-modal-header">
              <div className="usr-modal-header-left">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c9a84c"
                  strokeWidth="2"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <h2 className="usr-modal-title">
                  {editing ? "Staff Profile" : "Register Staff Account"}
                </h2>
              </div>
              <button
                className="usr-modal-close"
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

            <form onSubmit={handleSubmit} className="usr-modal-body">
              {/* Staff hero section */}
              <div className="usr-profile-hero">
                <div className="usr-profile-avatar">
                  {(form.first_name?.[0] || "") + (form.last_name?.[0] || "") || (
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>
                <div className="usr-profile-hero-info">
                  <span className="usr-profile-hero-name">
                    {[form.first_name, form.last_name].filter(Boolean).join(" ") ||
                      "New Staff"}
                  </span>
                  <div className="usr-profile-hero-tags">
                    <span
                      className={`usr-role ${ROLE_CLASS[form.role] || "usr-role--personnel"}`}
                    >
                      {form.role}
                    </span>
                    <span
                      className={`usr-status ${form.is_active ? "usr-status--active" : "usr-status--inactive"}`}
                    >
                      {form.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div className="usr-profile-section">
                <h3 className="usr-profile-section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Personal Information
                </h3>
                <div className="usr-form-grid">
                  <Field label="First Name">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="First name"
                      value={form.first_name}
                      onChange={(e) =>
                        setForm({ ...form, first_name: e.target.value })
                      }
                      required
                    />
                  </Field>
                  <Field label="Last Name">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="Last name"
                      value={form.last_name}
                      onChange={(e) =>
                        setForm({ ...form, last_name: e.target.value })
                      }
                      required
                    />
                  </Field>
                </div>
              </div>

              {/* Account Information */}
              <div className="usr-profile-section">
                <h3 className="usr-profile-section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Account Information
                </h3>
                <Field label="Username">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Username"
                    value={form.username}
                    onChange={(e) =>
                      setForm({ ...form, username: e.target.value })
                    }
                    required
                  />
                </Field>

                <Field label="Email Address">
                  <input
                    type="email"
                    className={inputCls}
                    placeholder="Email address"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </Field>

                <Field
                  label={editing ? "Password (leave blank to keep)" : "Password"}
                >
                  <input
                    type="password"
                    className={inputCls}
                    placeholder="Password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    required={!editing}
                  />
                </Field>
              </div>

              {/* Role & Status */}
              <div className="usr-profile-section">
                <h3 className="usr-profile-section-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Role & Status
                </h3>
                <div className="usr-form-grid">
                  <Field label="Role">
                    <select
                      className={inputCls}
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                    >
                      <option value="PERSONNEL">Personnel</option>
                      <option value="SUPERVISOR">Supervisor</option>
                      <option value="MANAGER">Manager</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select
                      className={inputCls}
                      value={form.is_active ? "true" : "false"}
                      onChange={(e) =>
                        setForm({ ...form, is_active: e.target.value === "true" })
                      }
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </Field>
                </div>
              </div>

              <div className="usr-modal-footer">
                <button
                  type="button"
                  className="usr-modal-btn usr-modal-btn--cancel"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="usr-modal-btn usr-modal-btn--submit"
                >
                  {editing ? "Update Account" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default User;
