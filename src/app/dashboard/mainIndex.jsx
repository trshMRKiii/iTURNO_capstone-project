import React, { useState, useEffect } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import Dashboard from "./Dashboard";
import Requisition from "./requisition/requisition"
import Queue from "./queue/queue";
import Remittance from "./remittance/remittance";
import Registry from "./registry/registry";
import StaffRegistry from "./user/user";
import Reports from "./report/report";
import Settings from "./settings/settings"
import {
  DashboardIcon,
  RemittanceIcon,
  ReportIcon,
  RequisitionIcon,
  SettingsIcon,
  QueueIcon,
  UserIcon,
  VehicleIcon,
} from "../../components/ui/NavIcon";
import { apiService } from "../../lib/api-service";
import { useConfirm } from "../../components/ui/ToastConfirmContext";
import { BusyOverlay, FeedbackProvider, Skel, SkeletonList } from "../../components/ui/kit";
import ForcePasswordChange from "../../components/auth/ForcePasswordChange";
import ProfileModal from "../../components/auth/ProfileModal";
import GlobalNotices from "../../components/notices/GlobalNotices";
import "./../../styles/mainIndex.css";
import sfcLogo from "../../pictures/sfc-nobg-logo.png";

const NAV_GROUPS = [
  [{ to: "/dashboard", label: "Dashboard", Icon: DashboardIcon }],
  [
    { to: "/dashboard/Requisition", label: "Ticket Requisition", Icon: RequisitionIcon },   
  ],
  [
    { to: "/dashboard/Queue", label: "Queue Management", Icon: QueueIcon },
    { to: "/dashboard/Remittance", label: "Remittance", Icon: RemittanceIcon },
  ],
  [
    { to: "/dashboard/Registry", label: "Vehicle and Driver", Icon: VehicleIcon },
    { to: "/dashboard/StaffRegistry", label: "User Management", Icon: UserIcon },
  ],
  [{ to: "/dashboard/Reports", label: "Report Generation", Icon: ReportIcon }],
  [{ to: "/dashboard/Settings", label: "Settings", Icon: SettingsIcon }],
];

const ROLE_LABELS = {
  SUPERADMIN: "Admin",
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  PERSONNEL: "Personnel",
};

const ADMIN_NAV = [
  "/dashboard",
  "/dashboard/Requisition",
  "/dashboard/Queue",
  "/dashboard/Remittance",
  "/dashboard/Registry",
  "/dashboard/StaffRegistry",
  "/dashboard/Reports",
  "/dashboard/Settings",
];

// Supervisor and Manager are one position under two titles.
const ROLE_NAV = {
  SUPERADMIN: ADMIN_NAV,
  MANAGER: ADMIN_NAV,
  SUPERVISOR: ADMIN_NAV,
  PERSONNEL: ["/dashboard", "/dashboard/Queue", "/dashboard/Reports"],
};

// Personnel see Fleet & Driver only once a Supervisor/Manager has ticked it for them.
const navFor = (user) => {
  const nav = ROLE_NAV[user.role] || [];
  return user.role === "PERSONNEL" && user.can_manage_fleet ? [...nav, "/dashboard/Registry"] : nav;
};

function mainIndex() {
  const [currentUser, setCurrentUser] = useState({});
  const [userLoaded, setUserLoaded] = useState(false);
  const [dark, setDark] = useState(
    () => localStorage.getItem("theme") === "dark",
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
      })
      .finally(() => {
        if (isMounted) setUserLoaded(true);
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
  const userRoleLabel = ROLE_LABELS[userRole] || userRole;
  const allowedNav = navFor(currentUser);
  const canViewRemittance = allowedNav.includes("/dashboard/Remittance");

  if (!userLoaded) {
    return (
      <div className="shell" aria-busy="true" aria-label="Loading">
        <aside className="sidebar">
          <div className="sidebar-nav">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skel key={i} h={36} style={{ marginBottom: 14 }} />
            ))}
          </div>
        </aside>
        <main className="main-content">
          <Skel w={220} h={30} style={{ marginBottom: 24 }} />
          <SkeletonList rows={4} h={90} />
        </main>
      </div>
    );
  }

  if (currentUser.must_reset_password) {
    return (
      <ForcePasswordChange
        onChanged={() =>
          setCurrentUser((prev) => ({ ...prev, must_reset_password: false }))
        }
      />
    );
  }

  return (
    <FeedbackProvider>
    <div className="shell">
      <BusyOverlay open={signingOut} title="Signing out..." />
      {profileOpen && (
        <ProfileModal
          user={currentUser}
          onSaved={(updated) => setCurrentUser((prev) => ({ ...prev, ...updated }))}
          onClose={() => setProfileOpen(false)}
        />
      )}
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
        {/* User footer */}
        <div className="header-user">
          <button
            type="button"
            className="header-user-info"
            onClick={() => setProfileOpen(true)}
            title="Edit my profile"
          >
            <div className="header-user-name">{userName}</div>
            <div className="header-user-role">{userRoleLabel}</div>
          </button>

          {/* Theme toggle */}
          <button
            className="header-icon-btn"
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
            className="header-icon-btn header-logout-btn"
            onClick={async () => {
              const ok = await showConfirm("Are you sure you want to logout?");
              if (!ok) return;
              setSigningOut(true);
              setTimeout(() => apiService.logout(), 800);
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
            <span className="header-logout-label">Logout</span>
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <div
          className="mobile-nav-overlay"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside className={`sidebar${mobileNavOpen ? " sidebar-open" : ""}`}>
        {/* Nav links */}
        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">Navigation</div>
          {NAV_GROUPS.map((group) =>
            group.filter((item) => allowedNav.includes(item.to)),
          )
            .filter((group) => group.length > 0)
            .map((group, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <div className="sidebar-nav-divider" />}
                {group.map(({ to, label, Icon }) => (
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
              </React.Fragment>
            ))}
        </nav>

      </aside>

      <main className="main-content">
        <GlobalNotices canViewRemittance={canViewRemittance} />
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="Dashboard" element={<Dashboard />} />
          <Route path="Requisition" element={<Requisition />} />
          <Route path="Queue" element={<Queue userRole={userRole} />} />
          <Route
            path="Remittance"
            element={<Remittance />}
          />          <Route path="Registry" element={<Registry />} />
          <Route
            path="StaffRegistry"
            element={<StaffRegistry userRole={userRole} />}
          />
          <Route path="Reports" element={<Reports />} />
          <Route path="Settings/*" element={<Settings />} />
        </Routes>
      </main>
    </div>
    </FeedbackProvider>
  );
}

export default mainIndex;
