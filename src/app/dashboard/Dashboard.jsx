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

// Ticket lifecycle + live fleet status colors reuse the app's existing status
// vocabulary (Dispatch.css badge dots, AuditTrail.jsx action pills) rather than
// introducing a new palette: green=good, amber=pending, blue=active, red=critical,
// slate=neutral. Every dot is always paired with a text label, never color alone.
const TICKET_STATUS_META = {
  QUEUED: { label: "Queued", color: "#f59e0b" },
  COLLECTED: { label: "Collected", color: "#22c55e" },
  CANCELLED: { label: "Cancelled", color: "#ef4444" },
};
const TICKET_STATUS_ORDER = ["QUEUED", "COLLECTED", "CANCELLED"];

const FLEET_STATUS_META = {
  QUEUED: { label: "Queued", color: "#f59e0b" },
  AVAILABLE: { label: "Available", color: "#22c55e" },
};
const FLEET_STATUS_ORDER = ["QUEUED", "AVAILABLE"];

// Matches AuditTrail.jsx's ACTION_COLORS exactly so audit entries look the same everywhere.
const ACTION_COLORS = { CREATE: "#22c55e", UPDATE: "#3b82f6", DELETE: "#ef4444" };

// Same stock thresholds already used on the Requisition page's inventory cards.
const STOCK_LOW_THRESHOLD = 5000;
const STOCK_HIGH_THRESHOLD = 10000;

const ACTIVITY_PAGE_SIZE = 8;

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
function StatCard({ label, value, sub, icon, alert }) {
  return (
    <div className={`stat-card${alert ? " stat-card--alert" : ""}`}>
      <div className="stat-card-top">
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-icon">{icon}</div>
      </div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

// ─── Status Breakdown (stacked bar + legend) ────────────────────────────────
function BreakdownCard({ title, badge, data, order, meta }) {
  const entries = order.map((key) => ({ key, count: data?.[key] ?? 0, ...meta[key] }));
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <span className="chart-card-title">{title}</span>
        <span className="chart-card-badge">{badge}</span>
      </div>
      <div className="chart-card-body">
        {total === 0 ? (
          <div className="breakdown-empty">No activity yet</div>
        ) : (
          <div className="breakdown-bar-track">
            {entries
              .filter((e) => e.count > 0)
              .map((e) => (
                <div
                  key={e.key}
                  style={{ width: `${(e.count / total) * 100}%`, background: e.color }}
                />
              ))}
          </div>
        )}
        <div className="breakdown-legend">
          {entries.map((e) => (
            <div className="breakdown-legend-row" key={e.key}>
              <span className="breakdown-legend-dot" style={{ background: e.color }} />
              <span className="breakdown-legend-label">{e.label}</span>
              <span className="breakdown-legend-count">{e.count}</span>
              {total > 0 && (
                <span className="breakdown-legend-pct">
                  {Math.round((e.count / total) * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Recent Activity row ─────────────────────────────────────────────────────
function ActivityRow({ log }) {
  const color = ACTION_COLORS[log.action] || "#64748b";
  const when = log.created_at
    ? new Date(log.created_at).toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return (
    <div className="activity-row">
      <span className="activity-pill" style={{ background: `${color}22`, color }}>
        {log.action_display || log.action}
      </span>
      <div className="activity-main">
        <span className="activity-title">
          {log.model_name} #{log.object_id}
        </span>
        {log.object_repr && <span className="activity-sub">{log.object_repr}</span>}
      </div>
      <div className="activity-meta">
        <span className="activity-user">{log.user_name || "System"}</span>
        <span className="activity-time">{when}</span>
      </div>
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
  const [activity, setActivity] = useState([]);
  const [activityPage, setActivityPage] = useState(0);
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
        const statsData = await apiService.getDashboardStats(range);
        setStats(statsData);
        setChartData((statsData.chart_data || []).slice(-31));

        // Routes and activity are secondary — a failure in either shouldn't kill the dashboard.
        const [routeData, logsData] = await Promise.all([
          apiService.getRoutes(range).catch(() => []),
          apiService.getAuditLogs({ ...range, all: true }).catch(() => ({ logs: [] })),
        ]);
        // Backend returns routes alphabetically (origin) — fine for picker dropdowns
        // elsewhere, but this sidebar ranks routes by activity, so re-sort busiest first.
        const sortedRoutes = (Array.isArray(routeData) ? routeData : []).sort(
          (a, b) => (b.checked_in_today ?? 0) - (a.checked_in_today ?? 0),
        );
        setRoutes(sortedRoutes);
        setActivity(Array.isArray(logsData.logs) ? logsData.logs : []);
        setActivityPage(0);
      } catch {
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
  // The chart alone widens to a 7-day trend when the filter is on today only —
  // its badge should say so instead of echoing the (still today-only) rangeLabel.
  const chartRangeLabel = isTodayOnly ? "Last 7 days" : rangeLabel;

  const fleetStatus = stats?.fleet_status || {};
  const queuedCount = fleetStatus.QUEUED ?? 0;
  const ticketStock = stats?.ticket_stock_remaining ?? 0;
  const stockIsLow = ticketStock < STOCK_LOW_THRESHOLD;
  const stockSub = stockIsLow
    ? ticketStock === 0
      ? "Out of stock"
      : "Low stock — reorder soon"
    : ticketStock >= STOCK_HIGH_THRESHOLD
      ? "Stock healthy"
      : "Stock normal";

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
          <button
            className="dashboard-scan-btn"
            onClick={() => window.open("/public-view", "_blank", "noopener,noreferrer")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Public View
          </button>
          <button className="dashboard-scan-btn" onClick={() => navigate("/mobile-scan")}>
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
          {/* ─── Live Status ────────────────────────────────────────────────── */}
          <div className="dashboard-section">
            <div className="dashboard-section-label">
              Live Status <span className="dashboard-section-range">(current)</span>
            </div>
            <div className="stat-cards-row">
              <StatCard
                label="Currently Queued"
                value={queuedCount}
                sub="Awaiting dispatch"
              />
              <StatCard
                label="Ticket Stock"
                value={`${ticketStock.toLocaleString()} pcs`}
                sub={stockSub}
                alert={stockIsLow}
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
                    <span className="chart-card-badge">{chartRangeLabel}</span>
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
                          stroke="rgba(26,39,68,0.15)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#1a2744" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#1a2744" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={yTickFormatter}
                          width={isRevenue ? 72 : 32}
                        />
                        <Tooltip
                          content={<CustomTooltip />}
                          cursor={{ fill: "rgba(26,39,68,0.07)" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                        />
                        {isRevenue ? (
                          <Bar
                            dataKey="total"
                            name="Amount (₱)"
                            fill="#1a2744"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={32}
                          />
                        ) : (
                          <Bar
                            dataKey="count"
                            name="Tickets"
                            fill="#1a2744"
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
                      <div className="dashboard-route-item-stats">
                        <div
                          className="dashboard-route-item-count"
                          title={`Checked in (${rangeLabel})`}
                        >
                          {route.checked_in_today ?? 0}
                        </div>
                        <div
                          className="dashboard-route-item-revenue"
                          title={`Revenue (${rangeLabel})`}
                        >
                          {peso(route.revenue_in_range ?? 0)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>{" "}
            {/* closes dashboard-routes-sidebar */}
          </div>{" "}
          {/* closes dashboard-chart-layout */}
          {/* ─── Ticket & Fleet Breakdown ───────────────────────────────────── */}
          <div className="dashboard-insights-row">
            <BreakdownCard
              title="Ticket Status Breakdown"
              badge={rangeLabel}
              data={stats?.ticket_status_breakdown}
              order={TICKET_STATUS_ORDER}
              meta={TICKET_STATUS_META}
            />
            <BreakdownCard
              title="Fleet Status"
              badge="Live"
              data={fleetStatus}
              order={FLEET_STATUS_ORDER}
              meta={FLEET_STATUS_META}
            />
          </div>
          {/* ─── Recent Activity ────────────────────────────────────────────── */}
          <div className="chart-card dashboard-section">
            <div className="chart-card-header">
              <span className="chart-card-title">Recent Activity</span>
              <span className="chart-card-badge">{rangeLabel}</span>
            </div>
            {activity.length === 0 ? (
              <div className="activity-empty">No activity recorded for this range.</div>
            ) : (
              <>
                <div className="activity-list">
                  {activity
                    .slice(activityPage * ACTIVITY_PAGE_SIZE, (activityPage + 1) * ACTIVITY_PAGE_SIZE)
                    .map((log, idx) => (
                      <ActivityRow key={`${log.id}-${idx}`} log={log} />
                    ))}
                </div>
                <div className="dashboard-pagination">
                  <span className="dashboard-pagination-info">
                    Page {activityPage + 1} of {Math.ceil(activity.length / ACTIVITY_PAGE_SIZE)}
                  </span>
                  <div className="dashboard-pagination-btns">
                    <button
                      className="dashboard-page-btn"
                      disabled={activityPage === 0}
                      onClick={() => setActivityPage((p) => p - 1)}
                    >
                      ← Prev
                    </button>
                    <button
                      className="dashboard-page-btn"
                      disabled={(activityPage + 1) * ACTIVITY_PAGE_SIZE >= activity.length}
                      onClick={() => setActivityPage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
