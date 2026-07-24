import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { alertesAPI, poulaillersAPI, eleveursAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Alerte {
  id: string;
  severity: "critical" | "warning";
  parameter: string;
  value: number;
  threshold?: number;
  thresholdType?: "min" | "max";
  direction?: string;
  message?: string;
  read: boolean;
  resolved: boolean;
  resolvedAt?: string;
  poulailler: {
    id: string;
    name: string;
    code?: string;
    eleveur?: {
      id: string;
      name: string;
      email: string;
    };
  };
  createdAt: string;
}

interface Poulailler {
  id: string;
  name: string;
  code?: string;
}

interface Eleveur {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Pagination {
  page: number;
  pages: number;
  total: number;
  limit: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PARAMETER_LABELS: Record<string, string> = {
  temperature: "Température",
  humidity: "Humidité",
  co2: "CO₂",
  nh3: "NH₃",
  ammonia: "NH₃",
  dust: "Poussière",
  waterLevel: "Niveau d'eau",
};

const PARAMETER_UNITS: Record<string, string> = {
  temperature: "°C",
  humidity: "%",
  co2: "ppm",
  nh3: "ppm",
  ammonia: "ppm",
  dust: "mg/m³",
  waterLevel: "cm",
};

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  colorClass,
}: {
  icon: string;
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`material-symbols-outlined text-sm ${colorClass}`}>
          {icon}
        </span>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </p>
      </div>
      <p className={`text-2xl font-semibold ${colorClass}`}>{value}</p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: "critical" | "warning" }) {
  if (severity === "critical") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <span className="material-symbols-outlined text-[11px]">
          error_outline
        </span>
        Critique
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <span className="material-symbols-outlined text-[11px]">warning</span>
      Avert.
    </span>
  );
}

function StatusBadge({ alerte }: { alerte: Alerte }) {
  if (alerte.resolved) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <span className="material-symbols-outlined text-[12px]">
          check_circle
        </span>
        Résolue
      </span>
    );
  }
  if (!alerte.read) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <span className="material-symbols-outlined text-[12px]">
          notifications_active
        </span>
        Non lue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
      <span className="material-symbols-outlined text-[12px]">drafts</span>
      Lue
    </span>
  );
}

function EmptyState() {
  return (
    <tr>
      <td colSpan={9} className="px-6 py-16 text-center">
        <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 block mb-3">
          notifications_off
        </span>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
          Aucune alerte pour ces critères
        </p>
        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
          Modifiez les filtres pour afficher d'autres résultats
        </p>
      </td>
    </tr>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Alertes() {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [poulaillers, setPoulaillers] = useState<Poulailler[]>([]);
  const [eleveurs, setEleveurs] = useState<Eleveur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [filters, setFilters] = useState({
    resolved: "",
    read: "",
    parameter: "",
    poulaillerId: "",
    eleveurId: "",
  });

  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pages: 1,
    total: 0,
    limit: 15,
  });

  const [selectedAlertes, setSelectedAlertes] = useState<string[]>([]);
  const [markingRead, setMarkingRead] = useState(false);

  // ── Chargement des données ──

  const fetchPoulaillers = async () => {
    try {
      const res = await poulaillersAPI.getAll({ limit: 1000 });
      setPoulaillers(res.data.data || []);
    } catch (err) {
      console.error("fetchPoulaillers:", err);
    }
  };

  const fetchEleveurs = async () => {
    try {
      const res = await eleveursAPI.getAll({ limit: 1000 });
      setEleveurs(res.data.data || []);
    } catch (err) {
      console.error("fetchEleveurs:", err);
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
      if (dateStart) params.startDate = dateStart;
      if (dateEnd) params.endDate = dateEnd;
      if (filters.resolved !== "") params.resolved = filters.resolved;
      if (filters.read !== "") params.read = filters.read;
      if (filters.parameter) params.parameter = filters.parameter;
      if (filters.poulaillerId) params.poulaillerId = filters.poulaillerId;
      if (filters.eleveurId) params.eleveurId = filters.eleveurId;

      const res = await alertesAPI.getAll(params);
      setAlertes(res.data.data);
      setPagination((prev) => ({ ...prev, ...res.data.pagination }));
    } catch (err: any) {
      console.error("fetchAlertes:", err);
      setError(err.response?.data?.error || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertes();
  }, [
    pagination.page,
    pagination.limit,
    dateStart,
    dateEnd,
    filters.resolved,
    filters.read,
    filters.parameter,
    filters.poulaillerId,
    filters.eleveurId,
  ]);

  useEffect(() => {
    fetchPoulaillers();
    fetchEleveurs();
  }, []);

  // ── Actions ──

  const handleMarkAllAsRead = async () => {
    if (!confirm("Marquer toutes les alertes comme lues ?")) return;
    setMarkingRead(true);
    try {
      await alertesAPI.markMultipleAsRead(alertes.map((a) => a.id));
      fetchAlertes();
    } catch (err) {
      console.error(err);
    } finally {
      setMarkingRead(false);
    }
  };

  const handleMarkSelectedAsRead = async () => {
    if (selectedAlertes.length === 0) return;
    setMarkingRead(true);
    try {
      await alertesAPI.markMultipleAsRead(selectedAlertes);
      setSelectedAlertes([]);
      fetchAlertes();
    } catch (err) {
      console.error(err);
    } finally {
      setMarkingRead(false);
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
    setSelectedAlertes((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const clearFilters = () => {
    setFilters({
      resolved: "",
      read: "",
      parameter: "",
      poulaillerId: "",
      eleveurId: "",
    });
    setDateStart("");
    setDateEnd("");
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // ── Stats ──
  const unreadCount = alertes.filter((a) => !a.read).length;
  const criticalCount = alertes.filter((a) => a.severity === "critical").length;
  const warningCount = alertes.filter((a) => a.severity === "warning").length;
  const hasActiveFilters =
    dateStart || dateEnd || Object.values(filters).some(Boolean);

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">
          {/* ── En-tête ── */}
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-xl text-slate-500">
                notifications
              </span>
              Alertes système
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 ml-7">
              Supervision globale — toutes les alertes en temps réel
            </p>
          </div>

          {/* ── Cartes statistiques ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              icon="notifications_active"
              label="Non lues"
              value={unreadCount}
              colorClass="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              icon="error_outline"
              label="Critiques"
              value={criticalCount}
              colorClass="text-red-600 dark:text-red-400"
            />
            <StatCard
              icon="warning"
              label="Avertissements"
              value={warningCount}
              colorClass="text-amber-600 dark:text-amber-400"
            />
            <StatCard
              icon="format_list_bulleted"
              label="Total affiché"
              value={pagination.total}
              colorClass="text-slate-600 dark:text-slate-300"
            />
          </div>

          {/* ── Filtres ── */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Dates */}

              {/* Éleveur */}
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-slate-400">
                  person
                </span>
                <select
                  value={filters.eleveurId}
                  onChange={(e) => setFilter("eleveurId", e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-w-[150px]"
                >
                  <option value="">Tous les éleveurs</option>
                  {eleveurs.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Poulailler */}
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-slate-400">
                  warehouse
                </span>
                <select
                  value={filters.poulaillerId}
                  onChange={(e) => setFilter("poulaillerId", e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-w-[150px]"
                >
                  <option value="">Tous les poulaillers</option>
                  {poulaillers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.code ? `(${p.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reset */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">
                    restart_alt
                  </span>
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* ── Barre d'actions sélection ── */}
          {selectedAlertes.length > 0 && (
            <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
              <span className="material-symbols-outlined text-sm text-blue-600 dark:text-blue-400">
                check_box
              </span>
              <span className="text-sm text-blue-700 dark:text-blue-300 flex-1">
                <strong>{selectedAlertes.length}</strong> alerte
                {selectedAlertes.length > 1 ? "s" : ""} sélectionnée
                {selectedAlertes.length > 1 ? "s" : ""}
              </span>
              <button
                onClick={handleMarkSelectedAsRead}
                disabled={markingRead}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <span className="material-symbols-outlined text-sm">
                  drafts
                </span>
                Marquer comme lues
              </button>
              <button
                onClick={() => setSelectedAlertes([])}
                className="px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          )}

          {/* ── Erreur ── */}
          {error && (
            <div className="mb-4 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <span className="material-symbols-outlined text-red-500">
                error
              </span>
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              <button
                onClick={fetchAlertes}
                className="ml-auto text-xs text-red-600 underline hover:no-underline"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* ── Tableau ── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-200" />
              <p className="text-sm text-slate-400">Chargement des alertes…</p>
            </div>
          ) : (
            <>
              {/* Barre d'info + action globale */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {unreadCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-medium">
                      <span className="material-symbols-outlined text-sm">
                        notifications_active
                      </span>
                      {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                      <span className="material-symbols-outlined text-sm">
                        check_circle
                      </span>
                      Tout lu
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    disabled={markingRead}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">
                      done_all
                    </span>
                    Tout marquer comme lu
                  </button>
                )}
              </div>

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th className="w-10 px-3 py-3">
                          <input
                            type="checkbox"
                            checked={
                              alertes.length > 0 &&
                              selectedAlertes.length === alertes.length
                            }
                            ref={(el) => {
                              if (el) {
                                el.indeterminate =
                                  selectedAlertes.length > 0 &&
                                  selectedAlertes.length < alertes.length;
                              }
                            }}
                            onChange={handleSelectAll}
                            className="rounded accent-blue-600 cursor-pointer"
                          />
                        </th>
                        {/* Barre sévérité */}
                        <th className="w-1.5 p-0" />
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          Poulailler
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          Éleveur
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          Paramètre
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          Valeur mesurée
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          Seuil
                        </th>
                        <th className="px-3 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {alertes.length === 0 ? (
                        <EmptyState />
                      ) : (
                        alertes.map((alerte) => (
                          <tr
                            key={alerte.id}
                            className={`group transition-colors ${
                              !alerte.read && !alerte.resolved
                                ? "bg-blue-50/40 dark:bg-blue-900/5 hover:bg-blue-50/70 dark:hover:bg-blue-900/10"
                                : "hover:bg-slate-50 dark:hover:bg-slate-700/30"
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="px-3 py-3.5">
                              <input
                                type="checkbox"
                                checked={selectedAlertes.includes(alerte.id)}
                                onChange={() => handleSelect(alerte.id)}
                                className="rounded accent-blue-600 cursor-pointer"
                              />
                            </td>

                            {/* Barre de sévérité */}
                            <td className="p-0 w-1.5">
                              <div
                                className={`w-1.5 h-full min-h-[52px] ${
                                  alerte.severity === "critical"
                                    ? "bg-red-500"
                                    : "bg-amber-400"
                                }`}
                              />
                            </td>

                            {/* Poulailler */}
                            <td className="px-3 py-3.5">
                              <Link
                                to={`/poulaillers/${alerte.poulailler?.id}`}
                                className="font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-sm transition-colors"
                              >
                                {alerte.poulailler?.name || "Inconnu"}
                              </Link>
                              {alerte.poulailler?.code && (
                                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                                  {alerte.poulailler.code}
                                </p>
                              )}
                            </td>

                            {/* Éleveur */}
                            <td className="px-3 py-3.5">
                              <p className="text-sm text-slate-700 dark:text-slate-200">
                                {alerte.poulailler?.eleveur?.name || "—"}
                              </p>
                              {alerte.poulailler?.eleveur?.email && (
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {alerte.poulailler.eleveur.email}
                                </p>
                              )}
                            </td>

                            {/* Paramètre + sévérité */}
                            <td className="px-3 py-3.5">
                              <span className="inline-block text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                                {PARAMETER_LABELS[alerte.parameter] ||
                                  alerte.parameter}
                              </span>
                              <div className="mt-1.5">
                                <SeverityBadge severity={alerte.severity} />
                              </div>
                            </td>

                            {/* Valeur */}
                            <td className="px-3 py-3.5">
                              <span
                                className={`text-base font-semibold ${
                                  alerte.severity === "critical"
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {alerte.value}
                              </span>
                              <span className="text-xs text-slate-400 ml-1">
                                {PARAMETER_UNITS[alerte.parameter] || ""}
                              </span>
                            </td>

                            {/* Seuil */}
                            <td className="px-3 py-3.5 text-sm text-slate-500 dark:text-slate-400">
                              {alerte.threshold ? (
                                <span>
                                  <span className="text-xs font-medium text-slate-400 mr-1">
                                    {alerte.thresholdType === "min"
                                      ? "Min"
                                      : "Max"}
                                  </span>
                                  {alerte.threshold}
                                  <span className="text-xs text-slate-400 ml-0.5">
                                    {PARAMETER_UNITS[alerte.parameter] || ""}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">
                                  —
                                </span>
                              )}
                            </td>

                            {/* Date */}
                            <td className="px-3 py-3.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {formatDateTime(alerte.createdAt)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Pagination ── */}
              {pagination.pages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Affichage de{" "}
                    <strong className="text-slate-700 dark:text-slate-300">
                      {(pagination.page - 1) * pagination.limit + 1}
                    </strong>{" "}
                    à{" "}
                    <strong className="text-slate-700 dark:text-slate-300">
                      {Math.min(
                        pagination.page * pagination.limit,
                        pagination.total,
                      )}
                    </strong>{" "}
                    sur{" "}
                    <strong className="text-slate-700 dark:text-slate-300">
                      {pagination.total}
                    </strong>{" "}
                    alerte{pagination.total > 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          page: prev.page - 1,
                        }))
                      }
                      disabled={pagination.page === 1}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">
                        chevron_left
                      </span>
                      Précédent
                    </button>
                    <span className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg">
                      {pagination.page} / {pagination.pages}
                    </span>
                    <button
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          page: prev.page + 1,
                        }))
                      }
                      disabled={pagination.page === pagination.pages}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Suivant
                      <span className="material-symbols-outlined text-sm">
                        chevron_right
                      </span>
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
