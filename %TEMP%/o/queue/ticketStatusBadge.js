import React from "react";
const statusColor = {
  COLLECTED: "ticket-status--collected"
};
export default function TicketStatusBadge({ ticket }) {
  return /* @__PURE__ */ React.createElement("div", { className: "ticket-status-cell" }, /* @__PURE__ */ React.createElement("span", { className: `ticket-status ${statusColor[ticket.status] || "ticket-status--default"}` }, ticket.status));
}
