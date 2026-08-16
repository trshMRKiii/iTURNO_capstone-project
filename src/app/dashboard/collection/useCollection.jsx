import { useState, useEffect, useMemo } from "react";
import { apiService } from "../../../lib/api-service";

export function useCollection(userRole) {
  const [tickets, setTickets] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [todayStats, setTodayStats] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  const getTodayDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const isTodayTicket = (ticket) => {
    if (!ticket?.issued_at) return false;
    return (
      getTodayDateString(new Date(ticket.issued_at)) ===
      getTodayDateString(new Date())
    );
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await apiService.getTickets();
      setTickets(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const todaysTickets = useMemo(() => tickets.filter(isTodayTicket), [tickets]);

  useEffect(() => {
    const active = todaysTickets.filter((t) => t.status !== "CANCELLED");
    if (active.length === 0) {
      setTodayStats(null);
      return;
    }
    setTodayStats({
      total: active.reduce((sum, t) => sum + Number(t.collection_amount || 0), 0),
      count: active.length,
    });
  }, [todaysTickets]);

  const safeLower = (val) => String(val ?? "").toLowerCase();

  const filteredTickets = useMemo(() => {
    const term = safeLower(searchTerm);
    const filtered = tickets.filter(
      (t) =>
        safeLower(t.id).includes(term) ||
        safeLower(t.vehicle?.plate_number).includes(term) ||
        safeLower(t.driver?.name).includes(term) ||
        safeLower(t.vehicle?.route_detail?.full_name).includes(term) ||
        (t.status === "CANCELLED" && "cancelled".includes(term)) ||
        (t.status !== "CANCELLED" && "collected".includes(term)),
    );
    return filtered.sort(
      (a, b) => new Date(b.issued_at) - new Date(a.issued_at),
    );
  }, [searchTerm, tickets]);

  const clearSuccessMessage = () => setSuccessMessage("");
  const clearError = () => setError(null);

  return {
    tickets,
    filteredTickets,
    searchTerm,
    loading,
    error,
    todayStats,
    successMessage,
    setSearchTerm,
    setError,
    setSuccessMessage,
    fetchTickets,
    clearSuccessMessage,
    clearError,
  };
}

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

export const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    amount || 0,
  );
