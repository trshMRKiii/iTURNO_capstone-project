export const getDriverDisplayName = (driver) => {
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

export const normalizeDriverForm = (driver = {}) => ({
  id: driver.id ?? null,
  first_name: driver.first_name || "",
  middle_name: driver.middle_name || "",
  last_name: driver.last_name || "",
  iwp_number: driver.iwp_number || "",
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
