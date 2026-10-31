/**
 * API Service - Centralized API request handling with error logging
 */

// Set VITE_API_MODE=remote in the Vercel project's env vars. Locally/on the
// LAN this is unset, so nothing here changes from before — this only
// affects the deployed Vercel build, which can't reach the LAN Django
// backend and instead talks to the /api/remote/* serverless functions
// (same origin, no CORS needed) — see api/remote/ and api/_lib/.
export const IS_REMOTE = import.meta.env.VITE_API_MODE === "remote";

export const API_BASE_URL = IS_REMOTE
  ? "/api/remote"
  : window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8000/api"
    : `http://${window.location.hostname}:8000/api`;
// Backend stays HTTP — only frontend needs HTTPS for camera access

// Maps the LAN (Django) paths that read-only modules already call through
// apiService/request() to their /api/remote/* equivalent — this is the ONE
// place that has to know both shapes, so none of the existing components/
// hooks (queue, dispatch, vehicle, driver, remittance, requisition, etc.)
// needed to change to work remotely. Order matters: prefix matches (ending
// in "*") are checked after exact matches.
// Remote endpoints are grouped into 5 functions, not 1-per-resource — a
// deployment on Vercel's Hobby plan is capped at 12 Serverless Functions
// total, so api/remote/{auth,resource,reports,settings,registry} each use
// a Vercel dynamic-route file ([x].js) internally dispatching by URL
// segment instead of being separate files. See api/remote/auth/[action].js
// for the full explanation.
const REMOTE_GET_MAP = {
  "/vehicles/": "/resource/vehicles",
  "/drivers/": "/resource/drivers",
  "/tickets/": "/resource/tickets",
  "/routes/": "/settings/routes",
  "/users/": "/settings/users",
  "/puvtypes/": "/settings/puv-types",
  "/ticket-forms/": "/settings/ticket-forms",
  "/audit-logs/": "/resource/audit-logs",
  "/requisitions/": "/resource/requisitions",
  "/ticket-series/": "/resource/ticket-series",
  "/report/remittance/": "/resource/remittance-batches",
  "/report/summary/": "/reports/summary",
  "/report/collections/": "/reports/collections",
  "/report/chart/": "/reports/chart",
  "/report/eod-reconciliation/": "/reports/eod-reconciliation",
  "/report/route-analytics/": "/reports/route-analytics",
  "/dashboard/stats/": "/reports/dashboard-stats",
  "/dashboard/busiest/": "/reports/dashboard-busiest",
  "/current-user/": "/auth/current-user",
  "/settings/wip-mode/": "/settings/wip-mode",
};

// Everything writable remotely, and which HTTP methods are actually
// allowed on each — SUPERADMIN-gated server-side in every case (see
// CAN_EDIT_SETTINGS in api/_lib/auth.js), this table just avoids even
// attempting a call that's guaranteed to be rejected (e.g. createVehicle,
// which isn't allowed remotely — only editing an existing vehicle's
// registry fields is; see api/remote/registry/[resource].js).
const REMOTE_WRITABLE = [
  // Public (no login yet) — handled by api/remote/auth/[action].js alongside token/refresh.
  { prefix: "/auth/forgot-password/", remote: "/auth/forgot-password", methods: ["POST"] },
  { prefix: "/auth/reset-password/", remote: "/auth/reset-password", methods: ["POST"] },
  { prefix: "/auth/change-password/", remote: "/auth/change-password", methods: ["POST"] },
  { prefix: "/routes/", remote: "/settings/routes", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { prefix: "/users/", remote: "/settings/users", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { prefix: "/puvtypes/", remote: "/settings/puv-types", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { prefix: "/ticket-forms/", remote: "/settings/ticket-forms", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { prefix: "/vehicles/", remote: "/registry/vehicles", methods: ["PATCH", "PUT"] },
  { prefix: "/drivers/", remote: "/registry/drivers", methods: ["PATCH", "PUT"] },
  // Doesn't create a Ticket directly (LAN is always authoritative for those —
  // see sync/registry.py's PUSH_MODELS) — queues a RemoteBackfillRequest row
  // instead, applied by the LAN's next sync cycle. Only accepted while
  // WipMode is active (api/remote/settings/[resource].js enforces this).
  { prefix: "/backfill/batch/", remote: "/settings/backfill", methods: ["POST"] },
];

// Exported for the few places that build fetch() URLs directly instead of
// going through apiService (currently just the Reports module, which needs
// several endpoints in parallel) — same translation apiService.request()
// uses internally, so there's one source of truth for the path mapping.
export function remotePath(endpoint, method = "GET") {
  return translateForRemote(endpoint, method);
}

// Thin fetch() wrapper for callers that need the raw Response (Reports fires
// several endpoints in parallel and does its own .json() handling instead of
// apiService.request()'s parsed-data contract). Reuses the same remote path
// translation and Authorization header attachment as request() — without
// this, remote calls reach the serverless functions with no auth header and
// requireAuth() in api/_lib/auth.js 401s every one of them.
export async function authFetch(endpoint, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const effectiveEndpoint = IS_REMOTE
    ? translateForRemote(endpoint, method) ?? endpoint
    : endpoint;
  const url = `${API_BASE_URL}${effectiveEndpoint}`;

  await apiService.refreshIfExpiring();
  const send = () => {
    const token = sessionStorage.getItem("accessToken");
    const headers = { ...options.headers };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...options, headers });
  };

  // Access tokens last 5 minutes (SIMPLE_JWT) — refresh once and retry, as
  // apiService.request does. Parallel callers share one in-flight refresh.
  let response = await send();
  if (response.status === 401 && (await apiService.refreshToken())) {
    response = await send();
  }
  return response;
}

function translateForRemote(endpoint, method) {
  const [path, query] = endpoint.split("?");
  const qs = query ? `?${query}` : "";

  if (method === "GET") {
    const mapped = REMOTE_GET_MAP[path];
    return mapped ? `${mapped}${qs}` : endpoint;
  }

  const resource = REMOTE_WRITABLE.find((r) => path.startsWith(r.prefix));
  if (!resource || !resource.methods.includes(method)) return null; // not allowed remotely

  const idMatch = path.slice(resource.prefix.length).match(/^(\d+)\/?$/);
  return idMatch ? `${resource.remote}?id=${idMatch[1]}` : resource.remote;
}

export const apiService = {
  async request(endpoint, options = {}) {
    let effectiveEndpoint = endpoint;
    if (IS_REMOTE) {
      const method = (options.method || "GET").toUpperCase();
      const translated = translateForRemote(endpoint, method);
      if (translated === null) {
        throw new Error("This action isn't available remotely yet — it only works on the LAN terminal.");
      }
      effectiveEndpoint = translated;
    }

    const url = `${API_BASE_URL}${effectiveEndpoint}`;
    const defaultHeaders = {};

    await this.refreshIfExpiring();
    const token = sessionStorage.getItem("accessToken");
    if (token) {
      defaultHeaders["Authorization"] = `Bearer ${token}`;
    }

    const fetchOptions = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    if (!(fetchOptions.body instanceof FormData)) {
      fetchOptions.headers["Content-Type"] = "application/json";
    }

    let bodyPreview;
    if (fetchOptions.body instanceof FormData) {
      bodyPreview = "[FormData]";
    } else if (fetchOptions.body) {
      try {
        bodyPreview = JSON.parse(fetchOptions.body);
      } catch {
        bodyPreview = fetchOptions.body;
      }
    }

    console.log(`[API] ${options.method || "GET"} ${url}`, {
      body: bodyPreview,
    });

    try {
      let response = await fetch(url, fetchOptions);

      // Log response status
      console.log(`[API] Response Status: ${response.status}`, {
        statusText: response.statusText,
        headers: {
          "content-type": response.headers.get("content-type"),
        },
      });

      if (response.status === 401) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          fetchOptions.headers["Authorization"] =
            `Bearer ${sessionStorage.getItem("accessToken")}`;
          response = await fetch(url, fetchOptions);
        }

        // Refresh failed, or the retried request is still unauthorized
        // (e.g. token rejected for another reason) — stop here and
        // force a logout instead of surfacing a generic error.
        if (response.status === 401) {
          this.logout();
          return;
        }
      }

      // Try to parse response
      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        console.error(`[API] Error Response:`, data);
        // DRF field-validation errors come back as { field: ["message"] } rather
        // than { detail: "message" } — surface the first field name + message as
        // plain text instead of dumping raw JSON or an unattributed message.
        let message = data?.detail;
        if (!message && data && typeof data === "object") {
          const [firstKey, firstValue] = Object.entries(data)[0] || [];
          const text = Array.isArray(firstValue) ? firstValue[0] : firstValue;
          if (firstKey && typeof text === "string") {
            const label = firstKey
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
            message = `${label}: ${text}`;
          } else {
            message = text;
          }
        }
        const error = new Error(
          message ||
            JSON.stringify(data) ||
            `HTTP ${response.status}: ${response.statusText}`,
        );
        error.status = response.status;
        error.response = data;
        throw error;
      }

      console.log(`[API] Success:`, data);
      return data;
    } catch (err) {
      console.error(`[API] Request failed:`, err);
      throw err;
    }
  },

  // Access tokens are short-lived (5 min) — refresh just before expiry so the
  // request doesn't go out with a dead token and show up as a 401 in the console.
  async refreshIfExpiring() {
    const token = sessionStorage.getItem("accessToken");
    if (!token) return;
    try {
      const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (exp * 1000 - Date.now() < 30000) await this.refreshToken();
    } catch {
      // Unreadable token — let the normal 401 → refresh path handle it.
    }
  },

  async refreshToken() {
    // Several requests can 401 at once (e.g. a page that fires several fetches
    // in parallel) — without sharing one in-flight refresh, each would fire its own
    // /token/refresh/ call using the same refresh token.
    if (this._refreshPromise) return this._refreshPromise;
    this._refreshPromise = this._doRefreshToken().finally(() => {
      this._refreshPromise = null;
    });
    return this._refreshPromise;
  },

  async _doRefreshToken() {
    const refresh = sessionStorage.getItem("refreshToken");
    if (!refresh) {
      this.logout();
      return false;
    }

    try {
      const refreshUrl = IS_REMOTE ? `${API_BASE_URL}/auth/token-refresh` : `${API_BASE_URL}/token/refresh/`;
      const response = await fetch(refreshUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });

      if (!response.ok) {
        this.logout();
        return false;
      }

      const data = await response.json();
      sessionStorage.setItem("accessToken", data.access);
      return true;
    } catch {
      this.logout();
      return false;
    }
  },

  logout() {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    window.location.href = "/";
  },

  get(endpoint) {
    return this.request(endpoint, { method: "GET" });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: "PUT",
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  patch(endpoint, body) {
    return this.request(endpoint, {
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: "DELETE" });
  },

  // Specific endpoints for this app
  getTickets(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/tickets/${qs ? `?${qs}` : ""}`);
  },

  getServerTime() {
    return this.get("/server-time/");
  },

  createTicket(ticketData) {
    return this.post("/tickets/", ticketData);
  },

  updateTicket(ticketId, ticketData) {
    return this.patch(`/tickets/${ticketId}/`, ticketData);
  },

  reassignTicketDriver(ticketId, driverId) {
    return this.post(`/tickets/${ticketId}/reassign_driver/`, { driver_id: driverId });
  },

  dispatchTicket(vehicleId, { seriesId, quantity }) {
    return this.post("/tickets/dispatch/", {
      vehicle_id: vehicleId,
      series_id: seriesId,
      quantity,
    });
  },

  roamTicket(vehicleId, driverId, { ticketFormId, quantity }) {
    return this.post("/tickets/roam/", {
      vehicle_id: vehicleId,
      driver_id: driverId,
      ticket_form_id: ticketFormId,
      quantity,
    });
  },

  convertToRoam(vehicleId, { seriesId, quantity }) {
    return this.post("/tickets/convert-to-roam/", {
      vehicle_id: vehicleId,
      series_id: seriesId,
      quantity,
    });
  },

  // Kiosk visits (self-service QR check-in): the driver pays the check-in Personnel at
  // check-in, then their next scan on the kiosk checks them out. The kiosk screen itself
  // calls /kiosk/scan/ and /kiosk/check-in/ directly.
  getKioskSessions() {
    return this.get("/kiosk/sessions/");
  },

  // The Dispatch desk: check-in / check-out Personnel and the series the kiosk draws from.
  getDeskDuty() {
    return this.get("/desk-duty/");
  },

  setDeskDuty(fields) {
    return this.patch("/desk-duty/", fields);
  },

  cancelKioskVisit(vehicleId) {
    return this.post("/kiosk/cancel/", { vehicle_id: vehicleId });
  },

  reorderQueue(routeId, vehicleIds, reason) {
    return this.post("/tickets/reorder-queue/", {
      route_id: routeId,
      vehicle_ids: vehicleIds,
      reason,
    });
  },

  extendLoading(routeId, minutes) {
    return this.post("/tickets/extend-loading/", { route_id: routeId, minutes });
  },

  getVehicles(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/vehicles/${qs ? `?${qs}` : ""}`);
  },

  createVehicle(data) {
    return this.post("/vehicles/", data);
  },

  // LAN only (hidden when IS_REMOTE). `commit` false validates for the preview; true creates.
  importVehicles(rows, commit) {
    return this.post("/vehicles/import/", { rows, commit });
  },

  importDrivers(rows, commit) {
    return this.post("/drivers/import/", { rows, commit });
  },

  getTicketPrices() {
    return this.get("/ticketPrice/");
  },

  createTicketPrice(data) {
    return this.post("/ticketPrice/", data);
  },

  updateVehicle(id, data) {
    return this.put(`/vehicles/${id}/`, data);
  },

  deleteVehicle(id) {
    return this.delete(`/vehicles/${id}/`);
  },

  getDrivers(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/drivers/${qs ? `?${qs}` : ""}`);
  },

  createDriver(data) {
    return this.post("/drivers/", data);
  },

  updateDriver(id, data) {
    return this.put(`/drivers/${id}/`, data);
  },

  deleteDriver(id) {
    return this.delete(`/drivers/${id}/`);
  },

  getRoutes(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/routes/${qs ? `?${qs}` : ""}`);
  },

  createRoute(data) {
    return this.post("/routes/", data);
  },

  updateRoute(id, data) {
    return this.put(`/routes/${id}/`, data);
  },

  deleteRoute(id) {
  return this.delete(`/routes/${id}/`);
  },

  getUsers() {
    return this.get("/users/");
  },

  createUser(data) {
    return this.post("/users/", data);
  },

  updateUser(id, data) {
    return this.put(`/users/${id}/`, data);
  },

  // LAN only (hidden when IS_REMOTE). `commit` false validates for the preview; true creates.
  importUsers(rows, commit) {
    return this.post("/users/import/", { rows, commit });
  },

  // Supervisor/Manager-friendly: sends only the fleet tick, which is all they may change.
  setFleetAccess(id, allowed) {
    return this.patch(`/users/${id}/`, { can_manage_fleet: allowed });
  },

  getCurrentUser() {
    return this.get("/current-user/");
  },

  // Self-service: the server only accepts name and contact number here.
  updateCurrentUser(data) {
    return this.patch("/current-user/", data);
  },

  getDashboardStats(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/dashboard/stats/${qs ? `?${qs}` : ""}`);
  },

  getDashboardBusiest(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/dashboard/busiest/${qs ? `?${qs}` : ""}`);
  },

  getReportChart() {
    return this.get("/report/chart/");
  },

  getAuditLogs(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/audit-logs/${qs ? `?${qs}` : ""}`);
  },

  //puvtype
  getPUVTypes() {
    return this.get("/puvtypes/");
  },

  createPUVType(data) {
    return this.post("/puvtypes/", data);
  },

  updatePUVType(id, data) {
    return this.put(`/puvtypes/${id}/`, data);
  },

  deletePUVType(id) {
    return this.delete(`/puvtypes/${id}/`);
  },

  getTicketForms() {
    return this.get("/ticket-forms/");
  },

  createTicketForm(data) {
    return this.post("/ticket-forms/", data);
  },

  updateTicketForm(id, data) {
    return this.patch(`/ticket-forms/${id}/`, data);
  },

  deleteTicketForm(id) {
    return this.delete(`/ticket-forms/${id}/`);
  },

  // WIP mode: toggling stays LAN-only (see the model's docstring in
  // backend/api/models.py) — a flag meant to block ticket issuance
  // immediately can't tolerate the sync engine's pull-cycle latency.
  // Reading it remotely is fine though (WipMode is pushed to Supabase for
  // exactly this — see sync/registry.py), and gates remote backfill below.
  getWipMode() {
    return this.get("/settings/wip-mode/");
  },

  updateWipMode(isActive) {
    if (IS_REMOTE) {
      return Promise.reject(
        new Error("WIP mode isn't available remotely — it only works on the LAN terminal."),
      );
    }
    return this.put("/settings/wip-mode/", { is_active: isActive });
  },

  // One call for a whole screen's worth of entries (see backfill.py's run_batch):
  // saved all-or-nothing as a single history entry. Remotely (only while WIP is
  // active - enforced server-side) it queues ONE RemoteBackfillRequest holding
  // every row instead, so `commit` is meaningless there: no remote preview, every
  // call queues for real. See useTicketBackfill's IS_REMOTE branching.
  submitBackfillBatch(rows, commit, remitted = false) {
    return this.post("/backfill/batch/", { rows, commit, remitted });
  },

  // Remote-only: recent RemoteBackfillRequest rows and their apply status,
  // for the "queued" panel useTicketBackfill shows in place of a live
  // preview. No LAN equivalent — the LAN applies these via sync, it doesn't
  // need to list them.
  getRemoteBackfillRequests() {
    return this.get("/settings/backfill");
  },

  getBackfillRecord(id) {
    return this.get(`/backfill/history/${id}/`);
  },

  async downloadBackfillCsv(id, filename) {
    const token = sessionStorage.getItem("accessToken");
    const res = await fetch(`${API_BASE_URL}/backfill/history/${id}/download/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to download CSV (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "backfill.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  deleteRemittanceBatch(id) {
    return this.delete(`/remittance/${id}/`);
  },

  // system backup / restore
  getSystemBackups() {
    return this.get("/system/backups/");
  },

  getBackupSettings() {
    return this.get("/system/backups/settings/");
  },

  updateBackupSettings(settings) {
    return this.put("/system/backups/settings/", settings);
  },

  createSystemBackup(label = "") {
    return this.post("/system/backups/", { label });
  },

  deleteSystemBackup(id) {
    return this.delete(`/system/backups/${id}/`);
  },

  restoreSystemBackup(id) {
    return this.post(`/system/backups/${id}/restore/`);
  },

  // Lets the user choose where the backup file goes. Must run straight from a click (before any await).
  // Resolves to a file handle, or null when cancelled or unsupported (then the browser's normal download is used).
  async pickBackupSaveHandle(suggestedName) {
    if (!window.showSaveFilePicker) return null;
    try {
      return await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: "Backup file", accept: { "application/json": [".json"] } }],
      });
    } catch (err) {
      if (err.name === "AbortError") return null;
      throw err;
    }
  },

  async downloadSystemBackup(id, filename, fileHandle = null) {
    const token = sessionStorage.getItem("accessToken");
    const res = await fetch(`${API_BASE_URL}/system/backups/${id}/download/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to download backup (HTTP ${res.status})`);
    const blob = await res.blob();
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `backup.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  restoreSystemBackupUpload(file) {
    const formData = new FormData();
    formData.append("file", file);
    return this.post("/system/backups/restore-upload/", formData);
  },

  // password reset
  requestPasswordReset(email) {
    return this.post("/auth/forgot-password/", { email });
  },

  confirmPasswordReset({ uid, token, newPassword }) {
    return this.post("/auth/reset-password/", {
      uid,
      token,
      new_password: newPassword,
    });
  },

  changePassword(newPassword) {
    return this.post("/auth/change-password/", { new_password: newPassword });
  },

};

//login

/* ── Role label helper ── */
const roleLabel = (role) => {
  switch ((role || "").toUpperCase()) {
    case "MANAGER":
      return "Manager";
    case "SUPERVISOR":
      return "Supervisor";
    case "PERSONNEL":
      return "Personnel";
    default:
      return "Admin";
  }
};

export const handleLogin = async (
  username,
  password,
  setError,
  navigate,
  showToast,
) => {
  setError("");

  if (!username.trim() || !password.trim()) {
    setError("Please enter both email and password.");
    return;
  }

  try {
    const tokenUrl = IS_REMOTE ? `${API_BASE_URL}/auth/token` : `${API_BASE_URL}/token/`;
    const currentUserUrl = IS_REMOTE ? `${API_BASE_URL}/auth/current-user` : `${API_BASE_URL}/current-user/`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      // Both backends send SimpleJWT's stock "No active account found with the
      // given credentials" for a bad email/password (or a deactivated account).
      // Keep their other messages (e.g. unverified email) as-is.
      const detail = errData?.detail;
      const badLogin = errData?.code === "no_active_account" || /^no active account/i.test(detail || "");
      throw new Error(
        badLogin || (response.status === 401 && !detail)
          ? "Wrong email or password."
          : detail || "Unable to sign in. Please try again.",
      );
    }

    const data = await response.json();
    sessionStorage.setItem("accessToken", data.access);
    sessionStorage.setItem("refreshToken", data.refresh);

    // Fetch current user to personalise welcome toast
    try {
      const userRes = await fetch(currentUserUrl, {
        headers: { Authorization: `Bearer ${data.access}` },
      });
      if (userRes.ok) {
        const user = await userRes.json();
        const displayName = user.first_name ? user.first_name : user.username;
        if (showToast)
          showToast(`Welcome, ${roleLabel(user.role)} ${displayName}!`, "success");
      }
    } catch {
      // greeting is optional
    }

    // Remote (Vercel) reuses the same dashboard as the LAN — its data hooks
    // route through apiService's remote-path translation (see IS_REMOTE /
    // REMOTE_GET_MAP above) to read from Supabase instead of Django.
    navigate("/dashboard");
  } catch (err) {
    setError(err.message);
  }
};