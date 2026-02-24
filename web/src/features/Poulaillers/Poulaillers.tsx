import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { poulaillersAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import { cn } from "../../lib/utils";
import { formatLastCheck } from "../../lib/utils";

interface PoulaillerAdmin {
  id: string;
  codeUnique: string;
  name: string;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
  };
  status: string;
  lastMeasure?: {
    temperature: number;
    humidity: number;
  };
  alertesActives: number;
  dernierPing?: string;
  modePorte?: string;
  etatPorte?: string;
  modeVentilateur?: string;
  etatVentilateur?: string;
}

export default function PoulaillersAdmin() {
  const [poulaillers, setPoulaillers] = useState<PoulaillerAdmin[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPoulaillers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await poulaillersAPI.getAll();
      setPoulaillers(response.data.data);
    } catch (err: any) {
      console.error("Erreur fetchPoulaillers:", err);
      setError(err.response?.data?.error || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPoulaillers();
  }, []);

  const filtered = poulaillers.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.codeUnique?.toLowerCase().includes(search.toLowerCase()) ||
      p.owner?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      p.owner?.lastName?.toLowerCase().includes(search.toLowerCase()),
  );

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "connecte":
        return "Connecté";
      case "alerte":
        return "Alerte";
      case "hors_ligne":
        return "Hors ligne";
      case "en_attente_module":
        return "En attente";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          {/* En-tête */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Tous les Poulaillers
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Supervision globale · {filtered.length} installations
              </p>
            </div>

            <button className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition">
              <span className="material-symbols-outlined">download</span>
              Exporter CSV
            </button>
          </div>

          {/* Recherche */}
          <div className="mb-6">
            <div className="relative max-w-xl">
              <input
                type="text"
                placeholder="Rechercher nom, code ou éleveur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <span className="material-symbols-outlined">search</span>
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Tableau */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 flex justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                <span className="material-symbols-outlined text-6xl opacity-50 mb-4 block">
                  search_off
                </span>
                <p className="text-lg font-medium">
                  Aucun poulailler ne correspond
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                        <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Code / Nom
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Éleveur
                        </th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Statut
                        </th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Temp / Hum
                        </th>
                        <th className="px-6 py-4 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Alertes
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                          Dernier ping
                        </th>
                        <th className="px-6 py-4 text-right w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {filtered.map((p) => (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900/30"
                        >
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {p.codeUnique}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {p.name}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {p.owner ? (
                              <Link
                                to={`/eleveurs/${p.owner.id}`}
                                className="text-primary hover:underline text-sm"
                              >
                                {p.owner.firstName} {p.owner.lastName}
                              </Link>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span
                              className={cn(
                                "inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full",
                                p.status === "connecte"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : p.status === "alerte"
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                                    : p.status === "hors_ligne"
                                      ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
                              )}
                            >
                              {getStatusLabel(p.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-xs font-mono text-slate-700 dark:text-slate-300">
                            {p.lastMeasure?.temperature
                              ? `${p.lastMeasure.temperature}°C`
                              : "—"}
                            <br />
                            {p.lastMeasure?.humidity
                              ? `${p.lastMeasure.humidity}%`
                              : "—"}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {p.alertesActives > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 rounded-full text-xs font-medium">
                                <span className="material-symbols-outlined text-sm">
                                  warning
                                </span>
                                {p.alertesActives}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                0
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right text-xs text-slate-500 dark:text-slate-400">
                            {p.dernierPing
                              ? formatLastCheck(p.dernierPing)
                              : "—"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link
                              to={`/poulaillers/${p.id}`}
                              className="p-2 inline-block text-slate-500 hover:text-primary transition"
                              title="Voir détails"
                            >
                              <span className="material-symbols-outlined">
                                visibility
                              </span>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
