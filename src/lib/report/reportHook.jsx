export const peso = (n) => {
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

export const STATUS_COLORS = {
  COLLECTED: "#22c55e",
  ISSUED: "#3b82f6",
  DISPATCHED: "#f59e0b",
  CANCELLED: "#ef4444",
  RETURNED: "#8b5cf6",
};

export const today = new Date().toISOString().split("T")[0];

// Default report window: Jan 1 of the current year through today. Keeps the
// initial load bounded to the current year's data instead of the whole table
// — older years are only pulled in when the user explicitly picks a wider range.
export const yearStart = `${new Date().getFullYear()}-01-01`;

export const formatTime = (dateString) => {
  try {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "N/A";
  }
};

export const formatChanges = (changes) => {
  if (!changes || typeof changes !== "object") return "—";
  const entries = Object.entries(changes);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
};

export function exportCSV(data, filename = "report.csv") {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SummaryCard({ label, count, total }) {
  return (
    <div className="rpt-summary-card">
      <span className="rpt-summary-label">{label}</span>
      <div className="rpt-summary-count">
        {count}
        <span className="rpt-summary-unit">tickets</span>
      </div>
      <div className="rpt-summary-total">{peso(total)}</div>
    </div>
  );
}

export const handleDateChange = (field, value) => {
  setFilters((prev) => {
    const updated = { ...prev, [field]: value };
    if (field === "endDate" && updated.startDate && value < updated.startDate)
      return prev;
    if (field === "startDate" && updated.endDate && value > updated.endDate)
      updated.endDate = "";
    return updated;
  });
};

export const handleClearFilter = () => {
  setFilters({ startDate: "", endDate: "" });
  setTimeout(() => fetchData(), 0);
};

export const handleExportCSV = () => {
  exportCSV(
    filteredCollections.map((r) => ({
      Date: r.issued_at,
      "Ticket ID": r.id,
      Driver: r.driver,
      Vehicle: r.vehicle,
      Route: r.route,
      "Amount (PHP)": r.collection_amount || 0,
    })),
    `collection_report_${Date.now()}.csv`,
  );
};

export const handleExportLogsCSV = () => {
  exportCSV(
    logs.map((l) => ({
      Timestamp: l.timestamp,
      "Ticket ID": l.ticket_id,
      Action: l.action,
      Driver: l.driver,
      Vehicle: l.vehicle,
      Route: l.route,
      "Amount (PHP)": l.amount || 0,
      User: l.user,
    })),
    `transaction_logs_${Date.now()}.csv`,
  );
};

export const handleExportVehiclesCSV = () => {
  exportCSV(
    vehicles.map((v) => ({
      "Plate Number": v.plate_number,
      Route: v.route_detail
        ? `${v.route_detail.origin} - San Fernando`
        : v.route,
      Driver: v.active_driver_name || "—",
    })),
    `vehicle_records_${Date.now()}.csv`,
  );
};

export const handleExportDriversCSV = () => {
  exportCSV(
    drivers.map((d) => ({
      Code: d.code,
      Name: d.name,
      "Contact Number": d.contact_number,
    })),
    `driver_records_${Date.now()}.csv`,
  );
};

export const handleExportPDF = () => exportPDF(filteredCollections, filters);
