import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { poulaillersAPI, modulesAPI, alertesAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import { cn, formatLastCheck } from "../../lib/utils";
import toast from "react-hot-toast";

// ============================================================================
// TYPES
// ============================================================================

interface PoulaillerDetails {
  id: string;
  codeUnique: string;
  name: string;
  animalCount: number;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  status: string;
  seuils: {
    temperatureMin?: number;
    temperatureMax?: number;
    humidityMin?: number;
    humidityMax?: number;
    co2Max?: number;
    nh3Max?: number;
    dustMax?: number;
    waterLevelMin?: number;
  };
  autoThresholds: boolean;
  actuatorStates: {
    porte?: string;
    ventilateur?: string;
    lumiere?: string;
    pompe?: string;
  };
  lastMonitoring?: {
    temperature: number;
    humidity: number;
    co2?: number;
    nh3?: number;
    dust?: number;
    waterLevel?: number;
  };
  lastMeasureAt?: string;
  alertesActives: number;
  isCritical: boolean;
  isOnline: boolean;
  lastCommunicationAt?: string;
  createdAt: string;
  moduleId?: {
    id: string;
    serialNumber: string;
    macAddress: string;
    deviceName: string;
    status: string;
    firmwareVersion?: string;
    claimCode?: string;
    lastPing?: string;
  };
}

interface Alert {
  id: string;
  type: string;
  message: string;
  severity: string;
  createdAt: string;
  resolvedAt?: string;
}

interface Module {
  id: string;
  serialNumber: string;
  macAddress: string;
  deviceName: string;
  status: "pending" | "associated" | "offline" | "dissociated";
  claimCode?: string;
}

// ============================================================================
// COMPOSANTS UTILITAIRES
// ============================================================================

const StatusBadge = ({
  status,
  isOnline,
}: {
  status: string;
  isOnline: boolean;
}) => {
  const getStatusConfig = () => {
    if (!isOnline) {
      return {
        color: "text-slate-600",
        bg: "bg-slate-100",
        label: "Hors ligne",
      };
    }
    switch (status) {
      case "connecte":
        return {
          color: "text-emerald-600",
          bg: "bg-emerald-100",
          label: "Connecté",
        };
      case "alerte":
        return { color: "text-rose-600", bg: "bg-rose-100", label: "Alerte" };
      case "en_attente_module":
        return {
          color: "text-amber-600",
          bg: "bg-amber-100",
          label: "En attente",
        };
      default:
        return { color: "text-slate-600", bg: "bg-slate-100", label: status };
    }
  };

  const c = getStatusConfig();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        c.bg,
        c.color,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {c.label}
    </span>
  );
};

const SensorCard = ({
  label,
  value,
  unit,
  threshold,
  icon,
}: {
  label: string;
  value?: number | null;
  unit: string;
  threshold?: { min?: number; max?: number };
  icon: string;
}) => {
  const isWarning =
    threshold &&
    value !== undefined &&
    value !== null &&
    ((threshold.min !== undefined && value < threshold.min) ||
      (threshold.max !== undefined && value > threshold.max));

  return (
    <div
      className={cn(
        "p-4 rounded-xl border transition-all",
        isWarning
          ? "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800"
          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
          {label}
        </span>
        <span className="material-symbols-outlined text-slate-400">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-2xl font-bold",
            isWarning
              ? "text-rose-600 dark:text-rose-400"
              : "text-slate-900 dark:text-white",
          )}
        >
          {value !== undefined && value !== null ? value : "—"}
        </span>
        <span className="text-sm text-slate-500">{unit}</span>
      </div>
      {threshold && (
        <div className="mt-2 text-xs text-slate-400">
          Seuil: {threshold.min ?? "—"} - {threshold.max ?? "—"} {unit}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MODAL DE MODIFICATION DES SEUILS
// ============================================================================

const SeuilsModal = ({
  isOpen,
  onClose,
  onSave,
  seuils,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (seuils: any) => void;
  seuils: any;
  loading: boolean;
}) => {
  const [formData, setFormData] = useState({
    temperatureMin: "",
    temperatureMax: "",
    humidityMin: "",
    humidityMax: "",
    co2Max: "",
    nh3Max: "",
    dustMax: "",
    waterLevelMin: "",
  });

  useEffect(() => {
    if (isOpen && seuils) {
      setFormData({
        temperatureMin: seuils.temperatureMin?.toString() || "",
        temperatureMax: seuils.temperatureMax?.toString() || "",
        humidityMin: seuils.humidityMin?.toString() || "",
        humidityMax: seuils.humidityMax?.toString() || "",
        co2Max: seuils.co2Max?.toString() || "",
        nh3Max: seuils.nh3Max?.toString() || "",
        dustMax: seuils.dustMax?.toString() || "",
        waterLevelMin: seuils.waterLevelMin?.toString() || "",
      });
    }
  }, [isOpen, seuils]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    const data: any = {};
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== "") {
        data[key] = parseFloat(value);
      }
    });
    onSave(data);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            Modifier les Seuils
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Personnalisez les seuils d'alerte pour ce poulailler
          </p>
        </div>
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Temp. Min (°C)
              </label>
              <input
                type="number"
                name="temperatureMin"
                value={formData.temperatureMin}
                onChange={handleChange}
                placeholder="15"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Temp. Max (°C)
              </label>
              <input
                type="number"
                name="temperatureMax"
                value={formData.temperatureMax}
                onChange={handleChange}
                placeholder="30"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Humidité Min (%)
              </label>
              <input
                type="number"
                name="humidityMin"
                value={formData.humidityMin}
                onChange={handleChange}
                placeholder="40"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Humidité Max (%)
              </label>
              <input
                type="number"
                name="humidityMax"
                value={formData.humidityMax}
                onChange={handleChange}
                placeholder="80"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                CO2 Max (ppm)
              </label>
              <input
                type="number"
                name="co2Max"
                value={formData.co2Max}
                onChange={handleChange}
                placeholder="1000"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                NH3 Max (ppm)
              </label>
              <input
                type="number"
                name="nh3Max"
                value={formData.nh3Max}
                onChange={handleChange}
                placeholder="25"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Poussière Max (µg/m³)
              </label>
              <input
                type="number"
                name="dustMax"
                value={formData.dustMax}
                onChange={handleChange}
                placeholder="500"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Niveau eau Min (%)
              </label>
              <input
                type="number"
                name="waterLevelMin"
                value={formData.waterLevelMin}
                onChange={handleChange}
                placeholder="20"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function PoulaillerDetails() {
  const { id } = useParams<{ id: string }>();

  const [poulailler, setPoulailler] = useState<PoulaillerDetails | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showSeuilsModal, setShowSeuilsModal] = useState(false);
  const [showAssociateModal, setShowAssociateModal] = useState(false);
  const [showDissociateModal, setShowDissociateModal] = useState(false);

  // Loading states
  const [savingSeuils, setSavingSeuils] = useState(false);
  const [associating, setAssociating] = useState(false);
  const [dissociating, setDissociating] = useState(false);

  // ============================================================================
  // FONCTIONS API
  // ============================================================================

  const fetchPoulailler = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await poulaillersAPI.getById(id);
      setPoulailler(response.data.data);
    } catch (err: any) {
      console.error("Erreur fetchPoulailler:", err);
      setError(err.response?.data?.error || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    if (!id) return;
    try {
      const response = await alertesAPI.getAll({ poulaillerId: id, limit: 5 });
      setAlerts(response.data.data);
    } catch (err: any) {
      console.error("Erreur fetchAlerts:", err);
    }
  };

  const handleSaveSeuils = async (seuils: any) => {
    if (!id) return;
    setSavingSeuils(true);
    try {
      await poulaillersAPI.update(id, { seuils });
      toast.success("Seuils enregistrés avec succès!");
      setShowSeuilsModal(false);
      fetchPulailler();
    } catch (err: any) {
      console.error("Erreur saveSeuils:", err);
      toast.error(
        err.response?.data?.error || "Erreur lors de l'enregistrement",
      );
    } finally {
      setSavingSeuils(false);
    }
  };

  const handleAssociate = async (claimCodeOrModuleId: string) => {
    if (!id) return;
    setAssociating(true);
    try {
      await modulesAPI.claim(claimCodeOrModuleId, id);
      toast.success("Module associé avec succès!");
      setShowAssociateModal(false);
      fetchPulailler();
    } catch (err: any) {
      console.error("Erreur association:", err);
      toast.error(err.response?.data?.error || "Erreur lors de l'association");
    } finally {
      setAssociating(false);
    }
  };

  const handleDissociate = async (reason: string) => {
    if (!pulailler?.moduleId?.id) return;
    setDissociating(true);
    try {
      await modulesAPI.dissociate(pulailler.moduleId.id, {
        reason,
        confirm: true,
      });
      toast.success("Module dissocié avec succès!");
      setShowDissociateModal(false);
      fetchPulailler();
    } catch (err: any) {
      console.error("Erreur dissociation:", err);
      toast.error(
        err.response?.data?.error || "Erreur lors de la dissociation",
      );
    } finally {
      setDissociating(false);
    }
  };

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    fetchPulailler();
    fetchAlerts();
  }, [id]);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 lg:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error || !pulailler) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 lg:p-8">
            <div className="mb-6">
              <Link
                to="/pulaillers"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <span className="material-symbols-outlined">arrow_back</span>
                Retour aux poulaillers
              </Link>
            </div>
            <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-600 dark:text-red-400">
                {error || "Pulailler non trouvé"}
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link
              to="/pulaillers"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Retour aux poulaillers
            </Link>
          </div>

          {/* En-tête */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                  {pulailler.name}
                </h1>
                <StatusBadge
                  status={pulailler.status}
                  isOnline={pulailler.isOnline}
                />
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                Code: <span className="font-mono">{pulailler.codeUnique}</span>
                {pulailler.animalCount && ` · ${pulailler.animalCount} animaux`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSeuilsModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition"
              >
                <span className="material-symbols-outlined">tune</span>
                Seuils
              </button>
            </div>
          </div>

          {/* Informations propriétaire */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Informations
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Propriétaire
                </p>
                <p className="text-slate-900 dark:text-white font-medium">
                  {pulailler.owner.firstName} {pulailler.owner.lastName}
                </p>
                <p className="text-sm text-slate-500">
                  {pulailler.owner.email}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Contact
                </p>
                <p className="text-slate-900 dark:text-white">
                  {pulailler.owner.phone || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Créé le
                </p>
                <p className="text-slate-900 dark:text-white">
                  {new Date(pulailler.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
          </div>

          {/* Module */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Module Associé
              </h2>
              {pulailler.moduleId ? (
                <button
                  onClick={() => setShowDissociateModal(true)}
                  className="text-sm text-red-500 hover:text-red-700 transition"
                >
                  Dissocier
                </button>
              ) : (
                <button
                  onClick={() => setShowAssociateModal(true)}
                  className="text-sm text-primary hover:text-primary-dark transition"
                >
                  + Associer un module
                </button>
              )}
            </div>
            {pulailler.moduleId ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Nom
                  </p>
                  <p className="text-slate-900 dark:text-white font-medium">
                    {pulailler.moduleId.deviceName}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                    N° Série
                  </p>
                  <p className="text-slate-900 dark:text-white font-mono text-sm">
                    {pulailler.moduleId.serialNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                    MAC
                  </p>
                  <p className="text-slate-900 dark:text-white font-mono text-sm">
                    {pulailler.moduleId.macAddress}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Dernier ping
                  </p>
                  <p className="text-slate-900 dark:text-white">
                    {pulailler.moduleId.lastPing
                      ? formatLastCheck(pulailler.moduleId.lastPing)
                      : "Jamais"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3 block">
                  sensors_off
                </span>
                <p className="text-slate-500 dark:text-slate-400 mb-4">
                  Aucun module associé à ce poulailler
                </p>
                <button
                  onClick={() => setShowAssociateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition"
                >
                  <span className="material-symbols-outlined">add</span>
                  Associer un module
                </button>
              </div>
            )}
          </div>

          {/* Capteurs */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Mesures Actuelles
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <SensorCard
                label="Température"
                value={pulailler.lastMonitoring?.temperature}
                unit="°C"
                threshold={{
                  min: pulailler.seuils?.temperatureMin,
                  max: pulailler.seuils?.temperatureMax,
                }}
                icon="thermostat"
              />
              <SensorCard
                label="Humidité"
                value={pulailler.lastMonitoring?.humidity}
                unit="%"
                threshold={{
                  min: pulailler.seuils?.humidityMin,
                  max: pulailler.seuils?.humidityMax,
                }}
                icon="water_drop"
              />
              <SensorCard
                label="CO2"
                value={pulailler.lastMonitoring?.co2}
                unit="ppm"
                threshold={{ max: pulailler.seuils?.co2Max }}
                icon="co2"
              />
              <SensorCard
                label="NH3"
                value={pulailler.lastMonitoring?.nh3}
                unit="ppm"
                threshold={{ max: pulailler.seuils?.nh3Max }}
                icon="science"
              />
              <SensorCard
                label="Poussière"
                value={pulailler.lastMonitoring?.dust}
                unit="µg/m³"
                threshold={{ max: pulailler.seuils?.dustMax }}
                icon="dust"
              />
              <SensorCard
                label="Niveau eau"
                value={pulailler.lastMonitoring?.waterLevel}
                unit="%"
                threshold={{ min: pulailler.seuils?.waterLevelMin }}
                icon="water"
              />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-4 text-center">
              Dernière mesure:{" "}
              {pulailler.lastMeasureAt
                ? formatLastCheck(pulailler.lastMeasureAt)
                : "Jamais"}
            </p>
          </div>

          {/* Alertes récentes */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Alertes Récentes
              </h2>
              {pulailler.alertesActives > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 rounded-full text-xs font-medium">
                  {pulailler.alertesActives} active(s)
                </span>
              )}
            </div>
            {alerts.length > 0 ? (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg",
                      alert.resolvedAt
                        ? "bg-slate-50 dark:bg-slate-900/50"
                        : "bg-rose-50 dark:bg-rose-900/20",
                    )}
                  >
                    <span
                      className={cn(
                        "material-symbols-outlined mt-0.5",
                        alert.resolvedAt ? "text-slate-400" : "text-rose-500",
                      )}
                    >
                      {alert.severity === "critical" ? "error" : "warning"}
                    </span>
                    <div className="flex-1">
                      <p
                        className={cn(
                          "text-sm",
                          alert.resolvedAt
                            ? "text-slate-500 line-through"
                            : "text-slate-900 dark:text-white",
                        )}
                      >
                        {alert.message}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(alert.createdAt).toLocaleString("fr-FR")}
                        {alert.resolvedAt &&
                          ` · Résolue le ${new Date(alert.resolvedAt).toLocaleString("fr-FR")}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <span className="material-symbols-outlined text-4xl text-emerald-300 dark:text-emerald-600 mb-2 block">
                  check_circle
                </span>
                <p className="text-slate-500 dark:text-slate-400">
                  Aucune alerte récente
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      <SeuilsModal
        isOpen={showSeuilsModal}
        onClose={() => setShowSeuilsModal(false)}
        onSave={handleSaveSeuils}
        seuils={pulailler.seuils}
        loading={savingSeuils}
      />
    </div>
  );
}
