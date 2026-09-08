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
  "/roaming-logs/": "/resource/roaming-logs",
  "/audit-logs/": "/resource/audit-logs",
  "/requisitions/": "/resource/requisitions",
  "/ticket-series/": "/resource/ticket-series",
  "/settings/terminal-price/": "/settings/terminal-price",
  "/report/remittance/": "/resource/remittance-batches",
  "/report/summary/": "/reports/summary",
  "/report/collections/": "/reports/collections",
  "/report/chart/": "/reports/chart",
  "/report/eod-reconciliation/": "/reports/eod-reconciliation",
  "/dashboard/stats/": "/reports/dashboard-stats",
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
  { prefix: "/routes/", remote: "/settings/routes", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { prefix: "/users/", remote: "/settings/users", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { prefix: "/puvtypes/", remote: "/settings/puv-types", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { prefix: "/ticket-forms/", remote: "/settings/ticket-forms", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { prefix: "/settings/terminal-price/", remote: "/settings/terminal-price", methods: ["PATCH", "PUT"], singleton: true },
  { prefix: "/vehicles/", remote: "/registry/vehicles", methods: ["PATCH", "PUT"] },
  { prefix: "/drivers/", remote: "/registry/drivers", methods: ["PATCH", "PUT"] },
  // Doesn't create a Ticket directly (LAN is always authoritative for those —
  // see sync/registry.py's PUSH_MODELS) — queues a RemoteBackfillRequest row
  // instead, applied by the LAN's next sync cycle. Only accepted while
  // WipMode is active (api/remote/settings/[resource].js enforces this).
  { prefix: "/backfill/manual/", remote: "/settings/backfill", methods: ["POST"] },
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
export function authFetch(endpoint, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const effectiveEndpoint = IS_REMOTE
    ? translateForRemote(endpoint, method) ?? endpoint
    : endpoint;

  const token = sessionStorage.getItem("accessToken");
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(`${API_BASE_URL}${effectiveEndpoint}`, { ...options, headers });
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

  if (resource.singleton) return resource.remote;
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

    //token
    const token = sessionStorage.getItem("accessToken");
    if (token) {
      defaultHeaders["Authorization"] = `Bearer ${token}`;
    }

    // Some forms (driver/vehicle registry, for photo upload support) always
    // build a FormData body, even when nothing but a text field changed.
    // The remote serverless functions only parse JSON — no multipart
    // parser there — so convert here. Files are dropped (photo upload
    // isn't supported remotely; see known gaps in api/remote/registry/).
    let effectiveBody = options.body;
    if (IS_REMOTE && typeof FormData !== "undefined" && effectiveBody instanceof FormData) {
      const plain = {};
      for (const [key, value] of effectiveBody.entries()) {
        if (value instanceof File) continue;
        plain[key] = value;
      }
      effectiveBody = JSON.stringify(plain);
    }

    const isFormData = typeof FormData !== "undefined" && effectiveBody instanceof FormData;
    const fetchOptions = {
      ...options,
      body: effectiveBody,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    if (!isFormData) {
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

  async refreshToken() {
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

  dispatchTicket(vehicleId, { ticketFormId, quantity }) {
    return this.post("/tickets/dispatch/", {
      vehicle_id: vehicleId,
      ticket_form_id: ticketFormId,
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

  getVehicles(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/vehicles/${qs ? `?${qs}` : ""}`);
  },

  createVehicle(data) {
    return this.post("/vehicles/", data);
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

  deleteUser(id) {
    return this.delete(`/users/${id}/`);
  },

  getCurrentUser() {
    return this.get("/current-user/");
  },

  getDashboardStats(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get(`/dashboard/stats/${qs ? `?${qs}` : ""}`);
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

  getRoamingLogs() {
    return this.get("/roaming-logs/");
  },

  createRoamingLog(data) {
    return this.post("/roaming-logs/", data);
  },

  getTerminalPrice() {
    return this.get("/settings/terminal-price/");
  },

  updateTerminalPrice(data) {
    return this.put("/settings/terminal-price/", data);
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

  // Remotely (only while WIP is active — enforced server-side), this queues
  // a RemoteBackfillRequest instead of creating the ticket outright, so
  // `commit` is meaningless there: there's no remote preview, every call
  // queues for real. See useTicketBackfill's IS_REMOTE branching.
  submitManualBackfill(row, commit) {
    return this.post("/backfill/manual/", { ...row, commit });
  },

  // Remote-only: recent RemoteBackfillRequest rows and their apply status,
  // for the "queued" panel useTicketBackfill shows in place of a live
  // preview. No LAN equivalent — the LAN applies these via sync, it doesn't
  // need to list them.
  getRemoteBackfillRequests() {
    return this.get("/settings/backfill");
  },

  previewTicketBackfill(file) {
    const formData = new FormData();
    formData.append("file", file);
    return this.post("/backfill/preview/", formData);
  },

  importTicketBackfill(file) {
    const formData = new FormData();
    formData.append("file", file);
    return this.post("/backfill/import/", formData);
  },

  deleteRemittanceBatch(id) {
    return this.delete(`/remittance/${id}/`);
  },

  // system backup / restore
  getSystemBackups() {
    return this.get("/system/backups/");
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

  async downloadSystemBackup(id, filename) {
    const token = sessionStorage.getItem("accessToken");
    const res = await fetch(`${API_BASE_URL}/system/backups/${id}/download/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to download backup (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `backup.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  async downloadRemittanceXlsx(id, filename) {
    const token = sessionStorage.getItem("accessToken");
    const endpoint = IS_REMOTE
      ? `${API_BASE_URL}/reports/remittance-xlsx?id=${id}`
      : `${API_BASE_URL}/remittance/${id}/export-xlsx/`;
    const res = await fetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to export remittance report (HTTP ${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "Remittance_Report.xlsx";
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
      return "Head Manager";
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
      throw new Error("Invalid credentials");
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
        const label = roleLabel(user.role);
        if (showToast)
          showToast(`Welcome, ${label} ${displayName}!`, "success");
      } else {
        if (showToast) showToast("Welcome back!", "success");
      }
    } catch {
      if (showToast) showToast("Welcome back!", "success");
    }

    // Remote (Vercel) reuses the same dashboard as the LAN — its data hooks
    // route through apiService's remote-path translation (see IS_REMOTE /
    // REMOTE_GET_MAP above) to read from Supabase instead of Django.
    navigate("/dashboard");
  } catch (err) {
    setError(err.message);
  }
};