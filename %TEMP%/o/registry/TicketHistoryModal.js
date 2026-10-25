import React, { useState, useEffect, useMemo } from "react";
import { apiService } from "../../../lib/api-service";
import { SkeletonList } from "../../../components/ui/kit";
import PeriodFilter from "../../../components/ui/PeriodFilter";
import { usePeriodFilter } from "../../../lib/period";
import Pager from "../report/tables/Pager";
import { exportTablePDF } from "../report/exportPDF";
import { getDriverDisplayName } from "../driver/driver-utils";
import "../../../styles/Vehicle.css";
const PAGE_SIZE = 10;
const BADGES = {
  QUEUE: { label: "Queue", color: "#3b82f6" },
  UNLOAD: { label: "Roaming", color: "#8b5cf6" }
};
const badgeOf = (t) => BADGES[t.mode] || BADGES.QUEUE;
const VIEWS = [
  { key: "ALL", label: "All", params: {} },
  { key: "QUEUE", label: "Queue", params: { mode: "QUEUE" } },
  { key: "UNLOAD", label: "Roaming", params: { mode: "UNLOAD" } }
];
const visitOf = (t) => {
  const inAt = t.checked_in_at || t.issued_at;
  const open = t.status === "QUEUED" && !t.dispatched_at;
  const end = t.dispatched_at || (open ? /* @__PURE__ */ new Date() : null);
  const mins = inAt && end ? Math.max(0, Math.round((new Date(end) - new Date(inAt)) / 6e4)) : null;
  let stay = "\u2014";
  if (mins !== null) {
    const h = Math.floor(mins / 60);
    stay = mins < 1 ? "< 1 min" : h ? `${h}h ${mins % 60}m` : `${mins} min`;
  }
  return { inAt, outAt: t.dispatched_at, stay: open ? `${stay} so far` : stay, open };
};
function TicketHistoryModal({ vehicle, driver, onClose }) {
  const isDriver = !!driver;
  const subject = isDriver ? driver : vehicle;
  const [data, setData] = useState({ results: [], count: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("ALL");
  const [page, setPage] = useState(1);
  const periodFilter = usePeriodFilter("all");
  const { fromDate, toDate } = periodFilter;
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const filters = useMemo(
    () => ({
      ...isDriver ? { driver_id: subject?.id } : { vehicle_id: subject?.id },
      ...VIEWS.find((v) => v.key === view).params,
      ...fromDate && { start_date: fromDate, end_date: toDate },
      ...term && { search: term }
    }),
    [subject, isDriver, view, fromDate, toDate, term]
  );
  useEffect(() => setPage(1), [filters]);
  useEffect(() => {
    if (!subject) return;
    let cancelled = false;
    setLoading(true);
    apiService.getTickets({ ...filters, page, page_size: PAGE_SIZE }).then((d) => !cancelled && setData(d)).catch(() => !cancelled && setData({ results: [], count: 0, total_pages: 1 })).finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [subject, filters, page]);
  const filtered = data.results;
  if (!subject) return null;
  const formatDate = (iso) => {
    if (!iso) return "\u2014";
    const d = new Date(iso);
    return d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };
  const peso = (n) => n ? `\u20B1${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "\u2014";
  const handleExportPDF = async () => {
    const all = await apiService.getTickets(filters).then((d) => d.results || d).catch(() => []);
    const viewLabel = VIEWS.find((v) => v.key === view).label;
    const range = fromDate ? ` \xB7 ${fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}` : "";
    const name = isDriver ? getDriverDisplayName(driver) : vehicle.plate_number;
    exportTablePDF(
      all.map((t) => {
        const { inAt, outAt, stay, open } = visitOf(t);
        return {
          "Ticket ID": t.id,
          "Check-in": formatDate(inAt),
          "Check-out": open ? "In queue" : formatDate(outAt),
          "Checked in by": t.checked_in_by_name || "\u2014",
          "Checked out by": !open && t.checked_out_by_name || "\u2014",
          Stayed: stay,
          [isDriver ? "Vehicle" : "Driver"]: (isDriver ? t.vehicle?.plate_number : t.driver?.name) || "\u2014",
          Type: badgeOf(t).label,
          Amount: peso(t.collection_amount)
        };
      }),
      `Ticket History \u2014 ${name} (${viewLabel}${range})`
    );
  };
  return /* @__PURE__ */ React.createElement("div", { className: "veh-overlay", onClick: onClose }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "veh-modal",
      style: { maxWidth: 920 },
      onClick: (e) => e.stopPropagation()
    },
    /* @__PURE__ */ React.createElement("div", { className: "veh-modal-header" }, /* @__PURE__ */ React.createElement("div", { className: "veh-modal-header-left" }, /* @__PURE__ */ React.createElement("h2", { className: "veh-modal-title" }, "Ticket History \u2014 ", isDriver ? getDriverDisplayName(driver) : vehicle.plate_number)), /* @__PURE__ */ React.createElement("button", { className: "veh-modal-close", onClick: onClose, "aria-label": "Close" }, /* @__PURE__ */ React.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2" }, /* @__PURE__ */ React.createElement("path", { d: "M18 6 6 18" }), /* @__PURE__ */ React.createElement("path", { d: "m6 6 12 12" })))),
    /* @__PURE__ */ React.createElement("div", { className: "veh-ledger-filters" }, /* @__PURE__ */ React.createElement("div", { className: "veh-search-wrap", style: { width: 200 } }, /* @__PURE__ */ React.createElement("svg", { className: "veh-search-icon", width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("path", { d: "m21 21-4.3-4.3" })), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "veh-search",
        placeholder: isDriver ? "Search ticket or plate\u2026" : "Search ticket or driver\u2026",
        value: search,
        onChange: (e) => setSearch(e.target.value)
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "veh-seg" }, VIEWS.map(({ key, label }) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key,
        className: `veh-seg-btn ${view === key ? "veh-seg-btn--active" : ""}`,
        onClick: () => setView(key)
      },
      label
    ))), /* @__PURE__ */ React.createElement(PeriodFilter, { filter: periodFilter, includeAll: true })),
    /* @__PURE__ */ React.createElement("div", { className: "veh-ledger-body" }, loading ? /* @__PURE__ */ React.createElement(SkeletonList, { rows: 4, h: 40 }) : filtered.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "veh-table-state" }, /* @__PURE__ */ React.createElement("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", opacity: "0.3" }, /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" })), /* @__PURE__ */ React.createElement("span", null, "No tickets found")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "veh-ledger-summary" }, /* @__PURE__ */ React.createElement("span", null, data.count, " ticket", data.count !== 1 ? "s" : ""), /* @__PURE__ */ React.createElement("button", { className: "veh-btn veh-btn--history", onClick: handleExportPDF, title: "Export all matching tickets as PDF" }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2" }, /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" })), "Export PDF")), /* @__PURE__ */ React.createElement("div", { className: "veh-table-wrap", style: { maxHeight: 420, overflowY: "auto" } }, /* @__PURE__ */ React.createElement("table", { className: "veh-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, ["Ticket ID", "Check-in", "Check-out", "Stayed", isDriver ? "Vehicle" : "Driver", ...view === "ALL" ? ["Status"] : [], "Amount"].map((h) => /* @__PURE__ */ React.createElement("th", { key: h }, h)))), /* @__PURE__ */ React.createElement("tbody", null, filtered.map((t, i) => {
      const { inAt, outAt, stay, open } = visitOf(t);
      return /* @__PURE__ */ React.createElement("tr", { key: t.id || i, className: "veh-row" }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "veh-code" }, t.id)), /* @__PURE__ */ React.createElement("td", { className: "veh-td-route" }, formatDate(inAt), t.checked_in_by_name && /* @__PURE__ */ React.createElement("small", { style: { display: "block", opacity: 0.7 } }, "by ", t.checked_in_by_name)), /* @__PURE__ */ React.createElement("td", { className: "veh-td-route" }, open ? "In queue" : formatDate(outAt), !open && t.checked_out_by_name && /* @__PURE__ */ React.createElement("small", { style: { display: "block", opacity: 0.7 } }, "by ", t.checked_out_by_name)), /* @__PURE__ */ React.createElement("td", { style: { fontWeight: 600 } }, stay), /* @__PURE__ */ React.createElement("td", null, (isDriver ? t.vehicle?.plate_number : t.driver?.name) || /* @__PURE__ */ React.createElement("span", { className: "veh-na" }, "\u2014")), view === "ALL" && /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "veh-status",
          style: { background: `${badgeOf(t).color}18`, color: badgeOf(t).color }
        },
        badgeOf(t).label
      )), /* @__PURE__ */ React.createElement("td", { style: { fontWeight: 600 } }, peso(t.collection_amount)));
    })))), /* @__PURE__ */ React.createElement(
      Pager,
      {
        page,
        totalPages: data.total_pages || 1,
        count: data.count || 0,
        pageSize: PAGE_SIZE,
        onPageChange: setPage
      }
    )))
  ));
}
export default TicketHistoryModal;
