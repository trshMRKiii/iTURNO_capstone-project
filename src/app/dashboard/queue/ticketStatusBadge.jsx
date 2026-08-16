import React from "react";

const statusColor = {
  CANCELLED: "ticket-status--cancelled",
  DISPATCHED: "ticket-status--dispatched",
  COLLECTED: "ticket-status--collected",
};

export default function TicketStatusBadge({ ticket }) {
  return (
    <div className="ticket-status-cell">
      <span className={`ticket-status ${statusColor[ticket.status] || "ticket-status--default"}`}>
        {ticket.status}
      </span>
    </div>
  );
}
