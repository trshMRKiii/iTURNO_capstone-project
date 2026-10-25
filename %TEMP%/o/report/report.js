import { useState, useEffect, useCallback } from "react";
import { DataTable } from "../../../components/ui/dataTable";
import { nameWithRole } from "../../../lib/roles";
import {
  getToday,
  PERIODS,
  getPeriodRange,
  formatRangeLabel,
  matchesQueueRow,
  matchesRoamingRow,
  matchesRequisitionRow,
  matchesRemittanceRow,
  matchesAuditRow,
  formatAuditItem,
  formatAuditAction
} from "./reportHook";
import { exportTablePDF } from "./exportPDF";
import { useFeedback } from "../../../components/ui/kit";
import QueueLog from "./tables/QueueLog";
import RouteAnalytics from "./tables/RouteAnalytics";
import AuditTrail from "./tables/AuditTrail";
import RequisitionRemittance from "./tables/RequisitionRemittance";
import { IS_REMOTE, authFetch } from "../../../lib/api-service";
import "../../../styles/Report.css";
const PAGE_SIZE = 30;
const EMPTY_PAGE_META = { count: 0, totalPages: 1 };
const mapTicketToLogRow = (t) => ({
  id: t.id,
  timestamp: t.created_at,
  ticket_id: t.queue_code || String(t.id || "").replace(/^TICKET-/i, ""),
  action: t.status,
  driver: t.driver?.name || "",
  vehicle: t.vehicle?.plate_number || "",
  route: t.route_name || "",
  amount: t.collection_amount,
  issued_by: t.checked_in_by_name || "\u2014",
  dispatched_by: t.checked_out_by_name || "\u2014"
});
export default function Report() {
  const { notify } = useFeedback();
  const [period, setPeriod] = useState("month");
  const [filters, setFilters] = useState(() => getPeriodRange("month"));
  const [queueData, setQueueData] = useState([]);
  const [queueMeta, setQueueMeta] = useState(EMPTY_PAGE_META);
  const [roamingData, setRoamingData] = useState([]);
  const [roamingMeta, setRoamingMeta] = useState(EMPTY_PAGE_META);
  const [auditData, setAuditData] = useState([]);
  const [auditMeta, setAuditMeta] = useState(EMPTY_PAGE_META);
  const [requisitionData, setRequisitionData] = useState([]);
  const [requisitionMeta, setRequisitionMeta] = useState(EMPTY_PAGE_META);
  const [remittanceData, setRemittanceData] = useState([]);
  const [remittanceMeta, setRemittanceMeta] = useState(EMPTY_PAGE_META);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.startDate) p.set("start_date", filters.startDate);
    if (filters.endDate) p.set("end_date", filters.endDate);
    return p.toString();
  }, [filters.startDate, filters.endDate]);
  const fetchQueueRaw = useCallback(async (page = 1, size = PAGE_SIZE) => {
    const qs = buildParams();
    const res = await authFetch(
      `/tickets/?mode=QUEUE&page=${page}&page_size=${size}${qs ? `&${qs}` : ""}`
    );
    const data = await res.json();
    return {
      results: (data.results || []).map(mapTicketToLogRow),
      count: data.count || 0,
      totalPages: data.total_pages || Math.max(Math.ceil((data.count || 0) / size), 1),
      page: data.page || page
    };
  }, [buildParams]);
  const fetchRoamingRaw = useCallback(async (page = 1, size = PAGE_SIZE) => {
    const qs = buildParams();
    const res = await authFetch(
      `/tickets/?mode=UNLOAD&page=${page}&page_size=${size}${qs ? `&${qs}` : ""}`
    );
    const data = await res.json();
    return {
      results: data.results || [],
      count: data.count || 0,
      totalPages: data.total_pages || Math.max(Math.ceil((data.count || 0) / size), 1),
      page: data.page || page
    };
  }, [buildParams]);
  const fetchAuditRaw = useCallback(async (page = 1, size = PAGE_SIZE) => {
    const qs = buildParams();
    const res = await authFetch(
      `/audit-logs/?page=${page}&page_size=${size}${qs ? `&${qs}` : ""}`
    );
    const data = await res.json();
    const results = IS_REMOTE ? data.results || [] : data.logs || [];
    const count = IS_REMOTE ? data.count || 0 : data.total || 0;
    return {
      results,
      count,
      totalPages: data.total_pages || Math.max(Math.ceil(count / size), 1),
      page: data.page || page
    };
  }, [buildParams]);
  const fetchQueuePage = useCallback(async () => {
    try {
      const data = await fetchQueueRaw(1);
      setQueueData(data.results);
      setQueueMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load queue log");
      setError("Failed to load report data. Check your API connection.");
    }
  }, [fetchQueueRaw]);
  const fetchRoamingPage = useCallback(async () => {
    try {
      const data = await fetchRoamingRaw(1);
      setRoamingData(data.results);
      setRoamingMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load roaming logs");
      setError("Failed to load report data. Check your API connection.");
    }
  }, [fetchRoamingRaw]);
  const fetchAuditPage = useCallback(async () => {
    try {
      const data = await fetchAuditRaw(1);
      setAuditData(data.results);
      setAuditMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load audit trail");
      setError("Failed to load report data. Check your API connection.");
    }
  }, [fetchAuditRaw]);
  const fetchRequisitionRaw = useCallback(async (page = 1, size = PAGE_SIZE) => {
    const qs = buildParams();
    const res = await authFetch(
      `/requisitions/?page=${page}&page_size=${size}&is_archived=false${qs ? `&${qs}` : ""}`
    );
    const data = await res.json();
    return {
      results: data.results || [],
      count: data.count || 0,
      totalPages: data.total_pages || Math.max(Math.ceil((data.count || 0) / size), 1),
      page: data.page || page
    };
  }, [buildParams]);
  const fetchRemittanceRaw = useCallback(async (page = 1, size = PAGE_SIZE) => {
    const qs = buildParams();
    const res = await authFetch(
      `/report/remittance/?page=${page}&page_size=${size}&is_archived=false${qs ? `&${qs}` : ""}`
    );
    const data = await res.json();
    return {
      results: data.results || [],
      count: data.count || 0,
      totalPages: data.total_pages || Math.max(Math.ceil((data.count || 0) / size), 1),
      page: data.page || page
    };
  }, [buildParams]);
  const fetchRequisitionPage = useCallback(async () => {
    try {
      const data = await fetchRequisitionRaw(1);
      setRequisitionData(data.results);
      setRequisitionMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load requisitions");
      setError("Failed to load report data. Check your API connection.");
    }
  }, [fetchRequisitionRaw]);
  const fetchRemittancePage = useCallback(async () => {
    try {
      const data = await fetchRemittanceRaw(1);
      setRemittanceData(data.results);
      setRemittanceMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load remittance batches");
      setError("Failed to load report data. Check your API connection.");
    }
  }, [fetchRemittanceRaw]);
  const fetchQueueExportRows = useCallback(async (search = "") => {
    const qs = buildParams();
    const res = await authFetch(
      `/tickets/?mode=QUEUE${search ? `&search=${encodeURIComponent(search)}` : ""}${qs ? `&${qs}` : ""}`
    );
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.results || [];
    return list.map(mapTicketToLogRow);
  }, [buildParams]);
  const fetchRoamingExportRows = useCallback(async (search = "") => {
    const qs = buildParams();
    const res = await authFetch(
      `/tickets/?mode=UNLOAD${search ? `&search=${encodeURIComponent(search)}` : ""}${qs ? `&${qs}` : ""}`
    );
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }, [buildParams]);
  const fetchAuditExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await authFetch(`/audit-logs/?all=true${qs ? `&${qs}` : ""}`);
    const data = await res.json();
    return IS_REMOTE ? data.results || data || [] : data.logs || [];
  }, [buildParams]);
  const fetchRequisitionExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await authFetch(
      `/requisitions/?is_archived=false${qs ? `&${qs}` : ""}`
    );
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }, [buildParams]);
  const fetchRemittanceExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await authFetch(
      `/report/remittance/?is_archived=false${qs ? `&${qs}` : ""}`
    );
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }, [buildParams]);
  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      fetchQueuePage(),
      fetchRoamingPage(),
      fetchAuditPage(),
      fetchRequisitionPage(),
      fetchRemittancePage()
    ]).finally(() => setLoading(false));
  }, [filters.startDate, filters.endDate]);
  const handlePeriodChange = (key) => {
    setPeriod(key);
    const range = getPeriodRange(key);
    if (range) setFilters(range);
  };
  const handleDateChange = (field, value) => {
    setFilters((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "endDate" && updated.startDate && value < updated.startDate)
        return prev;
      if (field === "startDate" && updated.endDate && value > updated.endDate)
        updated.endDate = "";
      return updated;
    });
  };
  const handleClearFilter = () => handlePeriodChange("month");
  const buildRequisitionExportRow = (r) => ({
    "Date Requested": r.date_requested ? r.date_requested.slice(0, 10) : "\u2014",
    "Requested By": r.requested_by_name || "\u2014",
    "Issued By": nameWithRole(r.issued_by_name, r.issued_by_role) || "\u2014",
    "Ticket Series": r.ticket_series && r.ticket_series.length ? r.ticket_series.map((ts) => ts.series_no).join("; ") : "\u2014",
    "Total Value": r.total_value,
    Status: r.status
  });
  const exportTable = (data, title) => {
    if (!exportTablePDF(data, title)) notify.error({ title: "Nothing to export", message: "No records match the current filters." });
  };
  const handleExportRequisitionsPDF = async (search = "") => {
    const rows = await fetchRequisitionExportRows();
    exportTable(rows.filter((r) => matchesRequisitionRow(r, search)).map(buildRequisitionExportRow), "Requisition");
  };
  const buildRemittanceExportRow = (b) => ({
    "Issued At": b.issued_at ? new Date(b.issued_at).toLocaleString() : "\u2014",
    "Prepared By": b.prepared_by_name || "\u2014",
    "Issued By": nameWithRole(b.issued_by_name, b.issued_by_role) || "\u2014",
    Collections: b.collections ? b.collections.length : 0,
    "Total Amount": b.total_amount,
    Status: b.status
  });
  const handleExportRemittancePDF = async (search = "") => {
    const rows = await fetchRemittanceExportRows();
    exportTable(rows.filter((b) => matchesRemittanceRow(b, search)).map(buildRemittanceExportRow), "Remittance");
  };
  const buildLogExportRow = (l) => ({
    Timestamp: l.timestamp ? new Date(l.timestamp).toLocaleString() : "\u2014",
    "Ticket ID": l.ticket_id,
    Action: l.action,
    Driver: l.driver,
    Vehicle: l.vehicle,
    Route: l.route,
    "Amount (PHP)": l.amount,
    "Issued By": l.issued_by,
    "Dispatched By": l.dispatched_by
  });
  const handleExportQueuePDF = async (search = "") => {
    const rows = await fetchQueueExportRows(search);
    exportTable(rows.filter((l) => matchesQueueRow(l, search)).map(buildLogExportRow), "Terminal Queue Log");
  };
  const buildRoamingExportRow = (t) => ({
    "Ticket ID": String(t.id).replace(/^TICKET-/i, ""),
    Timestamp: t.issued_at ? new Date(t.issued_at).toLocaleString() : "\u2014",
    Vehicle: t.vehicle?.plate_number || "",
    Driver: t.driver?.name || "",
    "Issued By": t.checked_in_by_name || "",
    "Dispatched By": t.checked_out_by_name || "",
    Verified: t.is_verified ? "Verified" : "Pending"
  });
  const handleExportRoamingPDF = async (search = "") => {
    const rows = await fetchRoamingExportRows(search);
    exportTable(rows.filter((t) => matchesRoamingRow(t, search)).map(buildRoamingExportRow), "Roaming Logs");
  };
  const handleExportRouteAnalyticsPDF = (rows, title = "Route Analytics") => exportTable(rows, title);
  const fetchRouteAnalytics = useCallback(async (extra = {}) => {
    const p = new URLSearchParams(buildParams());
    Object.entries(extra).forEach(([k, v]) => v && p.set(k, v));
    const res = await authFetch(`/report/route-analytics/?${p}`);
    return res.json();
  }, [buildParams]);
  const buildAuditExportRow = (l) => ({
    Timestamp: l.created_at ? new Date(l.created_at).toLocaleString() : "\u2014",
    Action: formatAuditAction(l),
    Item: formatAuditItem(l),
    User: l.user_name || "System"
  });
  const handleExportAuditPDF = async (search = "") => {
    const rows = await fetchAuditExportRows();
    exportTable(rows.filter((l) => matchesAuditRow(l, search)).map(buildAuditExportRow), "Audit Trail");
  };
  return /* @__PURE__ */ React.createElement("div", { className: "rpt-page" }, /* @__PURE__ */ React.createElement("div", { className: "rpt-header" }, /* @__PURE__ */ React.createElement("div", { className: "rpt-header-left" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { className: "rpt-title" }, "Report Generation")))), error && /* @__PURE__ */ React.createElement("div", { className: "rpt-alert" }, /* @__PURE__ */ React.createElement(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2"
    },
    /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }),
    /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
    /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })
  ), error), /* @__PURE__ */ React.createElement("div", { className: "rpt-filter-bar" }, /* @__PURE__ */ React.createElement("div", { className: "rpt-chips" }, PERIODS.map((p) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: p.key,
      type: "button",
      className: `rpt-chip${period === p.key ? " rpt-chip--active" : ""}`,
      onClick: () => handlePeriodChange(p.key)
    },
    p.label
  ))), period === "custom" && /* @__PURE__ */ React.createElement("div", { className: "rpt-filter-fields" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      className: "rpt-date-input",
      "aria-label": "Start date",
      value: filters.startDate,
      max: getToday(),
      onChange: (e) => handleDateChange("startDate", e.target.value)
    }
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      className: "rpt-date-input",
      "aria-label": "End date",
      value: filters.endDate,
      min: filters.startDate || void 0,
      max: getToday(),
      onChange: (e) => handleDateChange("endDate", e.target.value)
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "rpt-filter-range" }, loading && /* @__PURE__ */ React.createElement("span", { className: "rpt-spinner rpt-spinner--dark" }), /* @__PURE__ */ React.createElement("span", null, formatRangeLabel(filters.startDate, filters.endDate)), /* @__PURE__ */ React.createElement("button", { type: "button", className: "rpt-link-btn", onClick: handleClearFilter }, "Reset"))), /* @__PURE__ */ React.createElement(
    RequisitionRemittance,
    {
      requisitionData,
      requisitionMeta,
      onRequisitionFetchPage: fetchRequisitionRaw,
      onRequisitionFetchAll: fetchRequisitionExportRows,
      onExportRequisitionsPDF: handleExportRequisitionsPDF,
      remittanceData,
      remittanceMeta,
      onRemittanceFetchPage: fetchRemittanceRaw,
      onRemittanceFetchAll: fetchRemittanceExportRows,
      onExportRemittancePDF: handleExportRemittancePDF
    }
  ), /* @__PURE__ */ React.createElement(
    QueueLog,
    {
      queueData,
      queueMeta,
      onQueueFetchPage: fetchQueueRaw,
      onExportQueuePDF: handleExportQueuePDF,
      roamingData,
      roamingMeta,
      onRoamingFetchPage: fetchRoamingRaw,
      onExportRoamingPDF: handleExportRoamingPDF,
      onQueueFetchAll: fetchQueueExportRows,
      onRoamingFetchAll: fetchRoamingExportRows,
      pageSize: PAGE_SIZE
    }
  ), /* @__PURE__ */ React.createElement(
    RouteAnalytics,
    {
      onFetch: fetchRouteAnalytics,
      onExportPDF: handleExportRouteAnalyticsPDF
    }
  ), /* @__PURE__ */ React.createElement(
    AuditTrail,
    {
      auditData,
      auditMeta,
      onAuditFetchPage: fetchAuditRaw,
      onAuditFetchAll: fetchAuditExportRows,
      onExportPDF: handleExportAuditPDF
    }
  ));
}
