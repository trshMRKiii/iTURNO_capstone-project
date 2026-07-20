import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../styles/login.css";
import { apiService } from "../lib/api-service";
import { useToast } from "../components/ui/ToastConfirmContext";

import sfcLogo from "../pictures/sfc-nobg-logo.png";
import sfcMain from "../pictures/sfc-main.jpg";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate  = useNavigate();
  const showToast = useToast();

  const uid   = searchParams.get("uid")   || "";
  const token = searchParams.get("token") || "";

  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,           setError]           = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [done,            setDone]            = useState(false);

  const linkIsValid = Boolean(uid && token);

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
      await apiService.confirmPasswordReset({ uid, token, newPassword });
      setDone(true);
      if (showToast) showToast("Password reset successfully!", "success");
    } catch (err) {
      setError(err.message || "Failed to reset password. The link may have expired.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lp-root" style={{ backgroundImage: `url(${sfcMain})` }}>
      <div className="lp-bg-overlay" />

      <main className="lp-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px" }}>
        <div className="lp-login-modal">
          <div className="lp-login-modal__brand">
            <img src={sfcLogo} alt="Logo" className="lp-login-modal__logo" style={{ borderRadius: "40px" }} />
            <h2>Reset Password</h2>
            <p>North Central Terminal Management System</p>
          </div>

          {!linkIsValid ? (
            <div className="lp-login-form">
              <div className="lp-error">This reset link is invalid or incomplete.</div>
              <button className="lp-btn lp-btn--navy lp-btn--full" onClick={() => navigate("/")}>
                Back to Login
              </button>
            </div>
          ) : done ? (
            <div className="lp-login-form">
              <div className="lp-success">Your password has been reset successfully.</div>
              <button className="lp-btn lp-btn--navy lp-btn--full" onClick={() => navigate("/")}>
                Back to Login
              </button>
            </div>
          ) : (
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
                {submitting ? "Resetting…" : "Reset Password"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export default ResetPassword;
