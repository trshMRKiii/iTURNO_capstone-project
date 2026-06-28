import { useState, useEffect, useCallback, useMemo } from "react";
import { apiService } from "../api-service";

const EMPTY_SERIES = {
  ticket_form: "",
  pad_no: "",
  box_no: "",
  start_no: "",
  end_no: "",
  qty: "",
  total_value: "",
};

export function useRequisition() {
  const [requisitions, setRequisitions] = useState([]);
  const [ticketForms, setTicketForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [seriesItems, setSeriesItems] = useState([{ ...EMPTY_SERIES }]);

  const fetchRequisitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.request("/requisitions/");
      setRequisitions(data);
    } catch (err) {
      setError(err.message || "Failed to load requisitions");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTicketForms = useCallback(async () => {
    try {
      const data = await apiService.getTicketForms();
      setTicketForms(data);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchRequisitions();
    fetchTicketForms();
  }, [fetchRequisitions, fetchTicketForms]);

  const allSeries = useMemo(() => {
    const series = [];
    for (const req of requisitions) {
      if (req.ticket_series) {
        for (const ts of req.ticket_series) {
          series.push({ ...ts, requisition_id: req.id, requisition_status: req.status });
        }
      }
    }
    series.sort((a, b) => a.requisition_id - b.requisition_id || a.id - b.id);
    return series;
  }, [requisitions]);

  const inventory = useMemo(() => {
    const getPcs = (s) => {
      const start = parseInt(s.start_no) || 0;
      const end = parseInt(s.end_no) || 0;
      return end > start ? end - start : 0;
    };

    const enriched = allSeries.map((s) => {
      const pcs = getPcs(s);
      const price = parseFloat(s.ticket_form_price) || 0;
      return { ...s, pcs, current_value: pcs * price };
    });
    const totalStock = enriched.reduce((sum, s) => sum + s.pcs, 0);
    const totalValue = enriched.reduce((sum, s) => sum + s.current_value, 0);
    const activeSeries = enriched.length > 0 ? enriched[0] : null;
    const hasStock = totalStock > 0;

    const byDenomination = {};
    for (const s of enriched) {
      const key = s.ticket_form_label || "Unspecified";
      if (!byDenomination[key]) {
        byDenomination[key] = { label: key, totalQty: 0, totalValue: 0, series: [] };
      }
      byDenomination[key].totalQty += s.pcs;
      byDenomination[key].totalValue += s.current_value;
      byDenomination[key].series.push(s);
    }

    const stockLevel =
      totalStock >= 10000 ? "high" : totalStock >= 5000 ? "normal" : "low";

    return { totalStock, totalValue, activeSeries, hasStock, stockLevel, allStock: enriched, byDenomination };
  }, [allSeries]);

  const updateSeriesItem = (index, field, value) => {
    setSeriesItems((prev) => {
      const copy = [...prev];
      const updated = { ...copy[index], [field]: value };

      if (field === "ticket_form" || field === "qty" || field === "start_no") {
        const form = ticketForms.find((tf) => String(tf.id) === String(updated.ticket_form));
        const price = form ? parseFloat(form.price) || 0 : 0;
        const qty = parseInt(updated.qty) || 0;
        const pcs = qty * 1000;
        const startNo = parseInt(updated.start_no) || 0;
        if (qty > 0 && startNo > 0) {
          updated.end_no = String(startNo + pcs - 1);
        }
        updated.total_value = (price * pcs).toFixed(2);
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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const totalValue = computeTotal();
      const currentUser = await apiService.request("/current-user/");
      const reqData = await apiService.request("/requisitions/", {
        method: "POST",
        body: JSON.stringify({ total_value: totalValue, requested_by: currentUser.id }),
      });

      for (const item of seriesItems) {
        if (!item.start_no && !item.end_no) continue;
        await apiService.request("/ticket-series/", {
          method: "POST",
          body: JSON.stringify({
            series_no: `${item.start_no}-${item.end_no}`,
            ticket_form: item.ticket_form || null,
            pad_no: item.pad_no || "",
            box_no: item.box_no || "",
            start_no: item.start_no,
            end_no: item.end_no,
            qty: parseInt(item.qty) || 0,
            unit_value: 0,
            total_value: parseFloat(item.total_value) || 0,
            requisition: reqData.id,
          }),
        });
      }

      setSeriesItems([{ ...EMPTY_SERIES }]);
      setShowForm(false);
      await fetchRequisitions();
    } catch (err) {
      setError(err.message || "Failed to save requisition");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await apiService.request(`/requisitions/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: "APPROVED" }),
      });
      await fetchRequisitions();
    } catch (err) {
      setError(err.message || "Failed to approve");
    }
  };

  const handleIssue = async (id) => {
    try {
      await apiService.request(`/requisitions/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ISSUED" }),
      });
      await fetchRequisitions();
    } catch (err) {
      setError(err.message || "Failed to issue");
    }
  };

  return {
    requisitions,
    ticketForms,
    loading,
    error,
    saving,
    showForm,
    setShowForm,
    seriesItems,
    updateSeriesItem,
    addSeriesItem,
    removeSeriesItem,
    computeTotal,
    handleSave,
    handleApprove,
    handleIssue,
    refresh: fetchRequisitions,
    allSeries,
    inventory,
  };
}
