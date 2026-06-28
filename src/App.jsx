import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useState } from "react";
import MainIndex from "./app/dashboard/mainIndex";
import Login from "./pages/Login";
import MobileScan from "./app/mobile/MobileScan";

function App() {
  return (
    <>
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard/*" element={<MainIndex />} />
        <Route path="/mobile-scan" element={<MobileScan />} />
      </Routes>
    </Router>

    </>
  );
}

export default App;