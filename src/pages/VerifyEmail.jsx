import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../styles/login.css";
import { apiService } from "../lib/api-service";

import sfcLogo from "../pictures/sfc-nobg-logo.png";
import sfcMain from "../pictures/sfc-main.jpg";

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const uid = searchParams.get("uid") || "";
  const token = searchParams.get("token") || "";
  const linkIsValid = Boolean(uid && token);

  const [status, setStatus] = useState(linkIsValid ? "verifying" : "invalid"); // verifying | done | invalid
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!linkIsValid) return;
    apiService
      .verifyEmail({ uid, token })
      .then((res) => {
        setStatus("done");
        setMessage(res?.detail || "Your email has been verified.");
      })
      .catch((err) => {
        setStatus("invalid");
        setMessage(err.message || "This verification link is invalid or expired.");
      });
  }, [uid, token, linkIsValid]);

  return (
    <div className="lp-root" style={{ backgroundImage: `url(${sfcMain})` }}>
      <div className="lp-bg-overlay" />

      <main className="lp-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px" }}>
        <div className="lp-login-modal">
          <div className="lp-login-modal__brand">
            <img src={sfcLogo} alt="Logo" className="lp-login-modal__logo" style={{ borderRadius: "40px" }} />
            <h2>Verify Email</h2>
            <p>North Central Terminal Management System</p>
          </div>

          <div className="lp-login-form">
            {status === "verifying" && <div>Verifying your email…</div>}
            {status === "done" && <div className="lp-success">{message}</div>}
            {status === "invalid" && <div className="lp-error">{message || "This verification link is invalid or incomplete."}</div>}

            {status !== "verifying" && (
              <button className="lp-btn lp-btn--navy lp-btn--full" onClick={() => navigate("/")}>
                Back to Login
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default VerifyEmail;
