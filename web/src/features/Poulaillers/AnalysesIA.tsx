import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import { cn } from "../../lib/utils";
import {
  Bot,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  X,
  Filter,
  Thermometer,
  Droplets,
  Wind,
  FlaskConical,
  Waves,
  Camera,
  CameraOff,
  Bird,
  Calendar,
  MapPin,
  User,
  Activity,
  Eye,
  Microscope,
  ShieldAlert,
  TrendingUp,
  BarChart3,
  ChevronLeft,
  RefreshCw,
  Info,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface AnalysePoulailler {
  id: string;
  name: string;
  codeUnique: string;
  location?: string | null;
  owner?: { firstName: string; lastName: string } | null;
}

interface AnalyseComptage {
  estimation?: number | null;
  fiabilite?: "faible" | "moyenne" | "bonne" | null;
  note?: string | null;
}

interface AnalyseMaladie {
  suspicion?: boolean;
  maladie_probable?: string | null;
  signes_observes?: string[];
  urgence_veterinaire?: boolean;
  confiance?: "faible" | "moyenne" | "élevée" | null;
}

interface AnalyseDetections {
  mortalityDetected?: boolean | null;
  behaviorNormal?: boolean | null;
  nombreMorts?: number | null;
}

interface AnalyseResult {
  healthScore?: number | null;
  urgencyLevel: "normal" | "attention" | "critique";
  confidence?: number | null;
  diagnostic?: string | null;
  advices?: string[];
  comptage?: AnalyseComptage;
  maladie_suspectee?: AnalyseMaladie;
  detections?: AnalyseDetections;
  imageAvailable?: boolean;
  imageUsable?: boolean;
}

interface Analyse {
  id: string;
  poulailler: AnalysePoulailler | null;
  triggeredBy: "manual" | "cron-auto" | "unknown";
  createdAt: string;
  result: AnalyseResult;
  image?: { url: string; thumbnailUrl?: string | null } | null;
  sensors?: Record<string, number | null>;
  cameraMac?: string | null;
}

interface Kpis {
  total: number;
  critique: number;
  attention: number;
  avgHealthScore: number | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ============================================================================
// API
// ============================================================================

const apiGet = async (url: string) => {
  const candidates = ["adminToken", "token", "accessToken", "jwt"]
    .map((k) => localStorage.getItem(k))
    .filter(Boolean) as string[];
  const jwt = candidates[0] ?? "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ============================================================================
// HELPERS
// ============================================================================

const URGENCY_CONFIG = {
  normal: {
    label: "Normal",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-400",
    Icon: CheckCircle2,
    rowBorder: "border-l-emerald-400",
  },
  attention: {
    label: "Attention",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-400",
    Icon: AlertTriangle,
    rowBorder: "border-l-amber-400",
  },
  critique: {
    label: "Critique",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-400",
    Icon: ShieldAlert,
    rowBorder: "border-l-red-500",
  },
} as const;

const getUrgencyCfg = (level: string) =>
  URGENCY_CONFIG[level as keyof typeof URGENCY_CONFIG] ?? URGENCY_CONFIG.normal;

// Seuls les déclencheurs connus et utiles — "unknown" exclu
const TRIGGER_CONFIG: Record<
  string,
  { label: string; Icon: React.ElementType; color: string }
> = {
  manual: { label: "Manuel", Icon: User, color: "text-violet-500" },
  "cron-auto": { label: "Planifié", Icon: Clock, color: "text-slate-500" },
};

const FIABILITE_COLOR: Record<string, string> = {
  bonne: "text-emerald-600 dark:text-emerald-400",
  moyenne: "text-amber-600 dark:text-amber-400",
  faible: "text-red-500 dark:text-red-400",
};

const SCORE_COLOR = (s: number) =>
  s >= 75 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444";

const SCORE_TEXT = (s: number) =>
  s >= 75
    ? "text-emerald-600 dark:text-emerald-400"
    : s >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const ScoreRing = ({
  score,
  size = 48,
}: {
  score: number | null | undefined;
  size?: number;
}) => {
  if (score == null)
    return (
      <div
        className="rounded-full border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-300 text-xs font-bold"
        style={{ width: size, height: size }}
      >
        —
      </div>
    );
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={SCORE_COLOR(score)}
          strokeWidth={4}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-bold tabular-nums",
          SCORE_TEXT(score),
        )}
        style={{ fontSize: size * 0.24 }}
      >
        {score}
      </span>
    </div>
  );
};

const UrgencyBadge = ({
  level,
  size = "sm",
}: {
  level: string;
  size?: "xs" | "sm";
}) => {
  const cfg = getUrgencyCfg(level);
  const { Icon } = cfg;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        cfg.bg,
        cfg.border,
        cfg.text,
        size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
      )}
    >
      <Icon size={size === "xs" ? 10 : 11} />
      {cfg.label}
    </span>
  );
};

const SENSOR_META: Record<
  string,
  { label: string; unit: string; Icon: React.ElementType; color: string }
> = {
  temperature: {
    label: "Température",
    unit: "°C",
    Icon: Thermometer,
    color: "text-orange-500",
  },
  humidity: {
    label: "Humidité",
    unit: "%",
    Icon: Droplets,
    color: "text-sky-500",
  },
  co2: { label: "CO₂", unit: "ppm", Icon: Wind, color: "text-slate-500" },
  nh3: {
    label: "NH₃",
    unit: "ppm",
    Icon: FlaskConical,
    color: "text-violet-500",
  },
  waterLevel: { label: "Eau", unit: "%", Icon: Waves, color: "text-cyan-500" },
};

const SectionLabel = ({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) => (
  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
    <Icon size={11} />
    {label}
  </p>
);

const Pill = ({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "red" | "amber" | "blue";
}) => {
  const cls = {
    default:
      "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
    red: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800",
    amber:
      "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
  }[variant];
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cls)}>
      {children}
    </span>
  );
};

// ============================================================================
// ANALYSE DETAIL PANEL
// ============================================================================

const AnalyseDetail = ({ a }: { a: Analyse }) => {
  const [imgErr, setImgErr] = useState(false);
  const [tab, setTab] = useState<
    "diagnostic" | "detections" | "sensors" | "conseils"
  >("diagnostic");

  const r = a.result;
  const hasMaladie = r.maladie_suspectee?.suspicion;
  const hasDetections =
    r.detections?.mortalityDetected || r.detections?.behaviorNormal === false;

  const tabs = [
    { id: "diagnostic" as const, label: "Diagnostic", Icon: Microscope },
    { id: "detections" as const, label: "Détections", Icon: Eye },
    { id: "sensors" as const, label: "Capteurs", Icon: Activity },
    { id: "conseils" as const, label: "Conseils", Icon: TrendingUp },
  ];

  // Résoudre le déclencheur — null si inconnu
  const triggerCfg = TRIGGER_CONFIG[a.triggeredBy] ?? null;

  return (
    <div className="border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30">
      <div className="flex items-center gap-1 px-5 py-2.5 border-b border-slate-100 dark:border-slate-700/60 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={(e) => {
              e.stopPropagation();
              setTab(t.id);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
              tab === t.id
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300",
            )}
          >
            <t.Icon size={12} />
            {t.label}
            {t.id === "detections" && hasDetections && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            )}
          </button>
        ))}
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column */}
          <div className="space-y-4">
            <div className="aspect-video rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
              {a.image?.url && !imgErr ? (
                <img
                  src={a.image.url}
                  alt="Analyse IA"
                  className="w-full h-full object-cover"
                  onError={() => setImgErr(true)}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <CameraOff size={24} className="opacity-40" />
                  <p className="text-xs">
                    {r.imageAvailable
                      ? r.imageUsable
                        ? "Erreur chargement"
                        : "Image non exploitable"
                      : "Pas d'image"}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              {a.poulailler && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3.5">
                  <SectionLabel icon={Bird} label="Poulailler" />
                  <Link
                    to={`/poulaillers/${a.poulailler.id}`}
                    className="font-semibold text-sm text-slate-900 dark:text-white hover:text-primary transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {a.poulailler.name}
                  </Link>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {a.poulailler.codeUnique}
                  </p>
                  {a.poulailler.owner && (
                    <p className="text-xs text-slate-500 mt-1.5">
                      {a.poulailler.owner.firstName}{" "}
                      {a.poulailler.owner.lastName}
                    </p>
                  )}
                  {a.poulailler.location && (
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <MapPin size={10} /> {a.poulailler.location}
                    </p>
                  )}
                </div>
              )}

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3.5">
                <SectionLabel icon={Info} label="Méta-données" />
                <div className="space-y-2">
                  {/* Déclencheur : masqué si inconnu */}
                  {triggerCfg && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">
                        Déclencheur
                      </span>
                      <div className="flex items-center gap-1">
                        <triggerCfg.Icon
                          size={11}
                          className={triggerCfg.color}
                        />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {triggerCfg.label}
                        </span>
                      </div>
                    </div>
                  )}
                  {r.confidence != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">
                        Confiance IA
                      </span>
                      <span
                        className={cn(
                          "text-xs font-bold tabular-nums",
                          r.confidence >= 70
                            ? "text-emerald-500"
                            : r.confidence >= 40
                              ? "text-amber-500"
                              : "text-red-500",
                        )}
                      >
                        {r.confidence}%
                      </span>
                    </div>
                  )}
                  {r.comptage?.estimation != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">
                        Comptage estimé
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        ~{r.comptage.estimation}{" "}
                        {r.comptage.fiabilite && (
                          <span
                            className={cn(
                              "font-normal",
                              FIABILITE_COLOR[r.comptage.fiabilite],
                            )}
                          >
                            ({r.comptage.fiabilite})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right columns */}
          <div className="lg:col-span-2 space-y-4">
            {tab === "diagnostic" && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <SectionLabel icon={Microscope} label="Diagnostic IA" />
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                    {r.diagnostic?.trim() || (
                      <span className="text-slate-400 italic">
                        Aucun diagnostic disponible.
                      </span>
                    )}
                  </p>
                </div>

                {hasMaladie && r.maladie_suspectee && (
                  <div className="bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldAlert size={14} className="text-red-500" />
                      <p className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
                        Maladie suspectée
                      </p>
                    </div>
                    {r.maladie_suspectee.maladie_probable && (
                      <p className="font-bold text-red-700 dark:text-red-300 text-sm mb-2">
                        {r.maladie_suspectee.maladie_probable}
                      </p>
                    )}
                    {(r.maladie_suspectee.signes_observes ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {r.maladie_suspectee.signes_observes!.map((s) => (
                          <Pill key={s} variant="red">
                            {s}
                          </Pill>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      {r.maladie_suspectee.urgence_veterinaire && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 px-2.5 py-1 rounded-full">
                          <AlertTriangle size={11} /> Urgence vétérinaire
                        </span>
                      )}
                      {r.maladie_suspectee.confiance && (
                        <span
                          className={cn(
                            "text-xs font-medium",
                            FIABILITE_COLOR[r.maladie_suspectee.confiance],
                          )}
                        >
                          Confiance : {r.maladie_suspectee.confiance}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "detections" && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <SectionLabel icon={Eye} label="Détections visuelles" />
                {[
                  {
                    label: "Mortalité détectée",
                    value: r.detections?.mortalityDetected,
                    critical: true,
                    extra:
                      r.detections?.nombreMorts != null
                        ? `${r.detections.nombreMorts} mort(s)`
                        : null,
                  },
                  {
                    label: "Comportement normal",
                    value: r.detections?.behaviorNormal,
                    invert: true,
                  },
                ].map((item) => {
                  const isNull = item.value == null;
                  const bad = item.invert
                    ? item.value === false
                    : item.value === true;
                  return (
                    <div
                      key={item.label}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border",
                        isNull
                          ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
                          : bad && item.critical
                            ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10"
                            : bad
                              ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10"
                              : "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10",
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {item.label}
                        </p>
                        {item.extra && bad && (
                          <p className="text-xs text-red-500 mt-0.5 font-semibold">
                            {item.extra}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-xs font-bold px-2.5 py-1 rounded-full",
                          isNull
                            ? "bg-slate-100 dark:bg-slate-700 text-slate-400"
                            : bad
                              ? item.critical
                                ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300"
                                : "bg-amber-100 dark:bg-amber-900/40 text-amber-600"
                              : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {isNull ? "—" : item.value ? "Oui" : "Non"}
                      </span>
                    </div>
                  );
                })}
                {r.comptage?.note && (
                  <div className="mt-1 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                      Note comptage
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {r.comptage.note}
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === "sensors" && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <SectionLabel
                  icon={Activity}
                  label="Relevé capteurs au moment de l'analyse"
                />
                {Object.keys(SENSOR_META).some(
                  (k) => a.sensors?.[k] != null,
                ) ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries(SENSOR_META).map(([key, meta]) => {
                      const val = a.sensors?.[key];
                      if (val == null) return null;
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"
                        >
                          <meta.Icon size={16} className={meta.color} />
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide leading-none mb-1">
                              {meta.label}
                            </p>
                            <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">
                              {val}
                              <span className="text-xs font-normal text-slate-400 ml-1">
                                {meta.unit}
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    Aucune donnée capteur enregistrée.
                  </p>
                )}
              </div>
            )}

            {tab === "conseils" && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <SectionLabel
                  icon={TrendingUp}
                  label="Recommandations Dr. Gemma"
                />
                {(r.advices ?? []).length > 0 ? (
                  <ul className="space-y-2.5">
                    {r.advices!.map((advice, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          {advice}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    Aucune recommandation pour cette analyse.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ANALYSE ROW
// ============================================================================

const AnalyseRow = ({ a }: { a: Analyse }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = getUrgencyCfg(a.result.urgencyLevel);

  // Déclencheur : null si inconnu → non affiché
  const triggerCfg = TRIGGER_CONFIG[a.triggeredBy] ?? null;

  return (
    <div
      className={cn(
        "border-l-4 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm transition-all duration-200",
        cfg.rowBorder,
        expanded
          ? "border border-slate-200 dark:border-slate-700 shadow-md"
          : "border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow",
      )}
    >
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <ScoreRing score={a.result.healthScore} size={44} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {a.poulailler ? (
              <span className="font-semibold text-sm text-slate-900 dark:text-white">
                {a.poulailler.name}
              </span>
            ) : (
              <span className="text-sm text-slate-400 italic">
                Poulailler inconnu
              </span>
            )}
            {a.poulailler && (
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                {a.poulailler.codeUnique}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar size={10} />
              {fmtDate(a.createdAt)}
            </span>
            {/* Déclencheur : affiché uniquement si connu (manual / cron-auto) */}
            {triggerCfg && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span
                  className={cn(
                    "text-xs flex items-center gap-1",
                    triggerCfg.color,
                  )}
                >
                  <triggerCfg.Icon size={10} />
                  {triggerCfg.label}
                </span>
              </>
            )}
            {a.poulailler?.owner && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-xs text-slate-400">
                  {a.poulailler.owner.firstName} {a.poulailler.owner.lastName}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="hidden sm:block flex-shrink-0">
          <UrgencyBadge level={a.result.urgencyLevel} />
        </div>

        <div className="hidden md:flex items-center gap-1 flex-shrink-0 text-slate-400">
          {a.image?.url ? (
            <Camera size={14} className="text-slate-400" />
          ) : (
            <CameraOff
              size={14}
              className="text-slate-300 dark:text-slate-600"
            />
          )}
        </div>

        {a.result.maladie_suspectee?.suspicion && (
          <span className="hidden lg:flex items-center gap-1 text-xs font-semibold text-red-500 flex-shrink-0">
            <ShieldAlert size={13} />
          </span>
        )}

        <ChevronDown
          size={15}
          className={cn(
            "text-slate-400 transition-transform duration-200 flex-shrink-0",
            expanded && "rotate-180",
          )}
        />
      </div>

      {expanded && <AnalyseDetail a={a} />}
    </div>
  );
};

// ============================================================================
// KPI CARD
// ============================================================================

const KpiCard = ({
  label,
  value,
  accent,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string | number;
  accent?: "emerald" | "rose" | "amber" | "blue";
  icon: React.ElementType;
  sub?: string;
}) => {
  const accentMap = {
    emerald: {
      val: "text-emerald-700 dark:text-emerald-400",
      ic: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-100 dark:border-emerald-900/40",
    },
    rose: {
      val: "text-rose-600 dark:text-rose-400",
      ic: "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400",
      border: "border-rose-100 dark:border-rose-900/40",
    },
    amber: {
      val: "text-amber-600 dark:text-amber-400",
      ic: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
      border: "border-amber-100 dark:border-amber-900/40",
    },
    blue: {
      val: "text-blue-600 dark:text-blue-400",
      ic: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
      border: "border-blue-100 dark:border-blue-900/40",
    },
  };
  const a = accentMap[accent ?? "blue"] ?? {
    val: "text-slate-900 dark:text-white",
    ic: "bg-slate-100 dark:bg-slate-700 text-slate-500",
    border: "border-slate-200 dark:border-slate-700",
  };
  return (
    <div
      className={cn(
        "bg-white dark:bg-slate-800 border rounded-xl px-4 py-3.5 shadow-sm flex-1 min-w-[130px] flex items-center gap-3",
        a.border,
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
          a.ic,
        )}
      >
        <Icon size={18} />
      </div>
      <div>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-1">
          {label}
        </p>
        <p className={cn("text-xl font-bold leading-none", a.val)}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function AnalysesIA() {
  const [searchParams, setSearchParams] = useSearchParams();

  const poulaillerId = searchParams.get("poulailler") ?? "";
  const urgencyParam = searchParams.get("urgency") ?? "";
  const pageParam = parseInt(searchParams.get("page") ?? "1");

  const [analyses, setAnalyses] = useState<Analyse[]>([]);
  const [kpis, setKpis] = useState<Kpis>({
    total: 0,
    critique: 0,
    attention: 0,
    avgHealthScore: null,
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poulaillerName, setPoulaillerName] = useState<string | null>(null);

  const fetchAnalyses = useCallback(
    async (page = pageParam) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (poulaillerId) params.set("poulailler", poulaillerId);
        if (urgencyParam) params.set("urgency", urgencyParam);
        params.set("page", String(page));
        params.set("limit", "20");

        const data = await apiGet(
          `/api/admin/analyses-ia?${params.toString()}`,
        );
        setAnalyses(data.data);
        setKpis(data.kpis);
        setPagination(data.pagination);

        if (poulaillerId && data.data.length > 0 && data.data[0].poulailler) {
          setPoulaillerName(data.data[0].poulailler.name);
        } else if (!poulaillerId) {
          setPoulaillerName(null);
        }
      } catch {
        setError("Erreur lors du chargement des analyses IA.");
      } finally {
        setLoading(false);
      }
    },
    [poulaillerId, urgencyParam, pageParam],
  );

  useEffect(() => {
    fetchAnalyses(1);
  }, [poulaillerId, urgencyParam]);

  const setFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  };

  const hasFilters = !!(poulaillerId || urgencyParam);

  const goPage = (p: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(p));
      return next;
    });
    fetchAnalyses(p);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-5 lg:p-7 min-w-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              {poulaillerId && (
                <Link
                  to="/analyses-ia"
                  className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 transition-colors mb-1"
                >
                  <ChevronLeft size={14} />
                  Toutes les analyses
                </Link>
              )}
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
                <Bot size={22} className="text-primary" />
                {poulaillerId && poulaillerName ? (
                  <>
                    {" "}
                    Analyses IA —{" "}
                    <span className="text-primary">{poulaillerName}</span>
                  </>
                ) : (
                  "Analyses IA"
                )}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {poulaillerId
                  ? "Historique complet des analyses pour ce poulailler"
                  : "Historique global des analyses Dr. Gemma"}
              </p>
            </div>
            <button
              onClick={() => fetchAnalyses(pagination.page)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary text-sm font-medium transition-all shadow-sm self-start sm:self-auto"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Actualiser
            </button>
          </div>

          {/* KPIs */}
          <div className="flex flex-wrap gap-3 mb-5">
            <KpiCard
              label="Total analyses"
              value={kpis.total}
              icon={BarChart3}
              accent="blue"
            />
            <KpiCard
              label="Critiques"
              value={kpis.critique}
              icon={ShieldAlert}
              accent="rose"
            />
            <KpiCard
              label="Attention"
              value={kpis.attention}
              icon={AlertTriangle}
              accent="amber"
            />
            <KpiCard
              label="Score moyen"
              value={
                kpis.avgHealthScore != null ? `${kpis.avgHealthScore}/100` : "—"
              }
              icon={TrendingUp}
              accent="emerald"
            />
          </div>

          {/* Filtres : uniquement urgence */}
          <div className="mb-4 flex flex-wrap gap-2.5 items-center">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Filter size={13} />
              Filtres :
            </div>

            <div className="relative">
              <select
                value={urgencyParam}
                onChange={(e) => setFilter("urgency", e.target.value)}
                className="appearance-none pl-3.5 pr-7 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30 text-xs shadow-sm font-medium"
              >
                <option value="">Tous niveaux</option>
                <option value="normal">Normal</option>
                <option value="attention">Attention</option>
                <option value="critique">Critique</option>
              </select>
              <ChevronDown
                size={11}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>

            {hasFilters && (
              <button
                onClick={() => setSearchParams({})}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-medium transition-colors"
              >
                <X size={11} />
                Réinitialiser
              </button>
            )}
          </div>

          {/* Erreur */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2.5">
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Compteur */}
          {!loading && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 font-medium">
              {pagination.total} analyse{pagination.total !== 1 ? "s" : ""}
            </p>
          )}

          {/* Liste */}
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[68px] rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 animate-pulse"
                />
              ))}
            </div>
          ) : analyses.length === 0 ? (
            <div className="p-16 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              <Bot
                size={36}
                className="mx-auto mb-3 text-slate-300 dark:text-slate-600"
              />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Aucune analyse trouvée
              </p>
              {hasFilters && (
                <button
                  onClick={() => setSearchParams({})}
                  className="mt-3 text-xs text-primary hover:underline"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {analyses.map((a) => (
                <AnalyseRow key={a.id} a={a} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && pagination.pages > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Page {pagination.page} / {pagination.pages} — {pagination.total}{" "}
                résultat{pagination.total !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => goPage(pagination.page - 1)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                >
                  ← Préc.
                </button>
                {Array.from({ length: pagination.pages }, (_, i) => i + 1)
                  .filter(
                    (pg) =>
                      pg === 1 ||
                      pg === pagination.pages ||
                      Math.abs(pg - pagination.page) <= 1,
                  )
                  .reduce<(number | "...")[]>((acc, pg, idx, arr) => {
                    if (idx > 0 && pg - (arr[idx - 1] as number) > 1)
                      acc.push("...");
                    acc.push(pg);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "..." ? (
                      <span
                        key={`e-${idx}`}
                        className="px-2 text-slate-400 text-sm"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => goPage(item as number)}
                        className={cn(
                          "w-8 h-8 rounded-lg border text-sm transition font-medium",
                          item === pagination.page
                            ? "bg-primary text-white border-primary shadow-sm"
                            : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700",
                        )}
                      >
                        {item}
                      </button>
                    ),
                  )}
                <button
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => goPage(pagination.page + 1)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                >
                  Suiv. →
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
