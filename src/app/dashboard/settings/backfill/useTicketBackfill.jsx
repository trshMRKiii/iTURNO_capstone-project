import { useEffect, useState } from "react";
import { apiService, IS_REMOTE } from "../../../../lib/api-service";
import {
  F_TICKET_ID, F_PLATE, F_DRIVER_IWP, F_DRIVER_LAST, F_DRIVER_FIRST,
  F_ROUTE, F_TICKET_TYPE, F_AMOUNT, F_ISSUED_AT, F_MODE, F_NOTES,
} from "./fields";

const EMPTY_ROW = {
  [F_TICKET_ID]: "",
  [F_PLATE]: "",
  [F_DRIVER_IWP]: "",
  [F_DRIVER_LAST]: "",
  [F_DRIVER_FIRST]: "",
  [F_ROUTE]: "",
  [F_TICKET_TYPE]: "",
  [F_AMOUNT]: "",
  [F_ISSUED_AT]: "",
  [F_MODE]: "Queue",
  [F_NOTES]: "",
};

export function useTicketBackfill() {
  const [wipMode, setWipMode] = useState(null);
  const [wipLoading, setWipLoading] = useState(true);
  const [togglingWip, setTogglingWip] = useState(false);

  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [ticketForms, setTicketForms] = useState([]);

  const [manualRow, setManualRow] = useState(EMPTY_ROW);
  const [manualPreview, setManualPreview] = useState(null);
  const [manualBusy, setManualBusy] = useState(false);

  const [csvFile, setCsvFile] = useState(null);
  const [csvReport, setCsvReport] = useState(null);
  const [csvBusy, setCsvBusy] = useState(false);

  // Remote has no live preview (see submitManualBackfill's comment in
  // api-service.js) — this list of queued requests + their apply status is
  // what stands in for it on the remote dashboard.
  const [remoteRequests, setRemoteRequests] = useState([]);
  const [remoteRequestsLoading, setRemoteRequestsLoading] = useState(false);

  const fetchRemoteRequests = () => {
    if (!IS_REMOTE) return Promise.resolve();
    setRemoteRequestsLoading(true);
    return apiService
      .getRemoteBackfillRequests()
      .then(setRemoteRequests)
      .catch((err) => console.error("Failed to load remote backfill requests:", err))
      .finally(() => setRemoteRequestsLoading(false));
  };

  const fetchWipMode = () => {
    setWipLoading(true);
    return apiService
      .getWipMode()
      .then(setWipMode)
      .catch((err) => console.error("Failed to load WIP mode:", err))
      .finally(() => setWipLoading(false));
  };

  useEffect(() => {
    fetchWipMode();
    fetchRemoteRequests();
    apiService.getVehicles().then(setVehicles).catch((err) => console.error("Failed to load vehicles:", err));
    apiService.getDrivers().then(setDrivers).catch((err) => console.error("Failed to load drivers:", err));
    apiService.getTicketForms().then(setTicketForms).catch((err) => console.error("Failed to load ticket forms:", err));
  }, []);

  const toggleWipMode = async (nextActive) => {
    setTogglingWip(true);
    try {
      const updated = await apiService.updateWipMode(nextActive);
      setWipMode(updated);
      return updated;
    } finally {
      setTogglingWip(false);
    }
  };

  const updateManualField = (field, value) => {
    setManualRow((prev) => ({ ...prev, [field]: value }));
    setManualPreview(null);
  };

  const resetManualRow = () => {
    setManualRow(EMPTY_ROW);
    setManualPreview(null);
  };

  const previewManualRow = async () => {
    setManualBusy(true);
    try {
      const result = await apiService.submitManualBackfill(manualRow, false);
      setManualPreview(result);
      return result;
    } finally {
      setManualBusy(false);
    }
  };

  const confirmManualRow = async () => {
    setManualBusy(true);
    try {
      const result = await apiService.submitManualBackfill(manualRow, true);
      if (result.outcome === "ok") {
        resetManualRow();
        if (IS_REMOTE) await fetchRemoteRequests();
      }
      return result;
    } finally {
      setManualBusy(false);
    }
  };

  const previewCsv = async () => {
    if (!csvFile) return;
    setCsvBusy(true);
    try {
      const result = await apiService.previewTicketBackfill(csvFile);
      setCsvReport(result);
      return result;
    } finally {
      setCsvBusy(false);
    }
  };

  const importCsv = async () => {
    if (!csvFile) return;
    setCsvBusy(true);
    try {
      const result = await apiService.importTicketBackfill(csvFile);
      setCsvReport(result);
      return result;
    } finally {
      setCsvBusy(false);
    }
  };

  const resetCsv = () => {
    setCsvFile(null);
    setCsvReport(null);
  };

  return {
    wipMode, wipLoading, togglingWip, toggleWipMode,
    vehicles, drivers, ticketForms,
    manualRow, manualPreview, manualBusy, updateManualField, resetManualRow, previewManualRow, confirmManualRow,
    csvFile, setCsvFile, csvReport, csvBusy, previewCsv, importCsv, resetCsv,
    remoteRequests, remoteRequestsLoading,
  };
}
