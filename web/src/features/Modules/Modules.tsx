import { useState, useEffect, useCallback } from "react";
import { modulesAPI, camerasAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import toast from "react-hot-toast";

// ============================================================================
// TYPES
// ============================================================================

interface Module {
  id: string;
  serialNumber: string;
  macAddress: string;
  deviceName: string;
  firmwareVersion?: string;
  status: "pending" | "associated" | "offline" | "dissociated";
  lastPing?: string;
  lastPingFormatted?: string;
  poulailler?: { id: string; name: string };
  owner?: { id: string; name: string; email: string };
  dissociationReason?: string;
  dissociatedAt?: string;
  createdAt: string;
}

interface Camera {
  id: string;
  serialNumber: string;
  macAddress: string;
  deviceName: string;
  firmwareVersion?: string;
  status: "pending" | "associated" | "offline" | "dissociated";
  lastPing?: string;
  lastPingFormatted?: string;
  streamUrl?: string;
  poulailler?: { id: string; name: string };
  owner?: { id: string; name: string; email: string };
  dissociationReason?: string;
  dissociatedAt?: string;
  createdAt: string;
}

interface Poulailler {
  id: string;
  name: string;
  type: string;
  animalCount: number;
  owner?: { id: string; name: string; email: string };
}

// ============================================================================
// HELPERS
// ============================================================================

const formatDeviceName = (name: string): string => {
  if (!name) return name;
  const upper = name.toUpperCase();
  return upper.replace(/^ESP32[_-]?(\d+)$/, "ESP32_$1");
};

const formatCamName = (name: string): string => {
  if (!name) return name;
  const upper = name.toUpperCase();
  return upper.replace(/^ESP32CAM[_-]?(\d+)$/, "ESP32CAM_$1");
};

// ============================================================================
// STATUS BADGE
// ============================================================================

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<
    string,
    { color: string; bg: string; dot: string; label: string }
  > = {
    pending: {
      color: "text-amber-700",
      bg: "bg-amber-50 dark:bg-amber-900/20",
      dot: "bg-amber-500",
      label: "En attente",
    },
    associated: {
      color: "text-emerald-700",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      dot: "bg-emerald-500",
      label: "Associé",
    },
    offline: {
      color: "text-red-700",
      bg: "bg-red-50 dark:bg-red-900/20",
      dot: "bg-red-500",
      label: "Hors ligne",
    },
    dissociated: {
      color: "text-slate-600",
      bg: "bg-slate-100 dark:bg-slate-700/40",
      dot: "bg-slate-400",
      label: "Dissocié",
    },
  };
  const c = config[status] || {
    color: "text-gray-600",
    bg: "bg-gray-100",
    dot: "bg-gray-400",
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.color}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
};

// ============================================================================
// STATS CARDS
// ============================================================================

const StatsRow = ({
  items,
  color,
}: {
  items: { label: string; value: number; icon: React.ReactNode }[];
  color: string;
}) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
    {items.map((item, i) => (
      <div
        key={i}
        className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3"
      >
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}
        >
          {item.icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">
            {item.value}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {item.label}
          </p>
        </div>
      </div>
    ))}
  </div>
);

// ============================================================================
// CREATE ESP32 MODAL
// ============================================================================

const CreateModuleModal = ({
  isOpen,
  onClose,
  onCreate,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { macAddress: string }) => void;
  loading: boolean;
}) => {
  const [macAddress, setMacAddress] = useState("");
  const [macValid, setMacValid] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMacAddress("");
      setMacValid(false);
    }
  }, [isOpen]);

  const handleMacChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value
      .replace(/[:\-\s]/g, "")
      .toUpperCase()
      .slice(0, 12);
    setMacAddress(cleaned);
    setMacValid(/^[0-9A-F]{12}$/.test(cleaned));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-violet-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Ajouter un module ESP32
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Module capteurs (température, humidité, air, eau)
            </p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Adresse MAC <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={macAddress}
              onChange={handleMacChange}
              placeholder="246F28AF4B10"
              maxLength={12}
              autoFocus
              className={`w-full px-4 py-2.5 border rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-violet-400/40 transition-colors ${
                macAddress.length === 0
                  ? "border-slate-300 dark:border-slate-700"
                  : macValid
                    ? "border-emerald-400"
                    : "border-red-400"
              }`}
            />
            <p className="text-xs text-slate-400 mt-1">
              12 caractères hexadécimaux — ex : 246F28AF4B10
            </p>
            {macAddress.length > 0 && !macValid && (
              <p className="text-xs text-red-500 mt-1">
                Format invalide — 12 caractères hex (0–9, A–F)
              </p>
            )}
          </div>
          <div className="p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
            <p className="text-xs text-violet-700 dark:text-violet-300">
              Le serveur générera automatiquement le numéro de série, le nom
              (ESP32_001...) et la version firmware.
            </p>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition text-sm"
          >
            Annuler
          </button>
          <button
            onClick={() => onCreate({ macAddress })}
            disabled={!macValid || loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition text-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Création...
              </>
            ) : (
              "Créer le module"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// CREATE ESP32-CAM MODAL
// ============================================================================

const CreateCameraModal = ({
  isOpen,
  onClose,
  onCreate,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { macAddress: string; streamUrl?: string }) => void;
  loading: boolean;
}) => {
  const [macAddress, setMacAddress] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [macValid, setMacValid] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMacAddress("");
      setStreamUrl("");
      setMacValid(false);
    }
  }, [isOpen]);

  const handleMacChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value
      .replace(/[:\-\s]/g, "")
      .toUpperCase()
      .slice(0, 12);
    setMacAddress(cleaned);
    setMacValid(/^[0-9A-F]{12}$/.test(cleaned));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-cyan-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Ajouter une caméra ESP32-CAM
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Caméra IA pour analyse visuelle des volailles
            </p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Adresse MAC <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={macAddress}
              onChange={handleMacChange}
              placeholder="A8032A1B4C20"
              maxLength={12}
              autoFocus
              className={`w-full px-4 py-2.5 border rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400/40 transition-colors ${
                macAddress.length === 0
                  ? "border-slate-300 dark:border-slate-700"
                  : macValid
                    ? "border-emerald-400"
                    : "border-red-400"
              }`}
            />
            <p className="text-xs text-slate-400 mt-1">
              12 caractères hexadécimaux — ex : A8032A1B4C20
            </p>
            {macAddress.length > 0 && !macValid && (
              <p className="text-xs text-red-500 mt-1">
                Format invalide — 12 caractères hex (0–9, A–F)
              </p>
            )}
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition text-sm"
          >
            Annuler
          </button>
          <button
            onClick={() =>
              onCreate({ macAddress, streamUrl: streamUrl || undefined })
            }
            disabled={!macValid || loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-xl transition text-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Création...
              </>
            ) : (
              "Ajouter la caméra"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// CLAIM MODAL (partagé ESP32 + CAM)
// ============================================================================

const ClaimModal = ({
  isOpen,
  onClose,
  onClaim,
  poulaillers,
  devices,
  loading,
  device,
  type,
}: {
  isOpen: boolean;
  onClose: () => void;
  onClaim: (macAddress: string, poulaillerId: string) => void;
  poulaillers: Poulailler[];
  devices: (Module | Camera)[];
  loading: boolean;
  device: Module | Camera | null;
  type: "esp32" | "cam";
}) => {
  const [selectedPoulaillerId, setSelectedPoulaillerId] = useState("");

  useEffect(() => {
    if (isOpen) setSelectedPoulaillerId("");
  }, [isOpen]);

  const occupiedIds = new Set(
    devices
      .filter(
        (m) =>
          (m.status === "associated" || m.status === "offline") &&
          m.poulailler?.id &&
          m.id !== device?.id,
      )
      .map((m) => m.poulailler!.id),
  );
  const availablePoulaillers = poulaillers.filter(
    (p) => !occupiedIds.has(p.id),
  );

  if (!isOpen || !device) return null;

  const accentColor =
    type === "cam"
      ? "bg-cyan-600 hover:bg-cyan-700"
      : "bg-violet-600 hover:bg-violet-700";
  const label =
    type === "cam"
      ? formatCamName(device.deviceName)
      : formatDeviceName(device.deviceName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Associer au poulailler
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {label} — <span className="font-mono">{device.macAddress}</span>
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Poulailler <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPoulaillerId}
              onChange={(e) => setSelectedPoulaillerId(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2"
            >
              <option value="">Sélectionner un poulailler</option>
              {availablePoulaillers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.animalCount} animaux (
                  {p.owner?.name || "Propriétaire inconnu"})
                </option>
              ))}
            </select>
            {availablePoulaillers.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Aucun poulailler disponible
              </p>
            )}
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition text-sm"
          >
            Annuler
          </button>
          <button
            onClick={() => onClaim(device.macAddress, selectedPoulaillerId)}
            disabled={!selectedPoulaillerId || loading}
            className={`inline-flex items-center gap-2 px-6 py-2.5 text-white font-medium rounded-xl transition text-sm disabled:opacity-50 ${accentColor}`}
          >
            {loading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Association...
              </>
            ) : (
              "Associer"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DISSOCIATE MODAL
// ============================================================================

const DissociateModal = ({
  isOpen,
  onClose,
  onDissociate,
  device,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDissociate: (reason: string) => void;
  device: Module | Camera | null;
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

  if (!isOpen || !device) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
            Dissocier l'équipement
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {device.deviceName} — {device.serialNumber}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Cette action dissociera l'équipement du poulailler. Il repassera
              en statut "En attente".
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Motif <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Expliquez la raison (minimum 10 caractères)"
              className="w-full px-4 py-2.5 border rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400/40"
              rows={3}
            />
            <p className="text-xs text-slate-500 mt-1">
              Minimum 10 caractères ({reason.length}/10)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="confirm-dissociate"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              className="w-4 h-4 text-red-500 border-slate-300 rounded"
            />
            <label
              htmlFor="confirm-dissociate"
              className="text-sm text-slate-700 dark:text-slate-300"
            >
              Je confirme vouloir dissocier cet équipement
            </label>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
          >
            Annuler
          </button>
          <button
            onClick={() => onDissociate(reason)}
            disabled={reason.length < 10 || !confirm || loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                Dissociation...
              </>
            ) : (
              "Dissocier"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TABLE SKELETON
// ============================================================================

const TableSkeleton = ({ cols }: { cols: number }) => (
  <>
    {Array.from({ length: 5 }).map((_, i) => (
      <tr key={i} className="animate-pulse">
        {Array.from({ length: cols }).map((__, j) => (
          <td key={j} className="px-6 py-4">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

// ============================================================================
// TAB — ESP32 MODULES
// ============================================================================

const ESP32Tab = () => {
  const [modules, setModules] = useState<Module[]>([]);
  const [poulaillers, setPoulaillers] = useState<Poulailler[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showDissociateModal, setShowDissociateModal] = useState(false);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [creating, setCreating] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [dissociating, setDissociating] = useState(false);

  const fetchModules = useCallback(async () => {
    setTableLoading(true);
    setError(null);
    try {
      const response = await modulesAPI.getAll({
        status: statusFilter || undefined,
        search: search || undefined,
        page,
        limit: 10,
      });
      setModules(response.data.data);
      setTotalPages(response.data.pagination.pages);
    } catch (err: any) {
      setError(err.response?.data?.error || "Erreur lors du chargement");
    } finally {
      setTableLoading(false);
    }
  }, [statusFilter, search, page]);

  const fetchPoulaillers = async () => {
    try {
      const response = await modulesAPI.getPendingPoulaillers();
      setPoulaillers(response.data.data);
    } catch {}
  };

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);
  useEffect(() => {
    fetchPoulaillers();
  }, []);
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const stats = [
    {
      label: "Total",
      value: modules.length,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-violet-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      label: "Associés",
      value: modules.filter((m) => m.status === "associated").length,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-emerald-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      label: "En attente",
      value: modules.filter((m) => m.status === "pending").length,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-amber-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      label: "Hors ligne",
      value: modules.filter((m) => m.status === "offline").length,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-red-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
  ];

  const handleCreate = async (data: { macAddress: string }) => {
    setCreating(true);
    try {
      await modulesAPI.create(data);
      toast.success("Module ESP32 créé !");
      setShowCreateModal(false);
      fetchModules();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur création");
    } finally {
      setCreating(false);
    }
  };

  const handleClaim = async (macAddress: string, poulaillerId: string) => {
    setClaiming(true);
    try {
      await modulesAPI.claim({ macAddress, poulaillerId });
      toast.success("Module associé !");
      setShowClaimModal(false);
      setSelectedModule(null);
      fetchModules();
      fetchPoulaillers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur association");
    } finally {
      setClaiming(false);
    }
  };

  const handleDissociate = async (reason: string) => {
    if (!selectedModule) return;
    setDissociating(true);
    try {
      await modulesAPI.dissociate(selectedModule.id, { reason, confirm: true });
      toast.success("Module dissocié !");
      setShowDissociateModal(false);
      setSelectedModule(null);
      fetchModules();
      fetchPoulaillers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur dissociation");
    } finally {
      setDissociating(false);
    }
  };

  const handleDelete = async (module: Module) => {
    if (
      !window.confirm(
        `Supprimer le module "${formatDeviceName(module.deviceName)}" ?`,
      )
    )
      return;
    try {
      await modulesAPI.delete(module.id);
      toast.success("Module supprimé");
      fetchModules();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur suppression");
    }
  };

  return (
    <div>
      <StatsRow items={stats} color="bg-violet-50 dark:bg-violet-900/20" />
      <div className="mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par MAC, série ou nom..."
            className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400/40 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400/40 text-sm"
          >
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="associated">Associé</option>
            <option value="offline">Hors ligne</option>
            <option value="dissociated">Dissocié</option>
          </select>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition text-sm flex-shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          Ajouter ESP32
        </button>
      </div>
      {error ? (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  {[
                    "Module",
                    "Série / MAC",
                    "Statut",
                    "Poulailler",
                    "Dernier ping",
                    "",
                  ].map((h, i) => (
                    <th
                      key={i}
                      className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {tableLoading ? (
                  <TableSkeleton cols={6} />
                ) : modules.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-slate-400 dark:text-slate-500"
                    >
                      Aucun module trouvé
                    </td>
                  </tr>
                ) : (
                  modules.map((module, index) => (
                    <tr
                      key={module.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5 text-violet-500"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white text-sm">{`ESP32_${String((page - 1) * 10 + index + 1).padStart(3, "0")}`}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              {module.serialNumber}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-mono text-slate-600 dark:text-slate-300">
                          {module.serialNumber}
                        </p>
                        <p className="text-xs font-mono text-slate-400">
                          {module.macAddress}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={module.status} />
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300 text-sm">
                        {module.poulailler?.name || (
                          <span className="text-slate-400">Non associé</span>
                        )}
                        {module.owner && (
                          <p className="text-xs text-slate-400">
                            {module.owner.name}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-sm">
                        {module.lastPingFormatted || "Jamais"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {(module.status === "pending" ||
                            module.status === "dissociated") && (
                            <button
                              onClick={() => {
                                setSelectedModule(module);
                                setShowClaimModal(true);
                                fetchPoulaillers();
                              }}
                              className="p-2 text-violet-500 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition"
                              title="Associer"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          )}
                          {(module.status === "associated" ||
                            module.status === "offline") && (
                            <button
                              onClick={() => {
                                setSelectedModule(module);
                                setShowDissociateModal(true);
                              }}
                              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                              title="Dissocier"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          )}
                          {(module.status === "pending" ||
                            module.status === "dissociated") && (
                            <button
                              onClick={() => handleDelete(module)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                              title="Supprimer"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Page {page} sur {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <CreateModuleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
        loading={creating}
      />
      <ClaimModal
        isOpen={showClaimModal}
        onClose={() => {
          setShowClaimModal(false);
          setSelectedModule(null);
        }}
        onClaim={handleClaim}
        poulaillers={poulaillers}
        devices={modules}
        loading={claiming}
        device={selectedModule}
        type="esp32"
      />
      <DissociateModal
        isOpen={showDissociateModal}
        onClose={() => {
          setShowDissociateModal(false);
          setSelectedModule(null);
        }}
        onDissociate={handleDissociate}
        device={selectedModule}
        loading={dissociating}
      />
    </div>
  );
};

// ============================================================================
// TAB — ESP32-CAM
// ============================================================================

const CameraTab = () => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [poulaillers, setPoulaillers] = useState<Poulailler[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showDissociateModal, setShowDissociateModal] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [creating, setCreating] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [dissociating, setDissociating] = useState(false);

  const fetchCameras = useCallback(async () => {
    setTableLoading(true);
    setError(null);
    try {
      const response = await camerasAPI.getAll({
        status: statusFilter || undefined,
        search: search || undefined,
        page,
        limit: 10,
      });
      setCameras(response.data.data);
      setTotalPages(response.data.pagination.pages);
    } catch (err: any) {
      setError(err.response?.data?.error || "Erreur lors du chargement");
    } finally {
      setTableLoading(false);
    }
  }, [statusFilter, search, page]);

  const fetchPoulaillers = async () => {
    try {
      const response = await camerasAPI.getPendingPoulaillers();
      setPoulaillers(response.data.data);
    } catch {}
  };

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);
  useEffect(() => {
    fetchPoulaillers();
  }, []);
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const stats = [
    {
      label: "Total",
      value: cameras.length,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-cyan-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
        </svg>
      ),
    },
    {
      label: "Associées",
      value: cameras.filter((c) => c.status === "associated").length,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-emerald-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      label: "En attente",
      value: cameras.filter((c) => c.status === "pending").length,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-amber-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      label: "Hors ligne",
      value: cameras.filter((c) => c.status === "offline").length,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-red-600"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
  ];

  const handleCreate = async (data: {
    macAddress: string;
    streamUrl?: string;
  }) => {
    setCreating(true);
    try {
      await camerasAPI.create(data);
      toast.success("ESP32-CAM enregistrée !");
      setShowCreateModal(false);
      fetchCameras();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur création");
    } finally {
      setCreating(false);
    }
  };

  const handleClaim = async (macAddress: string, poulaillerId: string) => {
    setClaiming(true);
    try {
      await camerasAPI.claim({ macAddress, poulaillerId });
      toast.success("Caméra associée !");
      setShowClaimModal(false);
      setSelectedCamera(null);
      fetchCameras();
      fetchPoulaillers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur association");
    } finally {
      setClaiming(false);
    }
  };

  const handleDissociate = async (reason: string) => {
    if (!selectedCamera) return;
    setDissociating(true);
    try {
      await camerasAPI.dissociate(selectedCamera.id, { reason, confirm: true });
      toast.success("Caméra dissociée !");
      setShowDissociateModal(false);
      setSelectedCamera(null);
      fetchCameras();
      fetchPoulaillers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur dissociation");
    } finally {
      setDissociating(false);
    }
  };

  const handleDelete = async (camera: Camera) => {
    if (!window.confirm(`Supprimer la caméra "${camera.deviceName}" ?`)) return;
    try {
      await camerasAPI.delete(camera.id);
      toast.success("Caméra supprimée");
      fetchCameras();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur suppression");
    }
  };

  return (
    <div>
      <StatsRow items={stats} color="bg-cyan-50 dark:bg-cyan-900/20" />
      <div className="mb-4 p-4 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-xl flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-cyan-600 flex-shrink-0 mt-0.5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-cyan-800 dark:text-cyan-200">
            Caméras IA pour l'analyse visuelle
          </p>
        </div>
      </div>
      <div className="mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par MAC, série ou nom..."
            className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40 text-sm"
          >
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="associated">Associée</option>
            <option value="offline">Hors ligne</option>
            <option value="dissociated">Dissociée</option>
          </select>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-xl transition text-sm flex-shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          Ajouter ESP32-CAM
        </button>
      </div>
      {error ? (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  {[
                    "Caméra",
                    "Série / MAC",
                    "Statut",
                    "Poulailler",
                    "Flux MJPEG",
                    "Dernier ping",
                    "",
                  ].map((h, i) => (
                    <th
                      key={i}
                      className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {tableLoading ? (
                  <TableSkeleton cols={7} />
                ) : cameras.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-7 w-7 text-cyan-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                          </svg>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">
                          Aucune caméra enregistrée
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          Ajoutez votre premier ESP32-CAM pour l'analyse IA
                        </p>
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-xl transition"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Ajouter ESP32-CAM
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  cameras.map((camera, index) => (
                    <tr
                      key={camera.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5 text-cyan-500"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white text-sm">
                              {camera.deviceName ||
                                `ESP32CAM_${String((page - 1) * 10 + index + 1).padStart(3, "0")}`}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              {camera.serialNumber}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-mono text-slate-600 dark:text-slate-300">
                          {camera.serialNumber}
                        </p>
                        <p className="text-xs font-mono text-slate-400">
                          {camera.macAddress}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={camera.status} />
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300 text-sm">
                        {camera.poulailler?.name || (
                          <span className="text-slate-400">Non associée</span>
                        )}
                        {camera.owner && (
                          <p className="text-xs text-slate-400">
                            {camera.owner.name}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {camera.streamUrl ? (
                          <a
                            href={camera.streamUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-mono text-cyan-600 hover:text-cyan-800 dark:text-cyan-400 dark:hover:text-cyan-200 transition"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Stream
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            MQTT uniquement
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-sm">
                        {camera.lastPingFormatted || "Jamais"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {(camera.status === "pending" ||
                            camera.status === "dissociated") && (
                            <button
                              onClick={() => {
                                setSelectedCamera(camera);
                                setShowClaimModal(true);
                                fetchPoulaillers();
                              }}
                              className="p-2 text-cyan-500 hover:text-cyan-700 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg transition"
                              title="Associer"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          )}
                          {(camera.status === "associated" ||
                            camera.status === "offline") && (
                            <button
                              onClick={() => {
                                setSelectedCamera(camera);
                                setShowDissociateModal(true);
                              }}
                              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                              title="Dissocier"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          )}
                          {(camera.status === "pending" ||
                            camera.status === "dissociated") && (
                            <button
                              onClick={() => handleDelete(camera)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                              title="Supprimer"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Page {page} sur {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <CreateCameraModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
        loading={creating}
      />
      <ClaimModal
        isOpen={showClaimModal}
        onClose={() => {
          setShowClaimModal(false);
          setSelectedCamera(null);
        }}
        onClaim={handleClaim}
        poulaillers={poulaillers}
        devices={cameras}
        loading={claiming}
        device={selectedCamera}
        type="cam"
      />
      <DissociateModal
        isOpen={showDissociateModal}
        onClose={() => {
          setShowDissociateModal(false);
          setSelectedCamera(null);
        }}
        onDissociate={handleDissociate}
        device={selectedCamera}
        loading={dissociating}
      />
    </div>
  );
};

// ============================================================================
// PAGE PRINCIPALE — Gestion Équipements
// ============================================================================

export default function Equipements() {
  const [activeTab, setActiveTab] = useState<"esp32" | "cam">("esp32");

  const tabs = [
    {
      id: "esp32" as const,
      label: "Modules ESP32",
      sublabel: "Capteurs",
      color: "violet",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      id: "cam" as const,
      label: "ESP32-CAM",
      sublabel: "Caméras IA",
      color: "cyan",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-slate-700 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-white"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Gestion des Équipements
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Supervision et association des modules ESP32 et caméras
                  ESP32-CAM
                </p>
              </div>
            </div>
          </div>
          <div className="mb-6 flex gap-2 p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-fit">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const activeStyles =
                tab.color === "violet"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-cyan-600 text-white shadow-sm";
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive ? activeStyles : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                >
                  <span
                    className={
                      isActive
                        ? "text-white"
                        : tab.color === "violet"
                          ? "text-violet-500"
                          : "text-cyan-500"
                    }
                  >
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-normal ${isActive ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"}`}
                  >
                    {tab.sublabel}
                  </span>
                </button>
              );
            })}
          </div>
          {activeTab === "esp32" ? <ESP32Tab /> : <CameraTab />}
        </main>
      </div>
    </div>
  );
}
