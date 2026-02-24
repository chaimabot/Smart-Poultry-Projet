import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { eleveursAPI, utilisateursAPI } from "../../services/api";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";
import { formatDate } from "../../lib/utils";

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
  lastLogin?: string;
  poulaillersCount?: number;
  createdAt: string;
  inviteToken?: string;
}

interface InviteForm {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface EditForm {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

// ─── Composant Principal ───────────────────────────────────────────────────────

export default function Utilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "eleveur" | "admin">(
    "all",
  );

  // Modal INVITATION (éleveurs seulement)
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Modal MODIFICATION
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

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchUtilisateurs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const roleParam = activeTab !== "all" ? activeTab : undefined;
      if (roleParam) params.role = roleParam;

      const response = await utilisateursAPI.getAll(params);
      setUtilisateurs(response.data.data);
    } catch (err: any) {
      console.error("Erreur fetchUtilisateurs:", err);
      setError(err.response?.data?.error || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUtilisateurs();
  }, [search, activeTab]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteErrors({});
    setInviting(true);
    setInviteSuccess(false);
    try {
      await eleveursAPI.invite(inviteForm);
      setInviteSuccess(true);
      setInviteForm({ email: "", firstName: "", lastName: "", phone: "" });
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSuccess(false);
      }, 2000);
      fetchUtilisateurs();
    } catch (err: any) {
      console.error("Erreur invitation:", err);
      if (err.response?.data?.error) {
        setInviteErrors({ email: err.response.data.error });
      }
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
      fetchUtilisateurs();
    } catch (err: any) {
      console.error("Erreur modification:", err);
      if (err.response?.data?.error) {
        setEditErrors({ general: err.response.data.error });
      }
    } finally {
      setEditing(false);
    }
  };

  const handleToggleStatus = async (user: Utilisateur) => {
    try {
      if (user.role === "eleveur") {
        await eleveursAPI.toggleStatus(user.id);
      } else {
        await utilisateursAPI.toggleStatus(user.id);
      }
      fetchUtilisateurs();
    } catch (err: any) {
      console.error("Erreur toggle status:", err);
    }
  };

  const handleDelete = async (user: Utilisateur) => {
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer ${user.firstName} ${user.lastName} (${user.role === "admin" ? "Administrateur" : "Éleveur"}) ?`,
    );

    if (!confirmed) return;

    console.log("=== DEBUT SUPPRESSION ===");
    console.log("User ID:", user.id);
    console.log("User Role:", user.role);
    console.log("User Email:", user.email);

    try {
      let result;
      if (user.role === "eleveur") {
        console.log("Appel API: DELETE /api/admin/eleveurs/" + user.id);
        result = await eleveursAPI.delete(user.id);
      } else {
        console.log("Appel API: DELETE /api/admin/utilisateurs/" + user.id);
        result = await utilisateursAPI.delete(user.id);
      }

      console.log("Réponse API:", result.data);
      console.log("=== SUPPRESSION RÉUSSIE ===");

      // Afficher le message de succès
      setSuccessMessage(
        `${user.firstName} ${user.lastName} a été ${user.role === "eleveur" ? "archivé" : "supprimé"} avec succès!`,
      );

      // Rafraîchir la liste
      fetchUtilisateurs();

      // Masquer le message après 3 secondes
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error("=== ERREUR SUPPRESSION ===");
      console.error("Erreur:", err);
      console.error("Response:", err.response);
      console.error("Message:", err.message);

      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Erreur lors de la suppression";
      alert("ERREUR: " + errorMsg);
    }
  };

  const handleResendInvite = async (id: string) => {
    try {
      await eleveursAPI.resendInvite(id);
      alert("Invitation renvoyée avec succès !");
    } catch (err: any) {
      alert(err.response?.data?.error || "Erreur lors du renvoi");
    }
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

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getRoleLabel = (role: string) =>
    role === "admin" ? "Administrateur" : "Éleveur";

  const getRoleColor = (role: string) =>
    role === "admin"
      ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
      : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";

  const getStatusLabel = (user: Utilisateur) => {
    if (user.status === "pending")
      return {
        label: "En attente",
        color:
          "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      };
    if (user.isActive)
      return {
        label: "Actif",
        color:
          "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      };
    return {
      label: "Inactif",
      color:
        "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
    };
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
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg shadow-md transition-all duration-200"
            >
              <span className="material-symbols-outlined">person_add</span>
              Inviter un utilisateur
            </button>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined">check_circle</span>
              {successMessage}
            </div>
          )}

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
                <span className="material-symbols-outlined">{tab.icon}</span>
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

          {/* Error */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
              {error}
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
                    <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                      Dernière Connexion
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
                        colSpan={5}
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
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}
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
                              className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
                            >
                              {statusInfo.label}
                            </span>
                          </td>

                          {/* Dernière connexion */}
                          <td className="px-6 py-4 hidden lg:table-cell">
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                              {user.lastLogin
                                ? formatDate(user.lastLogin)
                                : "Jamais"}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1">
                              {/* Modifier */}
                              <button
                                onClick={() => openEditModal(user)}
                                className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="Modifier"
                              >
                                <span className="material-symbols-outlined">
                                  edit
                                </span>
                              </button>

                              {/* Voir les poulaillers (éleveurs) */}
                              {user.role === "eleveur" && (
                                <Link
                                  to={`/admin/eleveurs/${user.id}`}
                                  className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                                  title="Voir les poulaillers"
                                >
                                  <span className="material-symbols-outlined">
                                    visibility
                                  </span>
                                </Link>
                              )}

                              {/* Renvoyer invitation (éleveurs en attente) */}
                              {user.role === "eleveur" &&
                                user.status === "pending" && (
                                  <button
                                    onClick={() => handleResendInvite(user.id)}
                                    className="p-2 text-slate-400 hover:text-amber-500 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                                    title="Renvoyer l'invitation"
                                  >
                                    <span className="material-symbols-outlined">
                                      send
                                    </span>
                                  </button>
                                )}

                              {/* Activer / Désactiver */}
                              <button
                                onClick={() => handleToggleStatus(user)}
                                className={`p-2 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 ${
                                  user.isActive
                                    ? "text-slate-400 hover:text-red-500"
                                    : "text-slate-400 hover:text-green-500"
                                }`}
                                title={user.isActive ? "Désactiver" : "Activer"}
                              >
                                <span className="material-symbols-outlined">
                                  {user.isActive ? "toggle_off" : "toggle_on"}
                                </span>
                              </button>

                              {/* Supprimer */}
                              <button
                                onClick={() => handleDelete(user)}
                                className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="Supprimer"
                              >
                                <span className="material-symbols-outlined">
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

      {/* ── Modal Invitation ──────────────────────────────────────────────────── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Inviter un Nouvel Éleveur
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Un email d'invitation sera envoyé
              </p>
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
                  Email
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                  className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    inviteErrors.email
                      ? "border-red-400"
                      : "border-slate-300 dark:border-slate-700"
                  }`}
                  required
                />
                {inviteErrors.email && (
                  <p className="text-xs text-red-500 mt-1">
                    {inviteErrors.email}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={inviteForm.phone}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, phone: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {inviteSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
                  <span className="material-symbols-outlined">
                    check_circle
                  </span>
                  Invitation envoyée avec succès !
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteErrors({});
                  }}
                  className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg disabled:opacity-60 transition"
                >
                  {inviting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">send</span>
                      Envoyer l'Invitation
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Modification ────────────────────────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Modifier l'Utilisateur
              </h2>
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
                  Email
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
                  className="w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {editErrors.general && (
                <p className="text-xs text-red-500">{editErrors.general}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-5 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={editing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg disabled:opacity-60 transition"
                >
                  {editing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">save</span>
                      Enregistrer
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

// Helper extrait pour éviter la répétition dans le JSX
function getStatusInfo(user: Utilisateur) {
  if (user.status === "pending")
    return {
      label: "En attente",
      color:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    };
  if (user.isActive)
    return {
      label: "Actif",
      color:
        "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    };
  return {
    label: "Inactif",
    color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  };
}
