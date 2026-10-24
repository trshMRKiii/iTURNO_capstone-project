import React, { useState, useEffect, useRef } from "react";
import { apiService, IS_REMOTE } from "../../../lib/api-service";
import { focusFirstError } from "../../../lib/focusFirstError";
import { useFeedback, SkeletonRows, EditIcon } from "../../../components/ui/kit";
import ImportUsersModal from "./ImportUsersModal";
import RowMenu from "../registry/RowMenu";

const PowerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
);
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
const ROLE_LABELS = Object.fromEntries(ROLES);

const STATUSES = [
  ["new", "New"],
  ["active", "Active"],
  ["inactive", "Inactive"],
];
const STATUS_LABELS = Object.fromEntries(STATUSES);
const statusOf = (u) => (u.must_reset_password ? "new" : u.is_active ? "active" : "inactive");

const fullNameOf = (u) => [u.first_name, u.middle_name, u.last_name].filter(Boolean).join(" ");

// Name/email columns toggle A–Z / Z–A. Role and status open a menu to pick which value is
// listed first (scales to any number of roles); the rest follow in the order listed above.
const COLUMNS = [
  { label: "Full Name", sortValue: (u) => fullNameOf(u).toLowerCase() },
  { label: "Username (Email)", sortValue: (u) => (u.username || "").toLowerCase() },
  { label: "Role", options: ROLES, valueOf: (u) => u.role },
  { label: "Fleet & Driver access" },
  { label: "Status", options: STATUSES, valueOf: statusOf },
];

const Chevrons = ({ dir }) => (
  <svg className="usr-sort-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {dir !== -1 && <path d="m2 4 3-3 3 3" opacity={dir === 1 ? 1 : 0.45} />}
    {dir !== 1 && <path d="m2 6 3 3 3-3" opacity={dir === -1 ? 1 : 0.45} />}
  </svg>
);

function SortHeader({ column, sort, users, onToggle, onPin }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = sort.label === column.label;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!column.options) {
    return (
      <button type="button" className={`usr-sort${active ? " is-active" : ""}`} onClick={() => onToggle(column.label)}>
        {column.label}
        <Chevrons dir={active ? sort.dir : 0} />
      </button>
    );
  }

  const pinnedText = active && column.options.find(([v]) => v === sort.pin)?.[1];
  return (
    <div className="usr-sort-wrap" ref={ref}>
      <button
        type="button"
        className={`usr-sort${active ? " is-active" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {column.label}
        {pinnedText && <span className="usr-sort-pin">{pinnedText}</span>}
        <Chevrons dir={-1} />
      </button>
      {open && (
        <ul className="usr-sort-menu" role="listbox">
          <li className="usr-sort-menu-title">Show first</li>
          {column.options.map(([value, text]) => (
            <li key={value}>
              <button
                type="button"
                role="option"
                aria-selected={active && sort.pin === value}
                className={active && sort.pin === value ? "is-active" : ""}
                onClick={() => { onPin(column.label, value); setOpen(false); }}
              >
                <span>{text}</span>
                <small>{users.filter((u) => column.valueOf(u) === value).length}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const initialFormRef = useRef(EMPTY_FORM);

  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState({ label: null, dir: 1, pin: null });
  // Field errors appear only after a failed submit, then clear as each field is fixed.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fieldErrors = submitAttempted ? validateStaffForm(form) : {};

  const { confirmAction } = useFeedback();

  useEffect(() => {
    fetchUsers();
    // The header's "My profile" editor changes a row in this list.
    window.addEventListener("profile-updated", fetchUsers);
    // Status changes happen in other sessions (a new hire setting their password), so
    // keep the list fresh while this tab is in view instead of only on mount.
    const refreshIfVisible = () => document.visibilityState === "visible" && fetchUsers();
    const timer = setInterval(refreshIfVisible, 10000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.removeEventListener("profile-updated", fetchUsers);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
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
          return { success: { title: editing ? "Staff account updated" : "Staff account registered", message: userData.email_queued ? `${payload.first_name} ${payload.last_name} was saved. Their login email will be sent automatically once the system is back online.` : `${payload.first_name} ${payload.last_name} was saved.` } };
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

  // First click sorts ascending, clicking the same column again flips it.
  const toggleSort = (label) =>
    setSort((s) => (s.label === label ? { label, dir: -s.dir } : { label, dir: 1 }));
  // Picking the already-pinned value un-pins it.
  const pinValue = (label, pin) =>
    setSort((s) => (s.label === label && s.pin === pin ? { label: null, dir: 1 } : { label, dir: 1, pin }));

  const sortColumn = COLUMNS.find((c) => c.label === sort.label);
  const sortValue = sortColumn?.options
    ? (u) => {
        const v = sortColumn.valueOf(u);
        return v === sort.pin ? -1 : sortColumn.options.findIndex(([k]) => k === v);
      }
    : sortColumn?.sortValue;

  const filteredUsers = users
    .filter((u) => {
      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        fullNameOf(u).toLowerCase().includes(q) ||
        (ROLE_LABELS[u.role] || u.role || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (!sortValue) return 0;
      const x = sortValue(a);
      const y = sortValue(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });

  const liveErrors = validateStaffForm(form);
  const doneCount = REQUIRED_FIELD_COUNT - Object.keys(liveErrors).length;
  const fullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" ");
  const roleLabel = ROLE_LABELS[form.role];

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
          {canManageStaff && !IS_REMOTE && (
            <button className="usr-import-btn" onClick={() => setImportOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m7 10 5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
              Import
            </button>
          )}
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
                {COLUMNS.map((column) => (
                  <th
                    key={column.label}
                    aria-sort={!column.options && sort.label === column.label ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  >
                    {column.sortValue || column.options ? (
                      <SortHeader column={column} sort={sort} users={users} onToggle={toggleSort} onPin={pinValue} />
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
                {canManageStaff && <th className="usr-th-center">Actions</th>}
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
                   
                    <td className="usr-td-name">{fullNameOf(user)}</td>
                    <td className="usr-td-email">{user.username}</td>
                    <td>
                      <span className="usr-role">{ROLE_LABELS[user.role] || user.role}</span>
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
                      <span className={`usr-status usr-status--${statusOf(user)}`}>
                        {STATUS_LABELS[statusOf(user)]}
                      </span>
                    </td>
                    {canManageStaff && <td>
                      <div className="usr-actions">
                        <RowMenu
                          items={[
                            { label: "Edit", icon: <EditIcon size={14} />, onClick: () => handleEdit(user) },
                            {
                              label: user.is_active ? "Deactivate" : "Reactivate",
                              icon: <PowerIcon />,
                              onClick: () => handleToggleActive(user),
                              danger: user.is_active,
                            },
                          ]}
                        />
                      </div>
                    </td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {importOpen && <ImportUsersModal onClose={() => setImportOpen(false)} onImported={fetchUsers} />}

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
