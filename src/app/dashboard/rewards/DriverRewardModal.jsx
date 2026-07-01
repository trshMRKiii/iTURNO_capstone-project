import { useState, useEffect } from "react";
import { apiService } from "../../../lib/api-service";
import { useToast, useConfirm } from "../../../components/ui/ToastConfirmContext";
import { exportRewardReceipt } from "../../../lib/report/exportRewardReceipt";

const peso = (n) =>
  "₱" +
  Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

export default function DriverRewardModal({ driver, rewardConfig, onClose, onRedeemed }) {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const showToast = useToast();
  const showConfirm = useConfirm();

  const load = async () => {
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

  useEffect(() => {
    if (!driver) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver]);

  const handleRedeem = async () => {
    if (!profile) return;
    const ok = await showConfirm(
      `Redeem ${Number(rewardConfig.points_per_redemption).toLocaleString()} points for ${peso(rewardConfig.peso_value_per_redemption)} for ${driver.last_name}, ${driver.first_name}?`
    );
    if (!ok) return;
    try {
      const res = await apiService.redeemReward(driver.id);
      if (res.error) {
        showToast(res.error, "info");
        return;
      }
      showToast("Redemption successful!", "success");
      load();
      onRedeemed?.();
    } catch {
      showToast("Redemption failed", "info");
    }
  };

  if (!driver) return null;

  return (
    <div className="rw-modal-overlay" onClick={onClose}>
      <div className="rw-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rw-modal-close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        {loading ? (
          <div className="dashboard-loading">
            <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
          </div>
        ) : profile ? (
          <>
            {/* Driver Header */}
            <div className="rw-profile-header">
              <div className="rw-profile-left">
                <div className="rw-profile-avatar">
                  {driver.last_name?.[0]}{driver.first_name?.[0]}
                </div>
                <div>
                  <h2 className="rw-profile-name">
                    {driver.last_name}, {driver.first_name}
                  </h2>
                  <span className="rw-profile-sub">{driver.iwp_number || "No IWP"}</span>
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
                  {profile.total_points >= rewardConfig.points_per_redemption
                    ? "Ready"
                    : `${(rewardConfig.points_per_redemption - profile.total_points).toLocaleString()} more`}
                </span>
              </div>
            </div>

            {/* Redeem Button */}
            {profile.can_redeem && (
              <button className="rw-redeem-btn" onClick={handleRedeem}>
                Redeem {Number(rewardConfig.points_per_redemption).toLocaleString()} pts for {peso(rewardConfig.peso_value_per_redemption)}
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
              <div className="rw-table-wrap rw-modal-table-wrap">
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
              <div className="rw-table-wrap rw-modal-table-wrap">
                <table className="rw-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Points</th>
                      <th>Value</th>
                      <th>Approved By</th>
                      <th>Action</th>
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
                          <td>{r.approved_by_name || "—"}</td>
                          <td>
                            <button
                              className="rw-receipt-btn"
                              onClick={() => exportRewardReceipt(r, driver)}
                            >
                              Create Receipt
                            </button>
                          </td>
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
  );
}
