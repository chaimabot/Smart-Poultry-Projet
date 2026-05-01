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
  ChevronDown,
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

const STATUS_OPTIONS = [
  { value: "", label: "Tous" },
  { value: "connecte", label: "validé" },
  { value: "en_attente_module", label: "En attente" },
];

const getStatusConfig = (status: string) => {
  switch (status) {
    case "connecte":
      return {
        label: "Connecté",
        dot: "bg-emerald-500",
        text: "text-emerald-600 dark:text-emerald-400",
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
        text: "text-amber-600 dark:text-amber-400",
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

// Badge unique combinant connexion + alertes — bien plus lisible
const StatusAlertBadge = ({
  status,
  alertCount,
  alertSeverity,
}: {
  status: string;
  alertCount: number;
  alertSeverity?: string;
}) => {
  // Priorité aux alertes critiques
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
  // Pas d'alerte : afficher le statut de connexion de façon claire
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

// ── Sensor card ─────────────────────────────────────────────────────────────
const SENSOR_META: Record<
  string,
  { Icon: React.ElementType; color: string; alertColor: string }
> = {
  "°C": {
    Icon: Thermometer,
    color: "text-orange-500",
    alertColor: "text-rose-600 dark:text-rose-400",
  },
  "%": {
    Icon: Droplets,
    color: "text-sky-500",
    alertColor: "text-rose-600 dark:text-rose-400",
  },
  ppm_co2: {
    Icon: Wind,
    color: "text-slate-500",
    alertColor: "text-rose-600 dark:text-rose-400",
  },
  ppm_nh3: {
    Icon: FlaskConical,
    color: "text-violet-500",
    alertColor: "text-rose-600 dark:text-rose-400",
  },
  "% eau": {
    Icon: Waves,
    color: "text-cyan-500",
    alertColor: "text-rose-600 dark:text-rose-400",
  },
};

const SensorCard = ({
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
        "rounded-xl border p-4 flex flex-col gap-2 min-w-[120px] transition-all",
        alert
          ? "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/10 shadow-rose-100 dark:shadow-none shadow-sm"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80",
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            alert
              ? "bg-rose-100 dark:bg-rose-900/40"
              : "bg-slate-100 dark:bg-slate-700",
          )}
        >
          <Icon
            size={16}
            className={
              alert ? "text-rose-500" : (meta?.color ?? "text-slate-500")
            }
          />
        </div>
        {alert && (
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        )}
      </div>
      <div>
        <p
          className={cn(
            "text-xl font-bold leading-none",
            alert
              ? "text-rose-700 dark:text-rose-300"
              : "text-slate-900 dark:text-white",
          )}
        >
          {value != null ? value : "—"}
          <span className="text-sm font-normal ml-1 text-slate-400">
            {unit}
          </span>
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {label}
        </p>
      </div>
      {limit && (
        <p
          className={cn(
            "text-xs border-t pt-2",
            alert
              ? "text-rose-500 border-rose-200 dark:border-rose-800"
              : "text-slate-400 border-slate-100 dark:border-slate-700",
          )}
        >
          {limit}
        </p>
      )}
    </div>
  );
};

// ── Actuator card ────────────────────────────────────────────────────────────
const ACTUATOR_ICONS: Record<string, React.ElementType> = {
  Porte: DoorOpen,
  Ventilation: Fan,
  Lampe: Lightbulb,
  Pompe: Droplet,
};

const ActuatorCard = ({
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
        "rounded-xl border p-4 flex flex-col items-center gap-2.5 min-w-[110px] transition-all",
        isOn
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80",
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center",
          isOn
            ? "bg-emerald-100 dark:bg-emerald-900/40"
            : "bg-slate-100 dark:bg-slate-700",
        )}
      >
        <Icon
          size={20}
          className={
            isOn ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
          }
        />
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
          {name}
        </p>
        <p
          className={cn(
            "text-sm font-medium mt-0.5",
            isOn ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400",
          )}
        >
          {state}
        </p>
      </div>
      <span
        className={cn(
          "text-xs px-2 py-0.5 rounded-full font-medium",
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
  const actuators: Actuator[] = p.actuators ?? [
    { name: "Porte", state: "Fermée", mode: "Auto", icon: "🚪" },
    { name: "Ventilation", state: "Éteinte", mode: "Manuel", icon: "💨" },
    { name: "Lampe", state: "Allumée", mode: "Auto", icon: "💡" },
    { name: "Pompe", state: "Éteinte", mode: "Manuel", icon: "💧" },
  ];

  const m = p.lastMeasure ?? {};
  const th = p.thresholds ?? {};
  const ath = p.autoThresholds ?? {};

  const Section = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-2">
        <span className="w-3 h-px bg-slate-300 dark:bg-slate-600" />
        {title}
        <span className="flex-1 h-px bg-slate-100 dark:bg-slate-700/50" />
      </h4>
      {children}
    </section>
  );

  return (
    <div className="border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-900/40 backdrop-blur-sm">
      {/* Action bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/30">
        <p className="text-xs text-slate-400 font-medium">
          Détails du poulailler
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(p);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary dark:hover:text-primary transition-all text-xs font-medium shadow-sm"
          >
            <Pencil size={13} />
            Modifier
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(p);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 transition-all text-xs font-medium shadow-sm"
          >
            <Trash2 size={13} />
            Supprimer
          </button>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* ── Informations générales ── */}
        <Section title="Informations générales">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5 text-sm">
            {[
              {
                label: "Propriétaire",
                content: p.owner ? (
                  <Link
                    to={`/eleveurs/${p.owner.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {p.owner.firstName} {p.owner.lastName}
                  </Link>
                ) : (
                  <span className="text-slate-400">—</span>
                ),
              },
              {
                label: "Email",
                content: (
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {p.owner?.email ?? "—"}
                  </span>
                ),
              },
              {
                label: "Localisation",
                content: (
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {p.location?.trim() || "Non renseignée"}
                  </span>
                ),
              },
              {
                label: "Installation",
                content: (
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {p.installationDate
                      ? new Date(p.installationDate).toLocaleDateString(
                          "fr-FR",
                          { day: "2-digit", month: "short", year: "numeric" },
                        )
                      : "—"}
                  </span>
                ),
              },
              {
                label: "Dernière mesure",
                content: (
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {p.lastMeasureDate
                      ? new Date(p.lastMeasureDate).toLocaleDateString(
                          "fr-FR",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )
                      : "—"}
                  </span>
                ),
              },
              {
                label: "Dernière alerte",
                content: (
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {p.lastAlertDate
                      ? new Date(p.lastAlertDate).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                ),
              },
              {
                label: "Description",
                content: (
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {p.description ?? "—"}
                  </span>
                ),
              },
              {
                label: "Archivé",
                content: (
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {p.archived ? "Oui" : "Non"}
                  </span>
                ),
              },
            ].map(({ label, content }) => (
              <div key={label}>
                <span className="block text-xs text-slate-400 dark:text-slate-500 mb-1 font-medium uppercase tracking-wide">
                  {label}
                </span>
                {content}
              </div>
            ))}
          </div>
        </Section>

        {/* ── Capteurs ── */}
        <Section title="Capteurs — Dernière mesure">
          <div className="flex flex-wrap gap-3">
            <SensorCard
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
            <SensorCard
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
            <SensorCard
              value={m.co2}
              unit="ppm"
              label="CO₂"
              iconKey="ppm_co2"
              limit={th.co2Max != null ? `Max : ${th.co2Max} ppm` : undefined}
              alert={m.co2 != null && th.co2Max != null && m.co2 > th.co2Max}
            />
            <SensorCard
              value={m.nh3}
              unit="ppm"
              label="NH₃"
              iconKey="ppm_nh3"
              limit={th.nh3Max != null ? `Max : ${th.nh3Max} ppm` : undefined}
              alert={m.nh3 != null && th.nh3Max != null && m.nh3 > th.nh3Max}
            />
            <SensorCard
              value={m.waterLevel}
              unit="%"
              label="Niveau eau"
              iconKey="% eau"
              limit={th.waterMin != null ? `Min : ${th.waterMin} %` : undefined}
              alert={
                m.waterLevel != null &&
                th.waterMin != null &&
                m.waterLevel < th.waterMin
              }
            />
          </div>
        </Section>

        {/* ── Actionneurs ── */}
        <Section title="Actionneurs">
          <div className="flex flex-wrap gap-3">
            {actuators.map((a) => (
              <ActuatorCard key={a.name} {...a} />
            ))}
          </div>
        </Section>

        {/* ── Seuils monitoring ── */}
        {th && Object.keys(th).length > 0 && (
          <Section title="Seuils de monitoring">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {th.tempMin != null && th.tempMax != null && (
                <ThresholdCard
                  label="Température"
                  value={`${th.tempMin}–${th.tempMax} °C`}
                />
              )}
              {th.humMin != null && th.humMax != null && (
                <ThresholdCard
                  label="Humidité"
                  value={`${th.humMin}–${th.humMax} %`}
                />
              )}
              {th.co2Max != null && (
                <ThresholdCard label="CO₂ max" value={`${th.co2Max} ppm`} />
              )}
              {th.nh3Max != null && (
                <ThresholdCard label="NH₃ max" value={`${th.nh3Max} ppm`} />
              )}
              {th.dustMax != null && (
                <ThresholdCard
                  label="Poussière max"
                  value={`${th.dustMax} μg/m³`}
                />
              )}
              {th.waterMin != null && (
                <ThresholdCard label="Eau min" value={`${th.waterMin} %`} />
              )}
            </div>
          </Section>
        )}

        {/* ── Seuils automatiques ── */}
        {ath && Object.keys(ath).length > 0 && (
          <Section title="Seuils automatiques">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {ath.tempVentilo != null && (
                <ThresholdCard
                  label="Seuil temp. ventilo"
                  value={`${ath.tempVentilo} °C`}
                />
              )}
              {ath.co2Ventilo != null && (
                <ThresholdCard
                  label="Seuil CO₂ ventilo"
                  value={`${ath.co2Ventilo} ppm`}
                />
              )}
              {ath.doorOpen && (
                <ThresholdCard label="Ouverture porte" value={ath.doorOpen} />
              )}
              {ath.doorClose && (
                <ThresholdCard label="Fermeture porte" value={ath.doorClose} />
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
};

const ThresholdCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
    <p className="text-xs text-slate-400 dark:text-slate-500 mb-1 font-medium uppercase tracking-wide">
      {label}
    </p>
    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
      {value}
    </p>
  </div>
);

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

  const statusCfg = getStatusConfig(p.connectionStatus ?? p.status);

  const avatarBg =
    p.alertSeverity === "critique"
      ? "bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/40 dark:to-orange-900/30 border-red-200 dark:border-red-800"
      : p.status === "connecte"
        ? "bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-900/30 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800"
        : "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-700/50 border-slate-200 dark:border-slate-600";

  return (
    <div
      className={cn(
        "border rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm transition-all duration-200",
        expanded
          ? "border-primary/30 dark:border-primary/20 shadow-md shadow-primary/5"
          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md",
      )}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Avatar */}
        <div
          className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border",
            avatarBg,
          )}
        >
          <Bird
            size={22}
            className={
              p.alertSeverity === "critique"
                ? "text-red-500"
                : p.status === "connecte"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-400"
            }
          />
        </div>

        {/* Name + owner + code */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-white text-sm leading-tight">
            {p.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {p.owner ? (
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {p.owner.firstName} {p.owner.lastName}
              </span>
            ) : (
              <span className="text-xs text-amber-500 font-medium">
                Aucun éleveur assigné
              </span>
            )}
            <span className="text-slate-200 dark:text-slate-700">·</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
              {p.codeUnique}
            </span>
            {p.animalCount != null && (
              <>
                <span className="text-slate-200 dark:text-slate-700">·</span>
                <span className="text-xs text-slate-400">
                  {p.animalCount.toLocaleString("fr-FR")} animaux
                </span>
              </>
            )}
          </div>
        </div>

        {/* Badge statut unique et lisible */}
        <div className="hidden sm:flex items-center flex-shrink-0">
          <StatusAlertBadge
            status={p.connectionStatus ?? p.status}
            alertCount={p.alertesActives}
            alertSeverity={p.alertSeverity}
          />
        </div>

        {/* Quick actions (visible without expanding) */}
        <div
          className="hidden md:flex items-center gap-1 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onEdit(p)}
            title="Modifier"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => onDelete(p)}
            title="Supprimer"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Chevron */}
        <ChevronDown
          size={18}
          className={cn(
            "text-slate-400 transition-transform duration-200 flex-shrink-0",
            expanded && "rotate-180",
          )}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <PoulaillerDetail p={p} onEdit={onEdit} onDelete={onDelete} />
      )}
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
}: {
  label: string;
  value: string | number;
  accent?: "emerald" | "rose" | "blue" | "default";
  icon: React.ElementType;
}) => {
  const accentMap = {
    emerald: {
      value: "text-emerald-600 dark:text-emerald-400",
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
        "bg-white dark:bg-slate-800 border rounded-xl px-5 py-4 shadow-sm flex-1 min-w-[150px] flex items-center gap-4",
        a.border,
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
          a.icon,
        )}
      >
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
          {label}
        </p>
        <p className={cn("text-2xl font-bold mt-0.5", a.value)}>{value}</p>
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
        installationDate: new Date().toISOString().slice(0, 10),
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
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                {isEdit ? (
                  <Pencil size={15} className="text-primary" />
                ) : (
                  <Plus size={15} className="text-primary" />
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {isEdit ? "Modifier le poulailler" : "Nouveau poulailler"}
              </h3>
            </div>
            <p className="text-xs text-slate-400 ml-10">
              {isEdit
                ? `Modification de "${poulailler!.name}"`
                : "Renseignez les informations du poulailler"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div>
            <label className={labelClass}>
              Éleveur propriétaire <span className="text-red-500">*</span>
            </label>
            {loadingUsers ? (
              <div className="flex items-center gap-2 px-3.5 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900">
                <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                <span className="text-sm text-slate-400">Chargement…</span>
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
              placeholder="ex : Route de la Ferme, 75000 Paris"
              className={inputClass}
            />
          </div>

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
        <div className="px-6 pb-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2.5 flex-shrink-0">
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
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Trash2 size={18} className="text-red-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Supprimer le poulailler
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {poulailler.codeUnique}
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

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Vous êtes sur le point de supprimer{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              {poulailler.name}
            </span>
            .
          </p>

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
              id="confirm-delete"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 text-red-500 border-slate-300 rounded focus:ring-red-400"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Je confirme la suppression de ce poulailler
            </span>
          </label>

          <div className="flex justify-end gap-2.5 pt-2">
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
        <main className="flex-1 p-6 lg:p-8 min-w-0">
          {/* ── Page header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Poulaillers
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Supervision et gestion globale
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
          <div className="flex flex-wrap gap-3 mb-6">
            <KpiCard label="Total" value={kpiTotal} icon={Bird} />
            <KpiCard
              label="Connectés"
              value={kpiConnected}
              accent="emerald"
              icon={Wifi}
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

          {/* ── Filters ── */}
          <div className="mb-5 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-lg">
              <input
                type="text"
                placeholder="Rechercher par nom, code, éleveur…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 text-slate-900 dark:text-white text-sm placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-all shadow-sm"
              />
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm shadow-sm transition-all"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2.5">
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {!loading && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 font-medium">
              {pagination.total} poulailler{pagination.total !== 1 ? "s" : ""}
            </p>
          )}

          {/* ── List ── */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[72px] rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 animate-pulse"
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
            <div className="space-y-2.5">
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
            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Page {pagination.page} sur {pagination.pages} —{" "}
                {pagination.total} résultat{pagination.total !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1.5">
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
