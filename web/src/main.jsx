 import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./features/auth/Login.tsx";
import Dashboard from "./features/dashboard/Dashboard.tsx";
import Poulaillers from "./features/Poulaillers/Poulaillers.tsx";
import Modules from "./features/Modules/Modules.tsx";
import Logs from "./features/logs/logs.tsx";
import Rapports from "./features/rapports/rapports.tsx";
import Utilisateurs from "./features/utilisateurs/utilisateurs.tsx";
import Parametres from "./features/parametres/parametres.tsx";
import Alertes from "./features/alertes/alertes.tsx";
import Profile from "./features/profile/Profile.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Page login en premier (route racine "/") */}
        <Route path="/" element={<Login />} />

        {/* Pages protégées après login */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/poulaillers" element={<Poulaillers />} />
        <Route path="/modules" element={<Modules />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/rapports" element={<Rapports />} />
        <Route path="/utilisateurs" element={<Utilisateurs />} />
        <Route path="/alertes" element={<Alertes />} />
        <Route path="/parametres" element={<Parametres />} />
        <Route path="/profile" element={<Profile />} />

        {/* Redirection si URL inconnue */}
        <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
