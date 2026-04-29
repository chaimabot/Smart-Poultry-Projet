import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { poulaillersAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import { cn } from "../../lib/utils";
import { formatLastCheck } from "../../lib/utils";
import toast from "react-hot-toast";

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
  { value: "", label: "Tous les statuts" },
  { value: "connecte", label: "Connecté" },
  { value: "alerte", label: "Alerte" },
  { value: "hors_ligne", label: "Hors ligne" },
  { value: "en_attente_module", label: "En attente" },
];

const getStatusConfig = (status: string) => {
  switch (status) {
    case "connecte":
      return {
        label: "Connecté",
        dot: "bg-emerald-500",
        text: "text-emerald-600 dark:text-emerald-400",
      };
    case "alerte":
      return {
        label: "Alerte",
        dot: "bg-rose-500",
        text: "text-rose-600 dark:text-rose-400",
      };
    case "hors_ligne":
      return {
        label: "Hors ligne",
        dot: "bg-slate-400",
        text: "text-slate-500 dark:text-slate-400",
      };
    case "en_attente_module":
      return {
        label: "En attente",
        dot: "bg-amber-400",
        text: "text-amber-600 dark:text-amber-400",
      };
    default:
      return { label: status, dot: "bg-gray-400", text: "text-gray-500" };
  }
};

const getSeverityBadge = (severity?: string, alertCount?: number) => {
  if (!alertCount || alertCount === 0)
    return (
      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
        ✓ OK
      </span>
    );
  if (severity === "critique")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium">
        <span className="w-2 h-2 bg-red-500 rounded-full inline-block" />
        Critique
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
      ⚠ {alertCount} alertes
    </span>
  );
};

const getConnectionBadge = (status: string) => {
  const cfg = getStatusConfig(status);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
      <span className={cfg.text}>{cfg.label}</span>
    </span>
  );
};

// Sensor card with threshold alert indicator
const SensorCard = ({
  value,
  unit,
  label,
  limit,
  limitLabel,
  alert,
}: {
  value?: number | null;
  unit: string;
  label: string;
  limit?: string;
  limitLabel?: string;
  alert?: boolean;
}) => (
  <div
    className={cn(
      "rounded-xl border p-4 flex flex-col gap-1 min-w-[100px]",
      alert
        ? "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20"
        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800",
    )}
  >
    <div className="flex items-start justify-between">
      <span
        className={cn(
          "text-2xl font-bold",
          alert
            ? "text-rose-700 dark:text-rose-300"
            : "text-slate-900 dark:text-white",
        )}
      >
        {value != null ? value : "—"}
      </span>
      {alert && <span className="w-2 h-2 rounded-full bg-rose-500 mt-1" />}
    </div>
    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">
      {unit} · {label}
    </span>
    {limit && (
      <span
        className={cn(
          "text-xs mt-1",
          alert ? "text-rose-500" : "text-slate-400",
        )}
      >
        {limit} {limitLabel && <span className="text-amber-500">⚠</span>}
      </span>
    )}
  </div>
);

// Actuator card
const ActuatorCard = ({
  icon,
  name,
  state,
  mode,
}: {
  icon: string;
  name: string;
  state: string;
  mode: string;
}) => {
  const isOn =
    state.toLowerCase() === "allumée" ||
    state.toLowerCase() === "ouverte" ||
    state.toLowerCase() === "on";
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 flex flex-col items-center gap-2 min-w-[100px]">
      <span className="text-3xl">{icon}</span>
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
        {name}
      </span>
      <span
        className={cn(
          "text-sm font-medium",
          isOn
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-slate-500 dark:text-slate-400",
        )}
      >
        {state}
      </span>
      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
        {mode}
      </span>
    </div>
  );
};

// ============================================================================
// EXPANDED POULAILLER DETAIL
// ============================================================================

const PoulaillerDetail = ({ p }: { p: PoulaillerAdmin }) => {
  // Default demo actuators if not provided
  const actuators: Actuator[] = p.actuators ?? [
    { name: "Porte", state: "Fermée", mode: "Auto", icon: "🚪" },
    { name: "Ventilation", state: "Éteinte", mode: "Manuel", icon: "💨" },
    { name: "Lampe", state: "Allumée", mode: "Auto", icon: "💡" },
    { name: "Pompe", state: "Éteinte", mode: "Manuel", icon: "💧" },
  ];

  const m = p.lastMeasure ?? {};
  const th = p.thresholds ?? {};
  const ath = p.autoThresholds ?? {};

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30">
      <div className="p-6 space-y-8">
        {/* ── Informations générales ── */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Informations générales
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4 text-sm">
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">
                Propriétaire
              </span>
              {p.owner ? (
                <Link
                  to={`/eleveurs/${p.owner.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {p.owner.firstName} {p.owner.lastName}
                </Link>
              ) : (
                <span className="font-medium text-slate-400">—</span>
              )}
            </div>
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">Email</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {p.owner?.email ?? "—"}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">
                Localisation
              </span>
<span className="font-medium text-slate-800 dark:text-slate-200">
                {p.location?.trim() || "Non renseignée"}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">
                Installation
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {p.installationDate
                  ? new Date(p.installationDate).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">
                Dernière mesure
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {p.lastMeasureDate
                  ? new Date(p.lastMeasureDate).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">
                Dernière alerte
              </span>
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
            </div>
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">
                Description
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {p.description ?? "—"}
              </span>
            </div>
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">
                Archivé
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {p.archived ? "Oui" : "Non"}
              </span>
            </div>
          </div>
        </section>

        {/* ── Capteurs — Dernière mesure ── */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Capteurs — Dernière mesure
          </h4>
          <div className="flex flex-wrap gap-3">
            <SensorCard
              value={m.temperature}
              unit="°C"
              label="Température"
              limit={
                th.tempMin != null && th.tempMax != null
                  ? `${th.tempMin}–${th.tempMax} °C`
                  : undefined
              }
              limitLabel="⚠"
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
              limit={
                th.humMin != null && th.humMax != null
                  ? `${th.humMin}–${th.humMax} %`
                  : undefined
              }
              limitLabel="⚠"
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
              limit={th.co2Max != null ? `Max ${th.co2Max} ppm` : undefined}
              alert={m.co2 != null && th.co2Max != null && m.co2 > th.co2Max}
            />
            <SensorCard
              value={m.nh3}
              unit="ppm"
              label="NH₃"
              limit={th.nh3Max != null ? `Max ${th.nh3Max} ppm` : undefined}
              alert={m.nh3 != null && th.nh3Max != null && m.nh3 > th.nh3Max}
            />
            <SensorCard
              value={m.waterLevel}
              unit="%"
              label="Niveau eau"
              limit={th.waterMin != null ? `Min ${th.waterMin} %` : undefined}
              limitLabel="⚠"
              alert={
                m.waterLevel != null &&
                th.waterMin != null &&
                m.waterLevel < th.waterMin
              }
            />
          </div>
        </section>

        {/* ── Actionneurs ── */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            Actionneurs
          </h4>
          <div className="flex flex-wrap gap-3">
            {actuators.map((a) => (
              <ActuatorCard key={a.name} {...a} />
            ))}
          </div>
        </section>

        {/* ── Seuils de monitoring ── */}
        {th && Object.keys(th).length > 0 && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
              Seuils de monitoring
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {th.tempMin != null && th.tempMax != null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">Température</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {th.tempMin}–{th.tempMax} °C
                  </p>
                </div>
              )}
              {th.humMin != null && th.humMax != null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">Humidité</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {th.humMin}–{th.humMax} %
                  </p>
                </div>
              )}
              {th.co2Max != null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">CO₂ max</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {th.co2Max} ppm
                  </p>
                </div>
              )}
              {th.nh3Max != null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">NH₃ max</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {th.nh3Max} ppm
                  </p>
                </div>
              )}
              {th.dustMax != null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">Poussière max</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {th.dustMax} μg/m³
                  </p>
                </div>
              )}
              {th.waterMin != null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">Eau min</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {th.waterMin} %
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Seuils automatiques ── */}
        {ath && Object.keys(ath).length > 0 && (
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
              Seuils automatiques
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {ath.tempVentilo != null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">
                    Seuil temp. ventilo
                  </p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {ath.tempVentilo} °C
                  </p>
                </div>
              )}
              {ath.co2Ventilo != null && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">
                    Seuil CO₂ ventilo
                  </p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {ath.co2Ventilo} ppm
                  </p>
                </div>
              )}
              {ath.doorOpen && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">Ouverture porte</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {ath.doorOpen}
                  </p>
                </div>
              )}
              {ath.doorClose && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <p className="text-xs text-slate-400 mb-1">Fermeture porte</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {ath.doorClose}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// POULAILLER ROW (collapsible)
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

  // Emoji avatar based on status
  const avatar =
    p.alertSeverity === "critique"
      ? "⚠️"
      : p.status === "connecte"
        ? "🐔"
        : p.status === "en_attente_module"
          ? "⏳"
          : "🐓";

  const avatarBg =
    p.alertSeverity === "critique"
      ? "bg-amber-100 dark:bg-amber-900/40"
      : p.status === "connecte"
        ? "bg-emerald-50 dark:bg-emerald-900/30"
        : "bg-slate-100 dark:bg-slate-700";

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
      {/* Header row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Avatar */}
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0",
            avatarBg,
          )}
        >
          {avatar}
        </div>

        {/* Name + code */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-white text-base leading-tight">
            {p.name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {p.codeUnique}
            {p.animalCount != null &&
              ` · ${p.animalCount.toLocaleString("fr-FR")} animaux`}
            {p.animalCount == null && " · Animaux non renseignés"}
          </p>
        </div>

        {/* Status badges */}
        <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
          {getConnectionBadge(p.connectionStatus ?? p.status)}

          {/* Module status */}
          {getConnectionBadge(p.status)}

          {/* Alerts badge */}
          {getSeverityBadge(p.alertSeverity, p.alertesActives)}
        </div>

        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            "h-5 w-5 text-slate-400 transition-transform flex-shrink-0 ml-2",
            expanded && "rotate-180",
          )}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && <PoulaillerDetail p={p} />}
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
}: {
  label: string;
  value: string | number;
  accent?: "emerald" | "rose" | "default";
}) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4 shadow-sm flex-1 min-w-[140px]">
    <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    <p
      className={cn(
        "text-3xl font-bold mt-1",
        accent === "emerald" && "text-emerald-500",
        accent === "rose" && "text-rose-500",
        (!accent || accent === "default") && "text-slate-900 dark:text-white",
      )}
    >
      {value}
    </p>
  </div>
);

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
  "w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm";

const labelClass =
  "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            {isEdit ? "Modifier le poulailler" : "Ajouter un poulailler"}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isEdit
              ? `Modification de "${poulailler!.name}"`
              : "Renseignez les informations du nouveau poulailler"}
          </p>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div>
            <label className={labelClass}>
              Éleveur propriétaire <span className="text-red-500">*</span>
            </label>
            {loadingUsers ? (
              <div className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900">
                <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                <span className="text-sm text-slate-500">
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
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Aucun éleveur trouvé.
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
              <p className="text-xs text-red-500 mt-1">Minimum 3 caractères</p>
            )}
          </div>
          <div>
            <label className={labelClass}>
              Nombre d'animaux{" "}
              <span className="font-normal text-slate-400">(optionnel)</span>
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
              <p className="text-xs text-red-500 mt-1">
                Le nombre doit être supérieur à 0
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>
              Localisation{" "}
              <span className="font-normal text-slate-400">(optionnel)</span>
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
              Date d'installation{" "}
              <span className="font-normal text-slate-400">(optionnel)</span>
            </label>
            <input
              type="date"
              value={form.installationDate}
              onChange={set("installationDate")}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Description{" "}
              <span className="font-normal text-slate-400">(optionnel)</span>
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
                descTooLong ? "text-red-500" : "text-slate-400",
              )}
            >
              {form.description.length}/200
            </p>
          </div>
        </div>
        <div className="px-6 pb-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition text-sm"
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
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition text-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                {isEdit ? "Enregistrement…" : "Création…"}
              </>
            ) : isEdit ? (
              "Enregistrer"
            ) : (
              "Créer le poulailler"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-red-600 dark:text-red-400">
            Supprimer le poulailler
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {poulailler.name} — {poulailler.codeUnique}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Le poulailler sera archivé (suppression douce). Les données
              historiques seront conservées.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="confirm-delete"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="w-4 h-4 text-red-500 border-slate-300 rounded focus:ring-red-400"
            />
            <label
              htmlFor="confirm-delete"
              className="text-sm text-slate-700 dark:text-slate-300"
            >
              Je confirme vouloir supprimer ce poulailler
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition text-sm"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              disabled={!confirmed || loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition text-sm disabled:opacity-70"
            >
              {loading ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Suppression…
                </>
              ) : (
                "Supprimer"
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

  // Derived KPIs
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
        <main className="flex-1 p-6 lg:p-8">
          {/* ── Page title ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Tous les Poulaillers
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Supervision globale
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  fetchUsers();
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition text-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Ajouter un poulailler
              </button>
            </div>
          </div>

          {/* ── KPI Cards ── */}
          <div className="flex flex-wrap gap-4 mb-6">
            <KpiCard label="Total poulaillers" value={kpiTotal} />
            <KpiCard label="Connectés" value={kpiConnected} accent="emerald" />
            <KpiCard label="Avec alertes" value={kpiAlerts} accent="rose" />
            <KpiCard
              label="Total animaux"
              value={kpiAnimals.toLocaleString("fr-FR")}
            />
          </div>

          {/* ── Filters ── */}
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-xl">
              <input
                type="text"
                placeholder="Rechercher nom, code, éleveur…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-slate-900 dark:text-white text-sm"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* ── Count ── */}
          {!loading && (
            <p className="text-xs text-slate-400 mb-4">
              {pagination.total} poulailler{pagination.total !== 1 ? "s" : ""}{" "}
              affiché{pagination.total !== 1 ? "s" : ""}
            </p>
          )}

          {/* ── List ── */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 animate-pulse"
                />
              ))}
            </div>
          ) : poulaillers.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-lg font-medium">
                Aucun poulailler ne correspond
              </p>
              <p className="text-sm mt-1">
                Modifiez vos filtres ou ajoutez un nouveau poulailler
              </p>
            </div>
          ) : (
            <div className="space-y-3">
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
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Page {pagination.page} sur {pagination.pages} —{" "}
                {pagination.total} résultat{pagination.total !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchPoulaillers(pagination.page - 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  ← Précédent
                </button>
                {Array.from({ length: pagination.pages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === pagination.pages ||
                      Math.abs(p - pagination.page) <= 1,
                  )
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                      acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "..." ? (
                      <span key={`e-${idx}`} className="px-2 text-slate-400">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => fetchPoulaillers(item as number)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm transition",
                          item === pagination.page
                            ? "bg-primary text-white border-primary font-medium"
                            : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700",
                        )}
                      >
                        {item}
                      </button>
                    ),
                  )}
                <button
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => fetchPoulaillers(pagination.page + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Suivant →
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
