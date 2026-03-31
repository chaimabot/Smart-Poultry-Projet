import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { dashboardAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Types
interface DashboardStats {
  eleveurs: { total: number; nouveauxCeMois: number };
  poulaillers: {
    total: number;
    connects: number;
    horsLigne: number;
    enAttente: number;
  };
  modules: { total: number; associes: number; libres: number };
  alertesActives: number;
  derniereMiseAJour: string;
}

interface AlerteRecente {
  id: string;
  severity: string;
  parameter: string;
  poulailler: string;
  value: number;
  resolved: boolean;
  tempsAgo: string;
}

interface PoulaillerCritique {
  id: string;
  nom: string;
  code: string;
  eleveur: string;
  eleveurEmail: string;
  severite: string;
  probleme: string;
  depuis: string;
  derniereMesure: string;
  alertesCount: number;
}

interface ActiviteRecente {
  type: string;
  description: string;
  tempsAgo: string;
}

const COLORS = {
  green: "#22c55e",
  red: "#ef4444",
  orange: "#f97316",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  yellow: "#eab308",
};

const PARAMETER_LABELS: Record<string, string> = {
  temperature: "Température",
  humidity: "Humidité",
  co2: "CO₂",
  nh3: "NH₃",
  dust: "Poussière",
  waterLevel: "Eau",
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alertesChart, setAlertesChart] = useState<any>(null);
  const [modulesActivity, setModulesActivity] = useState<any[]>([]);
  const [alertesRecentes, setAlertesRecentes] = useState<AlerteRecente[]>([]);
  const [poulaillersCritiques, setPoulaillersCritiques] = useState<
    PoulaillerCritique[]
  >([]);
  const [activiteRecente, setActiviteRecente] = useState<ActiviteRecente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"7d" | "30d">("7d");

  // Date et heure actuelles
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Appel basique - sans Promise.all pour mieux gérer les erreurs
      const statsRes = await dashboardAPI.getStats();
      if (statsRes.data?.data) {
        setStats(statsRes.data.data);
      }

      try {
        const alertsChartRes = await dashboardAPI.getAlertesChart(chartPeriod);
        if (alertsChartRes.data?.data) {
          setAlertesChart(alertsChartRes.data.data);
        }
      } catch (e) {
        console.warn("Alertes chart error:", e);
      }

      try {
        const modulesActivityRes = await dashboardAPI.getModulesActivity();
        if (modulesActivityRes.data?.data) {
          setModulesActivity(modulesActivityRes.data.data);
        }
      } catch (e) {
        console.warn("Modules activity error:", e);
      }

      try {
        const alertesRes = await dashboardAPI.getAlertesRecentes(5);
        if (alertesRes.data?.data) {
          setAlertesRecentes(alertesRes.data.data);
        }
      } catch (e) {
        console.warn("Alertes recentes error:", e);
      }

      try {
        const critiquesRes = await dashboardAPI.getPoulaillersCritiques(5);
        if (critiquesRes.data?.data) {
          setPoulaillersCritiques(critiquesRes.data.data);
        }
      } catch (e) {
        console.warn("Critiques error:", e);
      }

      try {
        const activiteRes = await dashboardAPI.getActiviteRecente(5);
        if (activiteRes.data?.data) {
          setActiviteRecente(activiteRes.data.data);
        }
      } catch (e) {
        console.warn("Activite error:", e);
      }
    } catch (err: any) {
      console.error("Erreur dashboard:", err);
      if (err.response?.status === 401) {
        setError("Vous devez être connecté pour voir le dashboard");
      } else {
        setError(err.response?.data?.error || "Erreur lors du chargement");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, [chartPeriod]);

  // Formater la date en français
  const formatDateFR = (date: Date) => {
    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTimeFR = (date: Date) => {
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Préparer les données du graphique d'alertes par jour
  const getAlertesByDayData = () => {
    if (!alertesChart?.alertsByDay) return [];

    const days = [];
    const now = new Date();
    const periodDays = chartPeriod === "7d" ? 7 : 30;

    for (let i = periodDays - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const found = alertesChart.alertsByDay.find(
        (a: any) => a._id === dateStr,
      );
      days.push({
        date: date.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
        }),
        alertes: found?.total || 0,
      });
    }
    return days;
  };

  // Préparer les données du donut État du parc
  const getParcData = () => {
    if (!stats) return [];
    return [
      {
        name: "Connectés",
        value: stats.poulaillers.connects,
        color: COLORS.green,
      },
      {
        name: "Hors-ligne",
        value: stats.poulaillers.horsLigne,
        color: COLORS.red,
      },
      {
        name: "En attente",
        value: stats.poulaillers.enAttente,
        color: COLORS.orange,
      },
    ].filter((d) => d.value > 0);
  };

  // Préparer les données du graphique alertes par paramètre
  const getAlertesByParamData = () => {
    if (!alertesChart?.alertsByParam) return [];

    const paramOrder = [
      "temperature",
      "humidity",
      "co2",
      "nh3",
      "dust",
      "waterLevel",
    ];
    const data = alertesChart.alertsByParam.map((a: any) => ({
      parameter: PARAMETER_LABELS[a.parameter] || a.parameter,
      total: a.total,
    }));

    // Trier selon l'ordre défini
    return data.sort((a: any, b: any) => {
      return paramOrder.indexOf(a.parameter) - paramOrder.indexOf(b.parameter);
    });
  };

  // Préparer les données d'activité des modules
  const getModulesActivityData = () => {
    const hours = [];
    const now = new Date();

    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now);
      hourDate.setHours(now.getHours() - i, 0, 0, 0);
      const hourStr = `${hourDate.getHours().toString().padStart(2, "0")}:00`;

      const found = modulesActivity.find((m: any) => m._id === hourStr);
      hours.push({
        hour: `${hourStr}`,
        mesures: found?.total || 0,
      });
    }
    return hours;
  };

  const systemStatus =
    stats?.alertesActives === 0
      ? "Système opérationnel"
      : `${stats?.alertesActives || 0} problème(s) détecté(s)`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          {/* SECTION 1 - EN-TÊTE */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Dashboard
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                {formatDateFR(currentDateTime)} à{" "}
                {formatTimeFR(currentDateTime)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`px-4 py-2 rounded-full text-sm font-medium ${
                  stats?.alertesActives === 0
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}
              >
                {systemStatus}
              </span>
              <button
                onClick={fetchDashboardData}
                className="p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                title="Actualiser"
              >
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
                  refresh
                </span>
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={fetchDashboardData}
                className="mt-2 text-sm text-red-700 underline"
              >
                Réessayer
              </button>
            </div>
          )}

          {loading && !stats ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
            </div>
          ) : (
            <>
              {/* SECTION 2 - 4 KPI CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* Card 1 - Éleveurs */}
                <KpiCard
                  icon="person"
                  color="blue"
                  label="Éleveurs"
                  value={stats?.eleveurs.total || 0}
                  subInfo={`${stats?.eleveurs.nouveauxCeMois || 0} nouveaux ce mois`}
                />

                {/* Card 2 - Poulaillers */}
                <KpiCard
                  icon="home"
                  color="green"
                  label="Poulaillers"
                  value={stats?.poulaillers.total || 0}
                  subInfo={`${stats?.poulaillers.connects || 0} connectés · ${stats?.poulaillers.horsLigne || 0} hors-ligne · ${stats?.poulaillers.enAttente || 0} en attente`}
                />

                {/* Card 3 - Modules ESP32 */}
                <KpiCard
                  icon="sensors"
                  color="purple"
                  label="Modules ESP32"
                  value={stats?.modules.total || 0}
                  subInfo={`${stats?.modules.associes || 0} associés · ${stats?.modules.libres || 0} libres`}
                />

                {/* Card 4 - Alertes actives */}
                <KpiCard
                  icon="warning"
                  color={(stats?.alertesActives || 0) > 0 ? "red" : "green"}
                  label="Alertes actives"
                  value={stats?.alertesActives || 0}
                  subInfo="actuelles"
                />
              </div>

              {/* SECTION 3 - GRAPHIQUE ALERTES + DONUT ÉTAT PARC */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Graphique 1 - Alertes des 7/30 derniers jours */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      Alertes des {chartPeriod === "7d" ? "7" : "30"} derniers
                      jours
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setChartPeriod("7d")}
                        className={`px-3 py-1 text-xs rounded-lg ${
                          chartPeriod === "7d"
                            ? "bg-slate-800 text-white"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        7j
                      </button>
                      <button
                        onClick={() => setChartPeriod("30d")}
                        className={`px-3 py-1 text-xs rounded-lg ${
                          chartPeriod === "30d"
                            ? "bg-slate-800 text-white"
                            : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        30j
                      </button>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={getAlertesByDayData()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 12 }}
                          stroke="#64748b"
                        />
                        <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e293b",
                            border: "none",
                            borderRadius: "8px",
                            color: "#fff",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="alertes"
                          stroke="#ef4444"
                          fill="#fecaca"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Graphique 2 - Donut État du parc */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                    État du parc
                  </h3>
                  <div className="h-48 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getParcData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {getParcData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-2xl font-bold text-slate-900 dark:text-white">
                        {stats?.poulaillers.total || 0}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 mt-4">
                    {getParcData().map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          ></span>
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {item.value} (
                          {Math.round(
                            (item.value / (stats?.poulaillers.total || 1)) *
                              100,
                          )}
                          %)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 4 - ALERTES PAR PARAMÈTRE + ACTIVITÉ MODULES */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Graphique 3 - Alertes par paramètre */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                    Alertes par paramètre (7j)
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={getAlertesByParamData()}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 12 }}
                          stroke="#64748b"
                        />
                        <YAxis
                          type="category"
                          dataKey="parameter"
                          tick={{ fontSize: 12 }}
                          stroke="#64748b"
                          width={80}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e293b",
                            border: "none",
                            borderRadius: "8px",
                            color: "#fff",
                          }}
                        />
                        <Bar
                          dataKey="total"
                          fill="#ef4444"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Graphique 4 - Activité des modules */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
                    Activité des modules (24h)
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getModulesActivityData()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 10 }}
                          stroke="#64748b"
                          interval={3}
                        />
                        <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e293b",
                            border: "none",
                            borderRadius: "8px",
                            color: "#fff",
                          }}
                        />
                        <Bar
                          dataKey="mesures"
                          fill="#8b5cf6"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* SECTION 5 - POULAILLERS CRITIQUES */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-6">
                <div className="p-5 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    Poulaillers critiques
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Sévérité
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Poulailler
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Éleveur
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Problème
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Depuis
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                          Dernière mesure
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {poulaillersCritiques.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-5 py-8 text-center text-slate-500 dark:text-slate-400"
                          >
                            Tous les poulaillers fonctionnent normalement
                          </td>
                        </tr>
                      ) : (
                        poulaillersCritiques.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-900/30"
                          >
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  p.severite === "critical"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                    : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                                }`}
                              >
                                {p.severite === "critical"
                                  ? "Critique"
                                  : "Avertissement"}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <div>
                                <p className="font-medium text-slate-900 dark:text-white">
                                  {p.nom}
                                </p>
                                <p className="text-xs text-slate-500">
                                  Code: {p.code}
                                </p>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div>
                                <p className="text-sm text-slate-900 dark:text-white">
                                  {p.eleveur}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {p.eleveurEmail}
                                </p>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                              {p.probleme}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-500">
                              {p.depuis}
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-500">
                              {p.derniereMesure}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <Link
                                to={`/poulaillers/${p.id}`}
                                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                              >
                                Voir
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION 6 - DERNIÈRES ALERTES + ACTIVITÉ RÉCENTE */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Colonne gauche - Dernières alertes */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      Dernières alertes
                    </h3>
                    <Link
                      to="/alertes"
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Voir toutes les alertes →
                    </Link>
                  </div>
                  <div className="p-5 space-y-3">
                    {alertesRecentes.length === 0 ? (
                      <p className="text-slate-500 text-center py-4">
                        Aucune alerte récente
                      </p>
                    ) : (
                      alertesRecentes.map((alerte) => (
                        <div
                          key={alerte.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50"
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              alerte.severity === "critical"
                                ? "bg-red-500"
                                : "bg-orange-500"
                            }`}
                          ></span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {PARAMETER_LABELS[alerte.parameter] ||
                                alerte.parameter}
                            </p>
                            <p className="text-xs text-slate-500">
                              {alerte.poulailler}
                            </p>
                          </div>
                          <div className="text-right">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                alerte.resolved
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                              }`}
                            >
                              {alerte.resolved ? "Résolue" : "Active"}
                            </span>
                            <p className="text-xs text-slate-400 mt-1">
                              {alerte.tempsAgo}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Colonne droite - Activité récente */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <div className="p-5 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      Activité récente
                    </h3>
                  </div>
                  <div className="p-5 space-y-3">
                    {activiteRecente.length === 0 ? (
                      <p className="text-slate-500 text-center py-4">
                        Aucune activité récente
                      </p>
                    ) : (
                      activiteRecente.map((activite, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50"
                        >
                          <span className="material-symbols-outlined text-slate-400">
                            {activite.type === "user_created"
                              ? "person_add"
                              : activite.type === "module_associated"
                                ? "sensors"
                                : activite.type === "poulailler_added"
                                  ? "home"
                                  : "info"}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm text-slate-900 dark:text-white">
                              {activite.description}
                            </p>
                            <p className="text-xs text-slate-400">
                              {activite.tempsAgo}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 7 - RACCOURCIS ACTIONS RAPIDES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <ActionCard
                  icon="person_add"
                  label="Créer un éleveur"
                  to="/utilisateurs"
                />
                <ActionCard
                  icon="sensors"
                  label="Associer un module"
                  to="/modules"
                />
                <ActionCard
                  icon="home"
                  label="Voir tous les poulaillers"
                  to="/poulaillers"
                />
                <ActionCard
                  icon="assessment"
                  label="Consulter les rapports"
                  to="/rapports"
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Composant KPI Card
function KpiCard({
  icon,
  color,
  label,
  value,
  subInfo,
}: {
  icon: string;
  color: "blue" | "green" | "red" | "purple" | "orange";
  label: string;
  value: number;
  subInfo: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${colors[color]}`}>
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
        {value}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {subInfo}
      </p>
    </div>
  );
}

// Composant Action Card
function ActionCard({
  icon,
  label,
  to,
}: {
  icon: string;
  label: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all"
    >
      <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
        {icon}
      </span>
      <span className="font-medium text-slate-900 dark:text-white">
        {label}
      </span>
    </Link>
  );
}
