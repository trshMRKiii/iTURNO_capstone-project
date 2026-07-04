import { useState, useEffect } from "react";
import { apiService } from "../../../lib/api-service";
import DriverRewardModal from "./DriverRewardModal";
import "../../../styles/Rewards.css";

const PAGE_SIZE = 10;

const BACKEND_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : `http://${window.location.hostname}:8000`;

export function driverPhotoUrl(driver) {
  if (!driver?.photo) return null;
  return driver.photo.startsWith("http") ? driver.photo : `${BACKEND_URL}${driver.photo}`;
}

export function DriverAvatar({ driver, className }) {
  const [broken, setBroken] = useState(false);
  const url = driverPhotoUrl(driver);

  if (url && !broken) {
    return (
      <img
        className={className}
        src={url}
        alt={`${driver.first_name} ${driver.last_name}`}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className={className}>
      {driver.last_name?.[0]}{driver.first_name?.[0]}
    </div>
  );
}

export default function Rewards() {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [rewardConfig, setRewardConfig] = useState({
    points_per_redemption: 1000,
    peso_value_per_redemption: 500,
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const loadLeaderboard = () => {
    apiService.getRewardLeaderboard().then((res) => {
      setLeaderboard(res.leaderboard || []);
    });
  };

  useEffect(() => {
    apiService.getDrivers().then((res) => {
      const list = Array.isArray(res) ? res : res.results || [];
      setDrivers(list.filter((d) => !d.is_archived));
    });
    loadLeaderboard();
    apiService.getRewardConfig().then((cfg) => {
      if (cfg) setRewardConfig(cfg);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const filteredDrivers = drivers.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.first_name?.toLowerCase().includes(q) ||
      d.last_name?.toLowerCase().includes(q) ||
      d.iwp_number?.toLowerCase().includes(q)
    );
  });

  const sortedDrivers = [...filteredDrivers].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "iwp") {
      cmp = (a.iwp_number || "").localeCompare(b.iwp_number || "");
    } else {
      const nameA = `${a.last_name || ""}, ${a.first_name || ""}`;
      const nameB = `${b.last_name || ""}, ${b.first_name || ""}`;
      cmp = nameA.localeCompare(nameB);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sortedDrivers.length / PAGE_SIZE));
  const pagedDrivers = sortedDrivers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="rw-page">
      <div className="col-header">
        <div className="col-header-left">
          <div className="col-header-accent" />
          <div>
            <h1 className="col-title">Driver Rewards</h1>
            <p className="col-subtitle">
              Points system for driver queue loyalty
            </p>
          </div>
        </div>
      </div>

      <div className="rw-layout rw-layout--full">
        {/* ── Driver Picker ── */}
        <div className="rw-panel">
          <div className="rw-search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="rw-search"
              placeholder="Search driver..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="rw-list-toolbar">
            <select
              className="rw-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              title="Sort by"
            >
              <option value="name">Sort: Name</option>
              <option value="iwp">Sort: IWP #</option>
            </select>
            <button
              type="button"
              className={`rw-sort-dir-btn${sortDir === "desc" ? " rw-sort-dir-btn--desc" : ""}`}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5v14M11 5 7 9M11 5l4 4" />
              </svg>
            </button>
          </div>

          <div className="rw-driver-list rw-driver-list--full">
            {pagedDrivers.map((d) => (
              <button
                key={d.id}
                className="rw-driver-item"
                onClick={() => setSelectedDriver(d)}
              >
                <DriverAvatar driver={d} className="rw-driver-avatar" />
                <div className="rw-driver-info">
                  <span className="rw-driver-name">{d.last_name}, {d.first_name}</span>
                  <span className="rw-driver-sub">{d.iwp_number || "No IWP"}</span>
                </div>
              </button>
            ))}
            {pagedDrivers.length === 0 && (
              <div className="rw-empty">No drivers found</div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="rw-pagination">
              <button
                className="rw-page-btn"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span className="rw-page-info">
                Page {page} of {totalPages}
              </span>
              <button
                className="rw-page-btn"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* ── Leaderboard ── */}
        <div className="rw-leaderboard">
          <div className="rw-leaderboard-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <span>Leaderboard</span>
            <span className="rw-leaderboard-count">{leaderboard.length}</span>
          </div>
          <div className="rw-leaderboard-body">
            {leaderboard.map((entry, idx) => (
              <div key={entry.id} className="rw-lb-item">
                <div className={`rw-lb-rank${idx < 3 ? " rw-lb-rank--top" : ""}`}>
                  {idx + 1}
                </div>
                <div className="rw-lb-info">
                  <span className="rw-lb-name">{entry.driver_name}</span>
                </div>
                <span className="rw-lb-pts">{entry.total_points.toLocaleString()}</span>
              </div>
            ))}
            {leaderboard.length === 0 && (
              <div className="rw-empty">No data yet</div>
            )}
          </div>
        </div>
      </div>

      {selectedDriver && (
        <DriverRewardModal
          driver={selectedDriver}
          rewardConfig={rewardConfig}
          onClose={() => setSelectedDriver(null)}
          onRedeemed={loadLeaderboard}
        />
      )}
    </div>
  );
}
