import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { alertesAPI } from "../../services/api";

interface Alerte {
  id: string;
  severity: string;
  parameter: string;
  poulailler: { name: string };
  value: number;
  read: boolean;
  createdAt: string;
}

export default function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const notificationRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<{
    nomComplet: string;
    email: string;
    role: string;
  }>({
    nomComplet: "Administrateur",
    email: "",
    role: "Administrateur",
  });

  useEffect(() => {
    const storedUser = localStorage.getItem("adminUser");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser({
          nomComplet:
            `${parsedUser.firstName || ""} ${parsedUser.lastName || ""}`.trim() ||
            "Administrateur",
          email: parsedUser.email || "",
          role: parsedUser.role || "Administrateur",
        });
      } catch (e) {
        console.error("Error parsing user:", e);
      }
    }
  }, []);

  // Fetch recent alerts
  const fetchAlertes = async () => {
    try {
      const response = await alertesAPI.getAll({
        limit: 5,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      if (response.data?.data) {
        setAlertes(response.data.data);
        const unread = response.data.data.filter((a: Alerte) => !a.read).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.warn("Erreur fetch alerts:", error);
    }
  };

  useEffect(() => {
    fetchAlertes();
  }, []);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    navigate("/");
  };

  const getParameterLabel = (param: string) => {
    const labels: Record<string, string> = {
      temperature: "Température",
      humidity: "Humidité",
      co2: "CO2",
      nh3: "NH3",
      ammonia: "NH3",
      dust: "Poussière",
      waterLevel: "Niveau d'eau",
    };
    return labels[param] || param;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diff < 1) return "À l'instant";
    if (diff < 60) return `Il y a ${diff}min`;
    if (diff < 1440) return `Il y a ${Math.floor(diff / 60)}h`;
    return `Il y a ${Math.floor(diff / 1440)}j`;
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm sticky top-0 z-30">
      <div className="max-w-full mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Recherche à gauche */}
          <div className="flex items-center gap-6 flex-1">
            <form onSubmit={handleSearch} className="flex-1 max-w-2xl">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher un élèveur, poulailler, alerte..."
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

          {/* Zone droite : Notifications + Profil */}
          <div className="flex items-center gap-6">
            {/* Notifications dropdown */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <span className="material-symbols-outlined text-xl">
                  notifications
                </span>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 size-2 bg-red-500 rounded-full"></span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <span className="text-xs bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 px-2 py-0.5 rounded-full">
                        {unreadCount} non lue(s)
                      </span>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {alertes.length === 0 ? (
                      <div className="px-4 py-8 text-center text-slate-500">
                        <span className="material-symbols-outlined text-4xl text-slate-300">
                          notifications_none
                        </span>
                        <p className="mt-2">Aucune notification</p>
                      </div>
                    ) : (
                      alertes.map((alerte) => (
                        <div
                          key={alerte.id}
                          className={`px-4 py-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer ${
                            !alerte.read
                              ? "bg-blue-50/50 dark:bg-blue-900/10"
                              : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                                alerte.severity === "critical"
                                  ? "bg-red-500"
                                  : "bg-orange-500"
                              }`}
                            ></span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-slate-900 dark:text-white">
                                  {getParameterLabel(alerte.parameter)}
                                </p>
                                {!alerte.read && (
                                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">
                                {alerte.poulailler?.name || "Inconnu"} •{" "}
                                {alerte.value}
                              </p>
                              <p className="text-xs text-slate-400 mt-1">
                                {formatTimeAgo(alerte.createdAt)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <Link
                    to="/alertes"
                    onClick={() => setShowNotifications(false)}
                    className="block px-4 py-3 text-center text-sm text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition border-t border-slate-100 dark:border-slate-800"
                  >
                    Voir toutes les alertes
                  </Link>
                </div>
              )}
            </div>

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
