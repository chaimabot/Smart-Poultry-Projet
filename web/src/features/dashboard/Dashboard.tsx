import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { dashboardAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";

// Types (based on backend)
interface DashboardStats {
  totalEleveurs: number;
  poulaillersActifs: number;
  poulaillersEnAttente: number;
  alertesNonResolues: number;
  tauxConnexionModules: string;
  derniereMiseAJour: string;
}

interface AlerteRecente {
  id: string;
  niveau: "danger" | "avertissement";
  poulailler: string;
  parametre: string;
  valeur: string;
  tempsAgo: string;
}

interface PoulaillerCritique {
  nom: string;
  eleveur: string;
  statut: "Optimal" | "Avertissement" | "Critique";
  temperature: string;
  alertesRecentes: number;
  derniereMesure: string;
}

// Component principal
export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alertesRecentes, setAlertesRecentes] = useState<AlerteRecente[]>([]);
  const [poulaillersCritiques, setPoulaillersCritiques] = useState<
    PoulaillerCritique[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Statistiques globales
      const statsRes = await dashboardAPI.getStats();
      setStats(statsRes.data.data);

      // 2. Alertes récentes
      const alertesRes = await dashboardAPI.getAlertesRecentes(5);
      setAlertesRecentes(alertesRes.data.data);

      // 3. Poulaillers critiques
      const critiquesRes = await dashboardAPI.getPoulaillersCritiques(5);
      setPoulaillersCritiques(critiquesRes.data.data);
    } catch (err: any) {
      console.error("Erreur lors du chargement du dashboard:", err);
      setError(
        err.response?.data?.error || "Erreur lors du chargement des données",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Rafraîchir toutes les 60 secondes
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Dashboard Administrateur
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Vue d&apos;ensemble du système Smart Poultry
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={fetchDashboardData}
                className="mt-2 text-sm text-red-700 dark:text-red-300 underline"
              >
                Réessayer
              </button>
            </div>
          )}

          {loading && !stats ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <KpiCard
                  icon="person"
                  color="blue"
                  label="Éleveurs"
                  value={stats?.totalEleveurs || 0}
                  subValue={`${stats?.poulaillersActifs || 0} poulaillers actifs`}
                />
                <KpiCard
                  icon="home"
                  color="green"
                  label="Poulaillers Actifs"
                  value={stats?.poulaillersActifs || 0}
                  subValue={`${stats?.poulaillersEnAttente || 0} en attente`}
                />
                <KpiCard
                  icon="warning"
                  color="amber"
                  label="Alertes"
                  value={stats?.alertesNonResolues || 0}
                  subValue="non résolues"
                  textColor={
                    (stats?.alertesNonResolues || 0) > 0 ? "text-amber-600" : ""
                  }
                />
                <KpiCard
                  icon="sensors"
                  color={
                    stats?.tauxConnexionModules === "100%" ? "green" : "red"
                  }
                  label="Modules Connectés"
                  value={stats?.tauxConnexionModules || "0%"}
                  subValue={`Dernière mise à jour: ${stats?.derniereMiseAJour || "N/A"}`}
                />
              </div>

              {/* Alertes Récentes */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm mb-8">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Alertes Récentes
                  </h2>
                  <Link
                    to="/alertes"
                    className="text-sm text-primary hover:text-primary-dark"
                  >
                    Voir toutes
                  </Link>
                </div>
                <div className="p-6">
                  {alertesRecentes.length === 0 ? (
                    <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                      Aucune alerte récente
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {alertesRecentes.map((alerte) => (
                        <div
                          key={alerte.id}
                          className={`flex items-center justify-between p-4 rounded-lg ${
                            alerte.niveau === "danger"
                              ? "bg-red-50 dark:bg-red-900/20"
                              : "bg-amber-50 dark:bg-amber-900/20"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span
                              className={`material-symbols-outlined ${
                                alerte.niveau === "danger"
                                  ? "text-red-500"
                                  : "text-amber-500"
                              }`}
                            >
                              {alerte.niveau === "danger" ? "error" : "warning"}
                            </span>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {alerte.poulailler}
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {alerte.parametre}: {alerte.valeur}
                              </p>
                            </div>
                          </div>
                          <span className="text-sm text-slate-500 dark:text-slate-400">
                            {alerte.tempsAgo}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Poulaillers Critiques */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Poulaillers Requérant Attention
                  </h2>
                  <Link
                    to="/poulaillers"
                    className="text-sm text-primary hover:text-primary-dark"
                  >
                    Voir tous
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Poulailler
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Éleveur
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Statut
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Température
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Alertes
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          Dernière Mesure
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {poulaillersCritiques.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-8 text-center text-slate-500 dark:text-slate-400"
                          >
                            Aucun poulailler critique
                          </td>
                        </tr>
                      ) : (
                        poulaillersCritiques.map((p, index) => (
                          <tr
                            key={index}
                            className="hover:bg-slate-50 dark:hover:bg-slate-900/30"
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="font-medium text-slate-900 dark:text-white">
                                {p.nom}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {p.eleveur}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                  p.statut === "Critique"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                    : p.statut === "Avertissement"
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                                      : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                }`}
                              >
                                <span className="w-2 h-2 rounded-full bg-current" />
                                {p.statut}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {p.temperature}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {p.alertesRecentes}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                              {p.derniereMesure}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Composant KPI réutilisable
function KpiCard({
  icon,
  color,
  label,
  value,
  subValue,
  textColor = "",
}: {
  icon: string;
  color: "blue" | "amber" | "red" | "green";
  label: string;
  value: number | string;
  subValue?: string;
  textColor?: string;
}) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 lg:p-6 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`${colors[color]} p-3 rounded-lg`}>
          <span className="material-symbols-outlined">{icon}</span>
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </p>
      <h3
        className={`text-3xl font-bold ${textColor || "text-slate-900 dark:text-white"}`}
      >
        {value}
      </h3>
      {subValue && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {subValue}
        </p>
      )}
    </div>
  );
}
