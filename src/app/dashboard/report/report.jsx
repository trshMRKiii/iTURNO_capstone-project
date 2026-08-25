import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DataTable } from "../../../components/ui/dataTable";
import {
  STATUS_COLORS,
  today,
  yearStart,
  formatChanges,
  exportCSV,
  SummaryCard,
  matchesLogRow,
  matchesRoamingRow,
  matchesRequisitionRow,
  matchesRemittanceRow,
  matchesAuditRow,
  matchesVehicleRow,
  matchesDriverRow,
} from "./reportHook";
import { exportTablePDF } from "./exportPDF";

import TransactionLogs from "./tables/TransactionLogs";
import AuditTrail from "./tables/AuditTrail";
import FleetRecords from "./tables/FleetRecords";
import RequisitionRemittance from "./tables/RequisitionRemittance";
import { getDriverCode } from "../driver/driver-utils";
import { API_BASE_URL, IS_REMOTE, remotePath } from "../../../lib/api-service";
import "../../../styles/Report.css";

const API_BASE = API_BASE_URL;
// Bypasses apiService's fetch wrapper (needs several requests in parallel
// with its own response handling), so it has to do its own LAN->remote path
// translation — same mapping apiService.request() uses, via remotePath().
const path = (endpoint) => (IS_REMOTE ? remotePath(endpoint) ?? endpoint : endpoint);

const PAGE_SIZE = 30;
const EMPTY_PAGE_META = { count: 0, totalPages: 1 };

// Shapes a raw Ticket record into the flat row TransactionLogs/export expect.
// ticket_id mirrors getTicketDisplayId() (queue/useQueue.jsx) so cancelled queue
// tickets show their friendly bay code (e.g. "NA-2") instead of the raw
// placeholder id they keep until a real ticket number is assigned at dispatch.
const mapTicketToLogRow = (t) => ({
  id: t.id,
  timestamp: t.created_at,
  ticket_id: t.queue_code || String(t.id || "").replace(/^TICKET-/i, ""),
  action: t.status,
  driver: t.driver?.name || "",
  vehicle: t.vehicle?.plate_number || "",
  route: t.route_name || "",
  amount: t.collection_amount,
  user: t.active_user_name || "System",
});

export default function Report() {
  const [filters, setFilters] = useState({
    startDate: yearStart,
    endDate: today,
  });
  const [summary, setSummary] = useState(null);
  const [collections, setCollections] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [showAllCollections, setShowAllCollections] = useState(false);

  const [transactionData, setTransactionData] = useState([]);
  const [transactionMeta, setTransactionMeta] = useState(EMPTY_PAGE_META);

  const [roamingData, setRoamingData] = useState([]);
  const [roamingMeta, setRoamingMeta] = useState(EMPTY_PAGE_META);

  const [auditData, setAuditData] = useState([]);
  const [auditMeta, setAuditMeta] = useState(EMPTY_PAGE_META);

  const [vehicles, setVehicles] = useState([]);
  const [vehiclesTotal, setVehiclesTotal] = useState(0);
  const [drivers, setDrivers] = useState([]);
  const [driversTotal, setDriversTotal] = useState(0);
  const [showAllVehicles, setShowAllVehicles] = useState(false);
  const [showAllDrivers, setShowAllDrivers] = useState(false);

  const [requisitionData, setRequisitionData] = useState([]);
  const [requisitionMeta, setRequisitionMeta] = useState(EMPTY_PAGE_META);
  const [requisitionArchived, setRequisitionArchived] = useState(false);

  const [remittanceData, setRemittanceData] = useState([]);
  const [remittanceMeta, setRemittanceMeta] = useState(EMPTY_PAGE_META);
  const [remittanceArchived, setRemittanceArchived] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.startDate) p.set("start_date", filters.startDate);
    if (filters.endDate) p.set("end_date", filters.endDate);
    return p.toString();
  }, [filters.startDate, filters.endDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    setShowAllCollections(false);
    try {
      const qs = buildParams();
      const q = qs ? `?${qs}` : "";
      const [sumRes, colRes, chartRes] = await Promise.all([
        fetch(`${API_BASE}${path(`/report/summary/${q}`)}`),
        fetch(`${API_BASE}${path(`/report/collections/${q}`)}`),
        fetch(`${API_BASE}${path(`/report/chart/${q}`)}`),
      ]);
      setSummary(await sumRes.json());
      setCollections((await colRes.json()).results || []);
      setChartData((await chartRes.json()).chart_data || []);
    } catch {
      setError("Failed to load report data. Check your API connection.");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Raw page fetchers — return data instead of touching state, so the "View All"
  // modal in each table can browse further pages without disturbing the
  // top-30 preview shown on the main card.
  const fetchTransactionRaw = useCallback(async (page = 1) => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}${path(`/tickets/?mode=QUEUE&page=${page}&page_size=${PAGE_SIZE}${qs ? `&${qs}` : ""}`)}`,
    );
    const data = await res.json();
    return {
      results: (data.results || []).map(mapTicketToLogRow),
      count: data.count || 0,
      totalPages: data.total_pages || Math.max(Math.ceil((data.count || 0) / PAGE_SIZE), 1),
      page: data.page || page,
    };
  }, [buildParams]);

  const fetchRoamingRaw = useCallback(async (page = 1) => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}${path(`/tickets/?mode=UNLOAD&page=${page}&page_size=${PAGE_SIZE}${qs ? `&${qs}` : ""}`)}`,
    );
    const data = await res.json();
    return {
      results: data.results || [],
      count: data.count || 0,
      totalPages: data.total_pages || Math.max(Math.ceil((data.count || 0) / PAGE_SIZE), 1),
      page: data.page || page,
    };
  }, [buildParams]);

  const fetchAuditRaw = useCallback(async (page = 1) => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}${path(`/audit-logs/?page=${page}&page_size=${PAGE_SIZE}${qs ? `&${qs}` : ""}`)}`,
    );
    const data = await res.json();
    // Remote /resource/audit-logs returns {results,count} (shared shape
    // across all remote resources); LAN's /audit-logs/ returns {logs,total}.
    const results = IS_REMOTE ? data.results || [] : data.logs || [];
    const count = IS_REMOTE ? data.count || 0 : data.total || 0;
    return {
      results,
      count,
      totalPages: data.total_pages || Math.max(Math.ceil(count / PAGE_SIZE), 1),
      page: data.page || page,
    };
  }, [buildParams]);

  const fetchTransactionPage = useCallback(async () => {
    try {
      const data = await fetchTransactionRaw(1);
      setTransactionData(data.results);
      setTransactionMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load transaction logs");
    }
  }, [fetchTransactionRaw]);

  const fetchRoamingPage = useCallback(async () => {
    try {
      const data = await fetchRoamingRaw(1);
      setRoamingData(data.results);
      setRoamingMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load roaming logs");
    }
  }, [fetchRoamingRaw]);

  const fetchAuditPage = useCallback(async () => {
    try {
      const data = await fetchAuditRaw(1);
      setAuditData(data.results);
      setAuditMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load audit trail");
    }
  }, [fetchAuditRaw]);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}${path("/vehicles/")}`);
      const data = await res.json();
      setVehicles(Array.isArray(data) ? data : data.vehicles || []);
      setVehiclesTotal(Array.isArray(data) ? data.length : data.total || 0);
    } catch {
      console.error("Failed to load vehicle records");
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}${path("/drivers/")}`);
      const data = await res.json();
      setDrivers(Array.isArray(data) ? data : data.drivers || []);
      setDriversTotal(Array.isArray(data) ? data.length : data.total || 0);
    } catch {
      console.error("Failed to load driver records");
    }
  }, []);

  const fetchRequisitionRaw = useCallback(async (page = 1) => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}${path(`/requisitions/?page=${page}&page_size=${PAGE_SIZE}&is_archived=${requisitionArchived}${qs ? `&${qs}` : ""}`)}`,
    );
    const data = await res.json();
    return {
      results: data.results || [],
      count: data.count || 0,
      totalPages: data.total_pages || Math.max(Math.ceil((data.count || 0) / PAGE_SIZE), 1),
      page: data.page || page,
    };
  }, [buildParams, requisitionArchived]);

  const fetchRemittanceRaw = useCallback(async (page = 1) => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}${path(`/report/remittance/?page=${page}&page_size=${PAGE_SIZE}&is_archived=${remittanceArchived}${qs ? `&${qs}` : ""}`)}`,
    );
    const data = await res.json();
    return {
      results: data.results || [],
      count: data.count || 0,
      totalPages: data.total_pages || Math.max(Math.ceil((data.count || 0) / PAGE_SIZE), 1),
      page: data.page || page,
    };
  }, [buildParams, remittanceArchived]);

  const fetchRequisitionPage = useCallback(async () => {
    try {
      const data = await fetchRequisitionRaw(1);
      setRequisitionData(data.results);
      setRequisitionMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load requisitions");
    }
  }, [fetchRequisitionRaw]);

  const fetchRemittancePage = useCallback(async () => {
    try {
      const data = await fetchRemittanceRaw(1);
      setRemittanceData(data.results);
      setRemittanceMeta({ count: data.count, totalPages: data.totalPages });
    } catch {
      console.error("Failed to load remittance batches");
    }
  }, [fetchRemittanceRaw]);

  // Full date-filtered range, ignoring pagination — used only when exporting,
  // so CSV/PDF stay complete even though the on-screen table only loads one page.
  const fetchTransactionExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await fetch(`${API_BASE}${path(`/tickets/?mode=QUEUE${qs ? `&${qs}` : ""}`)}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.results || [];
    return list.map(mapTicketToLogRow);
  }, [buildParams]);

  const fetchRoamingExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await fetch(`${API_BASE}${path(`/tickets/?mode=UNLOAD${qs ? `&${qs}` : ""}`)}`);
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }, [buildParams]);

  const fetchAuditExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await fetch(`${API_BASE}${path(`/audit-logs/?all=true${qs ? `&${qs}` : ""}`)}`);
    const data = await res.json();
    return IS_REMOTE ? data.results || data || [] : data.logs || [];
  }, [buildParams]);

  const fetchRequisitionExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}${path(`/requisitions/?is_archived=${requisitionArchived}${qs ? `&${qs}` : ""}`)}`,
    );
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }, [buildParams, requisitionArchived]);

  const fetchRemittanceExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}${path(`/report/remittance/?is_archived=${remittanceArchived}${qs ? `&${qs}` : ""}`)}`,
    );
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }, [buildParams, remittanceArchived]);

  useEffect(() => {
    fetchData();
    fetchTransactionPage();
    fetchRoamingPage();
    fetchAuditPage();
    fetchVehicles();
    fetchDrivers();
  }, []);

  // Refetches on mount and whenever the Active/Archived requisition tab flips.
  useEffect(() => {
    fetchRequisitionPage();
  }, [requisitionArchived]);

  // Refetches on mount and whenever the Active/Archived remittance tab flips.
  useEffect(() => {
    fetchRemittancePage();
  }, [remittanceArchived]);

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

  const refetchFiltered = () => {
    fetchData();
    fetchTransactionPage();
    fetchRoamingPage();
    fetchAuditPage();
    fetchRequisitionPage();
    fetchRemittancePage();
  };

  const handleClearFilter = () => {
    setFilters({ startDate: yearStart, endDate: today });
    setTimeout(refetchFiltered, 0);
  };

  const buildVehicleExportRow = (v) => ({
    "Plate Number": v.plate_number,
    Route: v.route_detail
      ? `${v.route_detail.origin} - San Fernando`
      : v.route || "—",
    Transportation: v.transportation_name || v.transportation_id || "—",
    "Franchise #": v.franchise_number || "—",
    "QR Code": v.qr_code || "—",
    "Active Driver": v.active_driver_name || "Unassigned",
  });

  const buildDriverExportRow = (d) => ({
    IWP: getDriverCode(d),
    "First Name": d.first_name || "—",
    "Middle Name": d.middle_name || "—",
    "Last Name": d.last_name || "—",
    Gender: d.gender || "—",
    Birthdate: d.birthdate || "—",
    Province: d.province || "—",
    City: d.city || "—",
    Barangay: d.barangay || "—",
    Street: d.street || "—",
    "Contact No.": d.contact || "—",
  });

  const handleExportVehiclesCSV = (search = "") =>
    exportCSV(
      vehicles.filter((v) => matchesVehicleRow(v, search)).map(buildVehicleExportRow),
      `vehicle_records_${Date.now()}.csv`,
    );

  const handleExportDriversCSV = (search = "") =>
    exportCSV(
      drivers.filter((d) => matchesDriverRow(d, search)).map(buildDriverExportRow),
      `driver_records_${Date.now()}.csv`,
    );

  const handleExportVehiclesPDF = (search = "") =>
    exportTablePDF(vehicles.filter((v) => matchesVehicleRow(v, search)).map(buildVehicleExportRow), "Vehicle Records");

  const handleExportDriversPDF = (search = "") =>
    exportTablePDF(drivers.filter((d) => matchesDriverRow(d, search)).map(buildDriverExportRow), "Driver Records");

  const buildRequisitionExportRow = (r) => ({
    "Date Requested": r.date_requested ? r.date_requested.slice(0, 10) : "—",
    "Requested By": r.requested_by_name || "—",
    "Approved By": r.approved_by_name || "—",
    "Ticket Series": r.ticket_series && r.ticket_series.length
      ? r.ticket_series.map((ts) => ts.series_no).join("; ")
      : "—",
    "Total Value": r.total_value,
    Status: r.status,
  });

  const handleExportRequisitionsCSV = async (search = "") => {
    const rows = await fetchRequisitionExportRows();
    exportCSV(
      rows.filter((r) => matchesRequisitionRow(r, search)).map(buildRequisitionExportRow),
      `requisitions_${Date.now()}.csv`,
    );
  };

  const handleExportRequisitionsPDF = async (search = "") => {
    const rows = await fetchRequisitionExportRows();
    exportTablePDF(rows.filter((r) => matchesRequisitionRow(r, search)).map(buildRequisitionExportRow), "Requisition");
  };

  const buildRemittanceExportRow = (b) => ({
    "Issued At": b.issued_at ? new Date(b.issued_at).toLocaleString() : "—",
    "Issued By": b.issued_by_name || "—",
    Collections: b.collections ? b.collections.length : 0,
    "Total Amount": b.total_amount,
    Status: b.status,
  });

  const handleExportRemittanceCSV = async (search = "") => {
    const rows = await fetchRemittanceExportRows();
    exportCSV(
      rows.filter((b) => matchesRemittanceRow(b, search)).map(buildRemittanceExportRow),
      `remittance_${Date.now()}.csv`,
    );
  };

  const handleExportRemittancePDF = async (search = "") => {
    const rows = await fetchRemittanceExportRows();
    exportTablePDF(rows.filter((b) => matchesRemittanceRow(b, search)).map(buildRemittanceExportRow), "Remittance");
  };

  const buildLogExportRow = (l) => ({
    Timestamp: l.timestamp ? new Date(l.timestamp).toLocaleString() : "—",
    "Ticket ID": l.ticket_id,
    Action: l.action,
    Driver: l.driver,
    Vehicle: l.vehicle,
    Route: l.route,
    "Amount (PHP)": l.amount,
    User: l.user,
  });

  const handleExportLogsCSV = async (search = "") => {
    const rows = await fetchTransactionExportRows();
    exportCSV(
      rows.filter((l) => matchesLogRow(l, search)).map(buildLogExportRow),
      `transaction_logs_${Date.now()}.csv`,
    );
  };

  const handleExportLogsPDF = async (search = "") => {
    const rows = await fetchTransactionExportRows();
    exportTablePDF(rows.filter((l) => matchesLogRow(l, search)).map(buildLogExportRow), "Transaction Logs");
  };

  const buildRoamingExportRow = (t) => ({
    "Ticket ID": String(t.id).replace(/^TICKET-/i, ""),
    Timestamp: t.issued_at ? new Date(t.issued_at).toLocaleString() : "—",
    Vehicle: t.vehicle?.plate_number || "",
    Driver: t.driver?.name || "",
    "Issued By": t.active_user_name || "",
    Verified: t.status === "CANCELLED" ? "Cancelled" : t.is_verified ? "Verified" : "Pending",
  });

  const handleExportRoamingCSV = async (search = "") => {
    const rows = await fetchRoamingExportRows();
    exportCSV(
      rows.filter((t) => matchesRoamingRow(t, search)).map(buildRoamingExportRow),
      `roaming_logs_${Date.now()}.csv`,
    );
  };

  const handleExportRoamingPDF = async (search = "") => {
    const rows = await fetchRoamingExportRows();
    exportTablePDF(rows.filter((t) => matchesRoamingRow(t, search)).map(buildRoamingExportRow), "Roaming Logs");
  };

  const buildAuditExportRow = (l) => ({
    Timestamp: l.created_at ? new Date(l.created_at).toLocaleString() : "—",
    Action: l.action_display || l.action,
    Item: `${l.model_name} #${l.object_id}`,
    Details: l.object_repr || formatChanges(l.changes),
    User: l.user_name || "System",
  });

  const handleExportAuditCSV = async (search = "") => {
    const rows = await fetchAuditExportRows();
    exportCSV(
      rows.filter((l) => matchesAuditRow(l, search)).map(buildAuditExportRow),
      `audit_trail_${Date.now()}.csv`,
    );
  };

  const handleExportAuditPDF = async (search = "") => {
    const rows = await fetchAuditExportRows();
    exportTablePDF(rows.filter((l) => matchesAuditRow(l, search)).map(buildAuditExportRow), "Audit Trail");
  };

  return (
    <div className="rpt-page">
      {/* Header */}
      <div className="rpt-header">
        <div className="rpt-header-left">
          <div className="rpt-header-accent" />
          <div>
            <h1 className="rpt-title">Report Logs</h1>
            <p className="rpt-subtitle">
              View and export collection data per batch and period.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rpt-alert">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="rpt-filter-bar">
        <div className="rpt-filter-fields">
          <div className="rpt-filter-field">
            <label className="rpt-label">Start Date</label>
            <input
              type="date"
              className="rpt-date-input"
              value={filters.startDate}
              max={today}
              onChange={(e) => handleDateChange("startDate", e.target.value)}
            />
          </div>
          <div className="rpt-filter-field">
            <label className="rpt-label">End Date</label>
            <input
              type="date"
              className="rpt-date-input"
              value={filters.endDate}
              min={filters.startDate || undefined}
              max={today}
              onChange={(e) => handleDateChange("endDate", e.target.value)}
            />
          </div>
        </div>
        <div className="rpt-filter-actions">
          <button
            className="rpt-btn rpt-btn--primary"
            onClick={refetchFiltered}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="rpt-spinner" /> Loading…
              </>
            ) : (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Apply Filter
              </>
            )}
          </button>
          <button
            className="rpt-btn rpt-btn--secondary"
            onClick={handleClearFilter}
          >
            Clear
          </button>
        </div>
      </div>

      <TransactionLogs
        logsData={transactionData}
        logsMeta={transactionMeta}
        onLogsFetchPage={fetchTransactionRaw}
        onExportLogsCSV={handleExportLogsCSV}
        onExportLogsPDF={handleExportLogsPDF}
        roamingData={roamingData}
        roamingMeta={roamingMeta}
        onRoamingFetchPage={fetchRoamingRaw}
        onExportRoamingCSV={handleExportRoamingCSV}
        onExportRoamingPDF={handleExportRoamingPDF}
        onLogsFetchAll={fetchTransactionExportRows}
        onRoamingFetchAll={fetchRoamingExportRows}
        STATUS_COLORS={STATUS_COLORS}
        pageSize={PAGE_SIZE}
      />

      <RequisitionRemittance
        requisitionData={requisitionData}
        requisitionMeta={requisitionMeta}
        onRequisitionFetchPage={fetchRequisitionRaw}
        onRequisitionFetchAll={fetchRequisitionExportRows}
        onExportRequisitionsCSV={handleExportRequisitionsCSV}
        onExportRequisitionsPDF={handleExportRequisitionsPDF}
        requisitionArchived={requisitionArchived}
        onRequisitionArchivedChange={setRequisitionArchived}
        remittanceData={remittanceData}
        remittanceMeta={remittanceMeta}
        onRemittanceFetchPage={fetchRemittanceRaw}
        onRemittanceFetchAll={fetchRemittanceExportRows}
        onExportRemittanceCSV={handleExportRemittanceCSV}
        onExportRemittancePDF={handleExportRemittancePDF}
        remittanceArchived={remittanceArchived}
        onRemittanceArchivedChange={setRemittanceArchived}
        pageSize={PAGE_SIZE}
      />

      <FleetRecords
        vehiclesTotal={vehiclesTotal}
        showAllVehicles={showAllVehicles}
        setShowAllVehicles={setShowAllVehicles}
        visibleVehicles={showAllVehicles ? vehicles : vehicles.slice(0, 5)}
        handleExportVehiclesCSV={handleExportVehiclesCSV}
        handleExportVehiclesPDF={handleExportVehiclesPDF}
        driversTotal={driversTotal}
        showAllDrivers={showAllDrivers}
        setShowAllDrivers={setShowAllDrivers}
        visibleDrivers={showAllDrivers ? drivers : drivers.slice(0, 5)}
        handleExportDriversCSV={handleExportDriversCSV}
        handleExportDriversPDF={handleExportDriversPDF}
      />

      <AuditTrail
        auditData={auditData}
        auditMeta={auditMeta}
        onAuditFetchPage={fetchAuditRaw}
        onAuditFetchAll={fetchAuditExportRows}
        onExportCSV={handleExportAuditCSV}
        onExportPDF={handleExportAuditPDF}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
