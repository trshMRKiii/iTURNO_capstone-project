import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState } from "react";
import MainIndex from "./app/dashboard/mainIndex";
import PublicView from "./pages/PublicView";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import MobileScan from "./app/mobile/MobileScan";

function App() {
  return (
    <>
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/public-view" element={<PublicView />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/dashboard/*" element={<MainIndex />} />
        <Route path="/mobile-scan" element={<MobileScan />} />
      </Routes>
    </Router>

    </>
  );
}

export default App;