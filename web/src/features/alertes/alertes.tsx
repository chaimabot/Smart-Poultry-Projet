import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { alertesAPI, poulaillersAPI, eleveursAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";

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

const parameterLabels: Record<string, string> = {
  temperature: "Température",
  humidity: "Humidité",
  co2: "CO₂",
  nh3: "NH₃",
  ammonia: "NH₃ (Ammoniac)",
  dust: "Poussière",
  waterLevel: "Niveau d'eau",
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

  const [pagination, setPagination] = useState({
    page: 1,
    pages: 1,
    total: 0,
    limit: 15,
  });
  const [selectedAlertes, setSelectedAlertes] = useState<string[]>([]);

  const fetchPoulaillers = async () => {
    try {
      const response = await poulaillersAPI.getAll({ limit: 1000 });
      setPoulaillers(response.data.data || []);
    } catch (err) {
      console.error("Erreur fetchPoulaillers:", err);
    }
  };

  const fetchEleveurs = async () => {
    try {
      const response = await eleveursAPI.getAll({ limit: 1000 });
      setEleveurs(response.data.data || []);
    } catch (err) {
      console.error("Erreur fetchEleveurs:", err);
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
    fetchAlertes();
  }, [filters, pagination.page, dateStart, dateEnd]);

  useEffect(() => {
    fetchPoulaillers();
    fetchEleveurs();
  }, []);

  const handleMarkAllAsRead = async () => {
    if (!confirm("Voulez-vous marquer toutes les alertes comme lues?")) return;
    try {
      const allIds = alertes.map((a) => a.id);
      await alertesAPI.markMultipleAsRead(allIds);
      fetchAlertes();
    } catch (err) {
      console.error("Erreur markAllAsRead:", err);
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
    } catch (err) {
      console.error("Erreur markMultipleAsRead:", err);
    }
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

  const nonLuesCount = alertes.filter((a) => !a.read).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          {/* En-tête */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Alertes Système
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  Supervision globale de toutes les alertes
                </p>
              </div>
            </div>
          </div>

          {/* Filtres */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Dates */}
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                />
                <span className="text-slate-500">à</span>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                />
              </div>

              {/* Filtre par éleveur */}
              <select
                value={filters.eleveurId}
                onChange={(e) =>
                  setFilters({ ...filters, eleveurId: e.target.value })
                }
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm min-w-[160px]"
              >
                <option value="">Tous les éleveurs</option>
                {eleveurs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>

              {/* Filtre par poulailler */}
              <select
                value={filters.poulaillerId}
                onChange={(e) =>
                  setFilters({ ...filters, poulaillerId: e.target.value })
                }
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm min-w-[160px]"
              >
                <option value="">Tous les poulaillers</option>
                {poulaillers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.code ? `(${p.code})` : ""}
                  </option>
                ))}
              </select>

              {/* Filtre paramètre */}
              <select
                value={filters.parameter}
                onChange={(e) =>
                  setFilters({ ...filters, parameter: e.target.value })
                }
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
              >
                <option value="">Tous paramètres</option>
                <option value="temperature">Température</option>
                <option value="humidity">Humidité</option>
                <option value="co2">CO₂</option>
                <option value="nh3">NH₃</option>
                <option value="dust">Poussière</option>
                <option value="waterLevel">Niveau d'eau</option>
              </select>

              {/* Filtre lecture */}
              <select
                value={filters.read}
                onChange={(e) =>
                  setFilters({ ...filters, read: e.target.value })
                }
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
              >
                <option value="">Toutes</option>
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

          {/* Barre d'actions de sélection */}
          {selectedAlertes.length > 0 && (
            <div className="flex gap-2 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span className="text-sm text-blue-700 dark:text-blue-300 self-center">
                {selectedAlertes.length} alerte(s) sélectionnée(s)
              </span>
              <button
                onClick={handleMarkSelectedAsRead}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
              >
                Marquer comme lu
              </button>
              <button
                onClick={() => setSelectedAlertes([])}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm"
              >
                Annuler
              </button>
            </div>
          )}

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
                        <th className="px-3 py-3">
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
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Poulailler
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Éleveur
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Paramètre
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Valeur
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Seuil
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Date
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Statut
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
                            className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                              !alerte.read
                                ? "bg-blue-50/50 dark:bg-blue-900/10"
                                : ""
                            }`}
                          >
                            <td className="px-3 py-4">
                              <input
                                type="checkbox"
                                checked={selectedAlertes.includes(alerte.id)}
                                onChange={() => handleSelect(alerte.id)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-3 py-4">
                              <Link
                                to={`/poulaillers/${alerte.poulailler?.id}`}
                                className="font-medium text-slate-900 dark:text-white hover:text-blue-600 hover:underline"
                              >
                                {alerte.poulailler?.name || "Inconnu"}
                              </Link>
                              {alerte.poulailler?.code && (
                                <p className="text-xs text-slate-500">
                                  {alerte.poulailler.code}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-4">
                              <div>
                                <p className="text-sm text-slate-900 dark:text-white">
                                  {alerte.poulailler?.eleveur?.name || "—"}
                                </p>
                                {alerte.poulailler?.eleveur?.email && (
                                  <p className="text-xs text-slate-500">
                                    {alerte.poulailler.eleveur.email}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-4 text-slate-600 dark:text-slate-300">
                              {parameterLabels[alerte.parameter] ||
                                alerte.parameter}
                            </td>
                            <td className="px-3 py-4">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {alerte.value}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-slate-500">
                              {alerte.threshold && (
                                <span>
                                  {alerte.thresholdType === "min"
                                    ? "Min: "
                                    : "Max: "}
                                  {alerte.threshold}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-4 text-slate-500 text-sm">
                              {formatDateTime(alerte.createdAt)}
                            </td>
                            <td className="px-3 py-4">
                              {!alerte.read ? (
                                <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  Non lue
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  Lue
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-slate-500">
                    Affichage de {(pagination.page - 1) * pagination.limit + 1}{" "}
                    à{" "}
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total,
                    )}{" "}
                    sur {pagination.total} alerte(s)
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
                      className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
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
                      className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
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
