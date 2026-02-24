import { useState, useEffect } from "react";
import Header from "../../components/layout/Header";
import Sidebar from "../../components/layout/Sidebar";

interface User {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  role?: string;
  lastLogin?: string;
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const userData = localStorage.getItem("adminUser");
      
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setFormData({
          firstName: parsedUser.firstName || "",
          lastName: parsedUser.lastName || "",
          email: parsedUser.email || "",
          phone: parsedUser.phone || "",
        });
      }
    } catch (err) {
      console.error("Erreur fetchProfile:", err);
      setError("Erreur lors du chargement du profil");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const updatedUser: User = { ...user, ...formData };
      localStorage.setItem("adminUser", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setIsEditing(false);
      setSuccessMessage("Profil mis à jour avec succès!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError("Erreur lors de la mise à jour du profil");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (user) {
      setFormData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: user.phone || "",
      });
    }
    setIsEditing(false);
    setError(null);
  };

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    window.location.href = "/";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Mon Profil
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Gérez vos informations personnelles et votre compte
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-green-600 dark:text-green-400">{successMessage}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Colonne principale - Informations */}
            <div className="lg:col-span-2 space-y-6">
              {/* Carte Profil */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">person</span>
                    Informations Personnelles
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Vos informations de profil
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Prénom */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Prénom
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          name="firstName"
                          value={formData.firstName}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      ) : (
                        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-900 dark:text-white">
                          {user?.firstName || "—"}
                        </div>
                      )}
                    </div>

                    {/* Nom */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Nom
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          name="lastName"
                          value={formData.lastName}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      ) : (
                        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-900 dark:text-white">
                          {user?.lastName || "—"}
                        </div>
                      )}
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Adresse Email
                      </label>
                      {isEditing ? (
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      ) : (
                        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-900 dark:text-white">
                          {user?.email || "—"}
                        </div>
                      )}
                    </div>

                    {/* Téléphone */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Téléphone
                      </label>
                      {isEditing ? (
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="+33 1 23 45 67 89"
                        />
                      ) : (
                        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-900 dark:text-white">
                          {user?.phone || "—"}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Boutons */}
                  <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-4">
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg shadow-md transition-all duration-200 flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                        Modifier le profil
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleCancel}
                          className="px-5 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg shadow-md transition-all duration-200 disabled:opacity-70 flex items-center gap-2"
                        >
                          {saving ? (
                            <>
                              <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                              Enregistrement...
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-sm">save</span>
                              Enregistrer
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </form>
              </div>

              {/* Sécurité */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">security</span>
                    Sécurité
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Gérez la sécurité de votre compte
                  </p>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <span className="material-symbols-outlined text-primary">lock</span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">Mot de passe</p>
                          <p className="text-sm text-slate-500">Dernière modification il y a 30 jours</p>
                        </div>
                      </div>
                      <button className="px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition">
                        Modifier
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <span className="material-symbols-outlined text-primary">smartphone</span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">Authentification à deux facteurs</p>
                          <p className="text-sm text-slate-500">Non activée</p>
                        </div>
                      </div>
                      <button className="px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition">
                        Activer
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Colonne latérale */}
            <div className="space-y-6">
              {/* Avatar et résumé */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6">
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-primary to-indigo-600 rounded-full flex items-center justify-center text-3xl font-bold text-white mb-4">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {user?.firstName} {user?.lastName}
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400">{user?.email}</p>
                  <span className="inline-block mt-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium capitalize">
                    {user?.role}
                  </span>
                </div>
              </div>

              {/* Informations du compte */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">info</span>
                    Informations du Compte
                  </h2>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dernière connexion</span>
                    <span className="text-slate-900 dark:text-white text-right">
                      {user?.lastLogin ? new Date(user.lastLogin).toLocaleString("fr-FR") : "Jamais"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Statut du compte</span>
                    <span className="text-green-600 font-medium flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Actif
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ID Utilisateur</span>
                    <span className="text-slate-900 dark:text-white text-sm font-mono">
                      {user?.id?.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </div>

              {/* Déconnexion */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6">
                <button
                  onClick={handleLogout}
                  className="w-full px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">logout</span>
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
