import { useState, useEffect } from "react";
import { alertesAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";

interface Alerte {
  id: string;
  severity: "critical" | "warning";
  parameter: string;
  value: number;
  threshold?: number;
  direction?: string;
  message?: string;
  read: boolean;
  resolved: boolean;
  resolvedAt?: string;
  poulailler: {
    id: string;
    name: string;
    eleveur?: {
      id: string;
      name: string;
      email: string;
    };
  };
  createdAt: string;
  createdAtFormatted: string;
}

interface InfrastructureStatus {
  mqtt: { status: string; label: string };
  database: { status: string; label: string };
}

interface AlertesStats {
  total: number;
  nonLues: number;
  resolues: number;
  nonResolues: number;
  critical: number;
  warning: number;
  poulaillersHorsLigne: number;
  alertesNonTraitees24h: number;
  elevagesARisque: number;
  modulesEnAttente: number;
  alertesPeriode: number;
  infrastructure: InfrastructureStatus;
  periode: string;
}

const parameterLabels: Record<string, string> = {
  temperature: "Température",
  humidity: "Humidité",
  co2: "CO2",
  nh3: "NH3",
  ammonia: "NH3 (Ammoniac)",
  dust: "Poussière",
  waterLevel: "Niveau d'eau",
};

function getBadgeColor(value: number): string {
  if (value > 5) return "bg-red-500";
  if (value > 0) return "bg-orange-500";
  return "bg-green-500";
}

function getStatusColor(status: string): string {
  if (status === "connected") return "bg-green-500";
  return "bg-red-500";
}

export default function Alertes() {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [stats, setStats] = useState<AlertesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("7d");
  const [filters, setFilters] = useState({
    severity: "",
    read: "",
    resolved: "",
    parameter: "",
    search: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pages: 1,
    total: 0,
    limit: 10,
  });
  const [selectedAlertes, setSelectedAlertes] = useState<string[]>([]);

  const fetchStats = async () => {
    try {
      const response = await alertesAPI.getStats(period);
      setStats(response.data.data);
    } catch (err) {
      console.error("Erreur stats:", err);
    }
  };

  const fetchAlertes = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      };
      if (filters.severity) params.severity = filters.severity;
      if (filters.read !== "") params.read = filters.read;
      if (filters.resolved !== "") params.resolved = filters.resolved;
      if (filters.parameter) params.parameter = filters.parameter;
      if (filters.search) params.search = filters.search;

      const response = await alertesAPI.getAll(params);
      setAlertes(response.data.data);
      setPagination((prev) => ({
        ...prev,
        ...response.data.pagination,
      }));
    } catch (err: any) {
      console.error("Erreur fetchAlertes:", err);
      setError(err.response?.data?.error || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [period]);

  useEffect(() => {
    fetchAlertes();
  }, [filters, pagination.page, period]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await alertesAPI.markAsRead(id);
      fetchAlertes();
      fetchStats();
    } catch (err) {
      console.error("Erreur markAsRead:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette alerte?")) return;
    try {
      await alertesAPI.delete(id);
      fetchAlertes();
      fetchStats();
    } catch (err) {
      console.error("Erreur delete:", err);
    }
  };

  const handleSelectAll = () => {
    if (selectedAlertes.length === alertes.length) {
      setSelectedAlertes([]);
    } else {
      setSelectedAlertes(alertes.map((a) => a.id));
    }
  };

  const handleSelect = (id: string) => {
    if (selectedAlertes.includes(id)) {
      setSelectedAlertes(selectedAlertes.filter((i) => i !== id));
    } else {
      setSelectedAlertes([...selectedAlertes, id]);
    }
  };

  const handleMarkSelectedAsRead = async () => {
    if (selectedAlertes.length === 0) return;
    try {
      await alertesAPI.markMultipleAsRead(selectedAlertes);
      setSelectedAlertes([]);
      fetchAlertes();
      fetchStats();
    } catch (err) {
      console.error("Erreur markMultipleAsRead:", err);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedAlertes.length === 0) return;
    if (
      !confirm(
        `Êtes-vous sûr de vouloir supprimer ${selectedAlertes.length} alertes?`,
      )
    )
      return;
    try {
      await alertesAPI.deleteMultiple(selectedAlertes);
      setSelectedAlertes([]);
      fetchAlertes();
      fetchStats();
    } catch (err) {
      console.error("Erreur deleteMultiple:", err);
    }
  };

  const handleExport = async () => {
    try {
      const response = await alertesAPI.export({
        severity: filters.severity || undefined,
        read: filters.read || undefined,
        resolved: filters.resolved || undefined,
        parameter: filters.parameter || undefined,
        format: "csv",
      });
      const blob = new Blob([response.data], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `alertes-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
    } catch (err) {
      console.error("Erreur export:", err);
    }
  };

  const clearFilters = () => {
    setFilters({
      severity: "",
      read: "",
      resolved: "",
      parameter: "",
      search: "",
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          {/* En-tête */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Supervision des Alertes Système
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Vue d'ensemble des problèmes de connectivité, des comportements
              anormaux et des alertes sur l'ensemble des élevages
            </p>
          </div>

          {/* Sélecteur de période */}
          <div className="flex flex-wrap gap-2 mb-6">
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

          {/* Cartes KPI */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              <KPICard
                title="Poulaillers hors-ligne"
                value={stats.poulaillersHorsLigne}
                subtitle="depuis plus de 4h"
                badgeColor={getBadgeColor(stats.poulaillersHorsLigne)}
                icon="wifi_off"
              />
              <KPICard
                title="Alertes non traitées"
                value={stats.alertesNonTraitees24h}
                subtitle="depuis plus de 24h"
                badgeColor={
                  stats.alertesNonTraitees24h > 20
                    ? "bg-red-500"
                    : stats.alertesNonTraitees24h > 10
                      ? "bg-orange-500"
                      : "bg-slate-600"
                }
                icon="mark_email_unread"
              />
              <KPICard
                title="Élevages à risque"
                value={stats.elevagesARisque}
                subtitle="+8 alertes en 24h"
                badgeColor={getBadgeColor(stats.elevagesARisque)}
                icon="warning"
              />
              <KPICard
                title="Modules en attente"
                value={stats.modulesEnAttente}
                subtitle="+7 jours"
                badgeColor={getBadgeColor(stats.modulesEnAttente)}
                icon="hub"
              />
              <KPICard
                title="Alertes période"
                value={stats.alertesPeriode}
                subtitle={`sur ${period === "24h" ? "24h" : period === "7d" ? "7 jours" : period === "30d" ? "30 jours" : "90 jours"}`}
                badgeColor="bg-slate-700"
                icon="notifications"
              />
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-slate-500">
                    dns
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                    Infrastructure
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      MQTT
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${getStatusColor(stats.infrastructure?.mqtt?.status)}`}
                      ></span>
                      <span className="text-xs text-green-600 font-medium">
                        {stats.infrastructure?.mqtt?.label || "Connecté"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      Base de données
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${getStatusColor(stats.infrastructure?.database?.status)}`}
                      ></span>
                      <span className="text-xs text-green-600 font-medium">
                        {stats.infrastructure?.database?.label || "OK"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filtres */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Rechercher par poulailler..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <select
                value={filters.severity}
                onChange={(e) =>
                  setFilters({ ...filters, severity: e.target.value })
                }
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">Toutes sévérités</option>
                <option value="critical">Critique</option>
                <option value="warning">Avertissement</option>
              </select>
              <select
                value={filters.parameter}
                onChange={(e) =>
                  setFilters({ ...filters, parameter: e.target.value })
                }
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">Tous paramètres</option>
                <option value="temperature">Température</option>
                <option value="humidity">Humidité</option>
                <option value="co2">CO2</option>
                <option value="nh3">NH3</option>
                <option value="waterLevel">Niveau d'eau</option>
              </select>
              <select
                value={filters.read}
                onChange={(e) =>
                  setFilters({ ...filters, read: e.target.value })
                }
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">Tous statuts</option>
                <option value="true">Lues</option>
                <option value="false">Non lues</option>
              </select>
              <button
                onClick={clearFilters}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Réinitialiser les filtres"
              >
                <span className="material-symbols-outlined">restart_alt</span>
              </button>
            </div>
          </div>

          {/* Barre d'actions */}
          <div className="flex flex-wrap gap-2 mb-6">
            {selectedAlertes.length > 0 && (
              <div className="flex gap-2 mr-auto">
                <button
                  onClick={handleMarkSelectedAsRead}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm"
                >
                  Marquer lu ({selectedAlertes.length})
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
                >
                  Supprimer ({selectedAlertes.length})
                </button>
              </div>
            )}
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm ml-auto"
            >
              Exporter CSV
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-100 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={
                              selectedAlertes.length === alertes.length &&
                              alertes.length > 0
                            }
                            onChange={handleSelectAll}
                            className="rounded"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Sévérité
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Poulailler
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Paramètre
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Valeur
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {alertes.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-6 py-8 text-center text-slate-500"
                          >
                            Aucune alerte trouvée
                          </td>
                        </tr>
                      ) : (
                        alertes.map((alerte) => (
                          <tr
                            key={alerte.id}
                            className={`hover:bg-slate-50 ${!alerte.read ? "bg-slate-50" : ""}`}
                          >
                            <td className="px-4 py-4">
                              <input
                                type="checkbox"
                                checked={selectedAlertes.includes(alerte.id)}
                                onChange={() => handleSelect(alerte.id)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                  alerte.severity === "critical"
                                    ? "bg-red-500 text-white"
                                    : "bg-orange-400 text-white"
                                }`}
                              >
                                {alerte.severity === "critical"
                                  ? "Critique"
                                  : "Avertissement"}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div>
                                <p className="font-medium text-slate-900">
                                  {alerte.poulailler?.name || "Inconnu"}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {alerte.poulailler?.eleveur?.name}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {parameterLabels[alerte.parameter] ||
                                alerte.parameter}
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              <span className="font-medium">
                                {alerte.value}
                              </span>
                              {alerte.threshold && (
                                <span className="text-slate-400">
                                  {" "}
                                  / {alerte.threshold}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              {!alerte.read && (
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-slate-200 text-slate-700">
                                  Non lue
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-slate-500">
                              {alerte.createdAtFormatted}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-end gap-1">
                                {!alerte.read && (
                                  <button
                                    onClick={() => handleMarkAsRead(alerte.id)}
                                    className="p-2 text-slate-400 hover:text-slate-600"
                                    title="Marquer comme lu"
                                  >
                                    <span className="material-symbols-outlined text-sm">
                                      mark_email_read
                                    </span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDelete(alerte.id)}
                                  className="p-2 text-slate-400 hover:text-red-600"
                                  title="Supprimer"
                                >
                                  <span className="material-symbols-outlined text-sm">
                                    delete
                                  </span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {pagination.pages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-slate-500">
                    Affichage de {(pagination.page - 1) * pagination.limit + 1}{" "}
                    à{" "}
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total,
                    )}{" "}
                    sur {pagination.total}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          page: prev.page - 1,
                        }))
                      }
                      disabled={pagination.page === 1}
                      className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm disabled:opacity-50"
                    >
                      Précédent
                    </button>
                    <span className="px-4 py-2 text-sm text-slate-600">
                      Page {pagination.page} / {pagination.pages}
                    </span>
                    <button
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          page: prev.page + 1,
                        }))
                      }
                      disabled={pagination.page === pagination.pages}
                      className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm disabled:opacity-50"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function KPICard({
  title,
  value,
  subtitle,
  badgeColor,
  icon,
}: {
  title: string;
  value: number;
  subtitle: string;
  badgeColor: string;
  icon: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="material-symbols-outlined text-slate-400">{icon}</span>
        <span
          className={`px-2 py-0.5 rounded-full text-xs text-white ${badgeColor}`}
        >
          {value > 0 ? value : "0"}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="text-xs text-slate-500 mt-1">{title}</p>
      <p className="text-xs text-slate-400">{subtitle}</p>
    </div>
  );
}
