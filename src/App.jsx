import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState } from "react";
import MainIndex from "./app/dashboard/mainIndex";
import PublicView from "./pages/PublicView";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import MobileScan from "./app/mobile/MobileScan";
import RemoteDashboard from "./pages/RemoteDashboard";

function App() {
  return (
    <>
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/public-view" element={<PublicView />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard/*" element={<MainIndex />} />
        <Route path="/mobile-scan" element={<MobileScan />} />
        <Route path="/remote-dashboard" element={<RemoteDashboard />} />
      </Routes>
    </Router>

    </>
  );
}

export default App;