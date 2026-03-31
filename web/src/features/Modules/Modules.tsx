import { useState, useEffect, useRef } from "react";
import { modulesAPI, poulaillersAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import toast from "react-hot-toast";

// ============================================================================
// TYPES - STATUTS SIMPLIFIES: pending, associated, offline, dissociated
// ============================================================================

interface Module {
  id: string;
  serialNumber: string;
  macAddress: string;
  deviceName: string;
  firmwareVersion?: string;
  status: "pending" | "associated" | "offline" | "dissociated";
  claimCode?: string;
  claimCodeExpiresAt?: string;
  claimCodeUsedAt?: string;
  lastPing?: string;
  lastPingFormatted?: string;
  poulailler?: {
    id: string;
    name: string;
  };
  owner?: {
    id: string;
    name: string;
    email: string;
  };
  dissociationReason?: string;
  dissociatedAt?: string;
  createdAt: string;
}

interface Poulailler {
  id: string;
  name: string;
  type: string;
  animalCount: number;
  owner?: {
    id: string;
    name: string;
    email: string;
  };
}

// ============================================================================
// COMPOSANTS UTILITAIRES
// ============================================================================

/**
 * Badge de statut avec couleurs - 4 statuts simplifies
 * Couleurs:
 * - pending: orange (En attente)
 * - associated: vert (Associe)
 * - offline: rouge (Hors ligne)
 * - dissociated: gris (Dissocie)
 */
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
      label: "Associe",
    },
    offline: { color: "text-red-600", bg: "bg-red-100", label: "Hors ligne" },
    dissociated: {
      color: "text-slate-600",
      bg: "bg-slate-100",
      label: "Dissocie",
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

/**
 * Modal de scan QR Code
 */
const QRScannerModal = ({
  isOpen,
  onClose,
  onScan,
}: {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [html5QrCode, setHtml5QrCode] = useState<any>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      import("html5-qrcode").then((module) => {
        const Html5Qrcode = module.Html5Qrcode;
        const scanner = new Html5Qrcode("qr-reader");
        setHtml5QrCode(scanner);
      });
    } else {
      stopScanning();
    }
    return () => {
      stopScanning();
    };
  }, [isOpen]);

  const startScanning = async () => {
    if (!html5QrCode) return;
    setError(null);
    setScanning(true);
    try {
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          stopScanning();
          onScan(decodedText);
        },
        () => {},
      );
    } catch (err: any) {
      console.error("Erreur scan:", err);
      setError("Impossible de demarrer la camera. Verifiez les permissions.");
      setScanning(false);
    }
  };

  const stopScanning = async () => {
    if (html5QrCode && scanning) {
      try {
        await html5QrCode.stop();
      } catch (e) {
        /* ignore */
      }
    }
    setScanning(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            Scanner le Code QR
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Pointez la camera vers le code QR du module
          </p>
        </div>
        <div className="p-6">
          <div
            id="qr-reader"
            ref={videoRef}
            className="w-full h-64 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden mb-4"
          />
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          <div className="flex justify-center gap-4">
            {!scanning ? (
              <button
                onClick={startScanning}
                className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition"
              >
                Demarrer le scan
              </button>
            ) : (
              <button
                onClick={stopScanning}
                className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition"
              >
                Arreter
              </button>
            )}
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={() => {
              stopScanning();
              onClose();
            }}
            className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Modal de claim + association (fusionne - nouveau flux)
 * SIMPLIFICATION: Le claim inclut maintenant l'association au poulailler
 */
const ClaimModal = ({
  isOpen,
  onClose,
  onClaim,
  moduleData,
  poulaillers,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onClaim: (code: string, poulaillerId: string) => void;
  moduleData: { serialNumber?: string; deviceName?: string } | null;
  poulaillers: Poulailler[];
  loading: boolean;
}) => {
  const [claimCode, setClaimCode] = useState("");
  const [selectedPoulaillerId, setSelectedPoulaillerId] = useState("");

  useEffect(() => {
    if (isOpen) {
      setClaimCode("");
      setSelectedPoulaillerId("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            Claimer et Associer le Module
          </h3>
          {moduleData && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {moduleData.deviceName} - {moduleData.serialNumber}
            </p>
          )}
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Code Claim
            </label>
            <input
              type="text"
              value={claimCode}
              onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
              maxLength={14}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Poulailler <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPoulaillerId}
              onChange={(e) => setSelectedPoulaillerId(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Selectionner un poulailler</option>
              {poulaillers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.owner?.name || "Proprietaire inconnu"})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-700 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              onClick={() => onClaim(claimCode, selectedPoulaillerId)}
              disabled={!claimCode || !selectedPoulaillerId || loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg shadow-md transition-all duration-200 disabled:opacity-70"
            >
              {loading ? (
                <>
                  <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  Claim en cours...
                </>
              ) : (
                "Claimer et Associer"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Modal de dissociation avec confirmation et motif obligatoire
 */
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
            Dissocier le Module
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {module.deviceName} - {module.serialNumber}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Cette action dissociera le module du poulailler. Un nouveau code
              claim sera genere automatiquement pour toute reaffectation.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Motif de dissociation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Expliquez la raison de la dissociation (minimum 10 caracteres)"
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows={3}
              minLength={10}
            />
            <p className="text-xs text-slate-500 mt-1">
              Minimum 10 caracteres ({reason.length}/10)
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
          <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-700 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              onClick={() => onDissociate(reason)}
              disabled={reason.length < 10 || !confirm || loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg shadow-md transition-all duration-200 disabled:opacity-70"
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

/**
 * Modal de generation de code claim
 */
const GenerateClaimModal = ({
  isOpen,
  onClose,
  onGenerate,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: {
    serialNumber: string;
    macAddress: string;
    deviceName: string;
    firmwareVersion?: string;
  }) => void;
  loading: boolean;
}) => {
  const [formData, setFormData] = useState({
    serialNumber: "",
    macAddress: "",
    deviceName: "",
    firmwareVersion: "",
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        serialNumber: "",
        macAddress: "",
        deviceName: "",
        firmwareVersion: "",
      });
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "macAddress" ? value.toUpperCase() : value,
    }));
  };

  const isValid =
    formData.serialNumber && formData.macAddress && formData.deviceName;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            Generer Code Claim
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Creez un nouveau module avec code claim
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Numero de Serie <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="serialNumber"
              value={formData.serialNumber}
              onChange={handleChange}
              placeholder="ESP32-001"
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Adresse MAC <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="macAddress"
              value={formData.macAddress}
              onChange={handleChange}
              placeholder="XX:XX:XX:XX:XX:XX"
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Nom du Module <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="deviceName"
              value={formData.deviceName}
              onChange={handleChange}
              placeholder="Module Principal"
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Version Firmware
            </label>
            <input
              type="text"
              name="firmwareVersion"
              value={formData.firmwareVersion}
              onChange={handleChange}
              placeholder="1.0.0"
              className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-slate-700 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              onClick={() => onGenerate(formData)}
              disabled={!isValid || loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg shadow-md transition-all duration-200 disabled:opacity-70"
            >
              {loading ? (
                <>
                  <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  Generation...
                </>
              ) : (
                "Generer le Code"
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showDissociateModal, setShowDissociateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Donnees selectionnees
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [qrScannedData, setQrScannedData] = useState<{
    serialNumber?: string;
    deviceName?: string;
  } | null>(null);

  // Loading states
  const [claiming, setClaiming] = useState(false);
  const [dissociating, setDissociating] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ============================================================================
  // FONCTIONS API
  // ============================================================================

  const fetchModules = async () => {
    setLoading(true);
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
      console.error("Erreur fetchModules:", err);
      setError(err.response?.data?.error || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  const fetchPoulaillers = async () => {
    try {
      const response = await modulesAPI.getPendingPoulaillers();
      setPoulaillers(response.data.data);
    } catch (err: any) {
      console.error("Erreur fetchPoulaillers:", err);
    }
  };

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    fetchModules();
  }, [statusFilter, page]);
  useEffect(() => {
    fetchPoulaillers();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== "" || page === 1) fetchModules();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleQRScan = async (data: string) => {
    setShowQRScanner(false);
    setQrScannedData({ deviceName: "Module scanne" });
    try {
      const response = await modulesAPI.decodeQR(data);
      if (response.data.success) {
        setQrScannedData({
          serialNumber: response.data.data.serialNumber,
          deviceName: response.data.data.deviceName,
        });
        setShowClaimModal(true);
        toast.success("Code QR valide!");
      } else {
        toast.error(response.data.error || "Code QR invalide");
      }
    } catch (err: any) {
      console.error("Erreur decode QR:", err);
      if (data.match(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
        setQrScannedData({ deviceName: "Code claim detecte" });
        setShowClaimModal(true);
      } else {
        toast.error(err.response?.data?.error || "Erreur lors du scan");
      }
    }
  };

  // NOUVEAU: Claim + Association en une seule etape
  const handleClaim = async (claimCode: string, poulaillerId: string) => {
    setClaiming(true);
    try {
      await modulesAPI.claim(claimCode, poulaillerId);
      toast.success("Module reclame et associe avec succes!");
      setShowClaimModal(false);
      setQrScannedData(null);
      fetchModules();
      fetchPoulaillers();
    } catch (err: any) {
      console.error("Erreur claim:", err);
      toast.error(err.response?.data?.error || "Erreur lors du claim");
    } finally {
      setClaiming(false);
    }
  };

  const handleOpenDissociate = (module: Module) => {
    setSelectedModule(module);
    setShowDissociateModal(true);
  };

  const handleDissociate = async (reason: string) => {
    if (!selectedModule) return;
    setDissociating(true);
    try {
      await modulesAPI.dissociate(selectedModule.id, { reason, confirm: true });
      toast.success("Module dissocie avec succes! Nouveau code claim genere.");
      setShowDissociateModal(false);
      setSelectedModule(null);
      fetchModules();
      fetchPoulaillers();
    } catch (err: any) {
      console.error("Erreur dissociation:", err);
      toast.error(
        err.response?.data?.error || "Erreur lors de la dissociation",
      );
    } finally {
      setDissociating(false);
    }
  };

  const handleGenerate = async (data: {
    serialNumber: string;
    macAddress: string;
    deviceName: string;
    firmwareVersion?: string;
  }) => {
    setGenerating(true);
    try {
      const response = await modulesAPI.generateClaimCode(data);
      toast.success("Code claim genere avec succes!");
      setShowGenerateModal(false);
      fetchModules();
      if (response.data.data.claimCode) {
        // Copier automatiquement le code dans le presse-papiers
        await navigator.clipboard.writeText(response.data.data.claimCode);
        toast.success(`Code claim copie: ${response.data.data.claimCode}`);
      }
    } catch (err: any) {
      console.error("Erreur generation:", err);
      toast.error(err.response?.data?.error || "Erreur lors de la generation");
    } finally {
      setGenerating(false);
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
          {/* En-tete */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Gestion des Modules
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Supervision et association des modules ESP32
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowQRScanner(true)}
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
                    d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zm-2 7a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zm8-12a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1zm-1 7a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3zm2 2v-1h1v1h-1zm-3 7a1 1 0 011-1h.01a1 1 0 110 2H14a1 1 0 01-1-1zm-1-8a1 1 0 00-1 1v3a1 1 0 001 1h.01a1 1 0 100-2H13V4h.01z"
                    clipRule="evenodd"
                  />
                </svg>
                Scanner QR
              </button>
              <button
                onClick={() => setShowGenerateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition"
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
                Generer Code
              </button>
            </div>
          </div>

          {/* Filtres - 4 statuts simplifies */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Rechercher par code, nom, serie..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Statuts</option>
              <option value="pending">En attente</option>
              <option value="associated">Associe</option>
              <option value="offline">Hors ligne</option>
              <option value="dissociated">Dissocie</option>
            </select>
          </div>

          {/* Erreur */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Tableau */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                        Module
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                        Serie / MAC
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                        Code Claim
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                        Statut
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                        Poulailler
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                        Dernier Ping
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {modules.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-8 text-center text-slate-500 dark:text-slate-400"
                        >
                          Aucun module trouve
                        </td>
                      </tr>
                    ) : (
                      modules.map((module) => (
                        <tr
                          key={module.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900/30"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-5 w-5 text-primary"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M9 3a1 1 0 000 2h.01a1 1 0 100-2H9z" />
                                  <path
                                    fillRule="evenodd"
                                    d="M4 3a2 2 0 00-2 2v4a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 8H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                              <div>
                                <p className="font-medium text-slate-900 dark:text-white">
                                  {module.deviceName}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  v{module.firmwareVersion || "N/A"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <p className="text-sm font-mono text-slate-600 dark:text-slate-300">
                                {module.serialNumber}
                              </p>
                              <p className="text-xs font-mono text-slate-400">
                                {module.macAddress}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {module.claimCode ? (
                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                                  {module.claimCode}
                                </code>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(
                                      module.claimCode || "",
                                    );
                                    toast.success("Code copie!");
                                  }}
                                  className="p-1 text-slate-400 hover:text-primary transition"
                                  title="Copier le code"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-sm">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={module.status} />
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                            {module.poulailler?.name || (
                              <span className="text-slate-400">
                                Non associe
                              </span>
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
                            <div className="flex items-center justify-end gap-2">
                              {/* Bouton claim si en attente */}
                              {module.status === "pending" && (
                                <button
                                  onClick={() => {
                                    setSelectedModule(module);
                                    setQrScannedData({
                                      serialNumber: module.serialNumber,
                                      deviceName: module.deviceName,
                                    });
                                    setShowClaimModal(true);
                                  }}
                                  className="p-2 text-purple-500 hover:text-purple-700 transition"
                                  title="Claimer et associer"
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
                              {/* Bouton dissocier si associe */}
                              {module.status === "associated" && (
                                <button
                                  onClick={() => handleOpenDissociate(module)}
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
                      Precedent
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
      <QRScannerModal
        isOpen={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
      />
      <ClaimModal
        isOpen={showClaimModal}
        onClose={() => {
          setShowClaimModal(false);
          setQrScannedData(null);
        }}
        onClaim={handleClaim}
        moduleData={qrScannedData}
        poulaillers={poulaillers}
        loading={claiming}
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
      <GenerateClaimModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        onGenerate={handleGenerate}
        loading={generating}
      />
    </div>
  );
}
