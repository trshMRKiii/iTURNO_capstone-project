import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { apiService } from "../../../lib/api-service";
import { useFeedback } from "../../../components/ui/kit";
import SettingsModal from "../../../components/ui/settingsModal";
import TicketBackfillTab from "./backfill/TicketBackfillTab";
import ArchiveTab from "./archive/ArchiveTab";
import SettingsNav from "./SettingsNav";
import TicketFormsSection from "./TicketFormsSection";
import PuvTypesSection from "./PuvTypesSection";
import RoutesSection from "./RoutesSection";
import SystemSection from "./SystemSection";
import { SETTINGS_SECTIONS, SETTINGS_BASE, canViewSection } from "./settingsSections";
import "../../../styles/Settings.css";
import "../../../styles/SettingsUi.css";

const DeleteIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);

const ArchiveIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
    <path d="M10 12h4" />
  </svg>
);

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M5 12h14" /><path d="M12 5v14" />
  </svg>
);

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" />
  </svg>
);

const UploadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 21V9" /><path d="M7 14l5-5 5 5" /><path d="M4 3h16" />
  </svg>
);

const RollbackIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 4 3 9 8 9" />
  </svg>
);

const BusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="6" width="18" height="11" rx="2" />
    <path d="M3 12h18" />
    <circle cx="7.5" cy="19" r="1.5" />
    <circle cx="16.5" cy="19" r="1.5" />
  </svg>
);

const RouteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

const TicketIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
    <line x1="12" y1="6" x2="12" y2="18" strokeDasharray="2 2" />
  </svg>
);

const fmtPeso = (n) => `₱${Number(n || 0).toFixed(2)}`;
const routeLabel = (r) => `${r.origin} → San Fernando`;
const FALLBACK_ERROR = "Nothing was changed. Check your connection and try again.";
const errorMessage = (err) => err?.message?.replace(/^Error:\s*/, "") || FALLBACK_ERROR;

// Adds/clears one row's working state ({ kind: "busy" | "danger", label }) while `fn` runs.
async function withRow(setRows, id, state, fn) {
  setRows((prev) => ({ ...prev, [id]: state }));
  try {
    return await fn();
  } finally {
    setRows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }
}

const fetchPuvTypes = () => apiService.getPUVTypes();
const fetchRoutes = () => apiService.getRoutes();
// Must match the names the remittance export looks up (e.g. "Cash Tickets@3").
const TICKET_FORM_PREFIX = "Cash Tickets@";
const fetchTicketForms =() => apiService.getTicketForms();

// Loads a list once (skeleton rows while `loading`), and can be re-run quietly with `reload`.
// A failed load shows the centered error with "Try again".
function useListLoader(fetcher, errorTitle, notify) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(null);

  const load = useCallback(() => {
    fetcher()
      .then(setList)
      .catch((err) => {
        console.error(errorTitle, err);
        notify.error({
          title: errorTitle,
          message: errorMessage(err),
          onRetry: () => { setLoading(true); loadRef.current(); },
        });
      })
      .finally(() => setLoading(false));
  }, [fetcher, errorTitle, notify]);

  useEffect(() => {
    loadRef.current = load;
    load();
  }, [load]);

  return { list, setList, loading, reload: load };
}

function SettingsPage() {
  // The active section comes from the URL: /dashboard/settings/<section>
  const { pathname } = useLocation();
  const activeTab = pathname.split("/").filter(Boolean)[2]?.toLowerCase() || "";
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    apiService.getCurrentUser()
      .then((user) => setUserRole((user?.role || "").toUpperCase()))
      .catch((err) => console.error("Failed to load current user:", err));
  }, []);

  const isAdmin = userRole === "SUPERADMIN";
  const canManageBackfill = ["SUPERADMIN", "SUPERVISOR", "MANAGER"].includes(userRole);

  const { notify, report, confirmAction } = useFeedback();

  const { list: puvTypes, setList: setPuvTypes, loading: loadingPuv, reload: loadPuvTypes } = useListLoader(fetchPuvTypes, "Couldn't load PUV types", notify);
  const [newType, setNewType] = useState("");
  const [newTypePrice, setNewTypePrice] = useState("");
  const [puvPriceInputs, setPuvPriceInputs] = useState({});
  const [puvRows, setPuvRows] = useState({});
  const [addingPuv, setAddingPuv] = useState(false);

  const { list: routes, setList: setRoutes, loading: loadingRoutes, reload: loadRoutes } = useListLoader(fetchRoutes, "Couldn't load routes", notify);
  const [newOrigin, setNewOrigin] = useState("");
  const [routeEstimateInputs, setRouteEstimateInputs] = useState({});
  const [routeRows, setRouteRows] = useState({});
  const [addingRoute, setAddingRoute] = useState(false);

  const { list: ticketForms, setList: setTicketForms, loading: loadingForms } = useListLoader(fetchTicketForms, "Couldn't load ticket forms", notify);
  const [newTicketForm, setNewTicketForm] = useState("");
  const [formRows, setFormRows] = useState({});
  const [addingForm, setAddingForm] = useState(false);

  // Each section needs its own independent search/add-modal state.
  const [puvSearch, setPuvSearch] = useState("");
  const [puvModalOpen, setPuvModalOpen] = useState(false);
  const [routesSearch, setRoutesSearch] = useState("");
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [ticketFormsSearch, setTicketFormsSearch] = useState("");
  const [ticketFormModalOpen, setTicketFormModalOpen] = useState(false);

  // ── PUV types ──
  const addPuvType = async () => {
    if (!newType.trim()) {
      notify.error({ title: "Name is required", message: "Enter a name for the PUV type." });
      return;
    }
    setAddingPuv(true);
    try {
      const created = await apiService.createPUVType({ name: newType, terminal_price: parseFloat(newTypePrice) || 0 });
      setPuvTypes((prev) => [...prev, created]);
      setNewType("");
      setNewTypePrice("");
      setPuvModalOpen(false);
      notify.success({ title: "PUV type added", message: `${created.name} is ready to use.` });
    } catch (err) {
      console.error("Failed to create:", err);
      notify.error({ title: "Couldn't add PUV type", message: errorMessage(err), onRetry: addPuvType });
    } finally {
      setAddingPuv(false);
    }
  };

  const savePuvPrice = (pt, price) => withRow(setPuvRows, pt.id, { kind: "busy", label: "Saving..." }, async () => {
    try {
      const updated = await apiService.updatePUVType(pt.id, { name: pt.name, terminal_price: price });
      setPuvTypes((prev) => prev.map((p) => (p.id === pt.id ? updated : p)));
      setPuvPriceInputs(({ ...rest }) => (delete rest[pt.id], rest));
      return { success: { title: "Changes saved", message: `Terminal fee for ${pt.name} updated to ${fmtPeso(price)}.` } };
    } catch (err) {
      console.error("Failed to save terminal price:", err);
      return { error: { title: "Couldn't save changes", message: errorMessage(err), onRetry: () => savePuvPrice(pt, price).then(report) } };
    }
  });

  // Kept from the earlier request: changing a terminal fee asks first.
  const handleSavePuvPrice = (pt) => {
    const price = parseFloat(puvPriceInputs[pt.id]);
    if (isNaN(price) || price < 0) {
      notify.error({ title: "Check the fee", message: "Terminal fee must be 0 or more." });
      return;
    }
    confirmAction({
      title: "Change terminal fee?",
      message: `Change the terminal fee for "${pt.name}" from ${fmtPeso(pt.terminal_price)} to ${fmtPeso(price)}?`,
      confirmLabel: "Save",
      busyLabel: "Saving...",
      tone: "primary",
      run: () => savePuvPrice(pt, price),
    });
  };

  // PUV types and routes are archived rather than deleted so the vehicles and
  // tickets that reference them keep their data (restore from the Archive tab).
  const impactNote = (counts) => {
    const used = counts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
    return used.length
      ? `${used.join(" and ")} use it. They keep their records, but it won't be selectable for new ones.`
      : "Nothing uses it yet. It will be hidden from selection.";
  };

  const undoArchivePuvType = async (pt) => {
    try {
      const restored = await apiService.updatePUVType(pt.id, { name: pt.name, terminal_price: pt.terminal_price, is_archived: false });
      setPuvTypes((prev) => [...prev, restored]);
      notify.success({ title: "PUV type restored", message: `${pt.name} is back in PUV types.` });
    } catch (err) {
      console.error("Failed to undo archive:", err);
      notify.error({ title: "Couldn't undo", message: errorMessage(err), onRetry: () => undoArchivePuvType(pt) });
    }
  };

  const archivePuvType = (pt) => withRow(setPuvRows, pt.id, { kind: "danger", label: "Archiving..." }, async () => {
    try {
      await apiService.updatePUVType(pt.id, { name: pt.name, terminal_price: pt.terminal_price, is_archived: true });
      setPuvTypes((prev) => prev.filter((p) => p.id !== pt.id));
      return {
        success: {
          title: "PUV type archived",
          message: `${pt.name} was moved to Archive.`,
          undo: { label: "Undo", onUndo: () => undoArchivePuvType(pt) },
        },
      };
    } catch (err) {
      console.error("Failed to archive PUV type:", err);
      return { error: { title: "Couldn't archive PUV type", message: errorMessage(err), onRetry: () => archivePuvType(pt).then(report) } };
    }
  });

  const handleArchivePUVType = (pt) => confirmAction({
    title: "Archive this PUV type?",
    message: `"${pt.name}": ${impactNote([[pt.vehicle_count, "vehicle(s)"]])} You can restore it from the Archive tab.`,
    confirmLabel: "Archive",
    busyLabel: "Archiving...",
    run: () => archivePuvType(pt),
  });

  // ── Routes ──
  const addRoute = async () => {
    if (!newOrigin.trim()) {
      notify.error({ title: "Route origin is required", message: "Enter where the route starts." });
      return;
    }
    setAddingRoute(true);
    try {
      const created = await apiService.createRoute({ origin: newOrigin.trim().toUpperCase() });
      setRoutes((prev) => [...prev, created]);
      setNewOrigin("");
      setRouteModalOpen(false);
      notify.success({ title: "Route added", message: `${routeLabel(created)} is ready to use.` });
    } catch (err) {
      console.error("Failed to create route:", err);
      notify.error({ title: "Couldn't add route", message: errorMessage(err), onRetry: addRoute });
    } finally {
      setAddingRoute(false);
    }
  };

  const undoArchiveRoute = async (route) => {
    try {
      const restored = await apiService.updateRoute(route.id, { origin: route.origin, is_archived: false });
      setRoutes((prev) => [...prev, restored]);
      notify.success({ title: "Route restored", message: `${routeLabel(route)} is back in Routes.` });
    } catch (err) {
      console.error("Failed to undo archive:", err);
      notify.error({ title: "Couldn't undo", message: errorMessage(err), onRetry: () => undoArchiveRoute(route) });
    }
  };

  const archiveRoute = (route) => withRow(setRouteRows, route.id, { kind: "danger", label: "Archiving..." }, async () => {
    try {
      await apiService.updateRoute(route.id, { origin: route.origin, is_archived: true });
      setRoutes((prev) => prev.filter((r) => r.id !== route.id));
      return {
        success: {
          title: "Route archived",
          message: `${routeLabel(route)} was moved to Archive.`,
          undo: { label: "Undo", onUndo: () => undoArchiveRoute(route) },
        },
      };
    } catch (err) {
      console.error("Failed to archive route:", err);
      return { error: { title: "Couldn't archive route", message: errorMessage(err), onRetry: () => archiveRoute(route).then(report) } };
    }
  });

  const handleArchiveRoute = (route) => confirmAction({
    title: "Archive this route?",
    message: `"${routeLabel(route)}": ${impactNote([[route.vehicle_count, "vehicle(s)"], [route.ticket_count, "ticket(s)"]])} You can restore it from the Archive tab.`,
    confirmLabel: "Archive",
    busyLabel: "Archiving...",
    run: () => archiveRoute(route),
  });

  const saveRouteEstimate = (route, minutes) => withRow(setRouteRows, route.id, { kind: "busy", label: "Saving..." }, async () => {
    try {
      const updated = await apiService.updateRoute(route.id, {
        origin: route.origin,
        estimated_loading_minutes: minutes,
      });
      setRoutes((prev) => prev.map((r) => (r.id === route.id ? updated : r)));
      setRouteEstimateInputs(({ ...rest }) => (delete rest[route.id], rest));
      return { success: { title: "Changes saved", message: `${routeLabel(route)} updated.` } };
    } catch (err) {
      console.error("Failed to save estimated loading time:", err);
      return { error: { title: "Couldn't save changes", message: errorMessage(err), onRetry: () => saveRouteEstimate(route, minutes).then(report) } };
    }
  });

  const handleSaveRouteEstimate = (route) => {
    const raw = routeEstimateInputs[route.id];
    const minutes = raw === "" || raw == null ? null : parseInt(raw, 10);
    if (raw !== "" && raw != null && (isNaN(minutes) || minutes < 0)) {
      notify.error({ title: "Check the loading time", message: "Enter a whole number of minutes." });
      return;
    }
    saveRouteEstimate(route, minutes).then(report);
  };

  // ── Ticket forms ──
  const addTicketForm = async () => {
    const ticketAmount = newTicketForm.trim();
    if (!/^[1-9]\d*$/.test(ticketAmount)) {
      notify.error({ title: "Cash ticket number is required", message: "Enter a whole number, e.g. 3." });
      return;
    }
    const ticketFormName = `${TICKET_FORM_PREFIX}${ticketAmount}`;
    if (ticketForms.some((t) => t.name?.toLowerCase() === ticketFormName.toLowerCase())) {
      notify.error({ title: "Already exists", message: `${ticketFormName} is already configured.` });
      return;
    }
    setAddingForm(true);
    try {
      const created = await apiService.createTicketForm({ name: ticketFormName, price: parseInt(ticketAmount, 10) });
      setTicketForms((prev) => [...prev, created]);
      setNewTicketForm("");
      setTicketFormModalOpen(false);
      notify.success({ title: "Ticket form added", message: `${created.name} is ready to use.` });
    } catch (err) {
      console.error("Failed to create ticket form:", err);
      notify.error({ title: "Couldn't add ticket form", message: errorMessage(err), onRetry: addTicketForm });
    } finally {
      setAddingForm(false);
    }
  };

  const deleteTicketForm = (form) => withRow(setFormRows, form.id, { kind: "danger", label: "Deleting..." }, async () => {
    try {
      await apiService.deleteTicketForm(form.id);
      setTicketForms((prev) => prev.filter((t) => t.id !== form.id));
      return { success: { title: "Ticket form deleted", message: `${form.name} was deleted. This can't be undone.` } };
    } catch (err) {
      console.error("Failed to delete ticket form:", err);
      return { error: { title: "Couldn't delete ticket form", message: errorMessage(err), onRetry: () => deleteTicketForm(form).then(report) } };
    }
  });

  const handleDeleteTicketForm = (id) => {
    const form = ticketForms.find((t) => t.id === id);
    if (!form) return;
    confirmAction({
      title: "Delete this ticket form?",
      message: `"${form.name}" will be permanently deleted. This can't be undone.`,
      confirmLabel: "Delete",
      busyLabel: "Deleting...",
      run: () => deleteTicketForm(form),
    });
  };

  // ── Backups & restore ──
  const [systemBackups, setSystemBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [newBackupLabel, setNewBackupLabel] = useState("");
  const [backupRows, setBackupRows] = useState({});

  const refreshBackups = useCallback(async () => {
    const res = await apiService.getSystemBackups();
    setSystemBackups(res.backups || []);
  }, []);

  useEffect(() => {
    if (activeTab !== "system" || !isAdmin) return;
    apiService.getSystemBackups()
      .then((res) => setSystemBackups(res.backups || []))
      .catch((err) => {
        console.error("Failed to load backups:", err);
        notify.error({ title: "Couldn't load backups", message: errorMessage(err), onRetry: () => refreshBackups().catch(() => {}) });
      })
      .finally(() => setBackupsLoading(false));
  }, [activeTab, isAdmin, refreshBackups, notify]);

  // Long operations (create, roll back, restore from file) are driven by SystemSection, which shows
  // the step dialog. `onStage` is called once the server call has finished and only the refresh is left.
  const createBackupOutcome = async (onStage) => {
    try {
      // The picker needs the click's user gesture, so it opens before the slow server call.
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");
      const handle = await apiService.pickBackupSaveHandle(`backup_${stamp}.json`).catch(() => null);
      const record = await apiService.createSystemBackup(newBackupLabel.trim());
      onStage?.();
      setNewBackupLabel("");
      await refreshBackups();
      try {
        await apiService.downloadSystemBackup(record.id, record.filename, handle);
      } catch (err) {
        console.error("Backup created but download failed:", err);
        return { success: { title: "Backup created", message: "The download failed; use Download in the list." } };
      }
      return { success: { title: "Backup created", message: "A copy was downloaded." } };
    } catch (err) {
      console.error("Failed to create backup:", err);
      return { error: { title: "Couldn't create backup", message: errorMessage(err) } };
    }
  };

  const rollbackOutcome = async (backup, onStage) => {
    try {
      await apiService.restoreSystemBackup(backup.id);
      onStage?.();
      await refreshBackups();
      return { success: { title: "System restored", message: "A safety snapshot was saved." } };
    } catch (err) {
      console.error("Failed to roll back:", err);
      return { error: { title: "Couldn't roll back", message: errorMessage(err) } };
    }
  };

  const restoreFileOutcome = async (file, onStage) => {
    try {
      await apiService.restoreSystemBackupUpload(file);
      onStage?.();
      await refreshBackups();
      return { success: { title: "System restored", message: "A safety snapshot was saved." } };
    } catch (err) {
      console.error("Failed to restore from file:", err);
      return { error: { title: "Couldn't restore backup", message: errorMessage(err) } };
    }
  };

  const deleteBackup = (backup) => withRow(setBackupRows, backup.id, { kind: "danger", label: "Deleting..." }, async () => {
    try {
      await apiService.deleteSystemBackup(backup.id);
      await refreshBackups();
      return { success: { title: "Backup deleted", message: "This can't be undone." } };
    } catch (err) {
      console.error("Failed to delete backup:", err);
      return { error: { title: "Couldn't delete backup", message: errorMessage(err), onRetry: () => deleteBackup(backup).then(report) } };
    }
  });

  const handleDeleteBackup = (backup) => confirmAction({
    title: "Delete this backup?",
    message: `"${backup.label || backup.filename}" will be permanently deleted. This can't be undone.`,
    confirmLabel: "Delete",
    busyLabel: "Deleting...",
    run: () => deleteBackup(backup),
  });

  const handleDownloadBackup = async (backup) => {
    try {
      await apiService.downloadSystemBackup(backup.id, backup.filename);
    } catch (err) {
      console.error("Failed to download backup:", err);
      notify.error({ title: "Couldn't download backup", message: errorMessage(err), onRetry: () => handleDownloadBackup(backup) });
    }
  };

  // Wait for the role before guarding, otherwise every deep link would bounce.
  if (!userRole) return <div className="set-page" />;

  // Unknown or role-restricted sections fall back to the first visible one.
  const currentSection = SETTINGS_SECTIONS.find(s => s.key === activeTab);
  if (!currentSection || !canViewSection(currentSection, userRole)) {
    const first = SETTINGS_SECTIONS.find(s => canViewSection(s, userRole));
    return <Navigate to={`${SETTINGS_BASE}/${first.key}`} replace />;
  }

  const isKitSection = ["ticket-forms", "puv-types", "routes", "archive", "system"].includes(activeTab);

  return (
    <div className="set-page">
      {/* Header */}
      <div className="set-header">
        <div className="set-header-left">
          <div>
            <h1 className="set-title">Settings</h1>          </div>
        </div>
      </div>

      <div className="set-layout">
        <SettingsNav
          role={userRole}
          counts={{
            "ticket-forms": ticketForms.length,
            "puv-types": puvTypes.length,
            routes: routes.length,
          }}
        />

        {/* Panel */}
        <div className={isKitSection ? "set-pane" : "set-panel"}>
        {activeTab === "ticket-forms" && (
          <TicketFormsSection
            ticketForms={ticketForms}
            loading={loadingForms}
            rowStates={formRows}
            search={ticketFormsSearch}
            onSearch={setTicketFormsSearch}
            onAdd={() => setTicketFormModalOpen(true)}
            onDelete={handleDeleteTicketForm}
          />
        )}

        {activeTab === "puv-types" && (
          <PuvTypesSection
            puvTypes={puvTypes}
            loading={loadingPuv}
            rowStates={puvRows}
            search={puvSearch}
            onSearch={setPuvSearch}
            onAdd={() => setPuvModalOpen(true)}
            priceInputs={puvPriceInputs}
            onPriceChange={(id, value) => setPuvPriceInputs({ ...puvPriceInputs, [id]: value })}
            onSavePrice={handleSavePuvPrice}
            onRevertPrice={(id) => setPuvPriceInputs(({ ...rest }) => (delete rest[id], rest))}
            onArchive={handleArchivePUVType}
          />
        )}

        {activeTab === "routes" && (
          <RoutesSection
            routes={routes}
            loading={loadingRoutes}
            rowStates={routeRows}
            search={routesSearch}
            onSearch={setRoutesSearch}
            onAdd={() => setRouteModalOpen(true)}
            estimateInputs={routeEstimateInputs}
            onEstimateChange={(id, value) => setRouteEstimateInputs({ ...routeEstimateInputs, [id]: value })}
            onSaveEstimate={handleSaveRouteEstimate}
            onRevertEstimate={(id) => setRouteEstimateInputs(({ ...rest }) => (delete rest[id], rest))}
            onArchive={handleArchiveRoute}
          />
        )}

        {/* Ticket Backfill (manual entry + CSV) + WIP mode */}
        {activeTab === "ticket-backfill" && canManageBackfill && (
          <div className="set-section">
            <div className="set-panel-toolbar">
              <div className="set-panel-heading">
                <h2 className="set-panel-title">Ticket Backfill</h2>
              </div>
            </div>
            <TicketBackfillTab />
          </div>
        )}

        {/* Archive: restore archived vehicles, drivers, requisitions, remittance */}
        {activeTab === "archive" && (
          <ArchiveTab onRestored={(key) => { if (key === "routes") loadRoutes(); if (key === "puvtypes") loadPuvTypes(); }} />
        )}

        {/* System Backup / Restore / Rollback */}
        {activeTab === "system" && isAdmin && (
          <SystemSection
            backups={systemBackups}
            loading={backupsLoading}
            rowStates={backupRows}
            label={newBackupLabel}
            onLabelChange={setNewBackupLabel}
            onCreate={createBackupOutcome}
            onRestoreFile={restoreFileOutcome}
            onDownload={handleDownloadBackup}
            onRollback={rollbackOutcome}
            onDelete={handleDeleteBackup}
          />
        )}
        </div>
      </div>

      <SettingsModal
        open={puvModalOpen}
        title="Add PUV Type"
        fields={[
          { name: "name", label: "Name", placeholder: "New PUV Type" },
          { name: "terminal_price", label: "Terminal Price (₱)", type: "number", placeholder: "0 = no limit", min: "0", step: "0.01" },
        ]}
        values={{ name: newType, terminal_price: newTypePrice }}
        onChange={(field, value) => (field === "name" ? setNewType(value) : setNewTypePrice(value))}
        onClose={() => setPuvModalOpen(false)}
        onSubmit={addPuvType}
        saving={addingPuv}
        submitLabel="Add"
        savingLabel="Adding..."
      />

      <SettingsModal
        open={routeModalOpen}
        title="Add Route"
        fields={[{ name: "origin", label: "Route Origin", placeholder: "New Route Origin" }]}
        values={{ origin: newOrigin }}
        onChange={(_, value) => setNewOrigin(value.toUpperCase())}
        onClose={() => setRouteModalOpen(false)}
        onSubmit={addRoute}
        saving={addingRoute}
        submitLabel="Add Route"
        savingLabel="Adding..."
      />

      <SettingsModal
        open={ticketFormModalOpen}
        title="Add Ticket Form"
        fields={[
          { name: "name", label: "Cash Ticket Number", type: "number", prefix: TICKET_FORM_PREFIX, placeholder: "e.g. 3", min: "1", step: "1" },
          { name: "price", label: "Price", readOnly: true, display: /^[1-9]\d*$/.test(newTicketForm.trim()) ? `₱${newTicketForm.trim()}.00` : "Matches the ticket number" },
        ]}
        values={{ name: newTicketForm }}
        onChange={(_, value) => setNewTicketForm(value)}
        onClose={() => setTicketFormModalOpen(false)}
        onSubmit={addTicketForm}
        saving={addingForm}
        submitLabel="Add Ticket Form"
        savingLabel="Adding..."
      />
    </div>
  );
}

export default SettingsPage;
