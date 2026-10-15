// PH mobile numbers: 11 digits starting 09, shown as "0917 123 4567" and stored as plain digits.
export const CONTACT_PATTERN = /^09\d{9}$/;
export const CONTACT_ERROR = "Enter a mobile number like 0917 123 4567.";

// Keeps typed or pasted text on the 09XXXXXXXXX rail: a leading 9 or +63 becomes 09, and a
// first or second digit that would break the prefix is dropped.
export const normalizeContact = (raw) => {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("63")) d = `0${d.slice(2)}`;
  else if (d.startsWith("9")) d = `0${d}`;
  if (d.startsWith("09")) return d.slice(0, 11);
  return d.startsWith("0") ? "0" : "";
};

export const formatContact = (digits) =>
  [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 11)].filter(Boolean).join(" ");
