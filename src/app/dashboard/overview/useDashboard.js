import { useEffect, useState } from "react";
import { apiService } from "../../../lib/api-service";

const REFRESH_MS = 60_000;
const ACTIVITY_LIMIT = 60;

// Stats follow the period filter; the busiest-times grid is a fixed four-week view, and
// the activity feed ignores the filter too. Everything but the grid refreshes every minute
// so the queue waits, the "as of" time and the relative timestamps stay live.
// `stats` is null until the current period has loaded (a refresh keeps showing the old
// numbers until the new ones land); `busiest` is null while loading and false if it failed.
export function useDashboard({ fromDate, toDate }) {
  const period = `${fromDate}|${toDate}`;
  const [loaded, setLoaded] = useState({ period: "", stats: null });
  const [failedPeriod, setFailedPeriod] = useState("");
  const [busiest, setBusiest] = useState(null);
  const [activity, setActivity] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => document.hidden || setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let current = true;
    apiService
      .getDashboardStats({ start_date: fromDate, end_date: toDate })
      .then((stats) => {
        if (!current) return;
        setLoaded({ period, stats });
        setFailedPeriod("");
      })
      .catch(() => current && setFailedPeriod(period));
    return () => {
      current = false;
    };
  }, [fromDate, toDate, period, tick]);

  // Secondary panels: a failure in either shouldn't take the dashboard down.
  useEffect(() => {
    apiService.getDashboardBusiest().then(setBusiest).catch(() => setBusiest(false));
  }, []);

  useEffect(() => {
    apiService
      .getAuditLogs({ page: 1, page_size: ACTIVITY_LIMIT })
      .then((data) => setActivity(data.logs || data.results || []))
      .catch(() => {});
  }, [tick]);

  return {
    stats: loaded.period === period ? loaded.stats : null,
    error: failedPeriod === period ? "Failed to load dashboard data." : "",
    busiest,
    activity,
  };
}
