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
import FleetRecords from "../../../lib/report/tables/FleetRecords";
import RewardRedemptions from "../../../lib/report/tables/RewardRedemptions";
import { getDriverCode } from "../../../lib/driver-utils";
import "../../../styles/Report.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export default function Report() {
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
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
  const [redemptions, setRedemptions] = useState([]);
  const [redemptionsTotal, setRedemptionsTotal] = useState(0);
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

  const fetchRedemptions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/rewards/redemptions/`);
      const data = await res.json();
      const list = data.redemptions || [];
      setRedemptions(list);
      setRedemptionsTotal(list.length);
    } catch {
      console.error("Failed to load reward redemptions");
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchLogs();
    fetchVehicles();
    fetchDrivers();
    fetchRoaming();
    fetchRedemptions();
  }, []);

  const filteredLogs = logs.filter((l) => {
    const d = l.timestamp ? l.timestamp.slice(0, 10) : "";
    if (filters.startDate && d < filters.startDate) return false;
    if (filters.endDate && d > filters.endDate) return false;
    return true;
  });

  const filteredRoaming = roaming.filter((r) => {
    if (!r.recorded_at) return true;
    const d = r.recorded_at.slice(0, 10);
    if (filters.startDate && d < filters.startDate) return false;
    if (filters.endDate && d > filters.endDate) return false;
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

  const buildVehicleExportRow = (v) => ({
    "Plate Number": v.plate_number,
    Route: v.route_detail
      ? `${v.route_detail.origin} - San Fernando`
      : v.route || "—",
    Transportation: v.transportation_name || v.transportation_id || "—",
    "Franchise #": v.franchise_number || "—",
    "QR Code": v.qr_code || "—",
    "Active Driver": v.active_driver_name || "Unassigned",
    Status: v.status,
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
    Status: d.status === "ACTIVE" ? "Active" : "Inactive",
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

  const buildRedemptionExportRow = (r) => ({
    Date: r.created_at ? r.created_at.slice(0, 10) : "—",
    Driver: r.driver_name || "—",
    "Points Redeemed": r.points_redeemed,
    "Peso Value": r.peso_value,
    Status: r.status,
    "Approved By": r.approved_by_name || "—",
  });

  const handleExportRedemptionsCSV = () =>
    exportCSV(
      redemptions.map(buildRedemptionExportRow),
      `reward_redemptions_${Date.now()}.csv`,
    );

  const handleExportRedemptionsPDF = () =>
    exportTablePDF(redemptions.map(buildRedemptionExportRow), "Reward Redemptions");

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

      <TransactionLogs
        filteredLogs={filteredLogs}
        STATUS_COLORS={STATUS_COLORS}
        roaming={filteredRoaming}
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

      <RewardRedemptions
        redemptions={redemptions}
        redemptionsTotal={redemptionsTotal}
        handleExportRedemptionsCSV={handleExportRedemptionsCSV}
        handleExportRedemptionsPDF={handleExportRedemptionsPDF}
      />
    </div>
  );
}
