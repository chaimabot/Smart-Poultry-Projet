 import { useState, useEffect } from "react";
import { rapportsAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import {
  generateGlobalReportPDF,
  generateAlertesReportPDF,
  generateModulesReportPDF,
} from "../../utils/pdfExport";

interface GlobalReport {
  periode: string;
  poulaillers: {
    total: number;
    actifs: number;
    pourcentageActifs: number;
  };
  eleveurs: {
    total: number;
    actifs: number;
  };
  modules: {
    total: number;
    connectes: number;
    tauxConnexion: string;
  };
  alertes: {
    total: number;
    critiques: number;
    warnings: number;
    resolues: number;
  };
  commandes: {
    total: number;
    executees: number;
    echouees: number;
    tauxReussite: number;
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
  parStatut: Array<{
    _id: string;
    count: number;
  }>;
  modules: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    poulailler: string;
    lastPing: string;
    firmwareVersion: string;
  }>;
}

export default function Rapports() {
  const [period, setPeriod] = useState("7d");
  const [globalReport, setGlobalReport] = useState<GlobalReport | null>(null);
  const [alertesReport, setAlertesReport] = useState<AlertesReport | null>(
    null,
  );
  const [modulesReport, setModulesReport] = useState<ModulesReport | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"global" | "alertes" | "modules">(
    "global",
  );

  const fetchAllReports = async () => {
    setLoading(true);
    setError(null);

    try {
      const [globalRes, alertesRes, modulesRes] = await Promise.all([
        rapportsAPI.getGlobal(period),
        rapportsAPI.getAlertes(period),
        rapportsAPI.getModules(period),
      ]);

      setGlobalReport(globalRes.data.data);
      setAlertesReport(alertesRes.data.data);
      setModulesReport(modulesRes.data.data);
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

  const handleExportPDF = () => {
    if (activeTab === "global" && globalReport) {
      generateGlobalReportPDF(globalReport, period);
    } else if (activeTab === "alertes" && alertesReport) {
      generateAlertesReportPDF(alertesReport, period);
    } else if (activeTab === "modules" && modulesReport) {
      generateModulesReportPDF(modulesReport, period);
    }
  };

  const getAlertesResolutionRate = () => {
    if (!globalReport || globalReport.alertes.total === 0) return 0;
    return Math.round(
      (globalReport.alertes.resolues / globalReport.alertes.total) * 100,
    );
  };

  const getEleveursActivityRate = () => {
    if (!globalReport || globalReport.eleveurs.total === 0) return 0;
    return Math.round(
      (globalReport.eleveurs.actifs / globalReport.eleveurs.total) * 100,
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Rapports & Statistiques
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Analyse complète des performances du système Smart Poultry
            </p>
          </div>

          {/* Period Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div className="flex gap-2">
              {["24h", "7d", "30d", "90d"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    period === p
                      ? "bg-primary text-white shadow-md"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
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
            <button
              onClick={handleExportPDF}
              disabled={loading || !globalReport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">
                picture_as_pdf
              </span>
              Exporter PDF
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-red-600">
                  error
                </span>
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <button
                  onClick={fetchAllReports}
                  className="ml-auto text-sm text-red-700 dark:text-red-300 hover:underline"
                >
                  Réessayer
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : globalReport ? (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <KpiCard
                  icon="home"
                  color="blue"
                  label="Poulaillers"
                  value={globalReport.poulaillers.total}
                  subValue={`${globalReport.poulaillers.actifs} actifs (${globalReport.poulaillers.pourcentageActifs}%)`}
                />
                <KpiCard
                  icon="person"
                  color="green"
                  label="Éleveurs"
                  value={globalReport.eleveurs.total}
                  subValue={`${globalReport.eleveurs.actifs} actifs (${getEleveursActivityRate()}%)`}
                />
                <KpiCard
                  icon="sensors"
                  color="purple"
                  label="Modules"
                  value={globalReport.modules.total}
                  subValue={`${globalReport.modules.connectes} connectés (${globalReport.modules.tauxConnexion})`}
                />
                <KpiCard
                  icon="warning"
                  color="amber"
                  label="Alertes"
                  value={globalReport.alertes.total}
                  subValue={`${globalReport.alertes.critiques} critiques, ${getAlertesResolutionRate()}% résolues`}
                />
              </div>

              {/* Tabs */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden mb-8">
                <div className="border-b border-slate-200 dark:border-slate-700">
                  <nav className="flex">
                    <button
                      onClick={() => setActiveTab("global")}
                      className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                        activeTab === "global"
                          ? "text-primary"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      Vue Globale
                      {activeTab === "global" && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab("alertes")}
                      className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                        activeTab === "alertes"
                          ? "text-primary"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      Analyse des Alertes
                      {activeTab === "alertes" && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab("modules")}
                      className={`px-6 py-4 text-sm font-medium transition-colors relative ${
                        activeTab === "modules"
                          ? "text-primary"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      Performance des Modules
                      {activeTab === "modules" && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                      )}
                    </button>
                  </nav>
                </div>

                <div className="p-6">
                  {activeTab === "global" && (
                    <div className="space-y-6">
                      {/* Summary Stats */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg">
                              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">
                                home
                              </span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-200">
                              Poulaillers
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-slate-700 dark:text-slate-200">
                            {globalReport.poulaillers.total}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            {globalReport.poulaillers.pourcentageActifs}%
                            d'activité
                          </p>
                        </div>

                        <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg">
                              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">
                                sensors
                              </span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-200">
                              Modules
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-slate-700 dark:text-slate-200">
                            {globalReport.modules.connectes}/
                            {globalReport.modules.total}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Connectés ({globalReport.modules.tauxConnexion})
                          </p>
                        </div>

                        <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg">
                              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">
                                command
                              </span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-200">
                              Commandes
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-slate-700 dark:text-slate-200">
                            {globalReport.commandes.tauxReussite}%
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Taux de réussite
                          </p>
                        </div>
                      </div>

                      {/* Detailed Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-slate-100 dark:bg-slate-900">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                Catégorie
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                Total
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                Actifs/Connectés
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                Taux
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            <tr>
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                Poulaillers
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {globalReport.poulaillers.total}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {globalReport.poulaillers.actifs}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                  {globalReport.poulaillers.pourcentageActifs}%
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                Éleveurs
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {globalReport.eleveurs.total}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {globalReport.eleveurs.actifs}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                  {getEleveursActivityRate()}%
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                Modules
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {globalReport.modules.total}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {globalReport.modules.connectes}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                  {globalReport.modules.tauxConnexion}
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                Commandes
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {globalReport.commandes.total}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {globalReport.commandes.executees}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                  {globalReport.commandes.tauxReussite}%
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {activeTab === "alertes" && alertesReport && (
                    <div className="space-y-6">
                      {/* Alert Stats Cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-center border border-slate-200 dark:border-slate-700">
                          <p className="text-3xl font-bold text-slate-700 dark:text-slate-200">
                            {globalReport.alertes.total}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Total
                          </p>
                        </div>
                        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-center border border-slate-200 dark:border-slate-700">
                          <p className="text-3xl font-bold text-slate-700 dark:text-slate-200">
                            {globalReport.alertes.critiques}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Critiques
                          </p>
                        </div>
                        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-center border border-slate-200 dark:border-slate-700">
                          <p className="text-3xl font-bold text-slate-700 dark:text-slate-200">
                            {globalReport.alertes.warnings}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Avertissements
                          </p>
                        </div>
                        <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl text-center border border-slate-200 dark:border-slate-700">
                          <p className="text-3xl font-bold text-slate-700 dark:text-slate-200">
                            {globalReport.alertes.resolues}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Résolues
                          </p>
                        </div>
                      </div>

                      {/* Alert Distribution */}
                      <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-xl">
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
                          Distribution des alertes
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-600 dark:text-slate-300">
                                Critiques
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                {globalReport.alertes.critiques}
                              </span>
                            </div>
                            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-slate-500 rounded-full"
                                style={{
                                  width: `${globalReport.alertes.total > 0 ? (globalReport.alertes.critiques / globalReport.alertes.total) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-600 dark:text-slate-300">
                                Avertissements
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                {globalReport.alertes.warnings}
                              </span>
                            </div>
                            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-slate-400 rounded-full"
                                style={{
                                  width: `${globalReport.alertes.total > 0 ? (globalReport.alertes.warnings / globalReport.alertes.total) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-600 dark:text-slate-300">
                                Résolues
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                {globalReport.alertes.resolues}
                              </span>
                            </div>
                            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-slate-600 rounded-full"
                                style={{
                                  width: `${globalReport.alertes.total > 0 ? (globalReport.alertes.resolues / globalReport.alertes.total) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Top Alert Parameters */}
                      {alertesReport.parParametre &&
                        alertesReport.parParametre.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-slate-100 dark:bg-slate-900">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                    Paramètre
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                    Total
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                    Critiques
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                    Warnings
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {alertesReport.parParametre
                                  .slice(0, 5)
                                  .map((param, idx) => (
                                    <tr key={idx}>
                                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                        {param.parameter || "N/A"}
                                      </td>
                                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                        {param.total}
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                          {param.critiques}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                          {param.warnings}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                    </div>
                  )}

                  {activeTab === "modules" && modulesReport && (
                    <div className="space-y-6">
                      {/* Module Stats */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg">
                              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">
                                sensors
                              </span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-200">
                              Total Modules
                            </span>
                          </div>
                          <p className="text-4xl font-bold text-slate-700 dark:text-slate-200">
                            {modulesReport.total}
                          </p>
                        </div>

                        <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg">
                              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">
                                wifi
                              </span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-200">
                              Connectés
                            </span>
                          </div>
                          <p className="text-4xl font-bold text-slate-700 dark:text-slate-200">
                            {modulesReport.connectes}
                          </p>
                        </div>

                        <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-slate-200 dark:bg-slate-800 rounded-lg">
                              <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">
                                signal_cellular_alt
                              </span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-slate-200">
                              Taux de Connexion
                            </span>
                          </div>
                          <p className="text-4xl font-bold text-slate-700 dark:text-slate-200">
                            {modulesReport.tauxConnexion}%
                          </p>
                        </div>
                      </div>

                      {/* Connection Status */}
                      <div className="p-6 bg-slate-100 dark:bg-slate-900 rounded-xl">
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-4">
                          État de connexion
                        </h4>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-slate-600 rounded-full transition-all"
                                style={{
                                  width: `${modulesReport.tauxConnexion}%`,
                                }}
                              />
                            </div>
                          </div>
                          <span className="text-lg font-semibold text-slate-900 dark:text-white">
                            {modulesReport.tauxConnexion}%
                          </span>
                        </div>
                      </div>

                      {/* Modules List */}
                      {modulesReport.modules &&
                        modulesReport.modules.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-slate-100 dark:bg-slate-900">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                    Module
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                    Type
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                    Poulailler
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                    Statut
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">
                                    Dernière connexion
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {modulesReport.modules
                                  .slice(0, 10)
                                  .map((mod) => (
                                    <tr key={mod.id}>
                                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                        {mod.name}
                                      </td>
                                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                        {mod.type || "N/A"}
                                      </td>
                                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                        {mod.poulailler}
                                      </td>
                                      <td className="px-4 py-3">
                                        <span
                                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            mod.status === "connecte" ||
                                            mod.status === "connected"
                                              ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                          }`}
                                        >
                                          {mod.status || "unknown"}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                        {mod.lastPing
                                          ? new Date(
                                              mod.lastPing,
                                            ).toLocaleString("fr-FR")
                                          : "N/A"}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              Aucune donnée disponible. Veuillez vous connecter.
            </div>
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
}: {
  icon: string;
  color: "blue" | "amber" | "red" | "green" | "purple";
  label: string;
  value: number | string;
  subValue?: string;
}) {
  const colors = {
    blue: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    amber:
      "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    red: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    green:
      "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    purple:
      "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
  };

  return (
    <div
      className={`bg-white dark:bg-slate-800 border p-5 lg:p-6 rounded-xl shadow-sm ${colors[color]}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg bg-slate-100 dark:bg-slate-700`}>
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">
            {icon}
          </span>
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </p>
      <h3 className="text-3xl font-bold text-slate-900 dark:text-white">
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
