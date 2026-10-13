import { useState, useEffect } from "react";
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

// Ticket status + live fleet status colors reuse the app's existing status
// vocabulary (Dispatch.css badge dots, AuditTrail.jsx action pills) rather than
// introducing a new palette: green=good, amber=pending, blue=active, red=critical,
// slate=neutral. Every dot is always paired with a text label, never color alone.
// Queued/Roamed mirror the Collection Log (mode=QUEUE) / Roaming Vehicle Log
// (mode=UNLOAD) split on the Transaction page; Cancelled stays a separate
// bucket regardless of mode.
const TICKET_STATUS_META = {
  QUEUE: { label: "Queued", color: "#1a2744" },
  UNLOAD: { label: "Roamed", color: "#3b82f6" },
  CANCELLED: { label: "Cancelled", color: "#ef4444" },
};
const TICKET_STATUS_ORDER = ["QUEUE", "UNLOAD", "CANCELLED"];

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

// ─── Overview cards ──────────────────────────────────────────────────────────
// Series colours for per-denomination rows; reused by the collections dots and
// the stock bars so one denomination looks the same in both cards.
const FORM_COLORS = ["#1a2744", "#e8b94a", "#3b82f6", "#22c55e", "#ef4444"];

function OverviewCard({ label, badge, children }) {
  return (
    <div className="ov-card">
      <div className="ov-card-head">
        <span className="ov-card-label">{label}</span>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────
// Mirrors the real layout (same wrapper classes) so nothing jumps when data lands.
const Skel = ({ w = "100%", h = 12, className = "" }) => (
  <span className={`dash-skel ${className}`} style={{ width: w, height: h }} />
);

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="overview-panel">
        {[0, 1, 2].map((i) => (
          <div className="ov-card" key={i}>
            <div className="ov-card-head">
              <Skel w="40%" h={12} />
            </div>
            <Skel w="60%" h={34} />
            <Skel w="45%" h={12} className="dash-skel--gap" />
            <div className="dash-skel-stack">
              <Skel h={10} />
              <Skel h={10} w="85%" />
              <Skel h={10} w="70%" />
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-chart-layout">
        <div className="dashboard-chart-panel">
          <div className="chart-card">
            <div className="chart-card-header">
              <Skel w={150} h={14} />
              <Skel w={120} h={26} />
            </div>
            <div className="dash-skel-chart">
              {[55, 80, 40, 65, 90, 50, 70, 35, 60, 75].map((h, i) => (
                <Skel key={i} w="100%" h={`${h}%`} className="dash-skel--bar" />
              ))}
            </div>
          </div>
        </div>
        <div className="dashboard-routes-sidebar">
          <div className="dashboard-routes-sidebar-header">
            <Skel w="50%" h={14} />
          </div>
          <div className="dash-skel-stack dash-skel-stack--pad">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skel key={i} h={34} />
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-insights-row">
        {[0, 1].map((i) => (
          <div className="chart-card" key={i}>
            <div className="chart-card-header">
              <Skel w={160} h={14} />
            </div>
            <div className="dash-skel-stack dash-skel-stack--pad">
              <Skel h={14} />
              <Skel h={14} w="90%" />
              <Skel h={14} w="75%" />
              <Skel h={14} w="85%" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status Breakdown (stacked bar + legend) ────────────────────────────────
function BreakdownCard({ title, badge, data, order, meta }) {
  const entries = order.map((key) => ({ key, count: data?.[key] ?? 0, ...meta[key] }));
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="chart-card">
      <div className="chart-card-header chart-card-header--stacked">
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

// Period chips for the header filter. "custom" keeps the current dates and
// reveals the From/To inputs.
const PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const getPeriodRange = (key) => {
  const now = new Date();
  const end = todayStr();
  if (key === "today") return { from: end, to: end };
  if (key === "7d")
    return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: end };
  if (key === "month")
    return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: end };
  if (key === "year") return { from: `${now.getFullYear()}-01-01`, to: end };
  return null;
};

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
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

  const [period, setPeriod] = useState("today");

  const handlePeriodChange = (key) => {
    setPeriod(key);
    const range = getPeriodRange(key);
    if (range) {
      setFromDate(range.from);
      setToDate(range.to);
    }
  };

  const handleFromChange = (value) => {
    if (!value || value > today) value = today;
    setFromDate(value);
    if (value > toDate) setToDate(value);
  };

  const handleToChange = (value) => {
    if (!value || value > today) value = today;
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
  const collections = stats?.today_total?.count ?? 0;
  const collectionsTotal = parseFloat(stats?.today_total?.total) || 0;
  const collectionsByForm = stats?.collections_by_form || [];
  const queuedCount = fleetStatus.QUEUED ?? 0;
  const queueByRoute = (stats?.queue_by_route || []).slice(0, 3);
  const queueMax = Math.max(...queueByRoute.map((r) => r.count), 1);
  const ticketStock = stats?.ticket_stock_remaining ?? 0;
  const stockByForm = stats?.stock_by_form || [];
  const stockMax = Math.max(...stockByForm.map((f) => f.remaining), 1);
  const stockIsLow = ticketStock < STOCK_LOW_THRESHOLD;
  const stockStatus =
    ticketStock === 0
      ? { label: "Out of stock", tone: "bad" }
      : stockIsLow
        ? { label: "Low stock", tone: "warn" }
        : ticketStock >= STOCK_HIGH_THRESHOLD
          ? { label: "Healthy", tone: "good" }
          : { label: "Normal", tone: "good" };

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="col-header">
        <div className="col-header-left">
          <div>
            <h1 className="col-title">Dashboard</h1>
          
          </div>
        </div>
        <div className="col-header-right">
          <div className="dashboard-date-filter">
            <div className="dashboard-chips">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`dashboard-chip${period === p.key ? " dashboard-chip--active" : ""}`}
                  onClick={() => handlePeriodChange(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="dashboard-error">{error}</div>}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* ─── Overview: three cards — Collections · Queue · Ticket Stock ─── */}
          <div className="overview-panel">
            <OverviewCard
              label="Total Collections"
              badge={<span className="ov-pill ov-pill--muted">{rangeLabel}</span>}
            >
              <div className="ov-value ov-value--hero">{peso(collectionsTotal)}</div>
              <div className="ov-sub">
                <strong>{collections}</strong> {collections === 1 ? "ticket" : "tickets"} issued
              </div>
              {collectionsByForm.length > 0 && (
                <ul className="ov-rows">
                  {collectionsByForm.map((f, i) => (
                    <li className="ov-row" key={f.name}>
                      <span className="ov-dot" style={{ background: FORM_COLORS[i % FORM_COLORS.length] }} />
                      <span className="ov-row-name">{f.name}</span>
                      <span className="ov-row-qty">× {f.count}</span>
                      <span className="ov-row-amt">{peso(f.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </OverviewCard>

            <OverviewCard label="Currently Queued">
              <div className="ov-value">
                {queuedCount}
                <span className="ov-unit">{queuedCount === 1 ? "vehicle" : "vehicles"} in line</span>
              </div>
              {queuedCount === 0 ? (
                <div className="ov-empty">
                  No vehicles waiting right now. New check-ins appear here on their own.
                </div>
              ) : (
                <>
                  <ul className="ov-stock">
                    {queueByRoute.map((r) => (
                      <li className="ov-queue-row" key={r.name}>
                        <span className="ov-queue-name">{r.name}</span>
                        <div className="ov-bar ov-bar--navy">
                          <span style={{ width: `${(r.count / queueMax) * 100}%` }} />
                        </div>
                        <strong className="ov-queue-count">{r.count}</strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </OverviewCard>

            <OverviewCard
              label="Ticket Stock"
              badge={
                <span className={`ov-pill ov-pill--${stockStatus.tone}`}>
                  <span className="ov-pill-dot" />
                  {stockStatus.label}
                </span>
              }
            >
              <div className="ov-value ov-value--hero">
                {ticketStock.toLocaleString()}
                <span className="ov-unit">pcs on hand</span>
              </div>
              {stockByForm.length > 0 && (
                <ul className="ov-stock">
                  {stockByForm.map((f) => (
                    <li key={f.name}>
                      <div className="ov-stock-row">
                        <span>{f.name}</span>
                        <strong>{f.remaining.toLocaleString()}</strong>
                      </div>
                      <div className="ov-bar">
                        <span
                          style={{
                            width: `${Math.max((f.remaining / stockMax) * 100, f.remaining > 0 ? 1.5 : 0)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </OverviewCard>
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
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={yTickFormatter}
                          width={isRevenue ? 72 : 32}
                        />
                        <Tooltip
                          content={<CustomTooltip />}
                          cursor={{ fill: "var(--bg-hover)" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                        />
                        {isRevenue ? (
                          <Bar
                            dataKey="total"
                            name="Amount (₱)"
                            fill="var(--chart-bar)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={32}
                          />
                        ) : (
                          <Bar
                            dataKey="count"
                            name="Tickets"
                            fill="var(--chart-bar)"
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
                          {route.origin}
                        </span>
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
          {/* ─── Ticket Breakdown + Recent Activity: two columns on desktop, ──── */}
          {/* stacked on mobile via the existing dashboard-insights-row breakpoint. */}
          <div className="dashboard-insights-row">
            <BreakdownCard
              title="Ticket Status Breakdown"
              badge={rangeLabel}
              data={stats?.ticket_status_breakdown}
              order={TICKET_STATUS_ORDER}
              meta={TICKET_STATUS_META}
            />
            <div className="chart-card">
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
          </div>
        </>
      )}
    </div>
  );
}
