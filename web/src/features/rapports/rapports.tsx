import { useState, useEffect } from "react";
import { rapportsAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";

interface GlobalReport {
  periode: string;
  poulaillers: {
    total: number;
    connects: number;
    horsLigne: number;
    enAttente: number;
    pourcentageActifs: number;
  };
  eleveurs: {
    total: number;
    actifs: number;
  };
  modules: {
    total: number;
    associes: number;
    libres: number;
    connectes: number;
    horsLigne: number;
    tauxConnexion: number;
  };
  alertes: {
    total: number;
    critiques: number;
    warnings: number;
    actives: number;
  };
}

interface AlertesReport {
  periode: string;
  parParametre: Array<{
    parameter: string;
    total: number;
    critiques: number;
    warnings: number;
  }>;
  parPoulailler: Array<{
    poulaillerName: string;
    count: number;
    critical: number;
  }>;
  timeline: Array<{
    _id: string;
    total: number;
    critical: number;
    warning: number;
  }>;
}

interface ModulesReport {
  periode: string;
  total: number;
  connectes: number;
  deconnectes: number;
  tauxConnexion: number;
  modulesSansPing: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    poulailler: string;
    lastPing: string;
    heuresSansPing: number;
  }>;
  modules: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    poulailler: string;
    lastPing: string;
  }>;
}

interface MesuresReport {
  periode: string;
  poulaillersActifs: number;
  poulaillersInactifs: number;
  totalPoulaillers: number;
  dernieresMesures: Array<{
    poulaillerId: string;
    poulaillerName: string;
    derniereMesure: string;
    parametres: string[];
  }>;
}

const parameterLabels: Record<string, string> = {
  temperature: "Température",
  humidity: "Humidité",
  co2: "CO₂",
  nh3: "NH₃",
  ammonia: "NH₃",
  dust: "Poussière",
  waterLevel: "Niveau d'eau",
};

export default function Rapports() {
  const [period, setPeriod] = useState("7d");
  const [globalReport, setGlobalReport] = useState<GlobalReport | null>(null);
  const [alertesReport, setAlertesReport] = useState<AlertesReport | null>(
    null,
  );
  const [modulesReport, setModulesReport] = useState<ModulesReport | null>(
    null,
  );
  const [mesuresReport, setMesuresReport] = useState<MesuresReport | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "global" | "alertes" | "modules" | "mesures"
  >("global");

  const fetchAllReports = async () => {
    setLoading(true);
    setError(null);

    try {
      const [globalRes, alertesRes, modulesRes, mesuresRes] = await Promise.all(
        [
          rapportsAPI.getGlobal(period),
          rapportsAPI.getAlertes(period),
          rapportsAPI.getModules(period),
          rapportsAPI.getMesures(period),
        ],
      );

      setGlobalReport(globalRes.data.data);
      setAlertesReport(alertesRes.data.data);
      setModulesReport(modulesRes.data.data);
      setMesuresReport(mesuresRes.data.data);
    } catch (err: any) {
      console.error("Erreur fetchReports:", err);
      if (err.response?.status === 401) {
        setError("Session expirée. Veuillez vous reconnecter.");
      } else {
        setError(
          err.response?.data?.error || "Erreur lors du chargement des données",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllReports();
  }, [period]);

  // Calculate hours since last ping
  const getHeuresSansPing = (lastPing: string): number => {
    if (!lastPing) return 999;
    const diff = Date.now() - new Date(lastPing).getTime();
    return Math.round(diff / (1000 * 60 * 60));
  };

  // Format date for display
  const formatDate = (dateString: string): string => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Rapports & Statistiques
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Analyse des performances du système Smart Poultry
            </p>
          </div>

          {/* Period Selector */}
          <div className="flex gap-2 mb-6">
            {["24h", "7d", "30d", "90d"].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  period === p
                    ? "bg-slate-800 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                }`}
              >
                {p === "24h"
                  ? "24H"
                  : p === "7d"
                    ? "7J"
                    : p === "30d"
                      ? "30J"
                      : "90J"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
            </div>
          ) : globalReport ? (
            <>
              {/* Tabs */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
                <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
                  <nav className="flex min-w-max">
                    {[
                      { key: "global", label: "Vue Globale" },
                      { key: "alertes", label: "Alertes" },
                      { key: "modules", label: "Modules" },
                      { key: "mesures", label: "Mesures" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as any)}
                        className={`px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
                          activeTab === tab.key
                            ? "text-slate-900 dark:text-white border-b-2 border-slate-800"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="p-6">
                  {/* GLOBAL TAB */}
                  {activeTab === "global" && (
                    <div className="space-y-6">
                      {/* KPIs */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KpiCard
                          icon="home"
                          label="Poulaillers"
                          value={globalReport.poulaillers.total}
                          subValues={[
                            `${globalReport.poulaillers.connects} connectés`,
                            `${globalReport.poulaillers.horsLigne} hors ligne`,
                          ]}
                        />
                        <KpiCard
                          icon="person"
                          label="Éleveurs"
                          value={globalReport.eleveurs.total}
                          subValues={[`${globalReport.eleveurs.actifs} actifs`]}
                        />
                        <KpiCard
                          icon="sensors"
                          label="Modules"
                          value={globalReport.modules.total}
                          subValues={[
                            `${globalReport.modules.associes} associés`,
                            `${globalReport.modules.libres} libres`,
                          ]}
                        />
                        <KpiCard
                          icon="warning"
                          label="Alertes actives"
                          value={globalReport.alertes.actives}
                          subValues={[
                            `${globalReport.alertes.critiques} critiques`,
                          ]}
                        />
                      </div>

                      {/* Summary Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-100 dark:bg-slate-900">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                Métrique
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                Valeur
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                Détails
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            <tr>
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                Taux de connexion modules
                              </td>
                              <td className="px-4 py-3 text-slate-900 dark:text-white font-semibold">
                                {globalReport.modules.tauxConnexion}%
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {globalReport.modules.connectes} /{" "}
                                {globalReport.modules.total}
                              </td>
                            </tr>
                            <tr>
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                Poulaillers actifs
                              </td>
                              <td className="px-4 py-3 text-slate-900 dark:text-white font-semibold">
                                {globalReport.poulaillers.pourcentageActifs}%
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {globalReport.poulaillers.connects} /{" "}
                                {globalReport.poulaillers.total}
                              </td>
                            </tr>
                            <tr>
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                Alertes période
                              </td>
                              <td className="px-4 py-3 text-slate-900 dark:text-white font-semibold">
                                {globalReport.alertes.total}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {globalReport.alertes.critiques} critiques,{" "}
                                {globalReport.alertes.warnings} warnings
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ALERTES TAB */}
                  {activeTab === "alertes" && alertesReport && (
                    <div className="space-y-6">
                      {/* Alert Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-center">
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">
                            {globalReport?.alertes.total || 0}
                          </p>
                          <p className="text-sm text-slate-500">Total</p>
                        </div>
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-center">
                          <p className="text-2xl font-bold text-red-600">
                            {globalReport?.alertes.critiques || 0}
                          </p>
                          <p className="text-sm text-red-500">Critiques</p>
                        </div>
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl text-center">
                          <p className="text-2xl font-bold text-orange-600">
                            {globalReport?.alertes.warnings || 0}
                          </p>
                          <p className="text-sm text-orange-500">Warnings</p>
                        </div>
                        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-center">
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">
                            {globalReport?.alertes.actives || 0}
                          </p>
                          <p className="text-sm text-slate-500">Actives</p>
                        </div>
                      </div>

                      {/* Distribution by Parameter */}
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
                          Répartition par paramètre
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {alertesReport.parParametre
                            .slice(0, 6)
                            .map((param, idx) => (
                              <div
                                key={idx}
                                className="p-3 bg-slate-100 dark:bg-slate-900 rounded-lg"
                              >
                                <p className="font-medium text-slate-900 dark:text-white">
                                  {parameterLabels[param.parameter] ||
                                    param.parameter}
                                </p>
                                <p className="text-sm text-slate-500">
                                  {param.total} alertes ({param.critiques}{" "}
                                  critiques)
                                </p>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Top 5 Poulaillers */}
                      {alertesReport.parPoulailler.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
                            Poulaillers les plus en alerte (Top 5)
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-slate-100 dark:bg-slate-900">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Poulailler
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Total
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Critiques
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {alertesReport.parPoulailler
                                  .slice(0, 5)
                                  .map((p, idx) => (
                                    <tr key={idx}>
                                      <td className="px-4 py-2 text-slate-900 dark:text-white">
                                        {p.poulaillerName}
                                      </td>
                                      <td className="px-4 py-2 text-slate-600">
                                        {p.count}
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                          {p.critical}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODULES TAB */}
                  {activeTab === "modules" && modulesReport && (
                    <div className="space-y-6">
                      {/* Module Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-center">
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">
                            {modulesReport.total}
                          </p>
                          <p className="text-sm text-slate-500">Total</p>
                        </div>
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
                          <p className="text-2xl font-bold text-green-600">
                            {modulesReport.connectes}
                          </p>
                          <p className="text-sm text-green-500">Connectés</p>
                        </div>
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-center">
                          <p className="text-2xl font-bold text-red-600">
                            {modulesReport.deconnectes}
                          </p>
                          <p className="text-sm text-red-500">Hors ligne</p>
                        </div>
                        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-center">
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">
                            {modulesReport.tauxConnexion}%
                          </p>
                          <p className="text-sm text-slate-500">
                            Taux connexion
                          </p>
                        </div>
                      </div>

                      {/* Modules without ping */}
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
                          Modules sans ping depuis 24h+
                        </h4>
                        {modulesReport.modulesSansPing &&
                        modulesReport.modulesSansPing.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-slate-100 dark:bg-slate-900">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Module
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Poulailler
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Dernier ping
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Durée
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {modulesReport.modulesSansPing.map(
                                  (mod, idx) => (
                                    <tr key={idx}>
                                      <td className="px-4 py-2 text-slate-900 dark:text-white">
                                        {mod.name}
                                      </td>
                                      <td className="px-4 py-2 text-slate-600">
                                        {mod.poulailler}
                                      </td>
                                      <td className="px-4 py-2 text-slate-500 text-sm">
                                        {formatDate(mod.lastPing)}
                                      </td>
                                      <td className="px-4 py-2">
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                          {mod.heuresSansPing}h
                                        </span>
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-slate-500">
                            Aucun module sans ping
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* MESURES TAB */}
                  {activeTab === "mesures" && mesuresReport && (
                    <div className="space-y-6">
                      {/* Activity Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-center">
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">
                            {mesuresReport.totalPoulaillers}
                          </p>
                          <p className="text-sm text-slate-500">
                            Total Poulaillers
                          </p>
                        </div>
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
                          <p className="text-2xl font-bold text-green-600">
                            {mesuresReport.poulaillersActifs}
                          </p>
                          <p className="text-sm text-green-500">Actifs</p>
                        </div>
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-center">
                          <p className="text-2xl font-bold text-red-600">
                            {mesuresReport.poulaillersInactifs}
                          </p>
                          <p className="text-sm text-red-500">Inactifs</p>
                        </div>
                      </div>

                      {/* Dernieres mesures */}
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
                          Dernières mesures reçues
                        </h4>
                        {mesuresReport.dernieresMesures &&
                        mesuresReport.dernieresMesures.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-slate-100 dark:bg-slate-900">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Poulailler
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Dernière mesure
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase">
                                    Paramètres
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {mesuresReport.dernieresMesures
                                  .slice(0, 10)
                                  .map((p, idx) => (
                                    <tr key={idx}>
                                      <td className="px-4 py-2 text-slate-900 dark:text-white">
                                        {p.poulaillerName}
                                      </td>
                                      <td className="px-4 py-2 text-slate-500 text-sm">
                                        {formatDate(p.derniereMesure)}
                                      </td>
                                      <td className="px-4 py-2">
                                        <div className="flex gap-1 flex-wrap">
                                          {p.parametres.map((param, i) => (
                                            <span
                                              key={i}
                                              className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-xs rounded"
                                            >
                                              {param}
                                            </span>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-slate-500">
                            Aucune donnée disponible
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

// KPI Card Component
function KpiCard({
  icon,
  label,
  value,
  subValues,
}: {
  icon: string;
  label: string;
  value: number;
  subValues: string[];
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-slate-500">{icon}</span>
        <span className="text-xs font-medium text-slate-500 uppercase">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
      {subValues.map((sub, idx) => (
        <p key={idx} className="text-xs text-slate-500 mt-1">
          {sub}
        </p>
      ))}
    </div>
  );
}
