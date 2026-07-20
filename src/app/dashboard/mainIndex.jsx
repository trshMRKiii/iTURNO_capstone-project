import React, { useState, useEffect } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import Dashboard from "./Dashboard";
import Dispatch from "./dispatch/dispatch";
import Requisition from "./requisition/requisition"
import Ticket from "./ticket/ticket";
import Collections from "./collection/collection";
import Remittance from "./remittance/remittance"
import Registry from "./registry/registry";
import StaffRegistry from "./user/user";
import Reports from "./report/report";
import Settings from "./settings/settings"
import {
  CollectionsIcon,
  DashboardIcon,
  DispatchIcon,
  RemittanceIcon,
  ReportIcon,
  RequisitionIcon,
  SettingsIcon,
  TicketIcon,
  UserIcon,
  VehicleIcon,
} from "../../components/ui/NavIcon";
import { apiService } from "../../lib/api-service";
import { useToast, useConfirm } from "../../components/ui/ToastConfirmContext";
import "./../../styles/mainIndex.css";
import sfcLogo from "../../pictures/sfc-nobg-logo.png";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { to: "/dashboard/Requisition", label: "Ticket Requisition", Icon: RequisitionIcon },
  { to: "/dashboard/Ticket", label: "Ticket Issuance", Icon: TicketIcon },
  { to: "/dashboard/Dispatch", label: "Dispatch", Icon: DispatchIcon },
  { to: "/dashboard/Collections", label: "Transaction", Icon: CollectionsIcon },
  { to: "/dashboard/Remittance", label: "Remittance", Icon: RemittanceIcon },
  { to: "/dashboard/Registry", label: "Fleet & Driver", Icon: VehicleIcon },
  { to: "/dashboard/StaffRegistry", label: "User Management", Icon: UserIcon },
  { to: "/dashboard/Reports", label: "Reports", Icon: ReportIcon },
  { to: "/dashboard/Settings", label: "Settings", Icon: SettingsIcon },
];

const ROLE_NAV = {
  SUPERADMIN: [
    "/dashboard",
    "/dashboard/Requisition",
    "/dashboard/Ticket",
    "/dashboard/Dispatch",
    "/dashboard/Collections",
    "/dashboard/Remittance",
    "/dashboard/Registry",
    "/dashboard/StaffRegistry",
    "/dashboard/Reports",
    "/dashboard/Settings",
  ],
  MANAGER: [
    "/dashboard",
    "/dashboard/Collections",
    "/dashboard/Registry",
    "/dashboard/StaffRegistry",
    "/dashboard/Reports",
    "/dashboard/Settings",
  ],
  SUPERVISOR: [
    "/dashboard",
    "/dashboard/Requisition",
    "/dashboard/Ticket",
    "/dashboard/Dispatch",
    "/dashboard/Collections",
    "/dashboard/Remittance",
    "/dashboard/Registry",
    "/dashboard/Reports",
    "/dashboard/Settings",
  ],
  PERSONNEL: [
    "/dashboard",
    "/dashboard/Ticket",
    "/dashboard/Dispatch",
    "/dashboard/Reports",
  ],
};

function mainIndex() {
  const [currentUser, setCurrentUser] = useState({});
  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark",
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const showToast = useToast();
  const showConfirm = useConfirm();
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // dark/light
  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  useEffect(() => {
    let isMounted = true;

    apiService
      .getCurrentUser()
      .then((user) => {
        if (isMounted) setCurrentUser(user || {});
      })
      .catch((error) => {
        console.error("Failed to load current user:", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const userName =
    currentUser.first_name || currentUser.last_name
      ? `${currentUser.first_name || ""} ${currentUser.last_name || ""}`.trim()
      : currentUser.username || "Unknown User";

  const userRole = currentUser.role || "Unknown Role";
  const userInitials =
    userName
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "US";

  return (
    <div className="shell">
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileNavOpen}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {mobileNavOpen ? (
              <>
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </>
            )}
          </svg>
        </button>

        <div className="mobile-header-brand">
          <img src={sfcLogo} alt="SFC Logo" className="mobile-header-logo" />
          <span className="mobile-header-name">North Central Terminal</span>
        </div>
      </header>

      {mobileNavOpen && (
        <div
          className="mobile-nav-overlay"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside className={`sidebar${mobileNavOpen ? " sidebar-open" : ""}`}>
        {/* Brand header */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <img
              src={sfcLogo}
              alt="SFC Logo"
              style={{ width: "30px", height: "30px", borderRadius: "40px" }}
            />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">North Central Terminal</span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">Navigation</div>
          {NAV_ITEMS.filter((item) =>
            ROLE_NAV[userRole]?.includes(item.to),
          ).map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              className={({ isActive }) =>
                isActive ? "nav-link nav-link-active" : "nav-link"
              }
            >
              <Icon className="nav-link-icon" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="sidebar-footer">
          <div className="sidebar-avatar">{userInitials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName}</div>
            <div className="sidebar-user-role">{userRole}</div>
          </div>

          {/* Theme toggle */}
          <button
            className="sidebar-icon-btn"
            onClick={() => setDark((d) => !d)}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? (
              // sun icon
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              // moon icon
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>

          {/* Logout */}
          <button
            className="sidebar-icon-btn"
            onClick={async () => {
              const ok = await showConfirm("Are you sure you want to logout?");
              if (!ok) return;
              showToast("Logging out...", "info");
              setTimeout(() => apiService.logout(), 1200);
            }}
            title="Logout"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="Dashboard" element={<Dashboard />} />
          <Route path="Requisition" element={<Requisition />} />
          <Route path="Ticket" element={<Ticket userRole={userRole} />} />
          <Route path="Dispatch" element={<Dispatch />} />
          <Route
            path="Collections"
            element={<Collections userRole={userRole} />}
          />
          <Route
            path="Remittance"
            element={<Remittance />}
          />
          <Route path="Registry" element={<Registry />} />
          <Route path="StaffRegistry" element={<StaffRegistry />} />
          <Route path="Reports" element={<Reports />} />
          <Route path="Settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default mainIndex;
