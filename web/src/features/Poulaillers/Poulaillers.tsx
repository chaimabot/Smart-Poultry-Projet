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

interface PoulaillerAdmin {
  id: string;
  codeUnique: string;
  name: string;
  animalCount?: number;
  description?: string;
  location?: string;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  } | null;
  status: string;
  lastMeasure?: {
    temperature: number;
    humidity: number;
  };
  alertesActives: number;
  dernierPing?: string;
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
        className:
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
      };
    case "alerte":
      return {
        label: "Alerte",
        className:
          "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
      };
    case "hors_ligne":
      return {
        label: "Hors ligne",
        className:
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      };
    case "en_attente_module":
      return {
        label: "En attente",
        className:
          "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      };
    default:
      return {
        label: status,
        className:
          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
      };
  }
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
        {/* Header */}
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

        {/* Body — scrollable */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* ── Éleveur propriétaire ── */}
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
                Aucun éleveur trouvé dans la base de données.
              </p>
            )}
          </div>

          {/* ── Nom ── */}
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

          {/* ── Nombre d'animaux ── */}
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

          {/* ── Localisation ── */}
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

          {/* ── Date d'installation ── */}
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

          {/* ── Description ── */}
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

        {/* Footer */}
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
// DELETE CONFIRM MODAL
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
              historiques seront conservées mais le poulailler n'apparaîtra plus
              dans les listes.
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

  // ============================================================================
  // API CALLS
  // ============================================================================

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
        console.error("Erreur fetchPoulaillers:", err);
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
    } catch (err) {
      console.error("Erreur fetchUsers:", err);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchPoulaillers(1);
  }, [fetchPoulaillers]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

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

  const handleExportCSV = () => {
    const headers = [
      "Code",
      "Nom",
      "Animaux",
      "Localisation",
      "Éleveur",
      "Email éleveur",
      "Statut",
      "Temp (°C)",
      "Hum (%)",
      "Alertes",
    ];
    const rows = poulaillers.map((p) => [
      p.codeUnique,
      p.name,
      p.animalCount ?? "",
      p.location ?? "",
      p.owner ? `${p.owner.firstName} ${p.owner.lastName}` : "",
      p.owner?.email ?? "",
      getStatusConfig(p.status).label,
      p.lastMeasure?.temperature ?? "",
      p.lastMeasure?.humidity ?? "",
      p.alertesActives,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `poulaillers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Tous les Poulaillers
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Supervision globale · {pagination.total} installation
                {pagination.total !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-lg transition text-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                Exporter CSV
              </button>
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

          {/* Filtres */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-xl">
              <input
                type="text"
                placeholder="Rechercher nom, code ou éleveur…"
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
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Tableau */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex gap-4 py-4 border-b border-slate-100 dark:border-slate-700 last:border-0 animate-pulse"
                  >
                    {Array.from({ length: 7 }).map((__, j) => (
                      <div
                        key={j}
                        className="h-4 bg-slate-200 dark:bg-slate-700 rounded flex-1"
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : poulaillers.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 mx-auto mb-4 opacity-30"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-lg font-medium">
                  Aucun poulailler ne correspond
                </p>
                <p className="text-sm mt-1">
                  Modifiez vos filtres ou ajoutez un nouveau poulailler
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Code / Nom
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Animaux / Lieu
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Éleveur
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Temp / Hum
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Alertes
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Dernier ping
                      </th>
                      <th className="px-6 py-4 w-28" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {poulaillers.map((p) => {
                      const statusCfg = getStatusConfig(p.status);
                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
                        >
                          {/* Code / Nom */}
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {p.codeUnique}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {p.name}
                            </div>
                          </td>

                          {/* Animaux / Lieu */}
                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-700 dark:text-slate-300">
                              {p.animalCount != null ? (
                                `${p.animalCount.toLocaleString("fr-FR")} animaux`
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
                            <div
                              className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[160px]"
                              title={p.location}
                            >
                              {p.location || "—"}
                            </div>
                          </td>

                          {/* Éleveur */}
                          <td className="px-6 py-4">
                            {p.owner ? (
                              <div>
                                <Link
                                  to={`/eleveurs/${p.owner.id}`}
                                  className="text-primary hover:underline text-sm font-medium"
                                >
                                  {p.owner.firstName} {p.owner.lastName}
                                </Link>
                                {p.owner.email && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {p.owner.email}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Statut */}
                          <td className="px-6 py-4 text-center">
                            <span
                              className={cn(
                                "inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full",
                                statusCfg.className,
                              )}
                            >
                              {statusCfg.label}
                            </span>
                          </td>

                          {/* Temp / Hum */}
                          <td className="px-6 py-4 text-center text-xs font-mono text-slate-700 dark:text-slate-300">
                            {p.lastMeasure?.temperature != null
                              ? `${p.lastMeasure.temperature}°C`
                              : "—"}
                            <br />
                            {p.lastMeasure?.humidity != null
                              ? `${p.lastMeasure.humidity}%`
                              : "—"}
                          </td>

                          {/* Alertes */}
                          <td className="px-6 py-4 text-center">
                            {p.alertesActives > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 rounded-full text-xs font-medium">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3.5 w-3.5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                {p.alertesActives}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                0
                              </span>
                            )}
                          </td>

                          {/* Dernier ping */}
                          <td className="px-6 py-4 text-right text-xs text-slate-500 dark:text-slate-400">
                            {p.dernierPing
                              ? formatLastCheck(p.dernierPing)
                              : "—"}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                to={`/poulaillers/${p.id}`}
                                className="p-2 text-slate-400 hover:text-primary transition rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="Voir détails"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                  <path
                                    fillRule="evenodd"
                                    d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </Link>
                              <button
                                onClick={() => {
                                  setSelectedPoulailler(p);
                                  fetchUsers();
                                  setShowEditModal(true);
                                }}
                                className="p-2 text-slate-400 hover:text-blue-500 transition rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="Modifier"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedPoulailler(p);
                                  setShowDeleteModal(true);
                                }}
                                className="p-2 text-slate-400 hover:text-red-500 transition rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
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
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && pagination.pages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
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
                        <span
                          key={`ellipsis-${idx}`}
                          className="px-2 text-slate-400"
                        >
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
          </div>
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
