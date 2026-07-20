import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { apiService } from "../../lib/api-service";
import "../../styles/Dashboard.css";
import "../../styles/Ticket.css";

const peso = (n) => {
  const num = parseFloat(n);
  if (isNaN(num)) return "₱0.00";
  return (
    "₱" +
    num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          className="chart-tooltip-row"
          style={{ color: entry.fill }}
        >
          <span className="chart-tooltip-name">{entry.name}</span>
          <span className="chart-tooltip-value">
            {entry.dataKey.includes("total")
              ? `₱${Number(entry.value).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
              : `${entry.value} tickets`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-icon">{icon}</div>
      </div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

// Local (not UTC) YYYY-MM-DD — avoids toISOString's UTC-shift off-by-one.
const todayStr = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // "tickets" | "revenue"
  const [chartMode, setChartMode] = useState("tickets");

  const today = todayStr();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const handleFromChange = (value) => {
    if (value > today) value = today;
    setFromDate(value);
    if (value > toDate) setToDate(value);
  };

  const handleToChange = (value) => {
    if (value > today) value = today;
    setToDate(value);
    if (value < fromDate) setFromDate(value);
  };

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError("");
      try {
        const range = { start_date: fromDate, end_date: toDate };
        const [statsData, chartJson] = await Promise.all([
          apiService.getDashboardStats(range),
          apiService.getReportChart(),
        ]);
        setStats(statsData);
        const data = (chartJson.chart_data || []).slice(-14);
        setChartData(data);
        // Routes fetched separately so a failure doesn't kill the dashboard
        try {
          const routeData = await apiService.getRoutes(range);
          setRoutes(Array.isArray(routeData) ? routeData : []);
        } catch {
          setRoutes([]);
        }
      } catch (e) {
        setError("Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [fromDate, toDate]);

  // Derive Y-axis tick formatter and bar data keys from chartMode
  const isRevenue = chartMode === "revenue";
  const yTickFormatter = isRevenue
    ? (v) =>
        `₱${Number(v).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`
    : (v) => `${v}`;

  const isSingleDay = fromDate === toDate;
  const isTodayOnly = isSingleDay && fromDate === today;
  const rangeLabel = isTodayOnly
    ? "Today"
    : isSingleDay
      ? fromDate
      : `${fromDate} – ${toDate}`;

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="col-header">
        <div className="col-header-left">
          <div className="col-header-accent" />
          <div>
            <h1 className="col-title">Dashboard</h1>
            <p className="col-subtitle">
              Overview of collection and activity for {rangeLabel}
            </p>
          </div>
        </div>
        <div className="col-header-right">
          <div className="dashboard-date-filter">
            <label>
              From
              <input
                type="date"
                value={fromDate}
                max={today}
                onChange={(e) => handleFromChange(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={toDate}
                max={today}
                onChange={(e) => handleToChange(e.target.value)}
              />
            </label>
          </div>
          <button className="ticket-mobile-scan-btn" onClick={() => navigate("/mobile-scan")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <rect x="7" y="7" width="10" height="10" rx="1" />
            </svg>
            Mobile Scan
          </button>
        </div>
      </div>

      {error && <div className="dashboard-error">{error}</div>}

      {loading ? (
        <div className="dashboard-loading">
          <div className="loading-dot" />
          <div className="loading-dot" />
          <div className="loading-dot" />
        </div>
      ) : (
        <>
          {/* ─── Collections ─────────────────────────────────────────────────── */}
          <div>
            <div className="dashboard-section-label">
              Collections <span className="dashboard-section-range">({rangeLabel})</span>
            </div>
            <div className="stat-cards-row">
              <StatCard
                label="Total"
                value={stats?.today_total?.count ?? 0}
                sub={peso(stats?.today_total?.total ?? 0)}
              />
            </div>
          </div>
          {/* ─── Check-Ins ──────────────────────────────────────────────────── */}
          <div className="dashboard-section">
            <div className="dashboard-section-label">
              Check-Ins <span className="dashboard-section-range">({rangeLabel})</span>
            </div>
            <div className="stat-cards-row">
              <StatCard
                label="Vehicles Checked In"
                value={stats?.active_vehicles ?? 0}
                sub={isTodayOnly ? "Resets daily" : rangeLabel}
              />
              <StatCard
                label="Drivers Checked In"
                value={stats?.active_drivers ?? 0}
                sub={isTodayOnly ? "Resets daily" : rangeLabel}
              />
            </div>
          </div>
          {/* ─── Bar Chart + Routes Sidebar ─────────────────────────────────── */}
          <div className="dashboard-chart-layout">
            {/* 70% — chart panel */}
            <div className="dashboard-chart-panel">
              <div className="chart-card">
                <div className="chart-card-header">
                  <span className="chart-card-title">
                    Collections Per Day
                  </span>
                  <div className="chart-card-controls">
                    <div className="chart-mode-toggle">
                      <button
                        className={`chart-mode-btn${!isRevenue ? " chart-mode-btn--active" : ""}`}
                        onClick={() => setChartMode("tickets")}
                      >
                        Tickets
                      </button>
                      <button
                        className={`chart-mode-btn${isRevenue ? " chart-mode-btn--active" : ""}`}
                        onClick={() => setChartMode("revenue")}
                      >
                        Revenue
                      </button>
                    </div>
                    <span className="chart-card-badge">Last 14 days</span>
                  </div>
                </div>

                {chartData.length === 0 ? (
                  <div className="chart-empty">
                    No data available for chart.
                  </div>
                ) : (
                  <div className="chart-card-body">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
                        barCategoryGap="30%"
                        barGap={3}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(201,168,76,0.15)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#c9a84c" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#c9a84c" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={yTickFormatter}
                          width={isRevenue ? 72 : 32}
                        />
                        <Tooltip
                          content={<CustomTooltip />}
                          cursor={{ fill: "rgba(201,168,76,0.07)" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                        />
                        {isRevenue ? (
                          <Bar
                            dataKey="total"
                            name="Amount (₱)"
                            fill="#c9a84c"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={32}
                          />
                        ) : (
                          <Bar
                            dataKey="count"
                            name="Tickets"
                            fill="#c9a84c"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={32}
                          />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>{" "}
              {/* closes chart-card */}
            </div>{" "}
            {/* closes dashboard-chart-panel */}
            {/* 30% — routes sidebar */}
            <div className="dashboard-routes-sidebar">
              <div className="dashboard-routes-sidebar-header accent-navy">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Route List</span>
                <span className="dashboard-routes-sidebar-count">
                  {routes.length}
                </span>
              </div>
              <div className="dashboard-routes-sidebar-body">
                {routes.length === 0 ? (
                  <div className="dashboard-routes-sidebar-empty">
                    No routes registered
                  </div>
                ) : (
                  routes.map((route, idx) => (
                    <div key={route.id} className="dashboard-route-item">
                      <div className="dashboard-route-item-index">
                        {idx + 1}
                      </div>
                      <div className="dashboard-route-item-info">
                        <span className="dashboard-route-item-name">
                          {route.full_name || route.origin}
                        </span>
                        {route.origin && route.full_name && (
                          <span className="dashboard-route-item-sub">
                            {route.origin}
                          </span>
                        )}
                      </div>
                      <div
                        className="dashboard-route-item-count"
                        title={`Checked in (${rangeLabel})`}
                      >
                        {route.checked_in_today ?? 0}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>{" "}
            {/* closes dashboard-routes-sidebar */}
          </div>{" "}
          {/* closes dashboard-chart-layout */}
        </>
      )}
    </div>
  );
}
