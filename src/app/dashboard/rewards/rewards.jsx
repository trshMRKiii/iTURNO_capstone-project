import { useState, useEffect } from "react";
import { apiService } from "../../../lib/api-service";
import { useToast, useConfirm } from "../../../components/ui/ToastConfirmContext";
import "../../../styles/Rewards.css";

const peso = (n) =>
  "₱" +
  Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function PointsBadge({ points }) {
  return <span className="rw-pts-badge">{points.toLocaleString()} pts</span>;
}

export default function Rewards() {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const showToast = useToast();
  const showConfirm = useConfirm();

  useEffect(() => {
    apiService.getDrivers().then((res) => {
      const list = Array.isArray(res) ? res : res.results || [];
      setDrivers(list.filter((d) => !d.is_archived));
    });
    apiService.getRewardLeaderboard().then((res) => {
      setLeaderboard(res.leaderboard || []);
    });
  }, []);

  const selectDriver = async (driver) => {
    setSelectedDriver(driver);
    setLoading(true);
    try {
      const [summary, hist, redemp] = await Promise.all([
        apiService.getRewardSummary(driver.id),
        apiService.getRewardHistory(driver.id),
        apiService.getRewardRedemptions(driver.id),
      ]);
      setProfile(summary);
      setHistory(hist.transactions || []);
      setRedemptions(redemp.redemptions || []);
    } catch {
      showToast("Failed to load reward data", "info");
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!profile) return;
    const ok = await showConfirm(
      `Redeem 1,000 points for ₱500 for ${selectedDriver.last_name}, ${selectedDriver.first_name}?`
    );
    if (!ok) return;
    try {
      const res = await apiService.redeemReward(selectedDriver.id);
      if (res.error) {
        showToast(res.error, "info");
        return;
      }
      showToast("Redemption successful!", "success");
      selectDriver(selectedDriver);
      apiService.getRewardLeaderboard().then((r) => setLeaderboard(r.leaderboard || []));
    } catch {
      showToast("Redemption failed", "info");
    }
  };

  const filteredDrivers = drivers.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.first_name?.toLowerCase().includes(q) ||
      d.last_name?.toLowerCase().includes(q) ||
      d.iwp_number?.toLowerCase().includes(q)
    );
  });

  const typeLabel = (type) => {
    const map = {
      QUEUE: "Queue",
      DAILY_BONUS_4: "Daily Bonus (4)",
      DAILY_BONUS_5: "Daily Bonus (5+)",
      STREAK_BONUS: "Streak Bonus",
      MONTHLY_BONUS: "Monthly Bonus",
      REDEMPTION: "Redemption",
    };
    return map[type] || type;
  };

  const typeClass = (type) => {
    if (type === "REDEMPTION") return "rw-type-redemption";
    if (type === "QUEUE") return "rw-type-queue";
    return "rw-type-bonus";
  };

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

      <div className="rw-layout">
        {/* ── Left: Driver Picker + Leaderboard ── */}
        <div className="rw-sidebar">
          {/* Search */}
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

          {/* Driver List */}
          <div className="rw-driver-list">
            {filteredDrivers.map((d) => (
              <button
                key={d.id}
                className={`rw-driver-item${selectedDriver?.id === d.id ? " rw-driver-item--active" : ""}`}
                onClick={() => selectDriver(d)}
              >
                <div className="rw-driver-avatar">
                  {d.last_name?.[0]}{d.first_name?.[0]}
                </div>
                <div className="rw-driver-info">
                  <span className="rw-driver-name">{d.last_name}, {d.first_name}</span>
                  <span className="rw-driver-sub">{d.iwp_number || "No IWP"}</span>
                </div>
              </button>
            ))}
            {filteredDrivers.length === 0 && (
              <div className="rw-empty">No drivers found</div>
            )}
          </div>

          {/* Leaderboard */}
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

        {/* ── Right: Driver Detail ── */}
        <div className="rw-main">
          {!selectedDriver ? (
            <div className="rw-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
              <p>Select a driver to view reward details</p>
            </div>
          ) : loading ? (
            <div className="dashboard-loading">
              <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
            </div>
          ) : profile ? (
            <>
              {/* Driver Header */}
              <div className="rw-profile-header">
                <div className="rw-profile-left">
                  <div className="rw-profile-avatar">
                    {selectedDriver.last_name?.[0]}{selectedDriver.first_name?.[0]}
                  </div>
                  <div>
                    <h2 className="rw-profile-name">
                      {selectedDriver.last_name}, {selectedDriver.first_name}
                    </h2>
                    <span className="rw-profile-sub">{selectedDriver.iwp_number || "No IWP"}</span>
                  </div>
                </div>
                <div className="rw-profile-points">
                  <span className="rw-profile-pts-value">{profile.total_points.toLocaleString()}</span>
                  <span className="rw-profile-pts-label">Total Points</span>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="rw-stats-row">
                <div className="rw-stat-card">
                  <span className="rw-stat-label">Current Streak</span>
                  <span className="rw-stat-value">{profile.current_streak} days</span>
                </div>
                <div className="rw-stat-card">
                  <span className="rw-stat-label">Last Queue</span>
                  <span className="rw-stat-value">
                    {profile.last_queue_date
                      ? new Date(profile.last_queue_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </span>
                </div>
                <div className="rw-stat-card">
                  <span className="rw-stat-label">Redemption Status</span>
                  <span className={`rw-stat-value ${profile.can_redeem ? "rw-stat-eligible" : ""}`}>
                    {profile.can_redeem ? "Eligible" : "Not Eligible"}
                  </span>
                </div>
                <div className="rw-stat-card">
                  <span className="rw-stat-label">Points to Redeem</span>
                  <span className="rw-stat-value">
                    {profile.total_points >= 1000 ? "Ready" : `${(1000 - profile.total_points).toLocaleString()} more`}
                  </span>
                </div>
              </div>

              {/* Redeem Button */}
              {profile.can_redeem && (
                <button className="rw-redeem-btn" onClick={handleRedeem}>
                  Redeem 1,000 pts for {peso(500)}
                </button>
              )}
              {!profile.can_redeem && profile.redeem_message && (
                <div className="rw-redeem-note">{profile.redeem_message}</div>
              )}

              {/* Tabs */}
              <div className="rw-tabs">
                <button
                  className={`rw-tab${tab === "overview" ? " rw-tab--active" : ""}`}
                  onClick={() => setTab("overview")}
                >
                  Points History
                </button>
                <button
                  className={`rw-tab${tab === "redemptions" ? " rw-tab--active" : ""}`}
                  onClick={() => setTab("redemptions")}
                >
                  Redemptions
                </button>
              </div>

              {/* Tab Content */}
              {tab === "overview" ? (
                <div className="rw-table-wrap">
                  <table className="rw-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Points</th>
                        <th>Description</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr><td colSpan={4} className="rw-empty-cell">No points yet</td></tr>
                      ) : (
                        history.map((tx) => (
                          <tr key={tx.id}>
                            <td>
                              <span className={`rw-type-tag ${typeClass(tx.type)}`}>
                                {typeLabel(tx.type)}
                              </span>
                            </td>
                            <td className={tx.points >= 0 ? "rw-pts-pos" : "rw-pts-neg"}>
                              {tx.points >= 0 ? "+" : ""}{tx.points}
                            </td>
                            <td className="rw-desc-cell">{tx.description}</td>
                            <td className="rw-date-cell">
                              {new Date(tx.created_at).toLocaleDateString("en-PH", {
                                month: "short", day: "numeric", year: "numeric",
                              })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rw-table-wrap">
                  <table className="rw-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Points</th>
                        <th>Value</th>
                        <th>Status</th>
                        <th>Approved By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {redemptions.length === 0 ? (
                        <tr><td colSpan={5} className="rw-empty-cell">No redemptions yet</td></tr>
                      ) : (
                        redemptions.map((r) => (
                          <tr key={r.id}>
                            <td className="rw-date-cell">
                              {new Date(r.created_at).toLocaleDateString("en-PH", {
                                month: "short", day: "numeric", year: "numeric",
                              })}
                            </td>
                            <td className="rw-pts-neg">-{r.points_redeemed.toLocaleString()}</td>
                            <td>{peso(r.peso_value)}</td>
                            <td>
                              <span className={`rw-status-tag rw-status-${r.status.toLowerCase()}`}>
                                {r.status}
                              </span>
                            </td>
                            <td>{r.approved_by_name || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
