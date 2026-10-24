const ROLE_NAMES = { PERSONNEL: "Personnel", SUPERVISOR: "Supervisor", MANAGER: "Manager", SUPERADMIN: "Admin" };

// "Mark San (Admin)" — the role is the one stored with the record, not the user's current one.
export const nameWithRole = (name, role) => {
  if (!name) return "";
  const label = ROLE_NAMES[role];
  return label ? `${name} (${label})` : name;
};
