import { useEffect, useState } from "react";
import { apiService } from "../../../lib/api-service";

export function useRemittance() {
  const [showModal, setShowModal] = useState(false);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch batches
  const fetchBatches = async () => {
    try {
      const res = await apiService.get("/report/remittance/");
      setBatches(res.results || []);
    } catch (err) {
      console.error("Failed to load remittance batches", err);
      setError("Failed to load remittance batches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  // Save new batch
  const handleSaveBatch = async (batchData) => {
    try {
      await apiService.post("/report/remittance/", batchData);
      setShowModal(false);
      fetchBatches(); // refresh table
    } catch (err) {
      console.error("Failed to save batch", err);
      alert("Error saving batch");
    }
  };

  // Archive a batch (soft delete)
  const handleArchiveBatch = async (id) => {
    try {
      const updated = await apiService.patch(`/remittance/${id}/`, { is_archived: true });
      setBatches((prev) => prev.map((b) => (b.id === id ? { ...b, ...updated } : b)));
    } catch (err) {
      console.error("Failed to archive batch", err);
      setError("Failed to archive remittance batch");
      throw err;
    }
  };

  // Restore an archived batch
  const handleRestoreBatch = async (id) => {
    try {
      const updated = await apiService.patch(`/remittance/${id}/`, { is_archived: false });
      setBatches((prev) => prev.map((b) => (b.id === id ? { ...b, ...updated } : b)));
    } catch (err) {
      console.error("Failed to restore batch", err);
      setError("Failed to restore remittance batch");
      throw err;
    }
  };

  return {
    showModal,
    setShowModal,
    batches,
    loading,
    error,
    handleSaveBatch,
    handleArchiveBatch,
    handleRestoreBatch,
  };
}
