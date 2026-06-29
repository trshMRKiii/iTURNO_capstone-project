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
import { exportPDF } from "../../../lib/report/exportPDF";
import { DataTable } from "../../../components/ui/dataTable";
import {
  peso,
  STATUS_COLORS,
  today,
  exportCSV,
  SummaryCard,
} from "../../../lib/report/reportHook";

import CollectionRecords from "../../../lib/report/tables/CollectionRecords";
import TransactionLogs from "../../../lib/report/tables/TransactionLogs";
import VehicleRecords from "../../../lib/report/tables/VehicleRecords";
import DriverRecords from "../../../lib/report/tables/DriverRecords";
import "../../../styles/Report.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export default function Report() {
  const [filters, setFilters] = useState({
    startDate: today,
    endDate: today,
    batch: "all",
  });
  const [summary, setSummary] = useState(null);
  const [collections, setCollections] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesTotal, setVehiclesTotal] = useState(0);
  const [drivers, setDrivers] = useState([]);
  const [driversTotal, setDriversTotal] = useState(0);
  const [showAllCollections, setShowAllCollections] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showAllVehicles, setShowAllVehicles] = useState(false);
  const [showAllDrivers, setShowAllDrivers] = useState(false);
  const [roaming, setRoaming] = useState([]);
  const [roamingTotal, setRoamingTotal] = useState(0);
  const [showAllRoaming, setShowAllRoaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/logs/?all=true`);
      const data = await res.json();
      setLogs(data.logs || []);
      setLogsTotal(data.total || 0);
    } catch {
      console.error("Failed to load logs");
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

  const fetchRoaming = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/roaming-logs/`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.results || [];
      setRoaming(list);
      setRoamingTotal(data.count ?? list.length);
    } catch {
      console.error("Failed to load roaming logs");
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchLogs();
    fetchVehicles();
    fetchDrivers();
    fetchRoaming();
  }, []);

  const filteredCollections = collections.filter((r) => {
    if (filters.batch === "batch1") return r.batch === "Batch 1";
    if (filters.batch === "batch2") return r.batch === "Batch 2";
    return true;
  });

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
    setFilters({ startDate: "", endDate: "", batch: "all" });
    setTimeout(() => fetchData(), 0);
  };

  const handleExportCSV = () =>
    exportCSV(
      filteredCollections.map((r) => ({
        Date: r.issued_at,
        Batch: r.batch,
        "Ticket ID": r.id,
        Driver: r.driver,
        Vehicle: r.vehicle,
        Route: r.route,
        "Amount (PHP)": r.collection_amount || 0,
      })),
      `collection_report_${Date.now()}.csv`,
    );

  const handleExportLogsCSV = () =>
    exportCSV(
      logs.map((l) => ({
        Timestamp: l.timestamp,
        "Ticket ID": l.ticket_id,
        Action: l.action,
        Driver: l.driver,
        Vehicle: l.vehicle,
        Route: l.route,
        Batch: l.batch,
        "Amount (PHP)": l.amount,
        User: l.user,
      })),
      `transaction_logs_${Date.now()}.csv`,
    );

  const handleExportVehiclesCSV = () =>
    exportCSV(
      vehicles.map((v) => ({
        Code: v.code,
        "Plate Number": v.plate_number,
        Route: v.route_detail
          ? `${v.route_detail.origin} - San Fernando`
          : v.route,
        Driver: v.active_driver_name || "—",
      })),
      `vehicle_records_${Date.now()}.csv`,
    );

  const handleExportDriversCSV = () =>
    exportCSV(
      drivers.map((d) => ({
        Code: d.code,
        Name: d.name,
        "Contact Number": d.contact_number,
      })),
      `driver_records_${Date.now()}.csv`,
    );

  const handleExportRoamingCSV = () =>
    exportCSV(
      roaming.map((r) => ({
        "Vehicle Plate": r.vehicle_plate,
        Driver: r.driver_name || "",
        "Recorded By": r.recorded_by_name || "",
        Notes: r.notes || "",
        "Recorded At": r.recorded_at,
      })),
      `roaming_logs_${Date.now()}.csv`,
    );

  const handleExportPDF = () => exportPDF(filteredCollections, filters);

  return (
    <div className="rpt-page">
      {/* Header */}
      <div className="rpt-header">
        <div className="rpt-header-left">
          <div className="rpt-header-accent" />
          <div>
            <h1 className="rpt-title">Collection Reports</h1>
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

      
      {/* Child table sections — style props kept for backward compat but unused */}
      <CollectionRecords
        filters={filters}
        setFilters={setFilters}
        showAllCollections={showAllCollections}
        setShowAllCollections={setShowAllCollections}
        filteredCollections={filteredCollections}
        visibleCollections={
          showAllCollections
            ? filteredCollections
            : filteredCollections.slice(0, 5)
        }
        handleExportCSV={handleExportCSV}
        handleExportPDF={handleExportPDF}
        peso={peso}
      />

      <TransactionLogs
        logsTotal={logsTotal}
        showAllLogs={showAllLogs}
        filteredLogs={logs}
        setShowAllLogs={setShowAllLogs}
        visibleLogs={showAllLogs ? logs : logs.slice(0, 5)}
        handleExportLogsCSV={handleExportLogsCSV}
        STATUS_COLORS={STATUS_COLORS}
        roaming={roaming}
        roamingTotal={roamingTotal}
        handleExportRoamingCSV={handleExportRoamingCSV}
      />

      <VehicleRecords
        vehiclesTotal={vehiclesTotal}
        showAllVehicles={showAllVehicles}
        setShowAllVehicles={setShowAllVehicles}
        visibleVehicles={showAllVehicles ? vehicles : vehicles.slice(0, 5)}
        handleExportVehiclesCSV={handleExportVehiclesCSV}
      />

      <DriverRecords
        driversTotal={driversTotal}
        showAllDrivers={showAllDrivers}
        setShowAllDrivers={setShowAllDrivers}
        visibleDrivers={showAllDrivers ? drivers : drivers.slice(0, 5)}
        handleExportDriversCSV={handleExportDriversCSV}
      />
    </div>
  );
}
