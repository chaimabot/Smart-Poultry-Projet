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

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constantes ───────────────────────────────────────────────────────────────

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

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function formatDateFR(date: Date) {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimeFR(date: Date) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

/**
 * Carte KPI — redesignée avec un indicateur de tendance et une barre de contexte
 */
function KpiCard({
  icon,
  color,
  label,
  value,
  subInfo,
  urgent = false,
}: {
  icon: string;
  color: "blue" | "green" | "red" | "purple" | "orange";
  label: string;
  value: number;
  subInfo: string;
  urgent?: boolean;
}) {
  const colorMap: Record<string, { icon: string; ring: string; text: string }> =
    {
      blue: {
        icon: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
        ring: "border-blue-100 dark:border-blue-900/40",
        text: "text-blue-600 dark:text-blue-400",
      },
      green: {
        icon: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
        ring: "border-emerald-100 dark:border-emerald-900/40",
        text: "text-emerald-600 dark:text-emerald-400",
      },
      red: {
        icon: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
        ring: "border-red-200 dark:border-red-900/60",
        text: "text-red-600 dark:text-red-400",
      },
      purple: {
        icon: "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400",
        ring: "border-violet-100 dark:border-violet-900/40",
        text: "text-violet-600 dark:text-violet-400",
      },
      orange: {
        icon: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
        ring: "border-orange-100 dark:border-orange-900/40",
        text: "text-orange-600 dark:text-orange-400",
      },
    };

  const c = colorMap[color];

  return (
    <div
      className={`relative bg-white dark:bg-slate-800 border rounded-xl p-5 transition-shadow hover:shadow-md ${
        urgent
          ? "border-red-300 dark:border-red-700 shadow-red-100 dark:shadow-red-900/20 shadow-sm"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      {urgent && (
        <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
      )}
      <div
        className={`inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3 ${c.icon}`}
      >
        <span className="material-symbols-outlined text-xl">{icon}</span>
      </div>
      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p
        className={`text-3xl font-bold tabular-nums ${urgent && value > 0 ? c.text : "text-slate-900 dark:text-white"}`}
      >
        {value}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
        {subInfo}
      </p>
    </div>
  );
}

/**
 * Carte d'action rapide
 */
function ActionCard({
  icon,
  label,
  to,
  color = "blue",
}: {
  icon: string;
  label: string;
  to: string;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
    green:
      "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
    purple:
      "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20",
    orange:
      "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20",
  };
  return (
    <Link
      to={to}
      className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-sm transition-all group"
    >
      <span
        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}
      >
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </span>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
        {label}
      </span>
      <span className="material-symbols-outlined text-sm text-slate-300 dark:text-slate-600 ml-auto group-hover:text-slate-400 dark:group-hover:text-slate-400 transition-colors">
        chevron_right
      </span>
    </Link>
  );
}

/**
 * Tooltip personnalisé pour les graphiques
 */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 dark:bg-slate-700 border border-slate-700 dark:border-slate-600 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-semibold text-white">
          {p.value} <span className="font-normal text-slate-300">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

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
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const statsRes = await dashboardAPI.getStats();
      if (statsRes.data?.data) setStats(statsRes.data.data);

      await Promise.allSettled([
        dashboardAPI
          .getAlertesChart(chartPeriod)
          .then((r) => r.data?.data && setAlertesChart(r.data.data)),
        dashboardAPI
          .getModulesActivity()
          .then((r) => r.data?.data && setModulesActivity(r.data.data)),
        dashboardAPI
          .getAlertesRecentes(5)
          .then((r) => r.data?.data && setAlertesRecentes(r.data.data)),
        dashboardAPI
          .getPoulaillersCritiques(5)
          .then((r) => r.data?.data && setPoulaillersCritiques(r.data.data)),
        dashboardAPI
          .getActiviteRecente(5)
          .then((r) => r.data?.data && setActiviteRecente(r.data.data)),
      ]);
    } catch (err: any) {
      setError(
        err.response?.status === 401
          ? "Session expirée, veuillez vous reconnecter."
          : err.response?.data?.error || "Erreur lors du chargement",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, [chartPeriod]);

  // ── Données graphiques ──

  const getAlertesByDayData = () => {
    if (!alertesChart?.alertsByDay) return [];
    const periodDays = chartPeriod === "7d" ? 7 : 30;
    const now = new Date();
    return Array.from({ length: periodDays }, (_, i) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (periodDays - 1 - i));
      const dateStr = date.toISOString().split("T")[0];
      const found = alertesChart.alertsByDay.find(
        (a: any) => a._id === dateStr,
      );
      return {
        date: date.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
        }),
        alertes: found?.total || 0,
      };
    });
  };

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

  const getAlertesByParamData = () => {
    if (!alertesChart?.alertsByParam) return [];
    return alertesChart.alertsByParam
      .map((a: any) => ({
        parameter: PARAMETER_LABELS[a.parameter] || a.parameter,
        total: a.total,
      }))
      .sort((a: any, b: any) => b.total - a.total); // tri par fréquence décroissante
  };

  const getModulesActivityData = () => {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const hourDate = new Date(now);
      hourDate.setHours(now.getHours() - (23 - i), 0, 0, 0);
      const hourStr = `${hourDate.getHours().toString().padStart(2, "0")}:00`;
      const found = modulesActivity.find((m: any) => m._id === hourStr);
      return { hour: hourStr, mesures: found?.total || 0 };
    });
  };

  const alertesTotal = getAlertesByDayData().reduce(
    (sum, d) => sum + d.alertes,
    0,
  );
  const hasAlertesActives = (stats?.alertesActives || 0) > 0;

  // ─── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">
          {/* ── En-tête ── */}
          <div className="flex items-start justify-between mb-7">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                Tableau de bord
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                {formatDateFR(currentDateTime)} ·{" "}
                {formatTimeFR(currentDateTime)}
              </p>
            </div>
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
              title="Actualiser"
            >
              <span
                className={`material-symbols-outlined text-sm ${loading ? "animate-spin" : ""}`}
              >
                refresh
              </span>
              Actualiser
            </button>
          </div>

          {/* ── Erreur ── */}
          {error && (
            <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <span className="material-symbols-outlined text-red-500">
                error
              </span>
              <p className="text-sm text-red-700 dark:text-red-400 flex-1">
                {error}
              </p>
              <button
                onClick={fetchDashboardData}
                className="text-xs text-red-600 underline hover:no-underline"
              >
                Réessayer
              </button>
            </div>
          )}

          {loading && !stats ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-200" />
              <p className="text-sm text-slate-400">
                Chargement du tableau de bord…
              </p>
            </div>
          ) : (
            <>
              {/* ── Bannière alerte critique (si alertes actives) ── */}
              {hasAlertesActives && (
                <Link
                  to="/alertes"
                  className="flex items-center gap-3 mb-6 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  <span className="flex h-2.5 w-2.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <span className="text-sm font-medium text-red-700 dark:text-red-400">
                    {stats?.alertesActives} alerte
                    {(stats?.alertesActives || 0) > 1 ? "s" : ""} active
                    {(stats?.alertesActives || 0) > 1 ? "s" : ""} nécessitent
                    votre attention
                  </span>
                  <span className="material-symbols-outlined text-sm text-red-500 ml-auto">
                    chevron_right
                  </span>
                </Link>
              )}

              {/* ── KPI Cards ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
                <KpiCard
                  icon="person"
                  color="blue"
                  label="Éleveurs"
                  value={stats?.eleveurs.total || 0}
                  subInfo={`+${stats?.eleveurs.nouveauxCeMois || 0} ce mois`}
                />
                <KpiCard
                  icon="home"
                  color="green"
                  label="Poulaillers"
                  value={stats?.poulaillers.total || 0}
                  subInfo={`${stats?.poulaillers.connects || 0} connectés · ${stats?.poulaillers.horsLigne || 0} hors-ligne`}
                />
                <KpiCard
                  icon="sensors"
                  color="purple"
                  label="Modules ESP32"
                  value={stats?.modules.total || 0}
                  subInfo={`${stats?.modules.associes || 0} associés · ${stats?.modules.libres || 0} libres`}
                />
                <KpiCard
                  icon="warning"
                  color={hasAlertesActives ? "red" : "green"}
                  label="Alertes actives"
                  value={stats?.alertesActives || 0}
                  subInfo={
                    hasAlertesActives
                      ? "Intervention requise"
                      : "Tout fonctionne normalement"
                  }
                  urgent={hasAlertesActives}
                />
              </div>

              {/* ── Graphiques — ligne 1 ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
                {/* Alertes dans le temps */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Évolution des alertes
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {alertesTotal} alerte{alertesTotal > 1 ? "s" : ""} sur
                        la période
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {(["7d", "30d"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setChartPeriod(p)}
                          className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                            chartPeriod === p
                              ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900"
                              : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                          }`}
                        >
                          {p === "7d" ? "7 jours" : "30 jours"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-56 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={getAlertesByDayData()}
                        margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                      >
                        <defs>
                          <linearGradient
                            id="alertGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#ef4444"
                              stopOpacity={0.15}
                            />
                            <stop
                              offset="95%"
                              stopColor="#ef4444"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f1f5f9"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="alertes"
                          name="alertes"
                          stroke="#ef4444"
                          strokeWidth={2}
                          fill="url(#alertGrad)"
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* État du parc */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                    État du parc
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    {stats?.poulaillers.total || 0} poulailler
                    {(stats?.poulaillers.total || 0) > 1 ? "s" : ""} au total
                  </p>

                  {getParcData().length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                      <span className="material-symbols-outlined text-3xl">
                        home
                      </span>
                      <p className="text-xs">Aucun poulailler enregistré</p>
                    </div>
                  ) : (
                    <>
                      <div className="relative h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={getParcData()}
                              cx="50%"
                              cy="50%"
                              innerRadius={48}
                              outerRadius={68}
                              dataKey="value"
                              strokeWidth={0}
                              paddingAngle={2}
                            >
                              {getParcData().map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.color}
                                />
                              ))}
                            </Pie>
                            <Tooltip content={<ChartTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                            {stats?.poulaillers.total || 0}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                            total
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 mt-1">
                        {getParcData().map((item) => (
                          <div
                            key={item.name}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-xs text-slate-600 dark:text-slate-400">
                                {item.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">
                                {item.value}
                              </span>
                              <span className="text-[10px] text-slate-400 w-8 text-right">
                                {Math.round(
                                  (item.value /
                                    (stats?.poulaillers.total || 1)) *
                                    100,
                                )}
                                %
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Graphiques — ligne 2 ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                {/* Alertes par paramètre */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                    Alertes par paramètre
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Répartition sur les 7 derniers jours
                  </p>
                  {getAlertesByParamData().length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                      <span className="material-symbols-outlined text-3xl">
                        check_circle
                      </span>
                      <p className="text-xs">Aucune alerte sur la période</p>
                    </div>
                  ) : (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={getAlertesByParamData()}
                          layout="vertical"
                          margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f1f5f9"
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 11, fill: "#94a3b8" }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="parameter"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            axisLine={false}
                            tickLine={false}
                            width={75}
                          />
                          <Tooltip
                            content={<ChartTooltip />}
                            cursor={{ fill: "#f8fafc" }}
                          />
                          <Bar
                            dataKey="total"
                            name="alertes"
                            fill="#ef4444"
                            radius={[0, 4, 4, 0]}
                            maxBarSize={20}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Activité des modules */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                    Activité des modules
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Mesures reçues par heure (24h glissantes)
                  </p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={getModulesActivityData()}
                        margin={{ top: 0, right: 4, bottom: 0, left: -20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f1f5f9"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 10, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          interval={5}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={<ChartTooltip />}
                          cursor={{ fill: "#f8fafc" }}
                        />
                        <Bar
                          dataKey="mesures"
                          name="mesures"
                          fill="#8b5cf6"
                          radius={[3, 3, 0, 0]}
                          maxBarSize={16}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* ── Poulaillers critiques ── */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-5 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Poulaillers nécessitant une attention
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {poulaillersCritiques.length === 0
                        ? "Tout le parc fonctionne normalement"
                        : `${poulaillersCritiques.length} poulailler${poulaillersCritiques.length > 1 ? "s" : ""} en alerte`}
                    </p>
                  </div>
                  <Link
                    to="/alertes"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    Voir toutes les alertes
                    <span className="material-symbols-outlined text-sm">
                      chevron_right
                    </span>
                  </Link>
                </div>

                {poulaillersCritiques.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                    <span className="material-symbols-outlined text-3xl text-emerald-400">
                      check_circle
                    </span>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Tous les poulaillers fonctionnent normalement
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-900/50">
                        <tr>
                          {[
                            "Sévérité",
                            "Poulailler",
                            "Éleveur",
                            "Problème",
                            "Depuis",
                            "Dernière mesure",
                            "",
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {poulaillersCritiques.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                          >
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  p.severite === "critical"
                                    ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                    : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[11px]">
                                  {p.severite === "critical"
                                    ? "error_outline"
                                    : "warning"}
                                </span>
                                {p.severite === "critical"
                                  ? "Critique"
                                  : "Avert."}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="text-sm font-medium text-slate-900 dark:text-white">
                                {p.nom}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {p.code}
                              </p>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="text-sm text-slate-700 dark:text-slate-200">
                                {p.eleveur}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {p.eleveurEmail}
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-300 max-w-[180px] truncate">
                              {p.probleme}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                              {p.depuis}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                              {p.derniereMesure}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Actions rapides ── */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                  Actions rapides
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <ActionCard
                    icon="person_add"
                    label="Créer un éleveur"
                    to="/utilisateurs"
                    color="blue"
                  />
                  <ActionCard
                    icon="sensors"
                    label="Associer un module"
                    to="/modules"
                    color="purple"
                  />
                  <ActionCard
                    icon="home"
                    label="Tous les poulaillers"
                    to="/poulaillers"
                    color="green"
                  />
                  <ActionCard
                    icon="assessment"
                    label="Consulter les rapports"
                    to="/rapports"
                    color="orange"
                  />
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
