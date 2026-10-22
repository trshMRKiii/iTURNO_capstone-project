import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState } from "react";
import MainIndex from "./app/dashboard/mainIndex";
import PublicView from "./pages/PublicView";
import Kiosk from "./app/dashboard/queue/kiosk/Kiosk";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";

function App() {
  return (
    <>
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/public-view" element={<PublicView />} />
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard/*" element={<MainIndex />} />
      </Routes>
    </Router>

    </>
  );
}

export default App;