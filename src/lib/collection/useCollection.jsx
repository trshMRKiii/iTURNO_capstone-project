import { useState, useEffect, useMemo } from "react";
import { OperationsService } from "../operations-service";
import { apiService } from "../api-service";

export function useCollection(shifts, userRole) {
  const [tickets, setTickets] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [batchStats, setBatchStats] = useState(null);
  const [verifyingBatch, setVerifyingBatch] = useState(null);
  const [verifyingTicketId, setVerifyingTicketId] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [verifiedBatches, setVerifiedBatches] = useState({
    batch1: null,
    batch2: null,
  });

  const STORAGE_KEY = "batch_verifications";

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

  const loadVerifiedBatches = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const today = getTodayDateString(new Date());

    if (stored) {
      const parsed = JSON.parse(stored);
      // Reset if date changed
      if (parsed.date !== today) {
        setVerifiedBatches({});
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today }));
      } else {
        setVerifiedBatches(parsed);
      }
    } else {
      const today = getTodayDateString(new Date());
      setVerifiedBatches({});
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today }));
    }
  };

  const getShiftByName = (batchName) =>
    Object.values(shifts || {}).find((shift) => shift.name === batchName);

  const isBatchEnded = (batchKey) => {
    const shift = getShiftByName(batchKey);
    if (!shift) return false;
    const now = new Date();
    return now.getHours() >= shift.endHour;
  };

  const isBatchVerifiable = (batchKey) => {
    return isBatchEnded(batchKey);
  };

  useEffect(() => {
    loadVerifiedBatches();
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
    if (todaysTickets.length > 0 && Object.keys(shifts || {}).length > 0) {
      setBatchStats(
        OperationsService.calculateBatchStats(todaysTickets, shifts),
      );
    } else {
      setBatchStats(null);
    }
  }, [todaysTickets, shifts]);

  const safeLower = (val) => String(val ?? "").toLowerCase();

  const filteredTickets = useMemo(() => {
    const term = safeLower(searchTerm);
    const filtered = tickets.filter(
      (t) =>
        safeLower(t.id).includes(term) ||
        safeLower(t.vehicle?.plate_number).includes(term) ||
        safeLower(t.driver?.name).includes(term) ||
        safeLower(t.vehicle?.route_detail?.full_name).includes(term),
    );
    return filtered.sort(
      (a, b) => new Date(b.issued_at) - new Date(a.issued_at),
    );
  }, [searchTerm, tickets]);

  const handleVerifyBatch = async (batchName) => {
    try {
      setVerifyingBatch(batchName);
      const batchTickets = tickets.filter(
        (t) =>
          isTodayTicket(t) &&
          !t.is_verified &&
          t.status !== "CANCELLED" &&
          t.vehicle?.status !== "QUEUED" &&
          OperationsService.getEffectiveBatchName(t, shifts) === batchName,
      );

      if (batchTickets.length === 0) {
        setSuccessMessage("No pending tickets to verify in this batch.");
        setTimeout(() => setSuccessMessage(""), 3000);
        setVerifyingBatch(null);
        return;
      }

      for (const ticket of batchTickets) {
        await apiService.patch(`/tickets/${ticket.id}/`, {
          is_verified: true,
          status: "COLLECTED",
        });
      }

      // Mark batch as verified today
      const today = getTodayDateString(new Date());
      const normalizedKey = batchName.toLowerCase().replace(/\s+/g, "");
      const updated = {
        ...verifiedBatches,
        [normalizedKey]: today,
        date: today,
      };
      setVerifiedBatches(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      setSuccessMessage(
        `${batchTickets.length} ticket(s) in ${batchName} verified successfully.`,
      );
      setTimeout(() => setSuccessMessage(""), 3000);
      fetchTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifyingBatch(null);
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

  const clearSuccessMessage = () => setSuccessMessage("");
  const clearError = () => setError(null);

  return {
    tickets,
    filteredTickets,
    searchTerm,
    loading,
    error,
    batchStats,
    verifyingBatch,
    verifyingTicketId,
    successMessage,
    setSearchTerm,
    setError,
    setSuccessMessage,
    fetchTickets,
    handleVerifyBatch,
    handleVerifyTicket,
    clearSuccessMessage,
    clearError,
    isBatchVerifiable,
    isBatchEnded,
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

export const BatchCard = ({
  label,
  stats,
  batchKey,
  onVerify,
  verifyingBatch,
  userRole,
  isBatchEnded,
}) => {
  const disabled = !isBatchEnded || userRole === "MANAGER";

  return (
    <div className="bc-card">
      <div className="bc-header">
        <span className="bc-label">{label}</span>
      </div>
      <div className="bc-body">
        {stats && (
          <div className="bc-rows">
            {[
              {
                label: "Revenue",
                value: formatCurrency(stats.total),
                bold: true,
              },
              { label: "Active Dispatches", value: stats.count },
              {
                label: "Pending Verification",
                value: stats.pending,
                warn: stats.pending > 0,
              },
            ].map(({ label: l, value, warn }) => (
              <div key={l} className="bc-row">
                <span className="bc-row-label">{l}</span>
                <span
                  className={`bc-row-value ${warn ? "bc-row-value--warn" : ""}`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="bc-verify-btn"
          onClick={() => onVerify(batchKey)}
          disabled={disabled}
        >
          {verifyingBatch === batchKey ? (
            <>
              <span className="bc-spinner" />
              Verifying…
            </>
          ) : !isBatchEnded ? (
            <>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Batch In Progress
            </>
          ) : (
            <>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Verify {batchKey}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
