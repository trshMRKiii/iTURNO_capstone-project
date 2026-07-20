import React, { useEffect, useState } from "react";
import { apiService } from "../../../lib/api-service";
import { useToast, useConfirm } from "../../../components/ui/ToastConfirmContext";
import { useTerminalPrice } from "../../../lib/useTerminalPrice";
import SettingsModal from "../../../components/ui/settingsModal";
import "../../../styles/Settings.css";

const TABS = [
  {
    key: "puv",
    label: "PUV Types",
    description: "Vehicle classifications used across the system",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="3" width="15" height="13" rx="1" />
        <path d="M16 8h4l3 3v5h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    key: "routes",
    label: "Routes",
    description: "Origin points connected to the terminal",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="10" r="3" />
        <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
      </svg>
    ),
  },
  {
    key: "ticketForms",
    label: "Ticket Forms",
    description: "Ticket types and their corresponding prices",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
  {
    key: "terminalPrice",
    label: "Terminal Price",
    description: "Maximum total collection amount allowed per issued ticket",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v12" />
        <path d="M15 9.5c0-1.38-1.34-2.5-3-2.5s-3 1.12-3 2.5 1.34 2.5 3 2.5 3 1.12 3 2.5-1.34 2.5-3 2.5-3-1.12-3-2.5" />
      </svg>
    ),
  },
  {
    key: "system",
    label: "System",
    description: "Backup, restore, and roll back the entire system",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
];

const DeleteIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
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

const formatBytes = (bytes) => {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

function Settings() {
  const [activeTab, setActiveTab] = useState("puv");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    apiService.getCurrentUser()
      .then((user) => setIsAdmin((user?.role || "").toUpperCase() === "SUPERADMIN"))
      .catch((err) => console.error("Failed to load current user:", err));
  }, []);

  const visibleTabs = isAdmin ? TABS : TABS.filter(tab => tab.key !== "system");

  const [puvTypes, setPuvTypes] = useState([]);
  const [newType, setNewType] = useState("");

  const [routes, setRoutes] = useState([]);
  const [newOrigin, setNewOrigin] = useState("");

  const [ticketForms, setTicketForms] = useState([]);
  const [newTicketForm, setNewTicketForm] = useState("");
  const [newTicketFormPrice, setNewTicketFormPrice] = useState("");

  const showToast = useToast();

  const [search, setSearch] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);

  const {
    terminalPrice,
    loading: terminalPriceLoading,
    error: terminalPriceError,
    updateTerminalPrice,
  } = useTerminalPrice();
  const [terminalPriceInput, setTerminalPriceInput] = useState("");
  const [savingTerminalPrice, setSavingTerminalPrice] = useState(false);

  useEffect(() => {
    if (terminalPrice) {
      setTerminalPriceInput(String(terminalPrice.amount ?? ""));
    }
  }, [terminalPrice]);

  const handleSaveTerminalPrice = async () => {
    setSavingTerminalPrice(true);
    try {
      await updateTerminalPrice(parseFloat(terminalPriceInput) || 0);
      showToast?.("Terminal price saved", "success");
    } catch (err) {
      console.error("Failed to save terminal price", err);
      showToast?.("Failed to save terminal price", "info");
    } finally {
      setSavingTerminalPrice(false);
    }
  };
  useEffect(() => {
    apiService.getPUVTypes()
      .then(setPuvTypes)
      .catch(err => console.error("Failed to load PUV Types:", err));
  }, []);

  const handleAddPUVType = async () => {
    if (!newType.trim()) return;
    try {
      const created = await apiService.createPUVType({ name: newType });
      setPuvTypes([...puvTypes, created]);
      setNewType("");
      setAddModalOpen(false);
    } catch (err) {
      console.error("Failed to create:", err);
    }
  };

  const handleDeletePUVType = async (id) => {
    try {
      await apiService.deletePUVType(id);
      setPuvTypes(puvTypes.filter(pt => pt.id !== id));
    } catch (err) {
      console.error("Failed to delete PUV type:", err);
    }
  };

  useEffect(() => {
    apiService.getRoutes()
      .then(setRoutes)
      .catch(err => console.error("Failed to load routes:", err));
  }, []);

  const handleAddRoute = async () => {
    if (!newOrigin.trim()) return;
    try {
      const created = await apiService.createRoute({ origin: newOrigin });
      setRoutes([...routes, created]);
      setNewOrigin("");
      setAddModalOpen(false);
    } catch (err) {
      console.error("Failed to create route:", err);
    }
  };

  const handleDeleteRoute = async (id) => {
    try {
      await apiService.deleteRoute(id);
      setRoutes(routes.filter(r => r.id !== id));
    } catch (err) {
      console.error("Failed to delete route:", err);
    }
  };

  useEffect(() => {
    apiService.getTicketForms()
      .then(setTicketForms)
      .catch(err => console.error("Failed to load ticket forms:", err));
  }, []);

  const handleAddTicketForm = async () => {
    if (!newTicketForm.trim()) return;
    try {
      const created = await apiService.createTicketForm({ name: newTicketForm, price: parseFloat(newTicketFormPrice) || 0 });
      setTicketForms([...ticketForms, created]);
      setNewTicketForm("");
      setNewTicketFormPrice("");
      setAddModalOpen(false);
    } catch (err) {
      console.error("Failed to create ticket form:", err);
    }
  };

  const handleDeleteTicketForm = async (id) => {
    try {
      await apiService.deleteTicketForm(id);
      setTicketForms(ticketForms.filter(t => t.id !== id));
    } catch (err) {
      console.error("Failed to delete ticket form:", err);
    }
  };

  const showConfirm = useConfirm();
  const [systemBackups, setSystemBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [newBackupLabel, setNewBackupLabel] = useState("");
  const [busyBackupId, setBusyBackupId] = useState(null);
  const [uploadingRestore, setUploadingRestore] = useState(false);
  const restoreUploadRef = React.useRef(null);

  const fetchSystemBackups = async () => {
    setBackupsLoading(true);
    try {
      const res = await apiService.getSystemBackups();
      setSystemBackups(res.backups || []);
    } catch (err) {
      console.error("Failed to load backups:", err);
      showToast?.("Failed to load backups", "info");
    } finally {
      setBackupsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "system" || !isAdmin) return;
    setBackupsLoading(true);
    apiService.getSystemBackups()
      .then(res => setSystemBackups(res.backups || []))
      .catch(err => {
        console.error("Failed to load backups:", err);
        showToast?.("Failed to load backups", "info");
      })
      .finally(() => setBackupsLoading(false));
  }, [activeTab, isAdmin]);

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      await apiService.createSystemBackup(newBackupLabel.trim());
      setNewBackupLabel("");
      showToast?.("System backup created", "success");
      await fetchSystemBackups();
    } catch (err) {
      console.error("Failed to create backup:", err);
      showToast?.("Failed to create backup", "info");
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDeleteBackup = async (backup) => {
    const ok = await showConfirm?.(`Delete backup "${backup.label || backup.filename}"? This cannot be undone.`);
    if (!ok) return;
    setBusyBackupId(backup.id);
    try {
      await apiService.deleteSystemBackup(backup.id);
      showToast?.("Backup deleted", "success");
      await fetchSystemBackups();
    } catch (err) {
      console.error("Failed to delete backup:", err);
      showToast?.("Failed to delete backup", "info");
    } finally {
      setBusyBackupId(null);
    }
  };

  const handleDownloadBackup = async (backup) => {
    try {
      await apiService.downloadSystemBackup(backup.id, backup.filename);
    } catch (err) {
      console.error("Failed to download backup:", err);
      showToast?.("Failed to download backup", "info");
    }
  };

  const handleRollbackToBackup = async (backup) => {
    const ok = await showConfirm?.(
      `Roll back the ENTIRE system to "${backup.label || backup.filename}"? All data created or changed after this backup will be permanently lost. A safety snapshot of the current state will be taken first.`
    );
    if (!ok) return;
    setBusyBackupId(backup.id);
    try {
      await apiService.restoreSystemBackup(backup.id);
      showToast?.("System rolled back successfully", "success");
      await fetchSystemBackups();
    } catch (err) {
      console.error("Failed to roll back:", err);
      showToast?.("Rollback failed. See console for details.", "info");
    } finally {
      setBusyBackupId(null);
    }
  };

  const handleRestoreUploadClick = () => {
    restoreUploadRef.current?.click();
  };

  const handleRestoreUploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const ok = await showConfirm?.(
      `Restore the ENTIRE system from "${file.name}"? All current data will be replaced. A safety snapshot of the current state will be taken first.`
    );
    if (!ok) return;

    setUploadingRestore(true);
    try {
      await apiService.restoreSystemBackupUpload(file);
      showToast?.("System restored from uploaded file", "success");
      await fetchSystemBackups();
    } catch (err) {
      console.error("Failed to restore from file:", err);
      showToast?.("Restore failed. Check the file and try again.", "info");
    } finally {
      setUploadingRestore(false);
    }
  };

  // reset search when switching tabs
  const switchTab = (key) => {
    setActiveTab(key);
    setSearch("");
    setAddModalOpen(false);
  };

  const q = search.trim().toLowerCase();

  const filteredPuvTypes = puvTypes.filter(pt => !q || pt.name?.toLowerCase().includes(q));
  const filteredRoutes = routes.filter(r => !q || r.full_name?.toLowerCase().includes(q));
  const filteredTicketForms = ticketForms.filter(tf => !q || tf.name?.toLowerCase().includes(q));

  const counts = {
    puv: puvTypes.length,
    routes: routes.length,
    ticketForms: ticketForms.length,
    terminalPrice: terminalPrice ? 1 : 0,
    system: systemBackups.length,
  };

  return (
    <div className="set-page">
      {/* Header */}
      <div className="set-header">
        <div className="set-header-left">
          <div className="set-header-accent" />
          <div>
            <h1 className="set-title">Settings</h1>
            <p className="set-subtitle">Manage PUV types, routes, ticket forms, and denominations</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="set-tabs">
        {visibleTabs.map(tab => (
          <button
            key={tab.key}
            className={`set-tab ${activeTab === tab.key ? "set-tab-active" : ""}`}
            onClick={() => switchTab(tab.key)}
          >
            <span className="set-tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
            <span className="set-tab-count">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="set-panel">
        <div className="set-panel-toolbar">
          <div className="set-panel-heading">
            <h2 className="set-panel-title">{TABS.find(t => t.key === activeTab)?.label}</h2>

          </div>
          {activeTab !== "terminalPrice" && activeTab !== "system" && (
            <div className="set-toolbar-actions">
              <button className="set-add-btn" onClick={() => setAddModalOpen(true)}>
                <PlusIcon />
                Add
              </button>
              <div className="set-search">
                <SearchIcon />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${TABS.find(t => t.key === activeTab)?.label.toLowerCase()}...`}
                />
              </div>
            </div>
          )}
        </div>

        {/* PUV Types */}
        {activeTab === "puv" && (
          <>
            <div className="set-table-wrap">
              <table className="set-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="set-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPuvTypes.length === 0 ? (
                    <tr>
                      <td colSpan="2" className="set-table-state">
                        {puvTypes.length === 0 ? "No PUV types configured" : "No matches found"}
                      </td>
                    </tr>
                  ) : (
                    filteredPuvTypes.map(pt => (
                      <tr key={pt.id} className="set-row">
                        <td className="set-cell-label">{pt.name}</td>
                        <td className="set-cell-actions">
                          <button className="set-delete-btn" onClick={() => handleDeletePUVType(pt.id)}>
                            <DeleteIcon />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Routes */}
        {activeTab === "routes" && (
          <>
            <div className="set-table-wrap">
              <table className="set-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th className="set-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutes.length === 0 ? (
                    <tr>
                      <td colSpan="2" className="set-table-state">
                        {routes.length === 0 ? "No routes configured" : "No matches found"}
                      </td>
                    </tr>
                  ) : (
                    filteredRoutes.map(route => (
                      <tr key={route.id} className="set-row">
                        <td className="set-cell-label">{route.full_name}</td>
                        <td className="set-cell-actions">
                          <button className="set-delete-btn" onClick={() => handleDeleteRoute(route.id)}>
                            <DeleteIcon />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Ticket Forms */}
        {activeTab === "ticketForms" && (
          <>
            <div className="set-table-wrap">
              <table className="set-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Price</th>
                    <th className="set-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTicketForms.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="set-table-state">
                        {ticketForms.length === 0 ? "No ticket forms configured" : "No matches found"}
                      </td>
                    </tr>
                  ) : (
                    filteredTicketForms.map(tf => (
                      <tr key={tf.id} className="set-row">
                        <td className="set-cell-label">{tf.name}</td>
                        <td className="set-cell-meta">₱{Number(tf.price || 0).toFixed(2)}</td>
                        <td className="set-cell-actions">
                          <button className="set-delete-btn" onClick={() => handleDeleteTicketForm(tf.id)}>
                            <DeleteIcon />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Terminal Price */}
        {activeTab === "terminalPrice" && (
          <div className="set-rewards-form">
            <p className="set-rewards-note">
              The terminal price is the maximum total collection amount (ticket price × quantity)
              allowed when issuing a ticket. Leave it at 0 to disable the limit.
            </p>
            {terminalPriceLoading ? (
              <p className="set-rewards-note">Loading terminal price...</p>
            ) : (
              <div className="set-add-row">
                <label className="set-field">
                  <span className="set-field-label">Terminal Price (₱)</span>
                  <input
                    type="number"
                    className="set-input"
                    min={0}
                    step="0.01"
                    value={terminalPriceInput}
                    onChange={(e) => setTerminalPriceInput(e.target.value)}
                    placeholder="0"
                  />
                </label>
              </div>
            )}
            {terminalPriceError && (
              <p className="set-rewards-note" style={{ color: "#c0392b" }}>{terminalPriceError}</p>
            )}
            <div className="set-add-row">
              <button className="set-add-btn" onClick={handleSaveTerminalPrice} disabled={savingTerminalPrice || terminalPriceLoading}>
                <PlusIcon />
                {savingTerminalPrice ? "Saving..." : "Save Terminal Price"}
              </button>
            </div>
          </div>
        )}

        {/* System Backup / Restore / Rollback */}
        {activeTab === "system" && isAdmin && (
          <div className="set-rewards-form">
            <p className="set-rewards-note">
              A backup captures the entire system — drivers, vehicles, tickets, routes,
              remittances, users, and every other record. Restoring or rolling back
              replaces ALL current data with the chosen backup. A safety snapshot of the
              current state is always taken automatically right before a restore or rollback,
              so that action itself can be undone.
            </p>

            <div className="set-add-row">
              <input
                type="text"
                className="set-input"
                value={newBackupLabel}
                onChange={(e) => setNewBackupLabel(e.target.value)}
                placeholder="Optional label, e.g. Before July payroll run"
              />
              <button className="set-add-btn" onClick={handleCreateBackup} disabled={creatingBackup}>
                <PlusIcon />
                {creatingBackup ? "Backing up..." : "Create Backup"}
              </button>
              <input
                ref={restoreUploadRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={handleRestoreUploadFile}
              />
              <button className="set-add-btn" onClick={handleRestoreUploadClick} disabled={uploadingRestore}>
                <UploadIcon />
                {uploadingRestore ? "Restoring..." : "Restore From File"}
              </button>
            </div>

            <div className="set-table-wrap">
              <table className="set-table">
                <thead>
                  <tr>
                    <th>Backup</th>
                    <th>Source</th>
                    <th>Size</th>
                    <th>Created</th>
                    <th className="set-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backupsLoading ? (
                    <tr>
                      <td colSpan="5" className="set-table-state">Loading backups...</td>
                    </tr>
                  ) : systemBackups.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="set-table-state">No backups yet</td>
                    </tr>
                  ) : (
                    systemBackups.map(b => (
                      <tr key={b.id} className="set-row">
                        <td className="set-cell-label">{b.label || b.filename}</td>
                        <td className="set-cell-meta">{b.source === "AUTO" ? "Auto (pre-restore)" : "Manual"}</td>
                        <td className="set-cell-meta">{formatBytes(b.size_bytes)}</td>
                        <td className="set-cell-meta">{new Date(b.created_at).toLocaleString()}</td>
                        <td className="set-cell-actions">
                          <button
                            className="set-add-btn"
                            onClick={() => handleDownloadBackup(b)}
                            style={{ marginRight: 6 }}
                          >
                            <DownloadIcon />
                            Download
                          </button>
                          <button
                            className="set-add-btn"
                            onClick={() => handleRollbackToBackup(b)}
                            disabled={busyBackupId === b.id}
                            style={{ marginRight: 6 }}
                          >
                            <RollbackIcon />
                            {busyBackupId === b.id ? "Working..." : "Roll Back To This"}
                          </button>
                          <button
                            className="set-delete-btn"
                            onClick={() => handleDeleteBackup(b)}
                            disabled={busyBackupId === b.id}
                          >
                            <DeleteIcon />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {activeTab === "puv" && (
        <SettingsModal
          open={addModalOpen}
          title="Add PUV Type"
          fields={[{ name: "name", label: "Name", placeholder: "New PUV Type" }]}
          values={{ name: newType }}
          onChange={(_, value) => setNewType(value)}
          onClose={() => setAddModalOpen(false)}
          onSubmit={handleAddPUVType}
          submitLabel="Add"
        />
      )}

      {activeTab === "routes" && (
        <SettingsModal
          open={addModalOpen}
          title="Add Route"
          fields={[{ name: "origin", label: "Route Origin", placeholder: "New Route Origin" }]}
          values={{ origin: newOrigin }}
          onChange={(_, value) => setNewOrigin(value)}
          onClose={() => setAddModalOpen(false)}
          onSubmit={handleAddRoute}
          submitLabel="Add Route"
        />
      )}

      {activeTab === "ticketForms" && (
        <SettingsModal
          open={addModalOpen}
          title="Add Ticket Form"
          fields={[
            { name: "name", label: "Name", placeholder: "e.g. Cash Ticket @2" },
            { name: "price", label: "Price", type: "number", placeholder: "Price", min: "0", step: "0.01" },
          ]}
          values={{ name: newTicketForm, price: newTicketFormPrice }}
          onChange={(field, value) =>
            field === "name" ? setNewTicketForm(value) : setNewTicketFormPrice(value)
          }
          onClose={() => setAddModalOpen(false)}
          onSubmit={handleAddTicketForm}
          submitLabel="Add Ticket Form"
        />
      )}
    </div>
  );
}

export default Settings;
