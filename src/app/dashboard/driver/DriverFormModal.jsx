import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { usePhilippineAddress } from "./usePhilippineAddress";
import {
  DRIVER_SECTIONS,
  REQUIRED_FIELD_COUNT,
  formatIwp,
  getDriverPhotoUrl,
  validateDriverForm,
} from "./driver-utils";

const capitalizeWords = (value) => value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

const DAY_MS = 86400000;

// "Expires in 18 days" style hint; only shown when the date is close or past.
const getExpiryHint = (iso) => {
  if (!iso) return null;
  const days = Math.ceil((new Date(`${iso}T00:00:00`) - new Date().setHours(0, 0, 0, 0)) / DAY_MS);
  if (days < 0) return { text: "Expired. The driver must renew before duty.", warn: true };
  if (days <= 30) return { text: `Expires in ${days} day${days === 1 ? "" : "s"}. Remind the driver to renew.`, warn: true };
  return null;
};

const getAge = (iso) => {
  if (!iso) return null;
  const born = new Date(`${iso}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

// 12-digit IWP number entered as three 4-digit boxes (xxxx-xxxx-xxxx).
// The form value stays a plain 12-digit string.
const IwpInput = ({ value, onChange, hasError }) => {
  const refs = [useRef(null), useRef(null), useRef(null)];
  const digits = (value || "").replace(/\D/g, "");
  const parts = [0, 1, 2].map((i) => digits.slice(i * 4, i * 4 + 4));

  const handleChange = (index, e) => {
    const text = e.target.value.replace(/\D/g, "").slice(0, 4);
    const next = [...parts];
    next[index] = text;
    onChange(next.join("").slice(0, 12));
    if (text.length === 4 && index < 2) refs[index + 1].current?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !parts[index] && index > 0) {
      e.preventDefault();
      refs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 12);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs[Math.min(Math.floor(pasted.length / 4), 2)].current?.focus();
  };

  return (
    <div className="drv-iwp">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="drv-iwp-dash">-</span>}
          <input
            ref={refs[i]}
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            aria-label={`IWP number part ${i + 1} of 3`}
            className={`drv-input drv-iwp-box${hasError ? " drv-input--error" : ""}`}
            value={part}
            onChange={(e) => handleChange(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
          />
        </React.Fragment>
      ))}
    </div>
  );
};

// Defined outside the modal so inputs keep focus across re-renders.
const Field = ({ label, required, optional, error, hint, warn, children }) => (
  <div className="drv-field">
    <label className="drv-label">
      {label}
      {required && <span className="drv-required"> *</span>}
      {optional && <span className="drv-optional"> (optional)</span>}
    </label>
    {children}
    {error ? (
      <p className="drv-field-error">{error}</p>
    ) : (
      hint && <p className={warn ? "drv-hint drv-hint--warn" : "drv-hint"}>{hint}</p>
    )}
  </div>
);

const Section = ({ number, title, children }) => (
  <section className="drv-section">
    <h3 className="drv-section-title">
      <span className="drv-section-num">{number}</span>
      {title}
    </h3>
    <div className="drv-profile-grid">{children}</div>
  </section>
);

function DriverFormModal({
  form,
  setForm,
  fieldErrors,
  error,
  editing,
  hasActiveTicket,
  onSubmit,
  onClose,
}) {
  const [brokenSrc, setBrokenSrc] = useState(null);
  const [photoViewOpen, setPhotoViewOpen] = useState(false);

  const { provinceOptions, cityOptions, barangayOptions, handleProvinceSelect, offline } =
    usePhilippineAddress({
      active: true,
      province: form.province,
      city: form.city,
      onProvinceChange: (name) => setForm((f) => ({ ...f, province: name })),
      onCityChange: (name) => setForm((f) => ({ ...f, city: name, barangay: "" })),
    });

  const photoPreview = useMemo(
    () => (form.photo instanceof File ? URL.createObjectURL(form.photo) : getDriverPhotoUrl(form.photo)),
    [form.photo],
  );
  useEffect(() => () => {
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const setName = (key) => (e) => setForm({ ...form, [key]: capitalizeWords(e.target.value) });

  // Live validation drives the sidebar checklist and progress bar; `fieldErrors`
  // (only filled after a failed submit) drives the red inline errors.
  const liveErrors = validateDriverForm(form);
  const doneCount = REQUIRED_FIELD_COUNT - Object.keys(liveErrors).length;
  const expiryHint = getExpiryHint(form.iwp_expiration_date);
  const age = getAge(form.birthdate);
  const fullName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" ");
  const showPhoto = photoPreview && brokenSrc !== photoPreview;

  const addressField = (key, label, placeholder, options, valueKey, labelKey, onChange, disabled) => (
    <Field label={label} required error={fieldErrors[key]}>
      {offline ? (
        <input type="text" className={`drv-input${fieldErrors[key] ? " drv-input--error" : ""}`} value={form[key]} onChange={set(key)} />
      ) : (
        <select
          className={`drv-select${fieldErrors[key] ? " drv-input--error" : ""}`}
          value={form[key]}
          disabled={disabled}
          onChange={onChange}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o[valueKey]} value={o[labelKey]}>{o[labelKey]}</option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <div className="drv-overlay" onClick={onClose}>
      <div className="drv-modal drv-modal--registry" onClick={(e) => e.stopPropagation()}>
        <div className="drv-modal-header">
          <h2 className="drv-modal-title">{editing ? "Driver profile" : "Register Driver"}</h2>
          <button className="drv-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="drv-modal-form">
          <div className="drv-modal-split">
            <aside className="drv-side">
              <label className={`drv-photo${showPhoto ? "" : " drv-photo--empty"}`} title={showPhoto ? "Change photo" : "Upload photo"}>
                {showPhoto ? (
                  <img src={photoPreview} alt="Driver" onError={() => setBrokenSrc(photoPreview)} />
                ) : (
                  <span className="drv-photo-placeholder">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>Upload photo</span>
                  </span>
                )}
                {showPhoto && <span className="drv-photo-overlay">Change photo</span>}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => setForm({ ...form, photo: e.target.files?.[0] || form.photo })}
                />
              </label>
              {showPhoto && (
                <>
                  <label className="drv-photo-btn">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    Edit photo
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => setForm({ ...form, photo: e.target.files?.[0] || form.photo })}
                    />
                  </label>
                  <button type="button" className="drv-photo-view" onClick={() => setPhotoViewOpen(true)}>
                    View full photo
                  </button>
                </>
              )}

              <div className="drv-preview">
                <span className="drv-preview-tag">Preview</span>
                <strong className="drv-preview-name">{fullName || "New driver"}</strong>
                {form.iwp_number && <span className="drv-preview-iwp">IWP {formatIwp(form.iwp_number)}</span>}
              </div>

              <ul className="drv-checklist">
                {DRIVER_SECTIONS.map((section) => {
                  const missing = section.fields.filter((k) => liveErrors[k]).length;
                  return (
                    <li key={section.title} className="drv-check">
                      <span className={`drv-check-icon${missing ? " drv-check-icon--todo" : ""}`}>{missing ? "!" : "✓"}</span>
                      <span>
                        <strong>{section.title}</strong>
                        <small className={missing ? "drv-check-todo" : ""}>
                          {missing ? `${missing} field${missing === 1 ? "" : "s"} need${missing === 1 ? "s" : ""} attention` : "Complete"}
                        </small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <div className="drv-main">
              <Section number={1} title="Personal information">
                <Field label="First name" required error={fieldErrors.first_name}>
                  <input type="text" className={`drv-input${fieldErrors.first_name ? " drv-input--error" : ""}`} placeholder="e.g. Juan" value={form.first_name} onChange={setName("first_name")} />
                </Field>
                <Field label="Last name" required error={fieldErrors.last_name}>
                  <input type="text" className={`drv-input${fieldErrors.last_name ? " drv-input--error" : ""}`} placeholder="e.g. Dela Cruz" value={form.last_name} onChange={setName("last_name")} />
                </Field>
                <Field label="Middle name" optional>
                  <input type="text" className="drv-input" placeholder="e.g. Reyes" value={form.middle_name || ""} onChange={(e) => setForm({ ...form, middle_name: capitalizeWords(e.target.value) || null })} />
                </Field>
                <Field label="IWP number" required error={fieldErrors.iwp_number} hint="12 digits. Dashes are added for you, and pasting works.">
                  <IwpInput value={form.iwp_number} hasError={!!fieldErrors.iwp_number} onChange={(iwp_number) => setForm({ ...form, iwp_number })} />
                </Field>
                <Field label="IWP expiration date" required error={fieldErrors.iwp_expiration_date} hint={expiryHint?.text} warn={expiryHint?.warn}>
                  <input type="date" className={`drv-input${fieldErrors.iwp_expiration_date ? " drv-input--error" : ""}`} value={form.iwp_expiration_date || ""} onChange={set("iwp_expiration_date")} />
                </Field>
                <Field label="Gender" required error={fieldErrors.gender}>
                  <div className="drv-segmented">
                    {[["MALE", "Male"], ["FEMALE", "Female"]].map(([value, text]) => (
                      <button
                        key={value}
                        type="button"
                        className={form.gender === value ? "is-active" : ""}
                        onClick={() => setForm({ ...form, gender: value })}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Birthdate" required error={fieldErrors.birthdate} hint={age !== null ? `${age} years old` : null}>
                  <input type="date" className={`drv-input${fieldErrors.birthdate ? " drv-input--error" : ""}`} max={new Date().toLocaleDateString("en-CA")} value={form.birthdate} onChange={set("birthdate")} />
                </Field>
              </Section>

              <Section number={2} title="Address">
                {offline && <p className="drv-warn-text drv-span-all">Address list unavailable (no internet). Enter the address manually.</p>}
                {addressField("province", "Province", "Select province", provinceOptions, "province_code", "province_name", (e) => handleProvinceSelect(e.target.value))}
                {addressField("city", "Municipality / city", "Select municipality/city", cityOptions, "city_code", "city_name", (e) => setForm({ ...form, city: e.target.value, barangay: "" }), !form.province)}
                {addressField("barangay", "Barangay", "Select barangay", barangayOptions, "brgy_code", "brgy_name", set("barangay"), !form.city)}
                <Field label="House no. / street / purok" optional>
                  <input type="text" className="drv-input" placeholder="e.g. 12 Quezon Ave., Purok 3" value={form.street} onChange={set("street")} />
                </Field>
              </Section>

              <Section number={3} title={editing ? "Contact & status" : "Contact"}>
                <Field label="Contact number" required error={fieldErrors.contact}>
                  <input type="text" inputMode="numeric" className={`drv-input${fieldErrors.contact ? " drv-input--error" : ""}`} placeholder="e.g. 09XXXXXXXXX" maxLength={11} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value.replace(/\D/g, "") })} />
                </Field>
                {editing && (
                  <Field
                    label="Status"
                    hint={hasActiveTicket && form.status === "INACTIVE" ? "This driver has an active ticket and cannot be set to Inactive." : null}
                    warn
                  >
                    <select className="drv-select" value={form.status} onChange={set("status")}>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </Field>
                )}
              </Section>

              {editing && form.qr_code && (
                <section className="drv-section">
                  <h3 className="drv-section-title">Driver QR code</h3>
                  <div className="drv-qr-display">
                    <QRCodeSVG value={form.qr_code} size={140} level="H" includeMargin />
                    <span className="drv-qr-label">{form.qr_code}</span>
                  </div>
                </section>
              )}

              {error && <div className="drv-alert drv-alert--inline">{error}</div>}
            </div>
          </div>

          <div className="drv-modal-footer">
            <div className="drv-progress">
              <div className="drv-progress-bar">
                <span style={{ width: `${(doneCount / REQUIRED_FIELD_COUNT) * 100}%` }} />
              </div>
              <small>{doneCount} of {REQUIRED_FIELD_COUNT} required fields done</small>
            </div>
            <button type="button" className="drv-modal-btn drv-modal-btn--cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="drv-modal-btn drv-modal-btn--submit">{editing ? "Save changes" : "Register driver"}</button>
          </div>
        </form>
      </div>

      {photoViewOpen && showPhoto && (
        <div className="drv-lightbox" onClick={(e) => { e.stopPropagation(); setPhotoViewOpen(false); }}>
          <button className="drv-lightbox-close" onClick={() => setPhotoViewOpen(false)} aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <img className="drv-lightbox-img" src={photoPreview} alt="Driver full photo" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

export default DriverFormModal;
