import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";
import { handleLogin, apiService } from '../lib/api-service';
import { useToast } from '../components/ui/ToastConfirmContext';

// ── Import images
import sfcLogo from '../pictures/sfc-nobg-logo.png';
import sfcMain from '../pictures/sfc-main.jpg';

function Login() {
  const [username,      setUsername]      = useState("");
  const [password,      setPassword]      = useState("");
  const [error,         setError]         = useState("");

  // ── Forgot password ──
  const [modalView,     setModalView]     = useState("login"); // 'login' | 'forgot'
  const [forgotEmail,   setForgotEmail]   = useState("");
  const [forgotError,   setForgotError]   = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent,    setForgotSent]    = useState(false);

  const navigate  = useNavigate();
  const showToast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    await handleLogin(username, password, setError, navigate, showToast);
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError("");

    if (!forgotEmail.trim()) {
      setForgotError("Please enter your email.");
      return;
    }

    setForgotSending(true);
    try {
      await apiService.requestPasswordReset(forgotEmail.trim());
      setForgotSent(true);
    } catch (err) {
      setForgotError(err.message || "Something went wrong. Please try again.");
    } finally {
      setForgotSending(false);
    }
  };

  return (
    <div className="lp-root" style={{ backgroundImage: `url(${sfcMain})` }}>

      {/* Background overlay */}
      <div className="lp-bg-overlay" />

      {/* ── HEADER ── */}
      <header className="lp-header">
        <div className="lp-header__inner">
          <div className="lp-header__brand">
            <img src={sfcLogo} alt="SFC Logo" className="lp-header__logo" style={{ borderRadius: '40px' }} />
            <div className="lp-header__brand-text">
              <span className="lp-header__title">North Central Terminal</span>
              <span className="lp-header__sub">City Government of San Fernando</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── LOGIN FORM ── */}
      <main
        className="lp-main"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 80px)', padding: '24px' }}
      >
        <div className="lp-login-modal">
          {modalView === "login" ? (
            <>
              <div className="lp-login-modal__brand">
                <img src={sfcLogo} alt="Logo" className="lp-login-modal__logo" style={{ borderRadius: '40px' }} />
                <h2>North Central Terminal</h2>
                <p>Sign in to manage terminal operations</p>
              </div>
              <form onSubmit={handleSubmit} className="lp-login-form">
                <div className="lp-field">
                  <label htmlFor="username">Email</label>
                  <input
                    id="username" type="email" placeholder="Enter your email"
                    value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
                  />
                </div>
                <div className="lp-field">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password" type="password" placeholder="Enter your password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error && <div className="lp-error">{error}</div>}
                <button type="submit" className="lp-btn lp-btn--navy lp-btn--full">Sign In</button>
                <button
                  type="button"
                  className="lp-link-btn"
                  onClick={() => {
                    setModalView("forgot");
                    setError("");
                    setForgotSent(false);
                    setForgotEmail("");
                    setForgotError("");
                  }}
                >
                  Forgot password?
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="lp-login-modal__brand">
                <img src={sfcLogo} alt="Logo" className="lp-login-modal__logo" style={{ borderRadius: '40px' }} />
                <h2>Reset Password</h2>
                <p>
                  {forgotSent
                    ? "Check your inbox for the reset link"
                    : "Enter your email and we'll send you a reset link"}
                </p>
              </div>
              {forgotSent ? (
                <div className="lp-login-form">
                  <div className="lp-success">
                    If an account exists for <strong>{forgotEmail}</strong>, a password reset
                    link has been sent to it.
                  </div>
                  <button
                    type="button"
                    className="lp-btn lp-btn--navy lp-btn--full"
                    onClick={() => setModalView("login")}
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="lp-login-form">
                  <div className="lp-field">
                    <label htmlFor="forgot-email">Email</label>
                    <input
                      id="forgot-email" type="email" placeholder="Enter your email"
                      value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoFocus
                    />
                  </div>
                  {forgotError && <div className="lp-error">{forgotError}</div>}
                  <button type="submit" className="lp-btn lp-btn--navy lp-btn--full" disabled={forgotSending}>
                    {forgotSending ? "Sending…" : "Send Reset Link"}
                  </button>
                  <button
                    type="button"
                    className="lp-link-btn"
                    onClick={() => { setModalView("login"); setForgotError(""); }}
                  >
                    ← Back to Sign In
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </main>

    </div>
  );
}

export default Login;
