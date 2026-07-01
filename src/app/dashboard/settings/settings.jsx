import React, { useEffect, useState } from "react";
import { apiService } from "../../../lib/api-service";
import { useToast } from "../../../components/ui/ToastConfirmContext";
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
    key: "rewards",
    label: "Rewards",
    description: "Points redemption rules for the driver rewards program",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
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

function Settings() {
  const [activeTab, setActiveTab] = useState("puv");

  const [puvTypes, setPuvTypes] = useState([]);
  const [newType, setNewType] = useState("");

  const [routes, setRoutes] = useState([]);
  const [newOrigin, setNewOrigin] = useState("");

  const [ticketForms, setTicketForms] = useState([]);
  const [newTicketForm, setNewTicketForm] = useState("");
  const [newTicketFormPrice, setNewTicketFormPrice] = useState("");

  const [rewardConfig, setRewardConfig] = useState(null);
  const [rewardForm, setRewardForm] = useState({
    points_per_redemption: "",
    peso_value_per_redemption: "",
    max_redemptions_per_year: "",
    cooldown_months: "",
  });
  const [savingRewardConfig, setSavingRewardConfig] = useState(false);
  const showToast = useToast();

  const [search, setSearch] = useState("");

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
    } catch (err) {
      console.error("Failed to create:", err);
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

  useEffect(() => {
    apiService.getRewardConfig()
      .then((cfg) => {
        setRewardConfig(cfg);
        setRewardForm({
          points_per_redemption: cfg.points_per_redemption,
          peso_value_per_redemption: cfg.peso_value_per_redemption,
          max_redemptions_per_year: cfg.max_redemptions_per_year,
          cooldown_months: cfg.cooldown_months,
        });
      })
      .catch(err => console.error("Failed to load reward config:", err));
  }, []);

  const handleSaveRewardConfig = async () => {
    setSavingRewardConfig(true);
    try {
      const updated = await apiService.updateRewardConfig({
        points_per_redemption: parseInt(rewardForm.points_per_redemption, 10) || 0,
        peso_value_per_redemption: parseFloat(rewardForm.peso_value_per_redemption) || 0,
        max_redemptions_per_year: parseInt(rewardForm.max_redemptions_per_year, 10) || 0,
        cooldown_months: parseInt(rewardForm.cooldown_months, 10) || 0,
      });
      setRewardConfig(updated);
      showToast?.("Reward settings saved", "success");
    } catch (err) {
      console.error("Failed to save reward config:", err);
      showToast?.("Failed to save reward settings", "info");
    } finally {
      setSavingRewardConfig(false);
    }
  };

  // reset search when switching tabs
  const switchTab = (key) => {
    setActiveTab(key);
    setSearch("");
  };

  const q = search.trim().toLowerCase();

  const filteredPuvTypes = puvTypes.filter(pt => !q || pt.name?.toLowerCase().includes(q));
  const filteredRoutes = routes.filter(r => !q || r.full_name?.toLowerCase().includes(q));
  const filteredTicketForms = ticketForms.filter(tf => !q || tf.name?.toLowerCase().includes(q));

  const counts = {
    puv: puvTypes.length,
    routes: routes.length,
    ticketForms: ticketForms.length,
    rewards: rewardConfig ? 1 : 0,
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
        {TABS.map(tab => (
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
          {activeTab !== "rewards" && (
            <div className="set-search">
              <SearchIcon />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${TABS.find(t => t.key === activeTab)?.label.toLowerCase()}...`}
              />
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
                  </tr>
                </thead>
                <tbody>
                  {filteredPuvTypes.length === 0 ? (
                    <tr>
                      <td className="set-table-state">
                        {puvTypes.length === 0 ? "No PUV types configured" : "No matches found"}
                      </td>
                    </tr>
                  ) : (
                    filteredPuvTypes.map(pt => (
                      <tr key={pt.id} className="set-row">
                        <td className="set-cell-label">{pt.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="set-add-row">
              <input
                type="text"
                className="set-input"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                placeholder="New PUV Type"
              />
              <button className="set-add-btn" onClick={handleAddPUVType}>
                <PlusIcon />
                Add
              </button>
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
            <div className="set-add-row">
              <input
                type="text"
                className="set-input"
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                placeholder="New Route Origin"
              />
              <button className="set-add-btn" onClick={handleAddRoute}>
                <PlusIcon />
                Add Route
              </button>
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
            <div className="set-add-row">
              <input
                type="text"
                className="set-input"
                value={newTicketForm}
                onChange={(e) => setNewTicketForm(e.target.value)}
                placeholder="e.g. Cash Ticket @2"
              />
              <input
                type="number"
                className="set-input"
                value={newTicketFormPrice}
                onChange={(e) => setNewTicketFormPrice(e.target.value)}
                placeholder="Price"
                style={{ maxWidth: 120 }}
              />
              <button className="set-add-btn" onClick={handleAddTicketForm}>
                <PlusIcon />
                Add Ticket Form
              </button>
            </div>
          </>
        )}

        {/* Rewards */}
        {activeTab === "rewards" && (
          <div className="set-rewards-form">
            <p className="set-rewards-note">
              Drivers earn 1 point per queue logged, plus a +3 bonus for 4 queues in a day
              (replaced by +5 if they reach 5+ that same day), +10 for a 5-day consecutive
              queue streak, and +30 for being active 20+ days in a month. The settings below
              only control redemption: how many points are needed, how much they're worth in
              pesos, and the yearly limit and cooldown between redemptions.
            </p>
            <div className="set-add-row">
              <label className="set-field">
                <span className="set-field-label">Points per redemption</span>
                <input
                  type="number"
                  className="set-input"
                  value={rewardForm.points_per_redemption}
                  onChange={(e) => setRewardForm({ ...rewardForm, points_per_redemption: e.target.value })}
                  placeholder="1000"
                />
              </label>
              <label className="set-field">
                <span className="set-field-label">Peso value (₱)</span>
                <input
                  type="number"
                  className="set-input"
                  value={rewardForm.peso_value_per_redemption}
                  onChange={(e) => setRewardForm({ ...rewardForm, peso_value_per_redemption: e.target.value })}
                  placeholder="500"
                />
              </label>
            </div>
            <div className="set-add-row">
              <label className="set-field">
                <span className="set-field-label">Max redemptions per year</span>
                <input
                  type="number"
                  className="set-input"
                  value={rewardForm.max_redemptions_per_year}
                  onChange={(e) => setRewardForm({ ...rewardForm, max_redemptions_per_year: e.target.value })}
                  placeholder="2"
                />
              </label>
              <label className="set-field">
                <span className="set-field-label">Cooldown (months)</span>
                <input
                  type="number"
                  className="set-input"
                  value={rewardForm.cooldown_months}
                  onChange={(e) => setRewardForm({ ...rewardForm, cooldown_months: e.target.value })}
                  placeholder="6"
                />
              </label>
            </div>
            <div className="set-add-row">
              <button className="set-add-btn" onClick={handleSaveRewardConfig} disabled={savingRewardConfig}>
                <PlusIcon />
                {savingRewardConfig ? "Saving..." : "Save Rewards Settings"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
