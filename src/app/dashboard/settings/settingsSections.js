export const SETTINGS_BASE = "/dashboard/settings";

// Single source of truth for the settings sections: the side menu, the
// sub-routes and the role guard in settings.jsx all read from this list.
export const SETTINGS_SECTIONS = [
  { group: "Pricing", key: "ticket-forms", label: "Ticket forms" },
  { group: "Pricing", key: "puv-types", label: "PUV types" },
  { group: "Operations", key: "routes", label: "Routes" },
  { group: "Records", key: "ticket-backfill", label: "Ticket backfill", allowedRoles: ["SUPERADMIN", "SUPERVISOR", "MANAGER"] },
  { group: "Records", key: "outside-remittance", label: "Outside remittance", allowedRoles: ["SUPERADMIN", "SUPERVISOR", "MANAGER"] },
  { group: "Records", key: "archive", label: "Archive" },
  { group: "System", key: "system", label: "Backups & restore", allowedRoles: ["SUPERADMIN"] },
];

export const canViewSection = (section, role) =>
  !section.allowedRoles || section.allowedRoles.includes(role);
