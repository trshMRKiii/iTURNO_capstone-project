import React, { useState, useEffect, useRef } from "react";
import { apiService } from "../../../lib/api-service";
import { focusFirstError } from "../../../lib/focusFirstError";
import { useFeedback, SkeletonRows } from "../../../components/ui/kit";
import "../../../styles/User.css";
import "../../../styles/FormModal.css";

const EMPTY_FORM = {
  username: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  role: "PERSONNEL",
  is_active: true,
};

function capitalizeWords(value) {
  return value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return EMAIL_PATTERN.test(value);
}

const ROLES = [
  ["PERSONNEL", "Personnel"],
  ["SUPERVISOR", "Supervisor"],
  ["MANAGER", "Manager"],
  ["SUPERADMIN", "Admin"],
];

// Drives the sidebar checklist; `fields` are the required keys in each section.
const STAFF_SECTIONS = [
  { title: "Personal information", fields: ["first_name", "last_name"] },
  { title: "Account", fields: ["username"] },
  { title: "Role & status", fields: [] },
];
const REQUIRED_FIELD_COUNT = STAFF_SECTIONS.reduce((n, s) => n + s.fields.length, 0);

function validateStaffForm(form) {
  const errors = {};
  if (!form.first_name.trim()) errors.first_name = "First name is required.";
  if (!form.last_name.trim()) errors.last_name = "Last name is required.";
  if (!form.username.trim()) errors.username = "Email address is required.";
  else if (!isValidEmail(form.username.trim())) errors.username = "Enter a valid email address.";
  return errors;
}

// Defined outside the page so inputs keep focus across re-renders.
const Field = ({ label, required, optional, error, hint, children }) => (
  <div className="usr-field">
    <label className="usr-label">
      {label}
      {required && <span className="usr-required"> *</span>}
      {optional && <span className="usr-optional"> (optional)</span>}
    </label>
    {children}
    {error ? (
      <p className="usr-field-error">{error}</p>
    ) : (
      hint && <p className="usr-hint">{hint}</p>
    )}
  </div>
);

const Section = ({ number, title, children }) => (
  <section className="usr-profile-section">
    <h3 className="usr-section-title">
      <span className="usr-section-num">{number}</span>
      {title}
    </h3>
    <div className="usr-form-grid">{children}</div>
  </section>
);

const inputCls = "usr-input";

function User({ userRole }) {
  const canManageStaff = userRole === "SUPERADMIN";
  // Supervisors/Managers may only tick which Personnel can register vehicles and drivers.

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const initialFormRef = useRef(EMPTY_FORM);

  const [searchTerm, setSearchTerm] = useState("");
  // Field errors appear only after a failed submit, then clear as each field is fixed.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fieldErrors = submitAttempted ? validateStaffForm(form) : {};

  const { confirmAction } = useFeedback();

  useEffect(() => {
    fetchUsers();
    // The header's "My profile" editor changes a row in this list.
    window.addEventListener("profile-updated", fetchUsers);
    return () => window.removeEventListener("profile-updated", fetchUsers);
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (Object.keys(validateStaffForm(form)).length > 0) {
      setSubmitAttempted(true);
      focusFirstError(".usr-modal");
      return;
    }

    // Several people may hold the same role (handover overlap, backups); the
    // server blocks the dangerous cases (own account, last active Admin).
    confirmAction({
      title: editing ? "Update staff account?" : "Register staff account?",
      confirmLabel: editing ? "Save changes" : "Register",
      busyLabel: "Saving…",
      tone: "primary",
      run: async () => {
        try {
          const payload = {
            username: form.username || "",
            first_name: form.first_name || "",
            middle_name: form.middle_name || "",
            last_name: form.last_name || "",
            role: form.role || "PERSONNEL",
            is_active: !!form.is_active,
          };
          const userData = editing
            ? await apiService.updateUser(editing.id, payload)
            : await apiService.createUser(payload);
          if (!userData) throw new Error("Failed to save user");
          fetchUsers();
          resetModal();
          return { success: { title: editing ? "Staff account updated" : "Staff account registered", message: `${payload.first_name} ${payload.last_name} was saved.` } };
        } catch (err) {
          setError(err.message);
          return { error: { title: "Couldn't save staff account", message: err.message || "Nothing was changed. Try again." } };
        }
      },
    });
  };

  const handleEdit = (user) => {
    setEditing(user);
    const editForm = {
      username: user.username,
      first_name: user.first_name,
      middle_name: user.middle_name || "",
      last_name: user.last_name,
      role: user.role,
      is_active: user.is_active,
    };
    initialFormRef.current = editForm;
    setForm(editForm);
    setSubmitAttempted(false);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    initialFormRef.current = EMPTY_FORM;
    setForm(EMPTY_FORM);
    setSubmitAttempted(false);
    setIsModalOpen(true);
  };
  const resetModal = () => {
    setIsModalOpen(false);
    setSubmitAttempted(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const isDirty = () => JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  // Closing with unsaved input asks first; resetModal closes without asking (used after a save).
  const closeModal = () => {
    if (!isDirty()) return resetModal();
    return confirmAction({
      title: editing ? "Discard changes?" : "Discard registration?",
      message: editing ? "Your edits haven't been saved and will be lost." : "What you've entered won't be saved.",
      confirmLabel: "Discard",
      busyLabel: "Discarding…",
      run: async () => { resetModal(); return null; },
    });
  };

  const handleToggleActive = (user) => {
    const verb = user.is_active ? "Deactivate" : "Reactivate";
    const name = `${user.first_name} ${user.last_name}`;
    return confirmAction({
      title: `${verb} ${name}?`,
      message: user.is_active ? "They will no longer be able to sign in, but their history is kept." : "They will be able to sign in again.",
      confirmLabel: verb,
      busyLabel: `${verb.replace(/e$/, "")}ing…`,
      tone: user.is_active ? "danger" : "primary",
      run: async () => {
        try {
          await apiService.updateUser(user.id, { ...user, is_active: !user.is_active });
          fetchUsers();
          return { success: { title: `Staff account ${user.is_active ? "deactivated" : "reactivated"}`, message: `${name} was updated.` } };
        } catch (err) {
          setError(err.message);
          return { error: { title: `Couldn't ${verb.toLowerCase()} account`, message: err.message || "Nothing was changed. Try again." } };
        }
      },
    });
  };

  const handleToggleFleet = async (user) => {
    const allowed = !user.can_manage_fleet;
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, can_manage_fleet: allowed } : u)));
    try {
      await apiService.setFleetAccess(user.id, allowed);
    } catch (err) {
      setError(err.message);
      fetchUsers();
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      ([u.first_name, u.middle_name, u.last_name].filter(Boolean).join(" ")).toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    );
  });

  const liveErrors = validateStaffForm(form);
  const doneCount = REQUIRED_FIELD_COUNT - Object.keys(liveErrors).length;
  const fullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" ");
  const roleLabel = ROLES.find(([value]) => value === form.role)?.[1];

  return (
    <div className="usr-page">
      {/* Header */}
      <div className="usr-header">
        <div className="usr-header-left">
          <div>
            <h1 className="usr-title">User Management</h1>
            
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
          {canManageStaff && (
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
          )}
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
                  "Username (Email)",
                  "Role",
                  "Fleet & Driver access",
                  "Status",
                  ...(canManageStaff ? ["Actions"] : []),
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={7} />
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="usr-table-state">
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
                      {[user.first_name, user.middle_name, user.last_name]
                        .filter(Boolean)
                        .join(" ")}
                    </td>
                    <td className="usr-td-email">{user.username}</td>
                    <td>
                      <span className="usr-role">{user.role}</span>
                    </td>
                    <td>
                      {user.role === "PERSONNEL" ? (
                        <label className="usr-fleet-tick">
                          <input
                            type="checkbox"
                            checked={!!user.can_manage_fleet}
                            disabled={!user.is_active}
                            onChange={() => handleToggleFleet(user)}
                          />
                          <span>Can register vehicles &amp; drivers</span>
                        </label>
                      ) : (
                        <span className="usr-fleet-always">Always</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`usr-status ${
                          user.must_reset_password
                            ? "usr-status--new"
                            : user.is_active
                            ? "usr-status--active"
                            : "usr-status--inactive"
                        }`}
                      >
                        {user.must_reset_password
                          ? "New"
                          : user.is_active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>
                    {canManageStaff && <td>
                      <div className="usr-actions">
                        {canManageStaff && (
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
                        )}
                        {canManageStaff && (
                          <button
                            className="usr-btn usr-btn--edit"
                            onClick={() => handleToggleActive(user)}
                          >
                            {user.is_active ? "Deactivate" : "Reactivate"}
                          </button>
                        )}
                      </div>
                    </td>}
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
          <div className="usr-modal usr-modal--registry" onClick={(e) => e.stopPropagation()}>
            <div className="usr-modal-header">
              <div className="usr-modal-header-left">
                <h2 className="usr-modal-title">
                  {editing ? "Staff profile" : "Register new staff"}
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

            <form onSubmit={handleSubmit} noValidate className="usr-modal-form">
              <div className="usr-modal-split">
                <aside className="usr-side">
                  <div className="usr-preview">
                    <span className="usr-preview-tag">Preview</span>
                    <strong className="usr-preview-name">{fullName || "New staff"}</strong>
                    <span className="usr-preview-role">{roleLabel}</span>
                    {form.username && <span className="usr-preview-email">{form.username}</span>}
                  </div>

                  <ul className="usr-checklist">
                    {STAFF_SECTIONS.map((section) => {
                      const missing = section.fields.filter((k) => liveErrors[k]).length;
                      return (
                        <li key={section.title} className="usr-check">
                          <span className={`usr-check-icon${missing ? " usr-check-icon--todo" : ""}`}>
                            {missing ? "!" : "✓"}
                          </span>
                          <span>
                            <strong>{section.title}</strong>
                            <small className={missing ? "usr-check-todo" : ""}>
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

                <div className="usr-main">
                  <Section number={1} title="Personal information">
                    <Field label="First name" required error={fieldErrors.first_name}>
                      <input
                        type="text"
                        className={`${inputCls}${fieldErrors.first_name ? " usr-input--error" : ""}`}
                        placeholder="e.g. Juan"
                        value={form.first_name}
                        onChange={(e) =>
                          setForm({ ...form, first_name: capitalizeWords(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Last name" required error={fieldErrors.last_name}>
                      <input
                        type="text"
                        className={`${inputCls}${fieldErrors.last_name ? " usr-input--error" : ""}`}
                        placeholder="e.g. Dela Cruz"
                        value={form.last_name}
                        onChange={(e) =>
                          setForm({ ...form, last_name: capitalizeWords(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Middle name" optional>
                      <input
                        type="text"
                        className={inputCls}
                        placeholder="e.g. Reyes"
                        value={form.middle_name}
                        onChange={(e) =>
                          setForm({ ...form, middle_name: capitalizeWords(e.target.value) })
                        }
                      />
                    </Field>
                  </Section>

                  <Section number={2} title="Account">
                    <div className="usr-span-all">
                      <Field
                        label="Username (email address)"
                        required
                        error={fieldErrors.username}
                        hint={
                          editing
                            ? null
                            : "A temporary password will be generated and emailed to this address. The new account will be required to set their own password on first sign-in."
                        }
                      >
                        <input
                          type="email"
                          className={`${inputCls}${fieldErrors.username ? " usr-input--error" : ""}`}
                          placeholder="name@example.com"
                          value={form.username}
                          onChange={(e) => setForm({ ...form, username: e.target.value })}
                        />
                      </Field>
                    </div>
                  </Section>

                  <Section number={3} title="Role & status">
                    <div className="usr-span-all">
                      <Field label="Role">
                        <div className="usr-segmented">
                          {ROLES.map(([value, text]) => (
                            <button
                              key={value}
                              type="button"
                              className={form.role === value ? "is-active" : ""}
                              onClick={() => setForm({ ...form, role: value })}
                            >
                              {text}
                            </button>
                          ))}
                        </div>
                      </Field>
                    </div>
                    {editing && (
                      <Field label="Status">
                        <select
                          className="usr-select"
                          value={form.is_active ? "true" : "false"}
                          onChange={(e) =>
                            setForm({ ...form, is_active: e.target.value === "true" })
                          }
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      </Field>
                    )}
                  </Section>
                </div>
              </div>

              <div className="usr-modal-footer usr-modal-footer--registry">
                <div className="usr-progress">
                  <div className="usr-progress-bar">
                    <span style={{ transform: `scaleX(${doneCount / REQUIRED_FIELD_COUNT})` }} />
                  </div>
                  <small>{doneCount} of {REQUIRED_FIELD_COUNT} required fields done</small>
                </div>
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
                  {editing ? "Save changes" : "Register staff"}
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
