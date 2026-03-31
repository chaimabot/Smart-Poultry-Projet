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
  type: string;
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

const StatusBadge = ({ status, isOnline }: { status: string; isOnline: boolean }) => {
  const getStatusConfig = () => {
    if (!isOnline) {
      return { color: "text-slate-600", bg: "bg-slate-100", label: "Hors ligne" };
    }
    switch (status) {
      case "connecte":
        return { color: "text-emerald-600", bg: "bg-emerald-100", label: "Connecté" };
      case "alerte":
        return { color: "text-rose-600", bg: "bg-rose-100", label: "Alerte" };
      case "en_attente_module":
        return { color: "text-amber-600", bg: "bg-amber-100", label: "En attente" };
      default:
        return { color: "text-slate-600", bg: "bg-slate-100", label: status };
    }
  };

  const c = getStatusConfig();

  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", c.bg, c.color)}>
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
  icon
}: {
  label: string;
  value?: number | null;
  unit: string;
  threshold?: { min?: number; max?: number };
  icon: string;
}) => {
  const isWarning = threshold && value !== undefined && value !== null && 
    ((threshold.min !== undefined && value < threshold.min) || 
     (threshold.max !== undefined && value > threshold.max));

  return (
    <div className={cn(
      "p-4 rounded-xl border transition-all",
      isWarning 
        ? "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800" 
        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
          {label}
        </span>
        <span className="material-symbols-outlined text-slate-400">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold", isWarning ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white")}>
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
  loading
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
    setFormData(prev => ({ ...prev, [name]: value }));
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
// MODAL D'ASSOCIATION DE MODULE (DEPUIS LA PAGE DETAILS)
// ============================================================================

const AssociateModuleModal = ({
  isOpen,
  onClose,
  onAssociate,
  poulaillerName,
  loading
}: {
  isOpen: boolean;
  onClose: () => void;
  onAssociate: (claimCode: string) => void;
  poulaillerName?: string;
  loading: boolean;
}) => {
  const [claimCode, setClaimCode] = useState("");
  const [modules, setModules] = useState<Module[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [mode, setMode] = useState<"select" | "manual">("select");

  useEffect(() => {
    if (isOpen) {
      setClaimCode("");
      setSelectedModuleId("");
      setMode("select");
      // Charger les modules en attente
      setLoadingModules(true);
      modulesAPI.getAll({ status: "pending", limit: 100 })
        .then(res => {
          setModules(res.data.data || []);
        })
        .catch(err => console.error("Erreur chargement modules:", err))
        .finally(() => setLoadingModules(false));
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (mode === "select" && selectedModuleId) {
      onAssociate(selectedModuleId);
    } else if (mode === "manual" && claimCode) {
      onAssociate(claimCode);
    }
  };

  const isValid = mode === "select" ? selectedModuleId : claimCode;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            Associer un Module
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Associer ce module au poulailler: <strong>{poulaillerName}</strong>
          </p>
        </div>
        <div className="p-6 space-y-4">
          {/* Mode de sélection */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("select")}
              className={cn(
                "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition",
                mode === "select"
                  ? "bg-primary text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              )}
            >
              Choisir un module
            </button>
            <button
              onClick={() => setMode("manual")}
              className={cn(
                "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition",
                mode === "manual"
                  ? "bg-primary text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              )}
            >
              Code manuel
            </button>
          </div>

          {mode === "select" ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Module en attente <span className="text-red-500">*</span>
              </label>
              {loadingModules ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : modules.length > 0 ? (
                <select
                  value={selectedModuleId}
                  onChange={(e) => setSelectedModuleId(e.target.value)}
                  className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Sélectionner un module</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.claimCode || m.id}>
                      {m.deviceName} - {m.serialNumber} ({m.claimCode})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-slate-500">Aucun module en attente disponible</p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Code Claim <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX" className="w-XXXX-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                maxLength={14}
              />
            </div>
          )}

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Le module sera immédiatement associé à ce poulailler après la confirmation.
            </p>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            disabled={loading}
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Association..." : "Associer"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MODAL DE DISSOCIATION DU MODULE
// ============================================================================

const DissociateModal = ({
  isOpen,
  onClose,
  onDissociate,
  moduleName,
  loading
}: {
  isOpen: boolean;
  onClose: () => void;
  onDissociate: (reason: string) => void;
  moduleName?: string;
  loading: boolean;
}) => {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setConfirm(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-red-600 dark:text-red-400">
            Dissocier le Module
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {moduleName}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Cette action dissociera le module du poulailler. Un nouveau code claim sera généré automatiquement.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Motif de dissociation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Expliquez la raison de la dissociation (minimum 10 caractères)"
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows={3}
              minLength={10}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="confirm-dissociate"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
            />
            <label htmlFor="confirm-dissociate" className="text-sm text-slate-700 dark:text-slate-300">
              Je confirme vouloir dissocier ce module
            </label>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            disabled={loading}
          >
            Annuler
          </button>
          <button
            onClick={() => onDissociate(reason)}
            disabled={reason.length < 10 || !confirm || loading}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Dissociation..." : "Dissocier"}
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
      fetchPoulailler();
    } catch (err: any) {
      console.error("Erreur saveSeuils:", err);
      toast.error(err.response?.data?.error || "Erreur lors de l'enregistrement");
    } finally {
      setSavingSeuils(false);
    }
  };

  const handleAssociate = async (claimCodeOrModuleId: string) => {
    if (!id) return;
    setAssociating(true);
    try {
      // Essayer d'abord comme claim code
      await modulesAPI.claim(claimCodeOrModuleId, id);
      toast.success("Module associé avec succès!");
      setShowAssociateModal(false);
      fetchPoulailler();
    } catch (err: any) {
      console.error("Erreur association:", err);
      toast.error(err.response?.data?.error || "Erreur lors de l'association");
    } finally {
      setAssociating(false);
    }
  };

  const handleDissociate = async (reason: string) => {
    if (!poulailler?.moduleId?.id) return;
    setDissociating(true);
    try {
      await modulesAPI.dissociate(poulailler.moduleId.id, { reason, confirm: true });
      toast.success("Module dissocié avec succès!");
      setShowDissociateModal(false);
      fetchPoulailler();
    } catch (err: any) {
      console.error("Erreur dissociation:", err);
      toast.error(err.response?.data?.error || "Erreur lors de la dissociation");
    } finally {
      setDissociating(false);
    }
  };

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    fetchPoulailler();
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

  if (error || !poulailler) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 lg:p-8">
            <div className="mb-6">
              <Link to="/poulaillers" className="inline-flex items-center gap-2 text-primary hover:underline">
                <span className="material-symbols-outlined">arrow_back</span>
                Retour aux poulaillers
              </Link>
            </div>
            <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-600 dark:text-red-400">{error || "Poulailler non trouvé"}</p>
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
            <Link to="/poulaillers" className="inline-flex items-center gap-2 text-primary hover:underline">
              <span className="material-symbols-outlined">arrow_back</span>
              Retour aux poulaillers
            </Link>
          </div>

          {/* En-tête */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                  {poulailler.name}
                </h1>
                <StatusBadge status={poulailler.status} isOnline={poulailler.isOnline} />
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                Code: <span className="font-mono">{poulailler.codeUnique}</span>
                {poulailler.type && ` · ${poulailler.type}`}
                {poulailler.animalCount && ` · ${poulailler.animalCount} animaux`}
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
                  {poulailler.owner.firstName} {poulailler.owner.lastName}
                </p>
                <p className="text-sm text-slate-500">{poulailler.owner.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Contact
                </p>
                <p className="text-slate-900 dark:text-white">
                  {poulailler.owner.phone || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Créé le
                </p>
                <p className="text-slate-900 dark:text-white">
                  {new Date(poulailler.createdAt).toLocaleDateString("fr-FR")}
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
              {poulailler.moduleId ? (
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
            {poulailler.moduleId ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Nom
                  </p>
                  <p className="text-slate-900 dark:text-white font-medium">
                    {poulailler.moduleId.deviceName}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                    N° Série
                  </p>
                  <p className="text-slate-900 dark:text-white font-mono text-sm">
                    {poulailler.moduleId.serialNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                    MAC
                  </p>
                  <p className="text-slate-900 dark:text-white font-mono text-sm">
                    {poulailler.moduleId.macAddress}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Dernier ping
                  </p>
                  <p className="text-slate-900 dark:text-white">
                    {poulailler.moduleId.lastPing 
                      ? formatLastCheck(poulailler.moduleId.lastPing)
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
                value={poulailler.lastMonitoring?.temperature}
                unit="°C"
                threshold={{ min: poulailler.seuils?.temperatureMin, max: poulailler.seuils?.temperatureMax }}
                icon="thermostat"
              />
              <SensorCard
                label="Humidité"
                value={poulailler.lastMonitoring?.humidity}
                unit="%"
                threshold={{ min: poulailler.seuils?.humidityMin, max: poulailler.seuils?.humidityMax }}
                icon="water_drop"
              />
              <SensorCard
                label="CO2"
                value={poulailler.lastMonitoring?.co2}
                unit="ppm"
                threshold={{ max: poulailler.seuils?.co2Max }}
                icon="co2"
              />
              <SensorCard
                label="NH3"
                value={poulailler.lastMonitoring?.nh3}
                unit="ppm"
                threshold={{ max: poulailler.seuils?.nh3Max }}
                icon="science"
              />
              <SensorCard
                label="Poussière"
                value={poulailler.lastMonitoring?.dust}
                unit="µg/m³"
                threshold={{ max: poulailler.seuils?.dustMax }}
                icon="dust"
              />
              <SensorCard
                label="Niveau eau"
                value={poulailler.lastMonitoring?.waterLevel}
                unit="%"
                threshold={{ min: poulailler.seuils?.waterLevelMin }}
                icon="water"
              />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-4 text-center">
              Dernière mesure: {poulailler.lastMeasureAt ? formatLastCheck(poulailler.lastMeasureAt) : "Jamais"}
            </p>
          </div>

          {/* Alertes récentes */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Alertes Récentes
              </h2>
              {poulailler.alertesActives > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 rounded-full text-xs font-medium">
                  {poulailler.alertesActives} active(s)
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
                        : "bg-rose-50 dark:bg-rose-900/20"
                    )}
                  >
                    <span className={cn(
                      "material-symbols-outlined mt-0.5",
                      alert.resolvedAt ? "text-slate-400" : "text-rose-500"
                    )}>
                      {alert.severity === "critical" ? "error" : "warning"}
                    </span>
                    <div className="flex-1">
                      <p className={cn(
                        "text-sm",
                        alert.resolvedAt 
                          ? "text-slate-500 line-through" 
                          : "text-slate-900 dark:text-white"
                      )}>
                        {alert.message}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(alert.createdAt).toLocaleString("fr-FR")}
                        {alert.resolvedAt && ` · Résolue le ${new Date(alert.resolvedAt).toLocaleString("fr-FR")}`}
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
        seuils={poulailler.seuils}
        loading={savingSeuils}
      />
      <AssociateModuleModal
        isOpen={showAssociateModal}
        onClose={() => setShowAssociateModal(false)}
        onAssociate={handleAssociate}
        poulaillerName={poulailler.name}
        loading={associating}
      />
      <DissociateModal
        isOpen={showDissociateModal}
        onClose={() => setShowDissociateModal(false)}
        onDissociate={handleDissociate}
        moduleName={poulailler.moduleId?.deviceName}
        loading={dissociating}
      />
    </div>
  );
}
