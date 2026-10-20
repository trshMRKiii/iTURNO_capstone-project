import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiService } from "../../../lib/api-service";
import { useFeedback } from "../../../components/ui/kit";
import { useSupervisors } from "../../../lib/useSupervisors";

const EMPTY_SERIES = {
  ticket_form: "",
  start_no: "",
  end_no: "",
  total_value: "",
};

const SERIES_SIZE = 10000;

const FALLBACK_ERROR = "Nothing was changed. Check your connection and try again.";
// Server field errors read "Series No: ticket series with this series no already exists." — spell it out and drop the field prefix.
const errorMessage = (err) => {
  const msg = err?.message?.replace(/^Error:\s*/, "").replace(/^Series No:\s*/i, "").replace(/\bseries no\b/gi, "series number");
  return msg ? msg.charAt(0).toUpperCase() + msg.slice(1) : FALLBACK_ERROR;
};

export function useRequisition() {
  const { notify, report, confirmAction } = useFeedback();
  const [requisitions, setRequisitions] = useState([]);
  const [ticketForms, setTicketForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setFormOpen] = useState(false);
  const [seriesItems, setSeriesItems] = useState([{ ...EMPTY_SERIES }]);
  const { supervisors, currentUser } = useSupervisors();
  const [requestedBy, setRequestedBy] = useState("");

  // The first load shows skeleton rows. Reloads after a save refresh quietly.
  const fetchRef = useRef(null);
  const fetchRequisitions = useCallback(async () => {
    try {
      const data = await apiService.request("/requisitions/");
      setRequisitions(data);
    } catch (err) {
      notify.error({
        title: "Couldn't load requisitions",
        message: errorMessage(err),
        onRetry: () => { setLoading(true); fetchRef.current(); },
      });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const fetchTicketForms = useCallback(async () => {
    try {
      const data = await apiService.getTicketForms();
      setTicketForms(data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchRef.current = fetchRequisitions;
    fetchRequisitions();
    fetchTicketForms();
  }, [fetchRequisitions, fetchTicketForms]);


  const activeRequisitions = useMemo(
    () => requisitions.filter((r) => !r.is_archived),
    [requisitions]
  );
  const archivedRequisitions = useMemo(
    () => requisitions.filter((r) => r.is_archived),
    [requisitions]
  );

  const allSeries = useMemo(() => {
    const series = [];
    for (const req of activeRequisitions) {
      if (req.ticket_series) {
        for (const ts of req.ticket_series) {
          series.push({ ...ts, requisition_id: req.id, requisition_status: req.status });
        }
      }
    }
    series.sort((a, b) => a.requisition_id - b.requisition_id || a.id - b.id);
    return series;
  }, [activeRequisitions]);

  const inventory = useMemo(() => {
    const getPcs = (s) => {
      const start = parseInt(s.start_no) || 0;
      const end = parseInt(s.end_no) || 0;
      return end >= start ? end - start + 1 : 0;
    };

    const enriched = allSeries.map((s) => {
      const pcs = getPcs(s);
      const remaining = s.remaining ?? pcs;
      const price = parseFloat(s.ticket_form_price) || 0;
      return { ...s, pcs, remaining, beginning: s.beginning ?? pcs, current_value: remaining * price };
    });
    const totalStock = enriched.reduce((sum, s) => sum + s.remaining, 0);
    const totalValue = enriched.reduce((sum, s) => sum + s.current_value, 0);
    const activeSeries = enriched.length > 0 ? enriched[0] : null;
    const hasStock = totalStock > 0;

    const byDenomination = {};
    for (const s of enriched) {
      const key = s.ticket_form_label || "Unspecified";
      if (!byDenomination[key]) {
        byDenomination[key] = { label: key, totalQty: 0, totalValue: 0, series: [] };
      }
      byDenomination[key].totalQty += s.remaining;
      byDenomination[key].totalValue += s.current_value;
      byDenomination[key].series.push(s);
    }

    const stockLevel =
      totalStock >= 10000 ? "high" : totalStock >= 5000 ? "normal" : "low";

    return { totalStock, totalValue, activeSeries, hasStock, stockLevel, allStock: enriched, byDenomination };
  }, [allSeries]);

  // Opening always starts from a blank form, so a cancelled entry never reappears.
  const setShowForm = (open) => {
    if (open) {
      setSeriesItems([{ ...EMPTY_SERIES }]);
      setRequestedBy(currentUser?.role === "SUPERVISOR" ? currentUser.id : "");
    }
    setFormOpen(open);
  };

  const updateSeriesItem = (index, field, value) => {
    setSeriesItems((prev) => {
      const copy = [...prev];
      const isNo = field === "start_no" || field === "end_no";
      const updated = { ...copy[index], [field]: isNo ? value.replace(/\D/g, "") : value };

      // A series is normally 10,000 tickets, so the end follows the start. It can still be typed over.
      if (field === "start_no") {
        const start = parseInt(updated.start_no);
        updated.end_no = start > 0 ? String(start + SERIES_SIZE - 1) : "";
      }

      if (field === "ticket_form" || isNo) {
        const form = ticketForms.find((tf) => String(tf.id) === String(updated.ticket_form));
        const price = form ? parseFloat(form.price) || 0 : 0;
        const start = parseInt(updated.start_no) || 0;
        const end = parseInt(updated.end_no) || 0;
        const pcs = end >= start && start > 0 ? end - start + 1 : 0;
        // Stay blank until there is a real amount to show.
        updated.total_value = price * pcs > 0 ? (price * pcs).toFixed(2) : "";
      }

      copy[index] = updated;
      return copy;
    });
  };

  const addSeriesItem = () =>
    setSeriesItems((prev) => [...prev, { ...EMPTY_SERIES }]);

  const removeSeriesItem = (index) =>
    setSeriesItems((prev) => prev.filter((_, i) => i !== index));

  const computeTotal = useCallback(
    () => seriesItems.reduce((sum, item) => sum + (parseFloat(item.total_value) || 0), 0),
    [seriesItems]
  );

  // Add: no confirmation. The Save button shows "Saving..." and the form stays locked until the server answers.
  const handleSave = async () => {
    if (!requestedBy) {
      notify.error({ title: "Choose a supervisor", message: "Select the supervisor who requested these tickets." });
      return;
    }
    // Untouched blank rows are ignored; any row the user started (form, start or end) must be complete.
    const filled = seriesItems.filter((item) => item.ticket_form || item.start_no || item.end_no);
    if (filled.length === 0) {
      notify.error({ title: "Nothing to save", message: "Add at least one ticket series with a start and end number." });
      return;
    }
    if (filled.some((item) => !item.ticket_form)) {
      notify.error({ title: "Select a ticket form", message: "Choose a ticket form for every series item." });
      return;
    }
    if (filled.some((item) => !String(item.start_no).trim() || !String(item.end_no).trim())) {
      notify.error({ title: "Missing series numbers", message: "Enter both a start and end number for every series item." });
      return;
    }
    setSaving(true);
    try {
      const totalValue = computeTotal();
      const reqData = await apiService.request("/requisitions/", {
        method: "POST",
        body: JSON.stringify({
          total_value: totalValue,
          requested_by: requestedBy,
        }),
      });

      try {
        for (const item of filled) {
          await apiService.request("/ticket-series/", {
            method: "POST",
            body: JSON.stringify({
              series_no: `${item.start_no}-${item.end_no}`,
              ticket_form: item.ticket_form,
              start_no: item.start_no,
              end_no: item.end_no,
              unit_value: 0,
              total_value: parseFloat(item.total_value) || 0,
              requisition: reqData.id,
            }),
          });
        }
      } catch (seriesErr) {
        // Don't leave an empty requisition behind, and show whatever did get saved.
        await apiService.request(`/requisitions/${reqData.id}/`, { method: "DELETE" }).catch(() => {});
        await fetchRequisitions();
        throw seriesErr;
      }

      setSeriesItems([{ ...EMPTY_SERIES }]);
      setFormOpen(false);
      await fetchRequisitions();
      notify.success({
        title: "Requisition saved",
        message: filled.length === 1 ? "1 ticket series was added to stock." : `${filled.length} ticket series were added to stock.`,
      });
    } catch (err) {
      notify.error({ title: "Couldn't save requisition", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const patchStatus = async (id, status, success, failTitle) => {
    try {
      await apiService.request(`/requisitions/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await fetchRequisitions();
      notify.success(success);
    } catch (err) {
      notify.error({ title: failTitle, message: errorMessage(err), onRetry: () => patchStatus(id, status, success, failTitle) });
    }
  };

  const handleApprove = (id) =>
    patchStatus(id, "APPROVED", { title: "Requisition approved", message: "It is ready to be issued." }, "Couldn't approve requisition");

  const handleIssue = (id) =>
    patchStatus(id, "ISSUED", { title: "Requisition issued", message: "The ticket series are now in stock." }, "Couldn't issue requisition");

  const restoreRequisition = async (id) => {
    try {
      await apiService.patch(`/requisitions/${id}/`, { is_archived: false });
      await fetchRequisitions();
      return { success: { title: "Requisition restored", message: "It is back in the active stock ledger." } };
    } catch (err) {
      return { error: { title: "Couldn't restore requisition", message: errorMessage(err), onRetry: () => restoreRequisition(id).then(report) } };
    }
  };

  const archiveRequisition = async (id) => {
    try {
      await apiService.patch(`/requisitions/${id}/`, { is_archived: true });
      await fetchRequisitions();
      return {
        success: {
          title: "Requisition archived",
          message: "It was moved out of the active stock ledger.",
          undo: { label: "Undo", onUndo: () => restoreRequisition(id).then(report) },
        },
      };
    } catch (err) {
      return { error: { title: "Couldn't archive requisition", message: errorMessage(err), onRetry: () => archiveRequisition(id).then(report) } };
    }
  };

  const handleArchive = (id) => confirmAction({
    title: "Archive this requisition?",
    message: "It will move out of the active stock ledger.",
    confirmLabel: "Archive",
    busyLabel: "Archiving...",
    run: () => archiveRequisition(id),
  });

  const handleRestore = async (id) => report(await restoreRequisition(id));

  // Corrects a mis-keyed series in place (the server refuses once any ticket or paper range uses it).
  const [editing, setEditing] = useState(null);

  const startEdit = (ts) => setEditing({ id: ts.id, start_no: String(ts.start_no), end_no: String(ts.end_no) });

  const updateEdit = (field, value) => setEditing((prev) => ({ ...prev, [field]: value.replace(/\D/g, "") }));

  const saveEdit = async () => {
    if (!editing.start_no || !editing.end_no) {
      notify.error({ title: "Missing series numbers", message: "Enter both a start and end number." });
      return;
    }
    setSaving(true);
    try {
      await apiService.patch(`/ticket-series/${editing.id}/`, {
        start_no: editing.start_no,
        end_no: editing.end_no,
      });
      setEditing(null);
      await fetchRequisitions();
      notify.success({ title: "Series updated", message: `${editing.start_no}–${editing.end_no} is now in stock.` });
    } catch (err) {
      notify.error({ title: "Couldn't update series", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return {
    requisitions,
    ticketForms,
    loading,
    saving,
    showForm,
    setShowForm,
    seriesItems,
    supervisors,
    requestedBy,
    setRequestedBy,
    updateSeriesItem,
    addSeriesItem,
    removeSeriesItem,
    computeTotal,
    handleSave,
    handleApprove,
    handleIssue,
    handleArchive,
    handleRestore,
    editing,
    setEditing,
    startEdit,
    updateEdit,
    saveEdit,
    refresh: fetchRequisitions,
    allSeries,
    inventory,
    activeRequisitions,
    archivedRequisitions,
  };
}
