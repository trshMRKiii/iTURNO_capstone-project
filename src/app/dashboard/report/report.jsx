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
  formatTime,
  formatChanges,
  exportCSV,
  SummaryCard,
} from "../../../lib/report/reportHook";
import { exportTablePDF } from "../../../lib/report/exportPDF";

import TransactionLogs from "../../../lib/report/tables/TransactionLogs";
import AuditTrail from "../../../lib/report/tables/AuditTrail";
import FleetRecords from "../../../lib/report/tables/FleetRecords";
import RequisitionRemittance from "../../../lib/report/tables/RequisitionRemittance";
import { getDriverCode } from "../../../lib/driver-utils";
import "../../../styles/Report.css";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8000/api"
    : `http://${window.location.hostname}:8000/api`);

const PAGE_SIZE = 30;
const EMPTY_PAGE_META = { count: 0, totalPages: 1 };

// Shapes a raw Ticket record into the flat row TransactionLogs/export expect.
const mapTicketToLogRow = (t) => ({
  id: t.id,
  timestamp: t.created_at,
  ticket_id: t.id,
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    setShowAllCollections(false);
    try {
      const qs = buildParams();
      const q = qs ? `?${qs}` : "";
      const [sumRes, colRes, chartRes] = await Promise.all([
        fetch(`${API_BASE}/report/summary/${q}`),
        fetch(`${API_BASE}/report/collections/${q}`),
        fetch(`${API_BASE}/report/chart/${q}`),
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
      `${API_BASE}/tickets/?mode=QUEUE&page=${page}&page_size=${PAGE_SIZE}${qs ? `&${qs}` : ""}`,
    );
    const data = await res.json();
    return {
      results: (data.results || []).map(mapTicketToLogRow),
      count: data.count || 0,
      totalPages: data.total_pages || 1,
      page: data.page || page,
    };
  }, [buildParams]);

  const fetchRoamingRaw = useCallback(async (page = 1) => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}/tickets/?mode=UNLOAD&page=${page}&page_size=${PAGE_SIZE}${qs ? `&${qs}` : ""}`,
    );
    const data = await res.json();
    return {
      results: data.results || [],
      count: data.count || 0,
      totalPages: data.total_pages || 1,
      page: data.page || page,
    };
  }, [buildParams]);

  const fetchAuditRaw = useCallback(async (page = 1) => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}/audit-logs/?page=${page}&page_size=${PAGE_SIZE}${qs ? `&${qs}` : ""}`,
    );
    const data = await res.json();
    return {
      results: data.logs || [],
      count: data.total || 0,
      totalPages: data.total_pages || 1,
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
      const res = await fetch(`${API_BASE}/vehicles/`);
      const data = await res.json();
      setVehicles(Array.isArray(data) ? data : data.vehicles || []);
      setVehiclesTotal(Array.isArray(data) ? data.length : data.total || 0);
    } catch {
      console.error("Failed to load vehicle records");
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/drivers/`);
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
      `${API_BASE}/requisitions/?page=${page}&page_size=${PAGE_SIZE}${qs ? `&${qs}` : ""}`,
    );
    const data = await res.json();
    return {
      results: data.results || [],
      count: data.count || 0,
      totalPages: data.total_pages || 1,
      page: data.page || page,
    };
  }, [buildParams]);

  const fetchRemittanceRaw = useCallback(async (page = 1) => {
    const qs = buildParams();
    const res = await fetch(
      `${API_BASE}/report/remittance/?page=${page}&page_size=${PAGE_SIZE}${qs ? `&${qs}` : ""}`,
    );
    const data = await res.json();
    return {
      results: data.results || [],
      count: data.count || 0,
      totalPages: data.total_pages || 1,
      page: data.page || page,
    };
  }, [buildParams]);

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
    const res = await fetch(`${API_BASE}/tickets/?mode=QUEUE${qs ? `&${qs}` : ""}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.results || [];
    return list.map(mapTicketToLogRow);
  }, [buildParams]);

  const fetchRoamingExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await fetch(`${API_BASE}/tickets/?mode=UNLOAD${qs ? `&${qs}` : ""}`);
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }, [buildParams]);

  const fetchAuditExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await fetch(`${API_BASE}/audit-logs/?all=true${qs ? `&${qs}` : ""}`);
    const data = await res.json();
    return data.logs || [];
  }, [buildParams]);

  const fetchRequisitionExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await fetch(`${API_BASE}/requisitions/${qs ? `?${qs}` : ""}`);
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];
  }, [buildParams]);

  const fetchRemittanceExportRows = useCallback(async () => {
    const qs = buildParams();
    const res = await fetch(`${API_BASE}/report/remittance/${qs ? `?${qs}` : ""}`);
    const data = await res.json();
    return data.results || [];
  }, [buildParams]);

  useEffect(() => {
    fetchData();
    fetchTransactionPage();
    fetchRoamingPage();
    fetchAuditPage();
    fetchVehicles();
    fetchDrivers();
    fetchRequisitionPage();
    fetchRemittancePage();
  }, []);

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

  const handleExportVehiclesCSV = () =>
    exportCSV(
      vehicles.map(buildVehicleExportRow),
      `vehicle_records_${Date.now()}.csv`,
    );

  const handleExportDriversCSV = () =>
    exportCSV(
      drivers.map(buildDriverExportRow),
      `driver_records_${Date.now()}.csv`,
    );

  const handleExportVehiclesPDF = () =>
    exportTablePDF(vehicles.map(buildVehicleExportRow), "Vehicle Records");

  const handleExportDriversPDF = () =>
    exportTablePDF(drivers.map(buildDriverExportRow), "Driver Records");

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

  const handleExportRequisitionsCSV = async () => {
    const rows = await fetchRequisitionExportRows();
    exportCSV(rows.map(buildRequisitionExportRow), `requisitions_${Date.now()}.csv`);
  };

  const handleExportRequisitionsPDF = async () => {
    const rows = await fetchRequisitionExportRows();
    exportTablePDF(rows.map(buildRequisitionExportRow), "Requisition");
  };

  const buildRemittanceExportRow = (b) => ({
    "Issued At": b.issued_at ? new Date(b.issued_at).toLocaleString() : "—",
    "Issued By": b.issued_by_name || "—",
    Collections: b.collections ? b.collections.length : 0,
    "Total Amount": b.total_amount,
    Status: b.status,
  });

  const handleExportRemittanceCSV = async () => {
    const rows = await fetchRemittanceExportRows();
    exportCSV(rows.map(buildRemittanceExportRow), `remittance_${Date.now()}.csv`);
  };

  const handleExportRemittancePDF = async () => {
    const rows = await fetchRemittanceExportRows();
    exportTablePDF(rows.map(buildRemittanceExportRow), "Remittance");
  };

  const buildLogExportRow = (l) => ({
    Timestamp: l.timestamp,
    "Ticket ID": l.ticket_id,
    Action: l.action,
    Driver: l.driver,
    Vehicle: l.vehicle,
    Route: l.route,
    "Amount (PHP)": l.amount,
    User: l.user,
  });

  const handleExportLogsCSV = async () => {
    const rows = await fetchTransactionExportRows();
    exportCSV(rows.map(buildLogExportRow), `transaction_logs_${Date.now()}.csv`);
  };

  const handleExportLogsPDF = async () => {
    const rows = await fetchTransactionExportRows();
    exportTablePDF(rows.map(buildLogExportRow), "Transaction Logs");
  };

  const buildRoamingExportRow = (t) => ({
    "Ticket ID": String(t.id).replace(/^TICKET-/i, ""),
    Time: formatTime(t.issued_at),
    Vehicle: t.vehicle?.plate_number || "",
    Driver: t.driver?.name || "",
    "Issued By": t.active_user_name || "",
    Verified: t.status === "CANCELLED" ? "Cancelled" : t.is_verified ? "Verified" : "Pending",
  });

  const handleExportRoamingCSV = async () => {
    const rows = await fetchRoamingExportRows();
    exportCSV(rows.map(buildRoamingExportRow), `roaming_logs_${Date.now()}.csv`);
  };

  const handleExportRoamingPDF = async () => {
    const rows = await fetchRoamingExportRows();
    exportTablePDF(rows.map(buildRoamingExportRow), "Roaming Logs");
  };

  const buildAuditExportRow = (l) => ({
    Timestamp: l.created_at ? new Date(l.created_at).toLocaleString() : "—",
    Action: l.action_display || l.action,
    Item: `${l.model_name} #${l.object_id}`,
    Details: l.object_repr || formatChanges(l.changes),
    User: l.user_name || "System",
  });

  const handleExportAuditCSV = async () => {
    const rows = await fetchAuditExportRows();
    exportCSV(rows.map(buildAuditExportRow), `audit_trail_${Date.now()}.csv`);
  };

  const handleExportAuditPDF = async () => {
    const rows = await fetchAuditExportRows();
    exportTablePDF(rows.map(buildAuditExportRow), "Audit Trail");
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
        STATUS_COLORS={STATUS_COLORS}
        pageSize={PAGE_SIZE}
      />

      <RequisitionRemittance
        requisitionData={requisitionData}
        requisitionMeta={requisitionMeta}
        onRequisitionFetchPage={fetchRequisitionRaw}
        onExportRequisitionsCSV={handleExportRequisitionsCSV}
        onExportRequisitionsPDF={handleExportRequisitionsPDF}
        remittanceData={remittanceData}
        remittanceMeta={remittanceMeta}
        onRemittanceFetchPage={fetchRemittanceRaw}
        onExportRemittanceCSV={handleExportRemittanceCSV}
        onExportRemittancePDF={handleExportRemittancePDF}
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
        onExportCSV={handleExportAuditCSV}
        onExportPDF={handleExportAuditPDF}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
