import { useEffect, useState } from "react";
import { apiService } from "../../../lib/api-service";

const REFRESH_MS = 60_000;
const ACTIVITY_LIMIT = 60;
const DAY_MS = 86_400_000;
// Under a week, some weekdays would have no data (or a single day), so the grid keeps its four-week view.
const MIN_HEATMAP_DAYS = 7;
// Per-ticket queue churn (loading-time extensions, edits) is noise here; it stays in the audit log.
const HIDDEN_MODELS = new Set(["Ticket"]);

// Stats and the busiest-times grid follow the period filter (a period under a week shows the
// grid's last four weeks); the activity feed ignores it.
// Everything but the grid refreshes every minute so the queue waits, the "as of" time and
// the relative timestamps stay live.
// `stats` is null until the current period has loaded (a refresh keeps showing the old
// numbers until the new ones land); `busiest` is null while loading and false if it failed.
export function useDashboard({ fromDate, toDate }) {
  const period = `${fromDate}|${toDate}`;
  const shortPeriod = (new Date(toDate) - new Date(fromDate)) / DAY_MS + 1 < MIN_HEATMAP_DAYS;
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
    let current = true;
    apiService
      .getDashboardBusiest(shortPeriod ? {} : { start_date: fromDate, end_date: toDate })
      .then((data) => current && setBusiest(data))
      .catch(() => current && setBusiest(false));
    return () => {
      current = false;
    };
  }, [fromDate, toDate, shortPeriod]);

  useEffect(() => {
    apiService
      .getAuditLogs({ page: 1, page_size: ACTIVITY_LIMIT })
      .then((data) => setActivity((data.logs || data.results || []).filter((l) => !HIDDEN_MODELS.has(l.model_name))))
      .catch(() => {});
  }, [tick]);

  return {
    stats: loaded.period === period ? loaded.stats : null,
    error: failedPeriod === period ? "Failed to load dashboard data." : "",
    busiest,
    busiestIsDefault: shortPeriod,
    activity,
  };
}
