import React, { useState } from "react";
import { apiService } from "../../lib/api-service";
import "../../styles/login.css";

import sfcLogo from "../../pictures/sfc-nobg-logo.png";
import sfcMain from "../../pictures/sfc-main.jpg";

function ForcePasswordChange({ onChanged }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!newPassword || !confirmPassword) {
      setError("Please fill in both fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await apiService.changePassword(newPassword);
      onChanged();
    } catch (err) {
      setError(err.message || "Failed to change password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lp-root" style={{ backgroundImage: `url(${sfcMain})` }}>
      <div className="lp-bg-overlay" />

      <main
        className="lp-main"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px" }}
      >
        <div className="lp-login-modal">
          <div className="lp-login-modal__brand">
            <img src={sfcLogo} alt="Logo" className="lp-login-modal__logo" style={{ borderRadius: "40px" }} />
            <h2>Set Your Password</h2>
            <p>You're using a temporary password — choose your own to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="lp-login-form">
            <div className="lp-field">
              <label htmlFor="new-password">New Password</label>
              <input
                id="new-password" type="password" placeholder="Enter new password"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus
              />
            </div>
            <div className="lp-field">
              <label htmlFor="confirm-password">Confirm Password</label>
              <input
                id="confirm-password" type="password" placeholder="Re-enter new password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {error && <div className="lp-error">{error}</div>}
            <button type="submit" className="lp-btn lp-btn--navy lp-btn--full" disabled={submitting}>
              {submitting ? "Saving…" : "Save Password & Continue"}
            </button>
            <button
              type="button"
              className="lp-link-btn"
              onClick={() => apiService.logout()}
            >
              Log out instead
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default ForcePasswordChange;
