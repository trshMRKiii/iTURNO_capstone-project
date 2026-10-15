import { CONTACT_PATTERN, CONTACT_ERROR } from "../../../lib/contact";

export const getDriverDisplayName =(driver) => {
  if (!driver) return "Unnamed Driver";

  const parts = [driver.first_name, driver.middle_name, driver.last_name]
    .filter(Boolean)
    .map((part) => part.trim());

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return driver.name || "Unnamed Driver";
};

export const getDriverCode = (driver) => driver?.iwp_number || driver?.code || "—";

// "valid" | "expired" | "none" (no expiration date on file). Valid through the expiry day itself.
export const getExpiryStatus = (exp) => {
  if (!exp) return "none";
  const today = new Date().toLocaleDateString("en-CA");
  return exp < today ? "expired" : "valid";
};

export const getIwpStatus = (driver) => getExpiryStatus(driver?.iwp_expiration_date);

// Driver photos come back as a backend-relative path (or a full URL); null when none.
export const getDriverPhotoUrl = (photo) => {
  if (!photo) return null;
  if (photo.startsWith("http")) return photo;
  const host = window.location.hostname;
  return `http://${host === "127.0.0.1" ? "localhost" : host}:8000${photo}`;
};

const REQUIRED_FIELD_MESSAGES = {
  first_name: "Enter the first name.",
  last_name: "Enter the last name.",
  iwp_number: "Enter the IWP number.",
  iwp_expiration_date: "Pick the IWP expiration date.",
  gender: "Select a gender.",
  birthdate: "Pick the birthdate.",
  province: "Select a province.",
  city: "Select a municipality or city.",
  barangay: "Select a barangay.",
  contact: "Enter the contact number.",
};

// Sidebar checklist in the registration modal; every required field belongs to one section.
export const DRIVER_SECTIONS = [
  { title: "Personal information", fields: ["first_name", "last_name", "iwp_number", "iwp_expiration_date", "gender", "birthdate"] },
  { title: "Address", fields: ["province", "city", "barangay"] },
  { title: "Contact", fields: ["contact"] },
];

export const REQUIRED_FIELD_COUNT = Object.keys(REQUIRED_FIELD_MESSAGES).length;

export const validateDriverForm = (form) => {
  const errors = {};
  for (const [key, message] of Object.entries(REQUIRED_FIELD_MESSAGES)) {
    if (!form[key]?.toString().trim()) errors[key] = message;
  }
  if (!errors.iwp_number && !/^\d{12}$/.test(form.iwp_number.toString().trim())) {
    errors.iwp_number = "IWP number must be exactly 12 digits.";
  }
  if (!errors.contact && !CONTACT_PATTERN.test(form.contact.toString().trim())) {
    errors.contact = CONTACT_ERROR;
  }
  return errors;
};

export const formatIwp = (value) => (value || "").replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1-");

export const normalizeDriverForm = (driver = {}) => ({
  id: driver.id ?? null,
  first_name: driver.first_name || "",
  middle_name: driver.middle_name || "",
  last_name: driver.last_name || "",
  iwp_number: driver.iwp_number || "",
  iwp_expiration_date: driver.iwp_expiration_date || "",
  gender: driver.gender || "",
  birthdate: driver.birthdate || "",
  province: driver.province || "La Union",
  city: driver.city || "",
  barangay: driver.barangay || "",
  street: driver.street || "",
  contact: driver.contact || "",
  qr_code: driver.qr_code || "",
  status: driver.status || "ACTIVE",
  is_archived: driver.is_archived ?? false,
  photo: driver.photo || null,
  name: getDriverDisplayName(driver),
  code: driver.code || driver.iwp_number || "",
});

export const buildDriverPayload = (form = {}) => {
  const payload = new FormData();

  payload.append("first_name", form.first_name || "");
  if (form.middle_name) {
    payload.append("middle_name", form.middle_name);
  }
  payload.append("last_name", form.last_name || "");
  payload.append("iwp_number", form.iwp_number || "");
  payload.append("iwp_expiration_date", form.iwp_expiration_date || "");
  payload.append("gender", form.gender || "");
  payload.append("birthdate", form.birthdate || "");
  payload.append("province", form.province || "La Union");
  payload.append("city", form.city || "");
  payload.append("barangay", form.barangay || "");
  payload.append("street", form.street || "");
  payload.append("contact", form.contact || "");
  payload.append("qr_code", form.qr_code || "");
  payload.append("status", form.status || "ACTIVE");
  payload.append("is_archived", form.is_archived ? "true" : "false");

  if (form.photo instanceof File) {
    payload.append("photo", form.photo);
  }

  return payload;
};
