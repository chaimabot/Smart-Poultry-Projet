import { useState, useEffect, useCallback } from "react";
import { modulesAPI } from "../../services/api";
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

interface Poulailler {
  id: string;
  name: string;
  type: string;
  animalCount: number;
  owner?: { id: string; name: string; email: string };
}

// ============================================================================
// HELPER — formate le nom du module en ESP32_001, ESP32_002, etc.
// ============================================================================

const formatDeviceName = (name: string): string => {
  if (!name) return name;
  // Normalise en majuscules
  const upper = name.toUpperCase();
  // esp32001 → ESP32_001  |  esp32_001 → ESP32_001  |  ESP32001 → ESP32_001
  return upper.replace(/^ESP32[_-]?(\d+)$/, "ESP32_$1");
};

// ============================================================================
// STATUS BADGE
// ============================================================================

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { color: string; bg: string; label: string }> = {
    pending: {
      color: "text-orange-600",
      bg: "bg-orange-100",
      label: "En attente",
    },
    associated: {
      color: "text-green-600",
      bg: "bg-green-100",
      label: "Associé",
    },
    offline: { color: "text-red-600", bg: "bg-red-100", label: "Hors ligne" },
    dissociated: {
      color: "text-slate-600",
      bg: "bg-slate-100",
      label: "Dissocié",
    },
  };
  const c = config[status] || {
    color: "text-gray-600",
    bg: "bg-gray-100",
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.color}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {c.label}
    </span>
  );
};

// ============================================================================
// CREATE MODULE MODAL — admin saisit MAC + infos du module
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

  const canSubmit = macValid;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            Ajouter un module
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Renseignez les informations du module ESP32
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* MAC */}
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
              className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors ${
                macAddress.length === 0
                  ? "border-slate-300 dark:border-slate-700"
                  : macValid
                    ? "border-green-400"
                    : "border-red-400"
              }`}
            />
            <p className="text-xs text-slate-400 mt-1">
              12 caractères hexadécimaux — ex : 246F28AF4B10 ou
              24:6F:28:AF:4B:10
            </p>
            {macAddress.length > 0 && !macValid && (
              <p className="text-xs text-red-500 mt-1">
                Format invalide — 12 caractères hexadécimaux (0–9, A–F)
              </p>
            )}
          </div>

          {/* Info */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Le serveur générera automatiquement le numéro de série, le nom du
              module (ESP32_001, ESP32_002, etc.) et la version firmware.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition text-sm"
          >
            Annuler
          </button>
          <button
            onClick={() => onCreate({ macAddress })}
            disabled={!canSubmit || loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition text-sm disabled:opacity-50"
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
// CLAIM MODAL — associer un module existant à un poulailler
// ============================================================================

const ClaimModal = ({
  isOpen,
  onClose,
  onClaim,
  poulaillers,
  modules,
  loading,
  module,
}: {
  isOpen: boolean;
  onClose: () => void;
  onClaim: (macAddress: string, poulaillerId: string) => void;
  poulaillers: Poulailler[];
  modules: Module[];
  loading: boolean;
  module: Module | null;
}) => {
  const [selectedPoulaillerId, setSelectedPoulaillerId] = useState("");

  useEffect(() => {
    if (isOpen) setSelectedPoulaillerId("");
  }, [isOpen]);

  // IDs des poulaillers déjà pris par un module actif (associated ou offline)
  const occupiedIds = new Set(
    modules
      .filter(
        (m) =>
          (m.status === "associated" || m.status === "offline") &&
          m.poulailler?.id &&
          m.id !== module?.id,
      )
      .map((m) => m.poulailler!.id),
  );

  const availablePoulaillers = poulaillers.filter(
    (p) => !occupiedIds.has(p.id),
  );

  if (!isOpen || !module) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            Associer au poulailler
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {formatDeviceName(module.deviceName)} —{" "}
            <span className="font-mono">{module.macAddress}</span>
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Poulailler <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPoulaillerId}
              onChange={(e) => setSelectedPoulaillerId(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
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

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition text-sm"
          >
            Annuler
          </button>
          <button
            onClick={() => onClaim(module.macAddress, selectedPoulaillerId)}
            disabled={!selectedPoulaillerId || loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition text-sm disabled:opacity-50"
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
  module,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDissociate: (reason: string) => void;
  module: Module | null;
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

  if (!isOpen || !module) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-red-600 dark:text-red-400">
            Dissocier le module
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {formatDeviceName(module.deviceName)} — {module.serialNumber}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Cette action dissociera le module du poulailler. Il repassera en
              statut "En attente".
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Motif <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Expliquez la raison de la dissociation (minimum 10 caractères)"
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
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
              className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
            />
            <label
              htmlFor="confirm-dissociate"
              className="text-sm text-slate-700 dark:text-slate-300"
            >
              Je confirme vouloir dissocier ce module
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              Annuler
            </button>
            <button
              onClick={() => onDissociate(reason)}
              disabled={reason.length < 10 || !confirm || loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition disabled:opacity-70"
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
    </div>
  );
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function Modules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [poulaillers, setPoulaillers] = useState<Poulailler[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("");
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

  // ============================================================================
  // API CALLS
  // ============================================================================

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
    } catch (err: any) {
      console.error("Erreur fetchPoulaillers:", err);
    }
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

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleCreate = async (data: { macAddress: string }) => {
    setCreating(true);
    try {
      await modulesAPI.create(data);
      toast.success("Module créé avec succès !");
      setShowCreateModal(false);
      fetchModules();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const handleClaim = async (macAddress: string, poulaillerId: string) => {
    setClaiming(true);
    try {
      await modulesAPI.claim({ macAddress, poulaillerId });
      toast.success("Module associé avec succès !");
      setShowClaimModal(false);
      setSelectedModule(null);
      fetchModules();
      fetchPoulaillers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur lors de l'association");
    } finally {
      setClaiming(false);
    }
  };

  const handleDissociate = async (reason: string) => {
    if (!selectedModule) return;
    setDissociating(true);
    try {
      await modulesAPI.dissociate(selectedModule.id, { reason, confirm: true });
      toast.success("Module dissocié avec succès !");
      setShowDissociateModal(false);
      setSelectedModule(null);
      fetchModules();
      fetchPoulaillers();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || "Erreur lors de la dissociation",
      );
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
      toast.error(err.response?.data?.error || "Erreur lors de la suppression");
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          {/* En-tête */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Gestion des Modules
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Supervision et association des modules ESP32
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition"
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
              Ajouter un module
            </button>
          </div>

          {/* Filtres */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par MAC, série ou nom..."
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="associated">Associé</option>
              <option value="offline">Hors ligne</option>
              <option value="dissociated">Dissocié</option>
            </select>
          </div>

          {/* Tableau */}
          {error ? (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Module
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Série / MAC
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Poulailler
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Dernier ping
                      </th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {tableLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j} className="px-6 py-4">
                              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                            </td>
                          ))}
                        </tr>
                      ))
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
                          {/* Module name */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5 text-purple-500"
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
                                <p className="font-medium text-slate-900 dark:text-white">
                                  {`ESP32_${String((page - 1) * 10 + index + 1).padStart(3, "0")}`}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                  {module.serialNumber}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Série / MAC */}
                          <td className="px-6 py-4">
                            <p className="text-sm font-mono text-slate-600 dark:text-slate-300">
                              {module.serialNumber}
                            </p>
                            <p className="text-xs font-mono text-slate-400">
                              {module.macAddress}
                            </p>
                          </td>

                          {/* Statut */}
                          <td className="px-6 py-4">
                            <StatusBadge status={module.status} />
                          </td>

                          {/* Poulailler */}
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                            {module.poulailler?.name || (
                              <span className="text-slate-400">
                                Non associé
                              </span>
                            )}
                            {module.owner && (
                              <p className="text-xs text-slate-400">
                                {module.owner.name}
                              </p>
                            )}
                          </td>

                          {/* Dernier Ping */}
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-sm">
                            {module.lastPingFormatted || "Jamais"}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              {/* Associer */}
                              {(module.status === "pending" ||
                                module.status === "dissociated") && (
                                <button
                                  onClick={() => {
                                    setSelectedModule(module);
                                    setShowClaimModal(true);
                                    fetchPoulaillers();
                                  }}
                                  className="p-2 text-purple-500 hover:text-purple-700 transition"
                                  title="Associer à un poulailler"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
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
                              {/* Dissocier */}
                              {(module.status === "associated" ||
                                module.status === "offline") && (
                                <button
                                  onClick={() => {
                                    setSelectedModule(module);
                                    setShowDissociateModal(true);
                                  }}
                                  className="p-2 text-red-500 hover:text-red-700 transition"
                                  title="Dissocier du poulailler"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
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
                              {/* Supprimer */}
                              {(module.status === "pending" ||
                                module.status === "dissociated") && (
                                <button
                                  onClick={() => handleDelete(module)}
                                  className="p-2 text-slate-400 hover:text-red-500 transition"
                                  title="Supprimer le module"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5"
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    Page {page} sur {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 text-sm rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                    >
                      Précédent
                    </button>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="px-3 py-1 text-sm rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
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
        modules={modules}
        loading={claiming}
        module={selectedModule}
      />
      <DissociateModal
        isOpen={showDissociateModal}
        onClose={() => {
          setShowDissociateModal(false);
          setSelectedModule(null);
        }}
        onDissociate={handleDissociate}
        module={selectedModule}
        loading={dissociating}
      />
    </div>
  );
}
