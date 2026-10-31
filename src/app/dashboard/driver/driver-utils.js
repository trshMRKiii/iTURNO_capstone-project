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

// Whole days left before a still-valid expiry within `withinDays` (default a month); null otherwise.
export const daysUntilExpiry = (exp, withinDays = 30) => {
  if (getExpiryStatus(exp) !== "valid") return null;
  const today = new Date().toLocaleDateString("en-CA");
  const days = Math.round((new Date(exp) - new Date(today)) / 86400000);
  return days <= withinDays ? days : null;
};

export const expiryLabel = (days) => (days === 0 ? "Expires today" : `Expires in ${days}d`);

export const getIwpStatus = (driver) => getExpiryStatus(driver?.iwp_expiration_date);

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
  status: driver.status || "ACTIVE",
  is_archived: driver.is_archived ?? false,
  created_at: driver.created_at || null,
  updated_at: driver.updated_at || null,
  name: getDriverDisplayName(driver),
  code: driver.code || driver.iwp_number || "",
});

export const buildDriverPayload = (form = {}) => ({
  first_name: form.first_name || "",
  middle_name: form.middle_name || "",
  last_name: form.last_name || "",
  iwp_number: form.iwp_number || "",
  iwp_expiration_date: form.iwp_expiration_date || null,
  gender: form.gender || "",
  birthdate: form.birthdate || null,
  province: form.province || "La Union",
  city: form.city || "",
  barangay: form.barangay || "",
  street: form.street || "",
  contact: form.contact || "",
  status: form.status || "ACTIVE",
  is_archived: !!form.is_archived,
});
