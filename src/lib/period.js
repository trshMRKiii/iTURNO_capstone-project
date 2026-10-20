import { useState } from "react";

export const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Local (not UTC) YYYY-MM-DD — avoids toISOString's UTC-shift off-by-one.
export const todayStr = () => toDateStr(new Date());

// Period chips. "custom" keeps the current dates and reveals the From/To inputs;
// "all" (opt-in per screen) clears the range.
export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];
export const ALL_PERIOD = { key: "all", label: "All time" };

export const getPeriodRange = (key) => {
  const now = new Date();
  const end = todayStr();
  if (key === "all") return { from: "", to: "" };
  if (key === "today") return { from: end, to: end };
  if (key === "7d")
    return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: end };
  if (key === "month")
    return { from: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: end };
  if (key === "year") return { from: `${now.getFullYear()}-01-01`, to: end };
  return null;
};

// Period + From/To state shared by the Dashboard and the history modals.
export function usePeriodFilter(initial = "today") {
  const today = todayStr();
  const start = getPeriodRange(initial);
  const [period, setPeriodKey] = useState(initial);
  const [fromDate, setFromDate] = useState(start.from);
  const [toDate, setToDate] = useState(start.to);

  const setPeriod = (key) => {
    setPeriodKey(key);
    const range = getPeriodRange(key) || (fromDate ? null : { from: today, to: today });
    if (range) {
      setFromDate(range.from);
      setToDate(range.to);
    }
  };

  const setFrom = (value) => {
    if (!value || value > today) value = today;
    setFromDate(value);
    if (value > toDate) setToDate(value);
  };

  const setTo = (value) => {
    if (!value || value > today) value = today;
    setToDate(value);
    if (value < fromDate) setFromDate(value);
  };

  return { period, fromDate, toDate, today, setPeriod, setFrom, setTo };
}

// True when an ISO timestamp's local date falls in [from, to]; empty range = all.
export const inPeriod = (iso, from, to) => {
  if (!from) return true;
  if (!iso) return false;
  const d = toDateStr(new Date(iso));
  return d >= from && d <= to;
};
