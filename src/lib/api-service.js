/**
 * API Service - Centralized API request handling with error logging
 */

const API_BASE_URL = "http://localhost:8000/api";

export const apiService = {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const defaultHeaders = {};

    //token
    const token = sessionStorage.getItem("accessToken");
    if (token) {
      defaultHeaders["Authorization"] = `Bearer ${token}`;
    }

    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const fetchOptions = {
      ...options,
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
        const error = new Error(
          data.detail ||
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
      const response = await fetch(`${API_BASE_URL}/token/refresh/`, {
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
  getTickets() {
    return this.get("/tickets/");
  },

  getServerTime() {
    return this.get("/server-time/");
  },

  getSchedules() {
    return this.get("/schedules/");
  },

  updateSchedules(data) {
    return this.put("/schedules/", data);
  },

  createTicket(ticketData) {
    return this.post("/tickets/", ticketData);
  },

  updateTicket(ticketId, ticketData) {
    return this.patch(`/tickets/${ticketId}/`, ticketData);
  },

  getVehicles() {
    return this.get("/vehicles/");
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

  getDrivers() {
    return this.get("/drivers/");
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

  getRoutes() {
    return this.get("/routes/");
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

  getDashboardStats() {
    return this.get("/dashboard/stats/");
  },

  getReportChart() {
    return this.get("/report/chart/");
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

  getDenominations() {
    return this.get("/denominations/");
  },

  createDenomination(data) {
    return this.post("/denominations/", data);
  },

  deleteDenomination(id) {
    return this.delete(`/denominations/${id}/`);
  },

  getRoamingLogs() {
    return this.get("/roaming-logs/");
  },

  createRoamingLog(data) {
    return this.post("/roaming-logs/", data);
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
    setError("Please enter both username and password.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/token/`, {
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
      const userRes = await fetch(`${API_BASE_URL}/current-user/`, {
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

    // ✅ Redirect to dashboard after successful login
    navigate("/dashboard");
  } catch (err) {
    setError(err.message);
  }
};