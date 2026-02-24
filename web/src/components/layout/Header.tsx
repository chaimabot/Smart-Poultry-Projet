// src/components/layout/Header.tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const navigate = useNavigate();

  // Exemple utilisateur (à remplacer par ton contexte auth réel)
  const user = {
    nomComplet: "Chahed Ben Ali",
    email: "chahed@example.com",
    avatarUrl: null,
    role: "Administrateur",
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Exemple : rediriger vers une page de résultats
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const handleLogout = () => {
    // logout(); // ton appel de déconnexion
    navigate("/login");
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm sticky top-0 z-30">
      <div className="max-w-full mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Recherche à gauche */}
          <div className="flex items-center gap-6 flex-1">
            {/* Barre de recherche globale */}
            <form onSubmit={handleSearch} className="flex-1 max-w-2xl">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher un éleveur, poulailler, alerte..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 transition-all duration-200"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <span className="material-symbols-outlined text-xl">
                    search
                  </span>
                </span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <span className="material-symbols-outlined text-lg">
                      close
                    </span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Zone droite : Profil */}
          <div className="flex items-center gap-6">
            {/* Notifications (optionnel) */}
            <button className="relative p-2 text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <span className="material-symbols-outlined text-xl">
                notifications
              </span>
              <span className="absolute top-1 right-1 size-2 bg-red-500 rounded-full"></span>
            </button>

            {/* Menu profil */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-3 focus:outline-none"
              >
                <div className="size-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 font-semibold">
                  {user.nomComplet.charAt(0).toUpperCase()}
                </div>

                <div className="hidden md:flex flex-col items-start text-left">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {user.nomComplet}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {user.role}
                  </span>
                </div>

                <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">
                  expand_more
                </span>
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-2 z-50">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {user.nomComplet}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {user.email}
                    </p>
                  </div>

                  <Link
                    to="/profile"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    onClick={() => setShowProfileMenu(false)}
                  >
                    <span className="material-symbols-outlined">person</span>
                    Mon profil
                  </Link>

                  <Link
                    to="/parametres"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    onClick={() => setShowProfileMenu(false)}
                  >
                    <span className="material-symbols-outlined">settings</span>
                    Paramètres
                  </Link>

                  <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>

                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      handleLogout();
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 w-full text-left transition"
                  >
                    <span className="material-symbols-outlined">logout</span>
                    Se déconnecter
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
