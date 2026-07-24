import { useState, useEffect, useCallback, useMemo } from "react";
import { eleveursAPI, utilisateursAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Utilisateur {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: "admin" | "eleveur";
  status: "pending" | "active" | "inactive" | "archived";
  isActive: boolean;
  hasInviteToken?: boolean; // inviteToken != null
  lastLogin?: string;
  poulaillersCount?: number;
  createdAt: string;
}

interface InviteForm {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: "eleveur" | "admin";
}

interface EditForm {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

// ─── Helper : récupère l'ID de l'utilisateur connecté depuis le JWT ─────────

function getCurrentUserId(): string | null {
  const token =
    localStorage.getItem("adminToken") ||
    sessionStorage.getItem("adminToken") ||
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("authToken") ||
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("accessToken");

  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.id || payload._id || payload.userId || payload.sub || null;
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureMaterialSymbolsFont() {
  const fontId = "material-symbols-outlined-font";
  if (!document.getElementById(fontId)) {
    const link = document.createElement("link");
    link.id = fontId;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
    document.head.appendChild(link);
  }

  const styleId = "material-symbols-outlined-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .material-symbols-outlined {
        font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        vertical-align: middle;
      }
    `;
    document.head.appendChild(style);
  }
}

// ─── Statut / Role helpers ───────────────────────────────────────────────────

function getStatusInfo(user: Utilisateur) {
  if (user.status === "pending") {
    return {
      label: "Invitation en attente",
      tooltip:
        "L'invitation a été envoyée. Le compte s'activera lorsque l'éleveur définira son mot de passe.",
      color:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      dot: "bg-amber-400",
      icon: "schedule_send",
    };
  }

  // si hasInviteToken vrai => invitation envoyée mais pas encore activée
  if (user.hasInviteToken) {
    return {
      label: "Invitation envoyée",
      tooltip:
        "L'invitation a été envoyée mais l'éleveur n'a pas encore activé son compte.",
      color:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      dot: "bg-amber-400",
      icon: "forward_to_inbox",
    };
  }

  if (user.isActive) {
    return {
      label: "Actif",
      tooltip: "Le compte est actif — l'éleveur peut se connecter.",
      color:
        "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      dot: "bg-green-400",
      icon: null,
    };
  }

  return {
    label: "Inactif",
    tooltip: "Le compte est désactivé.",
    color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
    dot: "bg-slate-400",
    icon: null,
  };
}

function getRoleLabel(role: string) {
  return role === "admin" ? "Administrateur" : "Éleveur";
}

function getRoleColor(role: string) {
  return role === "admin"
    ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
    : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
}

// ─── Toast Component ─────────────────────────────────────────────────────────

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: number) => void;
}) {
  const icons: Record<ToastType, string> = {
    success: "check_circle",
    error: "error",
    info: "info",
  };
  const colors: Record<ToastType, string> = {
    success:
      "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300",
    error:
      "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300",
    info: "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300",
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg pointer-events-auto animate-in slide-in-from-right-4 duration-300 ${
            colors[toast.type]
          }`}
        >
          <span className="material-symbols-outlined text-lg shrink-0 mt-0.5">
            {icons[toast.type]}
          </span>
          <p className="text-sm font-medium leading-snug flex-1">
            {toast.message}
          </p>
          <button
            onClick={() => onRemove(toast.id)}
            className="text-current opacity-60 hover:opacity-100 transition-opacity shrink-0"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700 p-6">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            danger
              ? "bg-red-100 dark:bg-red-900/40"
              : "bg-amber-100 dark:bg-amber-900/40"
          }`}
        >
          <span
            className={`material-symbols-outlined text-2xl ${
              danger
                ? "text-red-600 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {danger ? "delete_forever" : "warning"}
          </span>
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white text-center mb-2">
          {title}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
          {message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-primary hover:bg-primary-dark"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Utilisateurs() {
  const currentUserId = useMemo(() => getCurrentUserId(), []);

  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "eleveur" | "admin">(
    "all",
  );

  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        4000,
      );
    },
    [],
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    role: "eleveur",
  });
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    id: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    ensureMaterialSymbolsFont();
  }, []);

  const fetchUtilisateurs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (activeTab !== "all") params.role = activeTab;

      const response = await utilisateursAPI.getAll(params);

      const users = response.data.data
        .map((u: any) => {
          // ✅ Important : on détermine hasInviteToken depuis inviteToken si nécessaire
          // (selon ce que ton backend renvoie)
          const computedHasInviteToken =
            typeof u.hasInviteToken === "boolean"
              ? u.hasInviteToken
              : !!u.inviteToken;

          return {
            ...u,
            id: u._id || u.id,
            hasInviteToken: computedHasInviteToken,
          };
        })
        .filter((u: Utilisateur) => {
          if (!currentUserId) return true;
          return u.id !== currentUserId;
        });

      setUtilisateurs(users);
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        "Impossible de charger la liste des utilisateurs. Veuillez réessayer.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [search, activeTab, currentUserId]);

  useEffect(() => {
    fetchUtilisateurs();
  }, [fetchUtilisateurs]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteErrors({});
    setInviting(true);
    setInviteSuccess(false);

    try {
      let response;
      if (inviteForm.role === "admin") {
        response = await utilisateursAPI.inviteAdmin(inviteForm);
      } else {
        const { role, ...inviteData } = inviteForm;
        response = await eleveursAPI.invite(inviteData);
      }

      const backendMessage =
        response?.data?.message || "Invitation envoyée avec succès.";

      const isAlreadyPending =
        backendMessage.includes("déjà en attente") ||
        backendMessage.includes("Renvoyer l'invitation");

      setInviteMessage(backendMessage);
      setInviteSuccess(true);
      const sentEmail = inviteForm.email;

      setInviteForm({
        email: "",
        firstName: "",
        lastName: "",
        phone: "",
        role: "eleveur",
      });

      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSuccess(false);
        setInviteMessage("");
        addToast(
          isAlreadyPending
            ? `Une invitation est déjà en attente pour ${sentEmail}.`
            : backendMessage,
          isAlreadyPending ? "info" : "success",
        );
      }, 1800);

      fetchUtilisateurs();
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        "Une erreur est survenue lors de l'envoi de l'invitation.";
      setInviteErrors({ email: msg });
    } finally {
      setInviting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditErrors({});
    setEditing(true);

    try {
      await eleveursAPI.update(editForm.id, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        phone: editForm.phone,
      });

      setShowEditModal(false);
      addToast(
        `Les informations de ${editForm.firstName} ${editForm.lastName} ont été mises à jour.`,
        "success",
      );
      fetchUtilisateurs();
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        "Une erreur est survenue lors de la modification. Veuillez réessayer.";
      setEditErrors({ general: msg });
    } finally {
      setEditing(false);
    }
  };

  const handleToggleStatus = async (user: Utilisateur) => {
    const action = user.isActive ? "désactiver" : "activer";
    const actionLabel = user.isActive ? "Désactiver" : "Activer";

    setConfirm({
      open: true,
      title: `${actionLabel} le compte`,
      message: `Souhaitez-vous ${action} le compte de ${user.firstName} ${user.lastName} ?`,
      confirmLabel: actionLabel,
      danger: user.isActive,
      onConfirm: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        setTogglingId(user.id);

        try {
          if (user.role === "eleveur") {
            await eleveursAPI.toggleStatus(user.id);
          } else {
            await utilisateursAPI.toggleStatus(user.id);
          }

          addToast(
            `Le compte de ${user.firstName} ${user.lastName} a été ${
              user.isActive ? "désactivé" : "activé"
            } avec succès.`,
            "success",
          );

          fetchUtilisateurs();
        } catch (err: any) {
          const msg =
            err.response?.data?.error ||
            `Impossible de ${action} ce compte. Veuillez réessayer.`;
          addToast(msg, "error");
        } finally {
          setTogglingId(null);
        }
      },
    });
  };

  const handleDelete = async (user: Utilisateur) => {
    setConfirm({
      open: true,
      title: "Supprimer l'utilisateur",
      message: `Vous êtes sur le point de supprimer définitivement le compte de ${user.firstName} ${user.lastName} (${getRoleLabel(
        user.role,
      )}). Cette action est irréversible.`,
      confirmLabel: "Supprimer définitivement",
      danger: true,
      onConfirm: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        try {
          if (user.role === "eleveur") {
            await eleveursAPI.delete(user.id);
          } else {
            await utilisateursAPI.delete(user.id);
          }
          addToast(
            `Le compte de ${user.firstName} ${user.lastName} a été supprimé avec succès.`,
            "success",
          );
          fetchUtilisateurs();
        } catch (err: any) {
          const msg =
            err.response?.data?.error ||
            err.response?.data?.message ||
            "Une erreur est survenue lors de la suppression. Veuillez réessayer.";
          addToast(msg, "error");
        }
      },
    });
  };

  const handleResendInvite = async (user: Utilisateur) => {
    setConfirm({
      open: true,
      title: "Renvoyer l'invitation",
      message: `Un email sera envoyé à ${user.email}.`,
      confirmLabel: "Envoyer",
      danger: false,
      onConfirm: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        setResendingId(user.id);

        try {
          const response = await eleveursAPI.resendInvite(user.id);
          const backendMessage =
            response?.data?.message || "Invitation renvoyée avec succès.";

          const isAlreadyPending =
            backendMessage.includes("déjà en attente") ||
            backendMessage.includes("Renvoyer l'invitation");

          addToast(
            isAlreadyPending
              ? `Une invitation est déjà en attente pour ${user.email}.`
              : backendMessage,
            isAlreadyPending ? "info" : "success",
          );
        } catch (err: any) {
          const msg =
            err.response?.data?.error ||
            "Une erreur est survenue lors de l'envoi. Veuillez réessayer.";
          addToast(msg, "error");
        } finally {
          setResendingId(null);
        }
      },
    });
  };

  const openEditModal = (user: Utilisateur) => {
    setEditForm({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || "",
    });
    setEditErrors({});
    setShowEditModal(true);
  };

  const tabs = [
    { key: "all" as const, label: "Tous", icon: "group" },
    { key: "eleveur" as const, label: "Éleveurs", icon: "agriculture" },
    {
      key: "admin" as const,
      label: "Administrateurs",
      icon: "admin_panel_settings",
    },
  ];

  const counts = {
    all: utilisateurs.length,
    eleveur: utilisateurs.filter((u) => u.role === "eleveur").length,
    admin: utilisateurs.filter((u) => u.role === "admin").length,
  };

  const pendingCount = utilisateurs.filter(
    (u) => u.role === "eleveur" && (u.status === "pending" || u.hasInviteToken),
  ).length;

  const inviteModalTitle =
    inviteForm.role === "admin"
      ? "Inviter un Nouvel Administrateur"
      : "Inviter un Nouvel Éleveur";

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Gestion des Utilisateurs
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Gérez tous les comptes, rôles et invitations
              </p>

              {pendingCount > 0 && (
                <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <span className="material-symbols-outlined text-sm">
                    schedule_send
                  </span>
                  {pendingCount} invitation{pendingCount > 1 ? "s" : ""} en
                  attente
                </div>
              )}
            </div>

            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg shadow-md transition-all duration-200"
            >
              <span className="material-symbols-outlined">person_add</span>
              Inviter un utilisateur
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <span className="material-symbols-outlined text-lg">
                  {tab.icon}
                </span>
                {tab.label}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key
                      ? "bg-primary/10 text-primary"
                      : "bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              search
            </span>
            <input
              type="text"
              placeholder="Rechercher par nom, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Fetch Error */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined shrink-0">error</span>
              {error}
              <button
                onClick={fetchUtilisateurs}
                className="ml-auto text-red-700 dark:text-red-400 underline underline-offset-2 hover:no-underline text-xs font-medium"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                    <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Utilisateur
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Rôle
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {utilisateurs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-16 text-slate-400"
                      >
                        <span className="material-symbols-outlined text-4xl mb-2 block">
                          group_off
                        </span>
                        Aucun utilisateur trouvé
                      </td>
                    </tr>
                  ) : (
                    utilisateurs.map((user) => {
                      const statusInfo = getStatusInfo(user);
                      const isToggling = togglingId === user.id;
                      const isResending = resendingId === user.id;

                      // en attente = pending OU invitation déjà envoyée (token présent)
                      const awaiting =
                        user.status === "pending" || !!user.hasInviteToken;

                      // ✅ CORRECTION: icône d'envoi affichée si role=eleveur ET status=pending OU status=active
                      // (donc aussi si status=active et inviteToken == null)
                      const showSendIcon =
                        user.role === "eleveur" &&
                        (user.status === "pending" || user.status === "active");

                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                        >
                          {/* Utilisateur */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                                  user.role === "admin"
                                    ? "bg-gradient-to-br from-purple-500 to-purple-700"
                                    : "bg-gradient-to-br from-primary to-primary-dark"
                                }`}
                              >
                                {user.firstName?.[0]}
                                {user.lastName?.[0]}
                              </div>

                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white text-sm">
                                  {user.firstName} {user.lastName}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {user.email}
                                </div>
                                {user.phone && (
                                  <div className="text-xs text-slate-400 dark:text-slate-500">
                                    {user.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Rôle */}
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getRoleColor(
                                user.role,
                              )}`}
                            >
                              <span className="material-symbols-outlined text-sm">
                                {user.role === "admin"
                                  ? "admin_panel_settings"
                                  : "agriculture"}
                              </span>
                              {getRoleLabel(user.role)}
                            </span>
                          </td>

                          {/* Statut */}
                          <td className="px-6 py-4">
                            <span
                              title={statusInfo.tooltip}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-default ${statusInfo.color}`}
                            >
                              {statusInfo.icon ? (
                                <span className="material-symbols-outlined text-sm">
                                  {statusInfo.icon}
                                </span>
                              ) : (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusInfo.dot}`}
                                />
                              )}
                              {statusInfo.label}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1">
                              {/* Icône envoi invitation / credentials */}
                              {showSendIcon && (
                                <button
                                  onClick={() => handleResendInvite(user)}
                                  disabled={isResending}
                                  className="p-2 text-slate-400 hover:text-amber-500 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Renvoyer l'invitation par email"
                                >
                                  {isResending ? (
                                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <span className="material-symbols-outlined text-xl">
                                      forward_to_inbox
                                    </span>
                                  )}
                                </button>
                              )}

                              {/* Modifier */}
                              {!awaiting && (
                                <button
                                  onClick={() => openEditModal(user)}
                                  className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                                  title="Modifier les informations"
                                >
                                  <span className="material-symbols-outlined text-xl">
                                    edit
                                  </span>
                                </button>
                              )}

                              {/* Activer / Désactiver */}
                              {!awaiting && (
                                <button
                                  onClick={() => handleToggleStatus(user)}
                                  disabled={isToggling}
                                  className={`p-2 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed ${
                                    user.isActive
                                      ? "text-slate-400 hover:text-red-500"
                                      : "text-slate-400 hover:text-green-500"
                                  }`}
                                  title={
                                    user.isActive
                                      ? "Désactiver le compte"
                                      : "Activer le compte"
                                  }
                                >
                                  {isToggling ? (
                                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <span className="material-symbols-outlined text-xl">
                                      {user.isActive
                                        ? "toggle_off"
                                        : "toggle_on"}
                                    </span>
                                  )}
                                </button>
                              )}

                              {/* Supprimer */}
                              <button
                                onClick={() => handleDelete(user)}
                                className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="Supprimer le compte"
                              >
                                <span className="material-symbols-outlined text-xl">
                                  delete
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        danger={confirm.danger}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />

      {/* Modal Invitation */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {inviteModalTitle}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Un email d'invitation sera envoyé automatiquement
                </p>
              </div>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteErrors({});
                  setInviteSuccess(false);
                  setInviteMessage("");
                }}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Prénom
                  </label>
                  <input
                    type="text"
                    value={inviteForm.firstName}
                    onChange={(e) =>
                      setInviteForm({
                        ...inviteForm,
                        firstName: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nom
                  </label>
                  <input
                    type="text"
                    value={inviteForm.lastName}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, lastName: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Adresse email
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                  placeholder="exemple@domaine.com"
                  className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    inviteErrors.email
                      ? "border-red-400 focus:ring-red-400/40"
                      : "border-slate-300 dark:border-slate-700"
                  }`}
                  required
                />
                {inviteErrors.email && (
                  <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5">
                    <span className="material-symbols-outlined text-sm">
                      error
                    </span>
                    {inviteErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Rôle
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm({
                      ...inviteForm,
                      role: e.target.value as "eleveur" | "admin",
                    })
                  }
                  className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="eleveur">Éleveur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>

              {inviteSuccess && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
                    inviteMessage.includes("déjà en attente")
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
                      : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
                  }`}
                >
                  <span className="material-symbols-outlined">
                    {inviteMessage.includes("déjà en attente")
                      ? "info"
                      : "check_circle"}
                  </span>
                  {inviteMessage}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteErrors({});
                    setInviteSuccess(false);
                  }}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                >
                  {inviting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">
                        send
                      </span>
                      Envoyer l'invitation
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Modification */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Modifier l'utilisateur
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Prénom
                  </label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, firstName: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nom
                  </label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, lastName: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Adresse email{" "}
                  <span className="text-slate-400 font-normal">
                    (non modifiable)
                  </span>
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  disabled
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                  placeholder="+216 XX XXX XXX"
                  className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {editErrors.general && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  <span className="material-symbols-outlined text-sm shrink-0">
                    error
                  </span>
                  {editErrors.general}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={editing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
                >
                  {editing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">
                        save
                      </span>
                      Enregistrer les modifications
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
