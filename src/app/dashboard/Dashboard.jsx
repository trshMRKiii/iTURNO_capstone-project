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
import schedule from "../../../backend/schedules.json";

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

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError("");
      try {
        const [statsData, chartJson] = await Promise.all([
          apiService.getDashboardStats(),
          apiService.getReportChart(),
        ]);
        setStats(statsData);
        const data = (chartJson.chart_data || []).slice(-14);
        setChartData(data);
        // Routes fetched separately so a failure doesn't kill the dashboard
        try {
          const routeData = await apiService.getRoutes();
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
  }, []);

  // Derive Y-axis tick formatter and bar data keys from chartMode
  const isRevenue = chartMode === "revenue";
  const yTickFormatter = isRevenue
    ? (v) =>
        `₱${Number(v).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`
    : (v) => `${v}`;

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="col-header">
        <div className="col-header-left">
          <div className="col-header-accent" />
          <div>
            <h1 className="col-title">Dashboard</h1>
            <p className="col-subtitle">
              Overview of today's collection and activity
            </p>
          </div>
        </div>
        <div className="col-header-right">
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
          {/* ─── Today's Batch Cards ─────────────────────────────────────────── */}
          <div>
            <div className="dashboard-section-label">Today's Collections</div>
            <div className="stat-cards-row">
              <StatCard
                label="Batch 1 (AM)"
                value={stats?.batch1_today?.count ?? 0}
                sub={peso(stats?.batch1_today?.total ?? 0)}
              />
              <StatCard
                label="Batch 2 (PM)"
                value={stats?.batch2_today?.count ?? 0}
                sub={peso(stats?.batch2_today?.total ?? 0)}
              />
              <StatCard
                label="Today Total"
                value={stats?.today_total?.count ?? 0}
                sub={peso(stats?.today_total?.total ?? 0)}
              />
            </div>
          </div>
          {/* ─── Overall Stats ────────────────────────────────────────────────── */}
          <div className="dashboard-section">
            <div className="dashboard-section-label">Overall</div>
            <div className="stat-cards-row">
              <StatCard
                label="Active Vehicles"
                value={stats?.active_vehicles ?? 0}
              />
              <StatCard
                label="Active Drivers"
                value={stats?.active_drivers ?? 0}
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
                    Collections Per Day — Batch 1 vs Batch 2
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
                          <>
                            <Bar
                              dataKey="batch1_total"
                              name="Batch 1 — Amount (₱)"
                              fill="#c9a84c"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={32}
                            />
                            <Bar
                              dataKey="batch2_total"
                              name="Batch 2 — Amount (₱)"
                              fill="#2d3e5f"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={32}
                            />
                          </>
                        ) : (
                          <>
                            <Bar
                              dataKey="batch1_count"
                              name="Batch 1 — Tickets"
                              fill="#c9a84c"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={32}
                            />
                            <Bar
                              dataKey="batch2_count"
                              name="Batch 2 — Tickets"
                              fill="#2d3e5f"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={32}
                            />
                          </>
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
