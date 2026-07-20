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

export default function Report() {
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
  });
  const [summary, setSummary] = useState(null);
  const [collections, setCollections] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsTotal, setAuditLogsTotal] = useState(0);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesTotal, setVehiclesTotal] = useState(0);
  const [drivers, setDrivers] = useState([]);
  const [driversTotal, setDriversTotal] = useState(0);
  const [showAllCollections, setShowAllCollections] = useState(false);
  const [showAllVehicles, setShowAllVehicles] = useState(false);
  const [showAllDrivers, setShowAllDrivers] = useState(false);
  const [requisitions, setRequisitions] = useState([]);
  const [requisitionsTotal, setRequisitionsTotal] = useState(0);
  const [remittance, setRemittance] = useState([]);
  const [remittanceTotal, setRemittanceTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/tickets/`);
      const data = await res.json();
      setTickets(Array.isArray(data) ? data : data.results || []);
    } catch {
      console.error("Failed to load tickets");
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/audit-logs/?all=true`);
      const data = await res.json();
      setAuditLogs(data.logs || []);
      setAuditLogsTotal(data.total || 0);
    } catch {
      console.error("Failed to load audit trail");
    }
  }, []);

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

  const fetchRequisitions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/requisitions/`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.results || [];
      setRequisitions(list);
      setRequisitionsTotal(list.length);
    } catch {
      console.error("Failed to load requisitions");
    }
  }, []);

  const fetchRemittance = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/report/remittance/`);
      const data = await res.json();
      const list = data.results || [];
      setRemittance(list);
      setRemittanceTotal(data.count ?? list.length);
    } catch {
      console.error("Failed to load remittance batches");
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchTickets();
    fetchAuditLogs();
    fetchVehicles();
    fetchDrivers();
    fetchRequisitions();
    fetchRemittance();
  }, []);

  // Roaming vehicles are tickets issued with mode "UNLOAD" (see ticket.jsx issuance flow),
  // same split used by the Collection page so the two pages agree on what counts as roaming.
  const roamingTickets = tickets.filter((t) => t.mode === "UNLOAD");
  const transactionTickets = tickets.filter((t) => t.mode !== "UNLOAD");

  const inDateRange = (dateStr) => {
    const d = dateStr ? dateStr.slice(0, 10) : "";
    if (filters.startDate && d < filters.startDate) return false;
    if (filters.endDate && d > filters.endDate) return false;
    return true;
  };

  const filteredLogs = transactionTickets
    .filter((t) => inDateRange(t.created_at))
    .map((t) => ({
      id: t.id,
      timestamp: t.created_at,
      ticket_id: t.id,
      action: t.status,
      driver: t.driver?.name || "",
      vehicle: t.vehicle?.plate_number || "",
      route: t.route_name || "",
      amount: t.collection_amount,
      user: t.active_user_name || "System",
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const filteredAuditLogs = auditLogs.filter((a) => inDateRange(a.created_at));

  const filteredRoaming = roamingTickets
    .filter((t) => inDateRange(t.issued_at))
    .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));

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

  const handleClearFilter = () => {
    setFilters({ startDate: "", endDate: "" });
    setTimeout(() => fetchData(), 0);
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

  const handleExportRequisitionsCSV = () =>
    exportCSV(
      requisitions.map(buildRequisitionExportRow),
      `requisitions_${Date.now()}.csv`,
    );

  const handleExportRequisitionsPDF = () =>
    exportTablePDF(requisitions.map(buildRequisitionExportRow), "Requisition");

  const buildRemittanceExportRow = (b) => ({
    "Issued At": b.issued_at ? new Date(b.issued_at).toLocaleString() : "—",
    "Issued By": b.issued_by_name || "—",
    Collections: b.collections ? b.collections.length : 0,
    "Total Amount": b.total_amount,
    Status: b.status,
  });

  const handleExportRemittanceCSV = () =>
    exportCSV(
      remittance.map(buildRemittanceExportRow),
      `remittance_${Date.now()}.csv`,
    );

  const handleExportRemittancePDF = () =>
    exportTablePDF(remittance.map(buildRemittanceExportRow), "Remittance");

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
            onClick={fetchData}
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
        filteredLogs={filteredLogs}
        STATUS_COLORS={STATUS_COLORS}
        roaming={filteredRoaming}
      />

      <RequisitionRemittance
        requisitions={requisitions}
        requisitionsTotal={requisitionsTotal}
        handleExportRequisitionsCSV={handleExportRequisitionsCSV}
        handleExportRequisitionsPDF={handleExportRequisitionsPDF}
        remittance={remittance}
        remittanceTotal={remittanceTotal}
        handleExportRemittanceCSV={handleExportRemittanceCSV}
        handleExportRemittancePDF={handleExportRemittancePDF}
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

      <AuditTrail filteredAuditLogs={filteredAuditLogs} />
    </div>
  );
}
