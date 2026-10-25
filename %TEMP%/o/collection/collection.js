import React, { useState } from "react";
import {
  useCollection,
  formatTime,
  getTodayDateString
} from "./useCollection";
import { getTicketDisplayId } from "../queue/useQueue";
import "../../../styles/Collection.css";
import { SkeletonRows } from "../../../components/ui/kit";
function Collection() {
  const {
    tickets,
    page,
    setPage,
    totalPages,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    roamingTickets,
    roamingPage,
    setRoamingPage,
    roamingTotalPages,
    roamingLoading,
    roamingError,
    roamingSearch,
    setRoamingSearch
  } = useCollection();
  const today = getTodayDateString(/* @__PURE__ */ new Date());
  const [activeTab, setActiveTab] = useState("queue");
  const activeError = activeTab === "queue" ? error : roamingError;
  return /* @__PURE__ */ React.createElement("div", { className: "col-page" }, /* @__PURE__ */ React.createElement("div", { className: "col-header" }, /* @__PURE__ */ React.createElement("div", { className: "col-header-left" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { className: "col-title" }, "Tally & Collections")))), activeError && /* @__PURE__ */ React.createElement("div", { className: "col-alert col-alert--error" }, /* @__PURE__ */ React.createElement(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2"
    },
    /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }),
    /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
    /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })
  ), activeError), /* @__PURE__ */ React.createElement("div", { className: "col-card col-log-card" }, /* @__PURE__ */ React.createElement("div", { className: "col-tabs" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: `col-tab ${activeTab === "queue" ? "col-tab--active" : ""}`,
      onClick: () => setActiveTab("queue")
    },
    /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" })),
    "Terminal Queue Log"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: `col-tab ${activeTab === "roaming" ? "col-tab--active" : ""}`,
      onClick: () => setActiveTab("roaming")
    },
    /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "10", r: "3" })),
    "Roaming Vehicle Log"
  )), /* @__PURE__ */ React.createElement("div", { className: "col-date-bar" }, /* @__PURE__ */ React.createElement("div", { className: "col-date-field" }, /* @__PURE__ */ React.createElement("label", { className: "col-date-label" }, "From"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      className: "col-date-input",
      value: startDate,
      max: endDate || today,
      onChange: (e) => setStartDate(e.target.value)
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "col-date-field" }, /* @__PURE__ */ React.createElement("label", { className: "col-date-label" }, "To"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "date",
      className: "col-date-input",
      value: endDate,
      min: startDate || void 0,
      max: today,
      onChange: (e) => setEndDate(e.target.value)
    }
  )), (startDate || endDate) && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "col-date-clear",
      onClick: () => {
        setStartDate("");
        setEndDate("");
      }
    },
    "Clear"
  ), /* @__PURE__ */ React.createElement("div", { className: "col-search-wrap col-date-search" }, /* @__PURE__ */ React.createElement(
    "svg",
    {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      className: "col-search-icon"
    },
    /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }),
    /* @__PURE__ */ React.createElement("path", { d: "m21 21-4.3-4.3" })
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "col-search",
      placeholder: "Search tickets\u2026",
      value: activeTab === "queue" ? searchTerm : roamingSearch,
      onChange: (e) => activeTab === "queue" ? setSearchTerm(e.target.value) : setRoamingSearch(e.target.value)
    }
  ))), activeTab === "queue" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "col-table-wrap" }, /* @__PURE__ */ React.createElement("table", { className: "col-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, [
    "Ticket ID",
    "Time",
    "Vehicle",
    "Driver",
    "Issued By",
    "Verified"
  ].map((h) => /* @__PURE__ */ React.createElement("th", { key: h }, h)))), /* @__PURE__ */ React.createElement("tbody", null, loading ? /* @__PURE__ */ React.createElement(SkeletonRows, { cols: 6 }) : error ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement(
    "td",
    {
      colSpan: "6",
      className: "col-table-state col-table-state--error"
    },
    "Error: ",
    error
  )) : tickets.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "6", className: "col-table-state" }, /* @__PURE__ */ React.createElement(
    "svg",
    {
      width: "32",
      height: "32",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      opacity: "0.3"
    },
    /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
    /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" })
  ), /* @__PURE__ */ React.createElement("span", null, "No records found"))) : tickets.map((ticket) => /* @__PURE__ */ React.createElement("tr", { key: ticket.id, className: "col-table-row" }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "col-id-badge" }, getTicketDisplayId(ticket))), /* @__PURE__ */ React.createElement("td", { className: "col-td-time" }, formatTime(ticket.issued_at)), /* @__PURE__ */ React.createElement("td", null, ticket.vehicle?.plate_number ? /* @__PURE__ */ React.createElement("span", { className: "col-plate" }, ticket.vehicle.plate_number) : /* @__PURE__ */ React.createElement("span", { className: "col-na" }, "N/A")), /* @__PURE__ */ React.createElement("td", { className: "col-td-name" }, ticket.driver?.name || /* @__PURE__ */ React.createElement("span", { className: "col-na" }, "N/A")), /* @__PURE__ */ React.createElement("td", { className: "col-td-name" }, ticket.active_user_name || /* @__PURE__ */ React.createElement("span", { className: "col-na" }, "N/A")), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(
    "span",
    {
      className: `col-verified ${ticket.status === "QUEUED" ? "col-verified--queued" : "col-verified--yes"}`
    },
    ticket.status === "QUEUED" ? "Queued" : "Collected"
  ))))))), totalPages > 1 && /* @__PURE__ */ React.createElement("div", { className: "col-pagination" }, /* @__PURE__ */ React.createElement("span", { className: "col-pagination-info" }, "Page ", page, " of ", totalPages), /* @__PURE__ */ React.createElement("div", { className: "col-pagination-btns" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "col-page-btn",
      disabled: page === 1,
      onClick: () => setPage((p) => p - 1)
    },
    "\u2190 Prev"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "col-page-btn",
      disabled: page >= totalPages,
      onClick: () => setPage((p) => p + 1)
    },
    "Next \u2192"
  )))), activeTab === "roaming" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "col-table-wrap" }, /* @__PURE__ */ React.createElement("table", { className: "col-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, [
    "Ticket ID",
    "Time",
    "Vehicle",
    "Driver",
    "Issued By"
  ].map((h) => /* @__PURE__ */ React.createElement("th", { key: h }, h)))), /* @__PURE__ */ React.createElement("tbody", null, roamingLoading ? /* @__PURE__ */ React.createElement(SkeletonRows, { cols: 6 }) : roamingError ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "6", className: "col-table-state col-table-state--error" }, "Error: ", roamingError)) : roamingTickets.length === 0 ? /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "6", className: "col-table-state" }, /* @__PURE__ */ React.createElement("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", opacity: "0.3" }, /* @__PURE__ */ React.createElement("path", { d: "M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "10", r: "3" })), /* @__PURE__ */ React.createElement("span", null, "No roaming tickets found"))) : roamingTickets.map((ticket) => /* @__PURE__ */ React.createElement("tr", { key: ticket.id, className: "col-table-row" }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "col-id-badge" }, getTicketDisplayId(ticket))), /* @__PURE__ */ React.createElement("td", { className: "col-td-time" }, formatTime(ticket.issued_at)), /* @__PURE__ */ React.createElement("td", null, ticket.vehicle?.plate_number ? /* @__PURE__ */ React.createElement("span", { className: "col-plate" }, ticket.vehicle.plate_number) : /* @__PURE__ */ React.createElement("span", { className: "col-na" }, "N/A")), /* @__PURE__ */ React.createElement("td", { className: "col-td-name" }, ticket.driver?.name || /* @__PURE__ */ React.createElement("span", { className: "col-na" }, "N/A")), /* @__PURE__ */ React.createElement("td", { className: "col-td-name" }, ticket.active_user_name || /* @__PURE__ */ React.createElement("span", { className: "col-na" }, "N/A"))))))), roamingTotalPages > 1 && /* @__PURE__ */ React.createElement("div", { className: "col-pagination" }, /* @__PURE__ */ React.createElement("span", { className: "col-pagination-info" }, "Page ", roamingPage, " of ", roamingTotalPages), /* @__PURE__ */ React.createElement("div", { className: "col-pagination-btns" }, /* @__PURE__ */ React.createElement("button", { className: "col-page-btn", disabled: roamingPage === 1, onClick: () => setRoamingPage((p) => p - 1) }, "\u2190 Prev"), /* @__PURE__ */ React.createElement("button", { className: "col-page-btn", disabled: roamingPage >= roamingTotalPages, onClick: () => setRoamingPage((p) => p + 1) }, "Next \u2192"))))));
}
export default Collection;
