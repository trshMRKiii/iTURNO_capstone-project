import React, { useState, useCallback, useRef } from "react";
import Vehicle from "../vehicle/vehicle";
import Driver from "../driver/driver";
import "../../../styles/Registry.css";

function Registry() {
  const [activeTab, setActiveTab] = useState("vehicles");
  const [vehSearch, setVehSearch] = useState("");
  const [drvSearch, setDrvSearch] = useState("");

  const vehAddRef = useRef(null);
  const drvAddRef = useRef(null);
  const vehExportQRRef = useRef(null);

  const exposeVehAdd = useCallback((fn) => { vehAddRef.current = fn; }, []);
  const exposeDrvAdd = useCallback((fn) => { drvAddRef.current = fn; }, []);
  const exposeVehExportQR = useCallback((fn) => { vehExportQRRef.current = fn; }, []);

  const searchTerm = activeTab === "vehicles" ? vehSearch : drvSearch;
  const setSearchTerm = activeTab === "vehicles" ? setVehSearch : setDrvSearch;
  const placeholder = activeTab === "vehicles"
    ? "Search by plate or route…"
    : "Search by IWP or name…";
  const addLabel = activeTab === "vehicles" ? "Register Vehicle" : "Register Driver";

  const handleAdd = () => {
    if (activeTab === "vehicles") vehAddRef.current?.();
    else drvAddRef.current?.();
  };

  return (
    <div className="reg-page">
      {/* Header */}
      <div className="reg-header">
        <div className="reg-header-left">
          <div className="reg-header-accent" />
          <div>
            <h1 className="reg-title">Fleet &amp; Personnel Registry</h1>
            <p className="reg-subtitle">
              Manage registered vehicles, drivers, and assignments
            </p>
          </div>
        </div>
        <div className="reg-header-right">
          <div className="reg-search-wrap">
            <svg className="reg-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="reg-search"
              placeholder={placeholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {activeTab === "vehicles" && (
            <button className="reg-export-qr-btn" onClick={() => vehExportQRRef.current?.()} title="Export QR codes for filtered vehicles">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="3" height="3" rx="0.5" />
                <rect x="18" y="14" width="3" height="3" rx="0.5" />
                <rect x="14" y="18" width="3" height="3" rx="0.5" />
                <rect x="18" y="18" width="3" height="3" rx="0.5" />
              </svg>
              Export QR
            </button>
          )}
          <button className="reg-add-btn" onClick={handleAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            {addLabel}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="reg-tabs">
        <button
          className={`reg-tab ${activeTab === "vehicles" ? "reg-tab--active" : ""}`}
          onClick={() => setActiveTab("vehicles")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="3" width="15" height="13" rx="1" />
            <path d="M16 8h4l3 3v5h-7V8z" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          Vehicles
        </button>
        <button
          className={`reg-tab ${activeTab === "drivers" ? "reg-tab--active" : ""}`}
          onClick={() => setActiveTab("drivers")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Drivers
        </button>
      </div>

      {/* Tab content */}
      <div className="reg-content">
        {activeTab === "vehicles" && (
          <Vehicle
            embedded
            searchTerm={vehSearch}
            onSearchChange={setVehSearch}
            exposeAdd={exposeVehAdd}
            exposeExportQR={exposeVehExportQR}
          />
        )}
        {activeTab === "drivers" && (
          <Driver
            embedded
            searchTerm={drvSearch}
            onSearchChange={setDrvSearch}
            exposeAdd={exposeDrvAdd}
          />
        )}
      </div>
    </div>
  );
}

export default Registry;
