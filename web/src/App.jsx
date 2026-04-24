import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Login from "./features/auth/Login";
import CompleteInvite from "./features/auth/CompleteInvite";
import ProtectedRoute from "./features/auth/ProtectedRoute";
import Dashboard from "./features/dashboard/Dashboard";
import Poulaillers from "./features/Poulaillers/Poulaillers";
import PoulaillerDetails from "./features/Poulaillers/PoulaillerDetails";
import Modules from "./features/Modules/Modules";
import Alertes from "./features/alertes/alertes";
import Rapports from "./features/rapports/rapports";
import Utilisateurs from "./features/utilisateurs/utilisateurs";
import Parametres from "./features/parametres/parametres";
import Profile from "./features/profile/Profile";
import Logs from "./features/logs/logs";
import Dossiers from "./features/dossiers/dossiers";

function App() {
  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "#363636",
            color: "#fff",
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: "#22c55e",
              secondary: "#fff",
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: "#ef4444",
              secondary: "#fff",
            },
          },
        }}
      />
      <Routes>
        {/* Route publique - Login */}
        <Route path="/" element={<Login />} />

        {/* Route publique - Définition mot de passe (après invitation) */}
        <Route
          path="/definir-mot-de-passe/:token"
          element={<CompleteInvite />}
        />

        {/* Routes protégées - Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées - Poulaillers */}
        <Route
          path="/poulaillers"
          element={
            <ProtectedRoute>
              <Poulaillers />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées - Détails Poulailler */}
        <Route
          path="/poulaillers/:id"
          element={
            <ProtectedRoute>
              <PoulaillerDetails />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées - Modules */}
        <Route
          path="/modules"
          element={
            <ProtectedRoute>
              <Modules />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées - Alertes */}
        <Route
          path="/alertes"
          element={
            <ProtectedRoute>
              <Alertes />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées - Rapports */}
        <Route
          path="/rapports"
          element={
            <ProtectedRoute>
              <Rapports />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées - Utilisateurs */}
        <Route
          path="/utilisateurs"
          element={
            <ProtectedRoute>
              <Utilisateurs />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées - Paramètres */}
        <Route
          path="/parametres"
          element={
            <ProtectedRoute>
              <Parametres />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées - Profile */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* Routes protégées - Logs */}
        <Route
          path="/logs"
          element={
            <ProtectedRoute>
              <Logs />
            </ProtectedRoute>
          }
        />
        {/* Routes protégées - Dossiers */}
        <Route
          path="/dossiers"
          element={
            <ProtectedRoute>
              <Dossiers />
            </ProtectedRoute>
          }
        />

        {/* Redirection par défaut vers login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
