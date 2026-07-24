import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { poulaillersAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import { cn } from "../../lib/utils";
import toast from "react-hot-toast";
import {
  Thermometer,
  Droplets,
  Wind,
  FlaskConical,
  Waves,
  DoorOpen,
  Fan,
  Lightbulb,
  Droplet,
  ChevronRight,
  Search,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  WifiOff,
  Clock,
  Wifi,
  MoreHorizontal,
  Bird,
  X,
  CheckCircle2,
  MapPin,
  Calendar,
  User,
  Activity,
  ChevronDown,
  Bot,
  Gauge,
  SlidersHorizontal,
  Eye,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface SensorData {
  temperature?: number;
  humidity?: number;
  co2?: number;
  nh3?: number;
  waterLevel?: number;
  dust?: number;
}

interface Actuator {
  name: string;
  state: string;
  mode: "Auto" | "Manuel";
  icon: string;
}

interface Threshold {
  tempMin?: number;
  tempMax?: number;
  humMin?: number;
  humMax?: number;
  co2Max?: number;
  nh3Max?: number;
  dustMax?: number;
  waterMin?: number;
}

interface AutoThreshold {
  tempVentilo?: number;
  co2Ventilo?: number;
  doorOpen?: string;
  doorClose?: string;
}

interface PoulaillerAdmin {
  id: string;
  codeUnique: string;
  name: string;
  animalCount?: number;
  description?: string;
  location?: string;
  type?: string;
  installationDate?: string;
  archived?: boolean;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  } | null;
  status: string;
  connectionStatus?: string;
  lastMeasure?: SensorData;
  lastMeasureDate?: string;
  lastAlertDate?: string;
  alertesActives: number;
  alertSeverity?: "critique" | "alerte" | "ok";
  dernierPing?: string;
  actuators?: Actuator[];
  thresholds?: Threshold;
  autoThresholds?: AutoThreshold;
  lastAiAnalysis?: {
    healthScore: number;
    urgencyLevel: "normal" | "attention" | "critique" | "inconnu";
    diagnostic?: string;
    createdAt: string;
  } | null;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// ============================================================================
// HELPERS
// ============================================================================

const getStatusConfig = (status: string) => {
  switch (status) {
    case "connecte":
      return {
        label: "Connecté",
        dot: "bg-emerald-500",
        text: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
        Icon: Wifi,
      };
    case "alerte":
      return {
        label: "Alerte",
        dot: "bg-rose-500",
        text: "text-rose-600 dark:text-rose-400",
        bg: "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800",
        Icon: AlertTriangle,
      };
    case "hors_ligne":
      return {
        label: "Hors ligne",
        dot: "bg-slate-400",
        text: "text-slate-500 dark:text-slate-400",
        bg: "bg-slate-100 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700",
        Icon: WifiOff,
      };
    case "en_attente_module":
      return {
        label: "En attente",
        dot: "bg-amber-400",
        text: "text-amber-700 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
        Icon: Clock,
      };
    default:
      return {
        label: status,
        dot: "bg-gray-400",
        text: "text-gray-500",
        bg: "bg-gray-100 border-gray-200",
        Icon: MoreHorizontal,
      };
  }
};

// Badge statut connexion + alertes
const StatusAlertBadge = ({
  status,
  alertCount,
  alertSeverity,
}: {
  status: string;
  alertCount: number;
  alertSeverity?: string;
}) => {
  if (alertCount > 0 && alertSeverity === "critique") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold">
        <AlertTriangle size={11} />
        {alertCount} alerte{alertCount > 1 ? "s" : ""} critique
        {alertCount > 1 ? "s" : ""}
      </span>
    );
  }
  if (alertCount > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-medium">
        <AlertTriangle size={11} />
        {alertCount} alerte{alertCount > 1 ? "s" : ""}
      </span>
    );
  }
  const cfg = getStatusConfig(status);
  const { Icon } = cfg;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium",
        cfg.bg,
        cfg.text,
      )}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
};

// ── Sensor chip compact ───────────────────────────────────────────────────────
const SENSOR_META: Record<
  string,
  { Icon: React.ElementType; color: string; bg: string }
> = {
  "°C": {
    Icon: Thermometer,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/20",
  },
  "%": {
    Icon: Droplets,
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-900/20",
  },
  ppm_co2: {
    Icon: Wind,
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-700/50",
  },
  ppm_nh3: {
    Icon: FlaskConical,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
  },
  "% eau": {
    Icon: Waves,
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-50 dark:bg-cyan-900/20",
  },
};

const SensorChip = ({
  value,
  unit,
  label,
  limit,
  alert,
  iconKey,
}: {
  value?: number | null;
  unit: string;
  label: string;
  limit?: string;
  alert?: boolean;
  iconKey: string;
}) => {
  const meta = SENSOR_META[iconKey] ?? SENSOR_META[unit];
  const Icon = meta?.Icon ?? Thermometer;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 transition-all",
        alert
          ? "border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-900/10"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80",
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
          alert
            ? "bg-rose-100 dark:bg-rose-900/40"
            : (meta?.bg ?? "bg-slate-100 dark:bg-slate-700"),
        )}
      >
        <Icon
          size={16}
          className={
            alert ? "text-rose-500" : (meta?.color ?? "text-slate-500")
          }
        />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium leading-none mb-1">
          {label}
        </p>
        <p
          className={cn(
            "text-base font-bold leading-none",
            alert
              ? "text-rose-700 dark:text-rose-300"
              : "text-slate-900 dark:text-white",
          )}
        >
          {value != null ? value : "—"}
          <span className="text-xs font-normal ml-1 text-slate-400">
            {unit}
          </span>
        </p>
        {limit && (
          <p
            className={cn(
              "text-xs mt-1",
              alert ? "text-rose-400" : "text-slate-400",
            )}
          >
            {limit}
          </p>
        )}
      </div>
      {alert && (
        <span className="ml-auto w-2 h-2 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
      )}
    </div>
  );
};

// ── Actuator chip ─────────────────────────────────────────────────────────────
const ACTUATOR_ICONS: Record<string, React.ElementType> = {
  Porte: DoorOpen,
  Ventilation: Fan,
  Lampe: Lightbulb,
  Pompe: Droplet,
};

const ActuatorChip = ({
  name,
  state,
  mode,
}: {
  icon: string;
  name: string;
  state: string;
  mode: string;
}) => {
  const Icon = ACTUATOR_ICONS[name] ?? MoreHorizontal;
  const isOn =
    state.toLowerCase() === "allumée" ||
    state.toLowerCase() === "ouverte" ||
    state.toLowerCase() === "on";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 transition-all",
        isOn
          ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/10"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80",
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
          isOn
            ? "bg-emerald-100 dark:bg-emerald-900/40"
            : "bg-slate-100 dark:bg-slate-700",
        )}
      >
        <Icon
          size={16}
          className={
            isOn ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium leading-none mb-1 uppercase tracking-wide">
          {name}
        </p>
        <p
          className={cn(
            "text-sm font-semibold leading-none",
            isOn ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500",
          )}
        >
          {state}
        </p>
      </div>
      <span
        className={cn(
          "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
          mode === "Auto"
            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
            : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400",
        )}
      >
        {mode}
      </span>
    </div>
  );
};

// ── Section header ─────────────────────────────────────────────────────────────
const Section = ({
  title,
  icon: SectionIcon,
  children,
  action,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <section>
    <div className="flex items-center justify-between mb-4">
      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {SectionIcon && <SectionIcon size={13} className="text-slate-400" />}
        {title}
      </h4>
      {action}
    </div>
    {children}
  </section>
);

// ── Threshold pill ────────────────────────────────────────────────────────────
const ThresholdPill = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
    <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
      {value}
    </span>
  </div>
);

// ── Info field ────────────────────────────────────────────────────────────────
const InfoField = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
      {label}
    </span>
    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
      {children}
    </div>
  </div>
);

// ============================================================================
// EXPANDED POULAILLER DETAIL
// ============================================================================

const PoulaillerDetail = ({
  p,
  onEdit,
  onDelete,
}: {
  p: PoulaillerAdmin;
  onEdit: (p: PoulaillerAdmin) => void;
  onDelete: (p: PoulaillerAdmin) => void;
}) => {
  const [activeTab, setActiveTab] = useState<
    "overview" | "sensors" | "seuils" | "ia"
  >("overview");

  const actuators: Actuator[] = p.actuators ?? [
    { name: "Porte", state: "Fermée", mode: "Auto", icon: "🚪" },
    { name: "Ventilation", state: "Éteinte", mode: "Manuel", icon: "💨" },
    { name: "Lampe", state: "Allumée", mode: "Auto", icon: "💡" },
    { name: "Pompe", state: "Éteinte", mode: "Manuel", icon: "💧" },
  ];

  const m = p.lastMeasure ?? {};
  const th = p.thresholds ?? {};
  const ath = p.autoThresholds ?? {};
  const hasThresholds = th && Object.keys(th).length > 0;
  const hasAutoThresholds = ath && Object.keys(ath).length > 0;

  const tabs: {
    id: typeof activeTab;
    label: string;
    Icon: React.ElementType;
  }[] = [
    { id: "overview", label: "Général", Icon: Eye },
    { id: "sensors", label: "Capteurs & Actionneurs", Icon: Activity },
    { id: "seuils", label: "Seuils", Icon: SlidersHorizontal },
    { id: "ia", label: "Analyse IA", Icon: Bot },
  ];

  return (
    <div className="border-t border-slate-100 dark:border-slate-700/60">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700/60">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab(tab.id);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                activeTab === tab.id
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-600"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800/60",
              )}
            >
              <tab.Icon size={12} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-1.5 flex-shrink-0 ml-3"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onEdit(p)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary dark:hover:text-primary transition-all text-xs font-medium shadow-sm"
          >
            <Pencil size={12} />
            Modifier
          </button>
          <button
            onClick={() => onDelete(p)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 transition-all text-xs font-medium shadow-sm"
          >
            <Trash2 size={12} />
            Supprimer
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-5 bg-slate-50/60 dark:bg-slate-900/30">
        {/* ── TAB: Général ── */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Infos propriétaire */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <h5 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <User size={12} /> Propriétaire
              </h5>
              {p.owner ? (
                <>
                  <InfoField label="Éleveur">
                    <Link
                      to={`/eleveurs/${p.owner.id}`}
                      className="text-primary hover:underline font-semibold"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {p.owner.firstName} {p.owner.lastName}
                    </Link>
                  </InfoField>
                  {p.owner.email && (
                    <InfoField label="Email">{p.owner.email}</InfoField>
                  )}
                </>
              ) : (
                <p className="text-sm text-amber-500 font-medium flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Aucun éleveur assigné
                </p>
              )}
            </div>

            {/* Infos poulailler */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <h5 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <MapPin size={12} /> Localisation & installation
              </h5>
              <InfoField label="Localisation">
                {p.location?.trim() || (
                  <span className="text-slate-400">Non renseignée</span>
                )}
              </InfoField>
              <InfoField label="Date d'installation">
                {p.installationDate ? (
                  new Date(p.installationDate).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </InfoField>
              {p.description && (
                <InfoField label="Description">{p.description}</InfoField>
              )}
            </div>

            {/* Activité */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <h5 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <Calendar size={12} /> Activité récente
              </h5>
              <InfoField label="Dernière mesure">
                {p.lastMeasureDate ? (
                  new Date(p.lastMeasureDate).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </InfoField>
              <InfoField label="Dernière alerte">
                {p.lastAlertDate ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    {new Date(p.lastAlertDate).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : (
                  <span className="text-slate-400">Aucune</span>
                )}
              </InfoField>
              {p.dernierPing && (
                <InfoField label="Dernier ping">
                  {new Date(p.dernierPing).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </InfoField>
              )}
            </div>

            {/* Statut + score IA résumé */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <h5 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <Gauge size={12} /> Santé & statut
              </h5>
              <div className="flex items-center gap-3">
                <StatusAlertBadge
                  status={p.connectionStatus ?? p.status}
                  alertCount={p.alertesActives}
                  alertSeverity={p.alertSeverity}
                />
              </div>
              {p.lastAiAnalysis && (
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center flex-shrink-0"
                    style={{
                      borderColor:
                        p.lastAiAnalysis.healthScore >= 75
                          ? "#10b981"
                          : p.lastAiAnalysis.healthScore >= 50
                            ? "#f59e0b"
                            : "#ef4444",
                    }}
                  >
                    <span className="text-sm font-bold text-slate-800 dark:text-white">
                      {p.lastAiAnalysis.healthScore}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">
                      Score santé IA
                    </p>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 line-clamp-2">
                      {p.lastAiAnalysis.diagnostic ?? "Analyse disponible"}
                    </p>
                  </div>
                </div>
              )}
              <InfoField label="Archivé">
                {p.archived ? "Oui" : "Non"}
              </InfoField>
            </div>
          </div>
        )}

        {/* ── TAB: Capteurs & Actionneurs ── */}
        {activeTab === "sensors" && (
          <div className="space-y-6">
            <Section title="Dernière mesure capteurs" icon={Activity}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <SensorChip
                  value={m.temperature}
                  unit="°C"
                  label="Température"
                  iconKey="°C"
                  limit={
                    th.tempMin != null && th.tempMax != null
                      ? `Seuil : ${th.tempMin}–${th.tempMax} °C`
                      : undefined
                  }
                  alert={
                    m.temperature != null &&
                    th.tempMin != null &&
                    (m.temperature < th.tempMin || m.temperature > th.tempMax!)
                  }
                />
                <SensorChip
                  value={m.humidity}
                  unit="%"
                  label="Humidité"
                  iconKey="%"
                  limit={
                    th.humMin != null && th.humMax != null
                      ? `Seuil : ${th.humMin}–${th.humMax} %`
                      : undefined
                  }
                  alert={
                    m.humidity != null &&
                    th.humMin != null &&
                    (m.humidity < th.humMin || m.humidity > th.humMax!)
                  }
                />
                <SensorChip
                  value={m.co2}
                  unit="ppm"
                  label="CO₂"
                  iconKey="ppm_co2"
                  limit={
                    th.co2Max != null ? `Max : ${th.co2Max} ppm` : undefined
                  }
                  alert={
                    m.co2 != null && th.co2Max != null && m.co2 > th.co2Max
                  }
                />
                <SensorChip
                  value={m.nh3}
                  unit="ppm"
                  label="NH₃"
                  iconKey="ppm_nh3"
                  limit={
                    th.nh3Max != null ? `Max : ${th.nh3Max} ppm` : undefined
                  }
                  alert={
                    m.nh3 != null && th.nh3Max != null && m.nh3 > th.nh3Max
                  }
                />
                <SensorChip
                  value={m.waterLevel}
                  unit="%"
                  label="Niveau eau"
                  iconKey="% eau"
                  limit={
                    th.waterMin != null ? `Min : ${th.waterMin} %` : undefined
                  }
                  alert={
                    m.waterLevel != null &&
                    th.waterMin != null &&
                    m.waterLevel < th.waterMin
                  }
                />
              </div>
            </Section>

            <Section title="Actionneurs" icon={SlidersHorizontal}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {actuators.map((a) => (
                  <ActuatorChip key={a.name} {...a} />
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* ── TAB: Seuils ── */}
        {activeTab === "seuils" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {hasThresholds && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <h5 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                  Seuils de monitoring
                </h5>
                {th.tempMin != null && th.tempMax != null && (
                  <ThresholdPill
                    label="Température"
                    value={`${th.tempMin}–${th.tempMax} °C`}
                  />
                )}
                {th.humMin != null && th.humMax != null && (
                  <ThresholdPill
                    label="Humidité"
                    value={`${th.humMin}–${th.humMax} %`}
                  />
                )}
                {th.co2Max != null && (
                  <ThresholdPill label="CO₂ max" value={`${th.co2Max} ppm`} />
                )}
                {th.nh3Max != null && (
                  <ThresholdPill label="NH₃ max" value={`${th.nh3Max} ppm`} />
                )}
                {th.dustMax != null && (
                  <ThresholdPill
                    label="Poussière max"
                    value={`${th.dustMax} μg/m³`}
                  />
                )}
                {th.waterMin != null && (
                  <ThresholdPill
                    label="Niveau eau min"
                    value={`${th.waterMin} %`}
                  />
                )}
              </div>
            )}

            {hasAutoThresholds && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <h5 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                  Seuils automatiques
                </h5>
                {ath.tempVentilo != null && (
                  <ThresholdPill
                    label="Seuil temp. ventilo"
                    value={`${ath.tempVentilo} °C`}
                  />
                )}
                {ath.co2Ventilo != null && (
                  <ThresholdPill
                    label="Seuil CO₂ ventilo"
                    value={`${ath.co2Ventilo} ppm`}
                  />
                )}
                {ath.doorOpen && (
                  <ThresholdPill label="Ouverture porte" value={ath.doorOpen} />
                )}
                {ath.doorClose && (
                  <ThresholdPill
                    label="Fermeture porte"
                    value={ath.doorClose}
                  />
                )}
              </div>
            )}

            {!hasThresholds && !hasAutoThresholds && (
              <div className="col-span-2 flex items-center gap-3 p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400">
                <SlidersHorizontal size={20} className="opacity-40" />
                <p className="text-sm">
                  Aucun seuil configuré pour ce poulailler.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Analyse IA ── */}
        {activeTab === "ia" && (
          <div>
            {p.lastAiAnalysis ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="flex flex-col sm:flex-row items-start gap-6">
                  {/* Score circulaire */}
                  {(() => {
                    const score = p.lastAiAnalysis.healthScore;
                    const color =
                      score >= 75
                        ? {
                            border: "#10b981",
                            text: "text-emerald-600 dark:text-emerald-400",
                          }
                        : score >= 50
                          ? {
                              border: "#f59e0b",
                              text: "text-amber-600 dark:text-amber-400",
                            }
                          : {
                              border: "#ef4444",
                              text: "text-rose-600 dark:text-rose-400",
                            };
                    return (
                      <div
                        className="w-24 h-24 rounded-full border-4 flex flex-col items-center justify-center flex-shrink-0 mx-auto sm:mx-0"
                        style={{ borderColor: color.border }}
                      >
                        <span className={`text-2xl font-bold ${color.text}`}>
                          {score}
                        </span>
                        <span className="text-xs text-slate-400">/100</span>
                      </div>
                    );
                  })()}

                  {/* Détails */}
                  <div className="flex-1 space-y-4">
                    {p.lastAiAnalysis.diagnostic && (
                      <InfoField label="Diagnostic">
                        {p.lastAiAnalysis.diagnostic}
                      </InfoField>
                    )}
                    <div className="flex flex-wrap gap-6">
                      <InfoField label="Niveau d'urgence">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1",
                            p.lastAiAnalysis.urgencyLevel === "critique"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                              : p.lastAiAnalysis.urgencyLevel === "attention"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                          )}
                        >
                          {p.lastAiAnalysis.urgencyLevel === "critique"
                            ? "Critique"
                            : p.lastAiAnalysis.urgencyLevel === "attention"
                              ? "Attention"
                              : p.lastAiAnalysis.urgencyLevel === "inconnu"
                                ? "Inconnue"
                                : "Normale"}
                        </span>
                      </InfoField>
                      <InfoField label="Analysée le">
                        {new Date(p.lastAiAnalysis.createdAt).toLocaleString(
                          "fr-FR",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </InfoField>
                    </div>
                    <Link
                      to={`/analyses-ia?poulailler=${p.id}`}
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Voir tout l'historique des analyses{" "}
                      <ChevronRight size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400">
                <Bot size={24} className="opacity-40 flex-shrink-0" />
                <p className="text-sm">
                  Aucune analyse IA disponible pour ce poulailler.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// POULAILLER ROW
// ============================================================================

const PoulaillerRow = ({
  p,
  onEdit,
  onDelete,
}: {
  p: PoulaillerAdmin;
  onEdit: (p: PoulaillerAdmin) => void;
  onDelete: (p: PoulaillerAdmin) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<PoulaillerAdmin | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const statusCfg = getStatusConfig(p.connectionStatus ?? p.status);
  const StatusIcon = statusCfg.Icon;

  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) {
      setLoadingDetail(true);
      try {
        const res = await poulaillersAPI.getById(p.id);
        setDetail(res.data.data);
      } catch {
        setDetail(p);
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  return (
    <div
      className={cn(
        "border rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm transition-all duration-200",
        expanded
          ? "border-primary/30 dark:border-primary/20 shadow-md shadow-primary/5"
          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow",
      )}
    >
      {/* ── Clickable row ── */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={handleExpand}
      >
        {/* Status indicator dot */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center border",
              p.alertSeverity === "critique"
                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                : p.status === "connecte"
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                  : "bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600",
            )}
          >
            <Bird
              size={18}
              className={
                p.alertSeverity === "critique"
                  ? "text-red-500"
                  : p.status === "connecte"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-400"
              }
            />
          </div>
          {/* Connexion dot */}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800",
              statusCfg.dot,
            )}
          />
        </div>

        {/* Nom + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900 dark:text-white text-sm leading-tight">
              {p.name}
            </p>
            <span className="text-xs font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
              {p.codeUnique}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {p.owner ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {p.owner.firstName} {p.owner.lastName}
              </span>
            ) : (
              <span className="text-xs text-amber-500 font-medium">
                Sans éleveur
              </span>
            )}
            {p.animalCount != null && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-xs text-slate-400">
                  {p.animalCount.toLocaleString("fr-FR")} animaux
                </span>
              </>
            )}
            {p.location && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-xs text-slate-400 flex items-center gap-0.5 truncate max-w-[120px]">
                  <MapPin size={10} className="flex-shrink-0" />
                  {p.location}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Badge statut */}
        <div className="hidden sm:flex items-center flex-shrink-0">
          <StatusAlertBadge
            status={p.connectionStatus ?? p.status}
            alertCount={p.alertesActives}
            alertSeverity={p.alertSeverity}
          />
        </div>

        {/* Score IA si dispo */}
        {p.lastAiAnalysis && (
          <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
            <Bot size={13} className="text-slate-400" />
            <span
              className={cn(
                "text-xs font-bold tabular-nums",
                p.lastAiAnalysis.healthScore >= 75
                  ? "text-emerald-600 dark:text-emerald-400"
                  : p.lastAiAnalysis.healthScore >= 50
                    ? "text-amber-500"
                    : "text-rose-500",
              )}
            >
              {p.lastAiAnalysis.healthScore}/100
            </span>
          </div>
        )}

        {/* Actions rapides (hover/focus, md+) */}
        <div
          className="hidden md:flex items-center gap-0.5 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onEdit(p)}
            title="Modifier"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(p)}
            title="Supprimer"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Expand chevron */}
        <ChevronDown
          size={16}
          className={cn(
            "text-slate-400 transition-transform duration-200 flex-shrink-0",
            expanded && "rotate-180",
          )}
        />
      </div>

      {/* Expanded detail */}
      {expanded &&
        (loadingDetail ? (
          <div className="border-t border-slate-100 dark:border-slate-700/60 px-6 py-8 flex items-center gap-3 text-slate-400">
            <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full flex-shrink-0" />
            <span className="text-sm">Chargement des détails…</span>
          </div>
        ) : (
          <PoulaillerDetail
            p={detail ?? p}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
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
  accent?: "emerald" | "rose" | "blue" | "default";
  icon: React.ElementType;
  sub?: string;
}) => {
  const accentMap = {
    emerald: {
      value: "text-emerald-700 dark:text-emerald-400",
      icon: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-100 dark:border-emerald-900/40",
    },
    rose: {
      value: "text-rose-600 dark:text-rose-400",
      icon: "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400",
      border: "border-rose-100 dark:border-rose-900/40",
    },
    blue: {
      value: "text-blue-600 dark:text-blue-400",
      icon: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
      border: "border-blue-100 dark:border-blue-900/40",
    },
    default: {
      value: "text-slate-900 dark:text-white",
      icon: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
      border: "border-slate-200 dark:border-slate-700",
    },
  };
  const a = accentMap[accent ?? "default"];
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
          a.icon,
        )}
      >
        <Icon size={18} />
      </div>
      <div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-none mb-1">
          {label}
        </p>
        <p className={cn("text-xl font-bold leading-none", a.value)}>{value}</p>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

// ============================================================================
// CREATE / EDIT MODAL
// ============================================================================

interface FormState {
  name: string;
  animalCount: string;
  description: string;
  location: string;
  installationDate: string;
  ownerId: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  animalCount: "",
  description: "",
  location: "",
  installationDate: new Date().toISOString().slice(0, 10),
  ownerId: "",
};

const inputClass =
  "w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 text-sm transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600";

const labelClass =
  "block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5";

const PoulaillerModal = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  poulailler,
  users,
  loadingUsers,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
  poulailler: PoulaillerAdmin | null;
  users: User[];
  loadingUsers: boolean;
}) => {
  const isEdit = !!poulailler;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen) return;
    if (poulailler) {
      setForm({
        name: poulailler.name || "",
        animalCount: poulailler.animalCount?.toString() || "",
        description: poulailler.description || "",
        location: poulailler.location || "",
        installationDate: poulailler.installationDate
          ? poulailler.installationDate.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        ownerId: poulailler.owner?.id || "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [isOpen, poulailler]);

  const set =
    (key: keyof FormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const nameTooShort =
    form.name.trim().length > 0 && form.name.trim().length < 3;
  const descTooLong = form.description.length > 200;
  const animalInvalid =
    form.animalCount !== "" && parseInt(form.animalCount) < 1;
  const canSubmit =
    form.name.trim().length >= 3 &&
    form.ownerId !== "" &&
    !animalInvalid &&
    !descTooLong;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              {isEdit ? (
                <Pencil size={16} className="text-primary" />
              ) : (
                <Plus size={16} className="text-primary" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isEdit ? "Modifier le poulailler" : "Nouveau poulailler"}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEdit
                  ? `Modification de « ${poulailler!.name} »`
                  : "Renseignez les informations du poulailler"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — ordre logique : nom d'abord, éleveur ensuite */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Nom — champ principal, autofocus */}
          <div>
            <label className={labelClass}>
              Nom du poulailler <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={set("name")}
              placeholder="ex : Ferme Dupont — Bâtiment A"
              autoFocus
              className={inputClass}
            />
            {nameTooShort && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={11} /> Minimum 3 caractères
              </p>
            )}
          </div>

          {/* Éleveur */}
          <div>
            <label className={labelClass}>
              Éleveur propriétaire <span className="text-red-500">*</span>
            </label>
            {loadingUsers ? (
              <div className="flex items-center gap-2 px-3.5 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900">
                <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                <span className="text-sm text-slate-400">
                  Chargement des éleveurs…
                </span>
              </div>
            ) : (
              <select
                value={form.ownerId}
                onChange={set("ownerId")}
                className={inputClass}
              >
                <option value="">— Sélectionner un éleveur —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                    {u.email ? ` (${u.email})` : ""}
                  </option>
                ))}
              </select>
            )}
            {!loadingUsers && users.length === 0 && (
              <p className="text-xs text-amber-500 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={11} /> Aucun éleveur trouvé.
              </p>
            )}
          </div>

          {/* Animaux + Date (grille 2 colonnes) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Nombre d'animaux{" "}
                <span className="normal-case font-normal text-slate-300">
                  (opt.)
                </span>
              </label>
              <input
                type="number"
                min={1}
                value={form.animalCount}
                onChange={set("animalCount")}
                placeholder="ex : 500"
                className={inputClass}
              />
              {animalInvalid && (
                <p className="text-xs text-red-500 mt-1.5">
                  Doit être supérieur à 0
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>
                Date d'installation{" "}
                <span className="normal-case font-normal text-slate-300">
                  (opt.)
                </span>
              </label>
              <input
                type="date"
                value={form.installationDate}
                onChange={set("installationDate")}
                className={inputClass}
              />
            </div>
          </div>

          {/* Localisation */}
          <div>
            <label className={labelClass}>
              Localisation{" "}
              <span className="normal-case font-normal text-slate-300">
                (opt.)
              </span>
            </label>
            <input
              type="text"
              value={form.location}
              onChange={set("location")}
              placeholder="ex : Route de la Ferme, Mahdia"
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>
              Description{" "}
              <span className="normal-case font-normal text-slate-300">
                (opt.)
              </span>
            </label>
            <textarea
              value={form.description}
              onChange={set("description")}
              rows={3}
              placeholder="Notes ou informations complémentaires…"
              className={`${inputClass} resize-none`}
            />
            <p
              className={cn(
                "text-xs mt-1 text-right",
                descTooLong
                  ? "text-red-500"
                  : "text-slate-300 dark:text-slate-600",
              )}
            >
              {form.description.length}/200
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2.5 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition font-medium"
          >
            Annuler
          </button>
          <button
            onClick={() =>
              onSubmit({
                name: form.name.trim(),
                animalCount: form.animalCount
                  ? parseInt(form.animalCount)
                  : undefined,
                description: form.description.trim() || undefined,
                location: form.location.trim() || undefined,
                installationDate: form.installationDate || undefined,
                ownerId: form.ownerId,
              })
            }
            disabled={!canSubmit || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition text-sm disabled:opacity-50 shadow-sm"
          >
            {loading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                {isEdit ? "Enregistrement…" : "Création…"}
              </>
            ) : isEdit ? (
              <>
                <CheckCircle2 size={15} /> Enregistrer
              </>
            ) : (
              <>
                <Plus size={15} /> Créer le poulailler
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DELETE MODAL
// ============================================================================

const DeleteModal = ({
  isOpen,
  onClose,
  onConfirm,
  poulailler,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  poulailler: PoulaillerAdmin | null;
  loading: boolean;
}) => {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (isOpen) setConfirmed(false);
  }, [isOpen]);
  if (!isOpen || !poulailler) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Trash2 size={18} className="text-red-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Supprimer le poulailler
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="font-semibold">{poulailler.name}</span>
                <span className="font-mono ml-1.5 text-slate-300">
                  ({poulailler.codeUnique})
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2.5">
            <AlertTriangle
              size={15}
              className="text-amber-500 flex-shrink-0 mt-0.5"
            />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              Le poulailler sera archivé (suppression douce). Les données
              historiques seront conservées.
            </p>
          </div>

          <label className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-600 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 text-red-500 border-slate-300 rounded focus:ring-red-400"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Je confirme la suppression de ce poulailler
            </span>
          </label>

          <div className="flex justify-end gap-2.5">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              disabled={!confirmed || loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition text-sm disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Suppression…
                </>
              ) : (
                <>
                  <Trash2 size={14} /> Supprimer
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function PoulaillersAdmin() {
  const [poulaillers, setPoulaillers] = useState<PoulaillerAdmin[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPoulailler, setSelectedPoulailler] =
    useState<PoulaillerAdmin | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const kpiTotal = pagination.total;
  const kpiConnected = poulaillers.filter(
    (p) => p.status === "connecte",
  ).length;
  const kpiAlerts = poulaillers.filter((p) => p.alertesActives > 0).length;
  const kpiAnimals = poulaillers.reduce(
    (sum, p) => sum + (p.animalCount ?? 0),
    0,
  );

  const fetchPoulaillers = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const response = await poulaillersAPI.getAll({
          search: search || undefined,
          status: statusFilter || undefined,
          page,
          limit: pagination.limit,
        });
        setPoulaillers(response.data.data);
        setPagination(response.data.pagination);
      } catch (err: any) {
        setError(err.response?.data?.error || "Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter, pagination.limit],
  );

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await poulaillersAPI.getUsers();
      setUsers(response.data.data ?? []);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchPoulaillers(1);
  }, [fetchPoulaillers]);

  const handleCreate = async (data: any) => {
    setSubmitting(true);
    try {
      await poulaillersAPI.create(data);
      toast.success("Poulailler créé avec succès !");
      setShowCreateModal(false);
      fetchPoulaillers(1);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (data: any) => {
    if (!selectedPoulailler) return;
    setSubmitting(true);
    try {
      await poulaillersAPI.update(selectedPoulailler.id, data);
      toast.success("Poulailler mis à jour !");
      setShowEditModal(false);
      setSelectedPoulailler(null);
      fetchPoulaillers(pagination.page);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur lors de la mise à jour");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPoulailler) return;
    setDeleting(true);
    try {
      await poulaillersAPI.delete(selectedPoulailler.id);
      toast.success("Poulailler supprimé !");
      setShowDeleteModal(false);
      setSelectedPoulailler(null);
      const newTotal = pagination.total - 1;
      const newPages = Math.ceil(newTotal / pagination.limit);
      fetchPoulaillers(Math.min(pagination.page, Math.max(newPages, 1)));
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-5 lg:p-7 min-w-0">
          {/* ── Page header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Poulaillers
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Supervision et gestion globale des installations
              </p>
            </div>
            <button
              onClick={() => {
                fetchUsers();
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-xl transition text-sm shadow-sm self-start sm:self-auto"
            >
              <Plus size={16} />
              Ajouter un poulailler
            </button>
          </div>

          {/* ── KPI Cards ── */}
          <div className="flex flex-wrap gap-3 mb-5">
            <KpiCard label="Total" value={kpiTotal} icon={Bird} />
            <KpiCard
              label="Connectés"
              value={kpiConnected}
              accent="emerald"
              icon={Wifi}
              sub={
                kpiTotal > 0
                  ? `${Math.round((kpiConnected / kpiTotal) * 100)}% de la flotte`
                  : undefined
              }
            />
            <KpiCard
              label="Avec alertes"
              value={kpiAlerts}
              accent="rose"
              icon={AlertTriangle}
            />
            <KpiCard
              label="Animaux"
              value={kpiAnimals.toLocaleString("fr-FR")}
              accent="blue"
              icon={Bird}
            />
          </div>

          {/* ── Filtres ── */}
          <div className="mb-4 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1 max-w-md">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Rechercher par nom, code, éleveur…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 text-slate-900 dark:text-white text-sm placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-all shadow-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* ── Erreur ── */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2.5">
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* ── Compteur résultats ── */}
          {!loading && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 font-medium">
              {pagination.total} poulailler{pagination.total !== 1 ? "s" : ""}
              {search && <span className="ml-1">pour « {search} »</span>}
            </p>
          )}

          {/* ── Liste ── */}
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[62px] rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 animate-pulse"
                />
              ))}
            </div>
          ) : poulaillers.length === 0 ? (
            <div className="p-16 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              <Bird size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Aucun poulailler trouvé</p>
              <p className="text-xs mt-1">
                Modifiez vos filtres ou ajoutez un nouveau poulailler
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {poulaillers.map((p) => (
                <PoulaillerRow
                  key={p.id}
                  p={p}
                  onEdit={(poulailler) => {
                    setSelectedPoulailler(poulailler);
                    fetchUsers();
                    setShowEditModal(true);
                  }}
                  onDelete={(poulailler) => {
                    setSelectedPoulailler(poulailler);
                    setShowDeleteModal(true);
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Pagination ── */}
          {!loading && pagination.pages > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Page {pagination.page} sur {pagination.pages} —{" "}
                {pagination.total} résultat{pagination.total !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchPoulaillers(pagination.page - 1)}
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
                        onClick={() => fetchPoulaillers(item as number)}
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
                  onClick={() => fetchPoulaillers(pagination.page + 1)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                >
                  Suiv. →
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <PoulaillerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        loading={submitting}
        poulailler={null}
        users={users}
        loadingUsers={loadingUsers}
      />
      <PoulaillerModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedPoulailler(null);
        }}
        onSubmit={handleEdit}
        loading={submitting}
        poulailler={selectedPoulailler}
        users={users}
        loadingUsers={loadingUsers}
      />
      <DeleteModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedPoulailler(null);
        }}
        onConfirm={handleDelete}
        poulailler={selectedPoulailler}
        loading={deleting}
      />
    </div>
  );
}
