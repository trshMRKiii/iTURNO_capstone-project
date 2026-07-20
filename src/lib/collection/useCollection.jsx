import { useState, useEffect, useMemo } from "react";
import { apiService } from "../api-service";

export function useCollection(userRole) {
  const [tickets, setTickets] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [todayStats, setTodayStats] = useState(null);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [verifyingTicketId, setVerifyingTicketId] = useState(null);
  const [verifyingOverride, setVerifyingOverride] = useState(false);
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
      count: active.filter((t) => t.status !== "COLLECTED").length,
      pending: active.filter((t) => !t.is_verified).length,
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
        (t.status !== "CANCELLED" &&
          t.is_verified &&
          "verified".includes(term)) ||
        (t.status !== "CANCELLED" &&
          !t.is_verified &&
          "pending".includes(term)),
    );
    return filtered.sort(
      (a, b) => new Date(b.issued_at) - new Date(a.issued_at),
    );
  }, [searchTerm, tickets]);

  const handleVerifyAllPending = async () => {
    try {
      setVerifyingAll(true);
      const pendingTickets = tickets.filter(
        (t) => isTodayTicket(t) && !t.is_verified && t.status !== "CANCELLED",
      );

      if (pendingTickets.length === 0) {
        setSuccessMessage("No pending tickets to verify.");
        setTimeout(() => setSuccessMessage(""), 3000);
        setVerifyingAll(false);
        return;
      }

      for (const ticket of pendingTickets) {
        await apiService.patch(`/tickets/${ticket.id}/`, {
          is_verified: true,
          status: "COLLECTED",
        });
      }

      setSuccessMessage(
        `${pendingTickets.length} ticket(s) verified successfully.`,
      );
      setTimeout(() => setSuccessMessage(""), 3000);
      fetchTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifyingAll(false);
    }
  };

  const handleVerifyTicket = async (ticketId) => {
    try {
      setVerifyingTicketId(ticketId);
      await apiService.patch(`/tickets/${ticketId}/`, {
        is_verified: true,
        status: "COLLECTED",
      });
      setSuccessMessage(`Ticket #${ticketId} verified successfully.`);
      setTimeout(() => setSuccessMessage(""), 3000);
      await fetchTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifyingTicketId(null);
    }
  };

  // All unverified tickets regardless of date — used by the manual override
  // so stuck/orphaned tickets from any day can be force-verified.
  const unverifiedTickets = useMemo(
    () =>
      tickets
        .filter((t) => !t.is_verified && t.status !== "CANCELLED")
        .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at)),
    [tickets],
  );

  const handleVerifyAllOverride = async () => {
    if (unverifiedTickets.length === 0) {
      setSuccessMessage("No unverified tickets to override.");
      setTimeout(() => setSuccessMessage(""), 3000);
      return;
    }
    try {
      setVerifyingOverride(true);
      for (const ticket of unverifiedTickets) {
        await apiService.patch(`/tickets/${ticket.id}/`, {
          is_verified: true,
          status: "COLLECTED",
        });
      }
      setSuccessMessage(
        `${unverifiedTickets.length} ticket(s) force-verified via override.`,
      );
      setTimeout(() => setSuccessMessage(""), 3000);
      await fetchTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifyingOverride(false);
    }
  };

  const clearSuccessMessage = () => setSuccessMessage("");
  const clearError = () => setError(null);

  return {
    tickets,
    filteredTickets,
    searchTerm,
    loading,
    error,
    todayStats,
    verifyingAll,
    verifyingTicketId,
    verifyingOverride,
    unverifiedTickets,
    successMessage,
    setSearchTerm,
    setError,
    setSuccessMessage,
    fetchTickets,
    handleVerifyAllPending,
    handleVerifyTicket,
    handleVerifyAllOverride,
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
