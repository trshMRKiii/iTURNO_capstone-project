import { useState, useEffect } from "react";
import { apiService } from "../../../lib/api-service";

export const getTodayDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const PAGE_SIZE = 25;
// Debounce search so typing doesn't fire a request per keystroke.
const SEARCH_DEBOUNCE_MS = 350;

// One tab's worth of tickets (mode QUEUE or UNLOAD), fetched a page at a time
// from the server — search and date range are query params, not client-side
// filters, so results always reflect the full dataset, not just the loaded
// page. Both tabs share startDate/endDate but keep independent search/page
// state, since mixing modes into one page of results would misalign each
// tab's own page numbers against its own total count.
function usePaginatedTickets(mode, startDate, endDate, search) {
  const [tickets, setTickets] = useState([]);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // A new filter invalidates whatever page we were on — e.g. page 4 of an
  // unfiltered list is meaningless once a search narrows it to one result.
  useEffect(() => {
    setPage(1);
  }, [mode, startDate, endDate, search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { mode, page, page_size: PAGE_SIZE };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (search) params.search = search;

    apiService
      .getTickets(params)
      .then((data) => {
        if (cancelled) return;
        setTickets(Array.isArray(data?.results) ? data.results : []);
        setCount(Number(data?.count) || 0);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, page, startDate, endDate, search]);

  return { tickets, page, setPage, count, totalPages: Math.max(Math.ceil(count / PAGE_SIZE), 1), loading, error };
}

function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useCollection() {
  // Empty = no date filter = show everything (paginated), per the "default
  // to the entire history" behavior — start/end are opt-in narrowing, not a
  // mandatory range.
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [roamingSearch, setRoamingSearch] = useState("");
  const debouncedSearch = useDebounced(searchTerm, SEARCH_DEBOUNCE_MS);
  const debouncedRoamingSearch = useDebounced(roamingSearch, SEARCH_DEBOUNCE_MS);

  const collection = usePaginatedTickets("QUEUE", startDate, endDate, debouncedSearch);
  const roaming = usePaginatedTickets("UNLOAD", startDate, endDate, debouncedRoamingSearch);

  return {
    startDate,
    endDate,
    setStartDate,
    setEndDate,

    tickets: collection.tickets,
    page: collection.page,
    setPage: collection.setPage,
    totalPages: collection.totalPages,
    count: collection.count,
    loading: collection.loading,
    error: collection.error,
    searchTerm,
    setSearchTerm,

    roamingTickets: roaming.tickets,
    roamingPage: roaming.page,
    setRoamingPage: roaming.setPage,
    roamingTotalPages: roaming.totalPages,
    roamingCount: roaming.count,
    roamingLoading: roaming.loading,
    roamingError: roaming.error,
    roamingSearch,
    setRoamingSearch,
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
