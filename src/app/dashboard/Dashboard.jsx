import { useState } from "react";
import { Skel } from "../../components/ui/kit";
import PeriodFilter from "../../components/ui/PeriodFilter";
import { usePeriodFilter } from "../../lib/period";
import { useDashboard } from "./overview/useDashboard";
import { CollectionsCard, QueueCard, StockCard, SplitStrip } from "./overview/OverviewCards";
import HourlyChart from "./overview/HourlyChart";
import RoutePerformance from "./overview/RoutePerformance";
import BusiestTimes from "./overview/BusiestTimes";
import RecentActivity from "./overview/RecentActivity";
import "../../styles/Dashboard.css";

const PERIOD_LABELS = { today: "Today", "7d": "Last 7 days", month: "This month", year: "This year" };
const shortDate = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Mirrors the real layout so nothing jumps when data lands.
function DashboardSkeleton() {
  return (
    <div className="dash-stack" aria-busy="true" aria-label="Loading dashboard">
      <div className="ov-grid">
        {[0, 1, 2].map((i) => (
          <div className="ov-card ov-card--skel" key={i}>
            <Skel w="40%" />
            <Skel w="60%" h={36} />
            <Skel />
            <Skel w="80%" />
          </div>
        ))}
      </div>
      <Skel h={96} style={{ borderRadius: 16 }} />
      <div className="dash-cols">
        <div className="dash-col">
          <Skel h={400} style={{ borderRadius: 16 }} />
          <Skel h={280} style={{ borderRadius: 16 }} />
        </div>
        <div className="dash-col">
          <Skel h={260} style={{ borderRadius: 16 }} />
          <Skel h={420} style={{ borderRadius: 16 }} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const periodFilter = usePeriodFilter("today");
  const { period, fromDate, toDate, today } = periodFilter;
  const { stats, busiest, busiestIsDefault, activity, error } = useDashboard(periodFilter);
  // The route picked in Route performance; Collections by hour narrows to it.
  const [route, setRoute] = useState(null);

  const singleDay = fromDate === toDate;
  const rangeLabel = PERIOD_LABELS[period] || (singleDay ? shortDate(fromDate) : `${shortDate(fromDate)} – ${shortDate(toDate)}`);
  // What "up/down vs ..." compares against — see `compared` in the stats response.
  const comparedDays = stats?.compared.days;
  const comparedTo = comparedDays > 1 ? `the previous ${comparedDays} days` : singleDay && toDate === today ? "yesterday" : "the day before";
  // The queue is a live snapshot, so it only belongs on Today; any other period shows the
  // queued/roamed split in its place.
  const isToday = singleDay && toDate === today;

  return (
    <div className="dashboard-page">
      <div className="col-header">
        <div className="col-header-left">
          <h1 className="col-title">Dashboard</h1>
        </div>
        <div className="col-header-right">
          <PeriodFilter filter={periodFilter} />
        </div>
      </div>

      {error && <div className="dashboard-error">{error}</div>}

      {stats ? (
        <div className="dash-stack">
          <div className="ov-grid">
            <CollectionsCard stats={stats} rangeLabel={rangeLabel} />
            {isToday ? <QueueCard routes={stats.queue_routes} /> : <SplitStrip card stats={stats} rangeLabel={rangeLabel} comparedTo={comparedTo} />}
            <StockCard stats={stats} />
          </div>
          {isToday && <SplitStrip stats={stats} rangeLabel={rangeLabel} comparedTo={comparedTo} />}
          <div className="dash-cols">
            <div className="dash-col">
              <HourlyChart stats={stats} rangeLabel={rangeLabel} comparedTo={comparedTo} route={route} onClearRoute={() => setRoute(null)} />
              <BusiestTimes busiest={busiest} rangeLabel={busiestIsDefault ? "Last 4 weeks" : rangeLabel} />
            </div>
            <div className="dash-col">
              <RoutePerformance
                routes={stats.route_performance}
                rangeLabel={rangeLabel}
                selected={route}
                onSelect={(name) => setRoute((current) => (current === name ? null : name))}
              />
              <RecentActivity logs={activity} />
            </div>
          </div>
        </div>
      ) : (
        !error && <DashboardSkeleton />
      )}
    </div>
  );
}
