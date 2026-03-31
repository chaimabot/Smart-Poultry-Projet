import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { alertesAPI } from "../../services/api";

const navItems = [
  {
    name: "Tableau de bord",
    path: "/dashboard",
    icon: "dashboard",
    description: "Vue d'ensemble du système",
  },
  {
    name: "Utilisateurs",
    path: "/utilisateurs",
    icon: "admin_panel_settings",
    description: "Gérer les utilisateurs et rôles",
  },
  {
    name: "Poulaillers",
    path: "/poulaillers",
    icon: "house",
    description: "Gestion des poulaillers",
  },
  {
    name: "Modules",
    path: "/modules",
    icon: "sensors",
    description: "Appareils ESP32 connectés",
  },
  {
    name: "Rapports",
    path: "/rapports",
    icon: "analytics",
    description: "Statistiques et analyses",
  },
  {
    name: "Alertes",
    path: "/alertes",
    icon: "notifications",
    badge: true,
    description: "Notifications et alertes",
  },
  {
    name: "Journaux",
    path: "/logs",
    icon: "description",
    description: "Historique des actions",
  },
];

export default function Sidebar() {
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnreadAlerts = async () => {
      try {
        const response = await alertesAPI.getAll({ read: "false", limit: 100 });
        if (response.data?.data) {
          setUnreadCount(response.data.data.length);
        }
      } catch (error) {
        console.warn("Erreur fetch alerts:", error);
      }
    };

    fetchUnreadAlerts();

    // Refresh every 30 seconds
    const interval = setInterval(fetchUnreadAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-background-light dark:bg-background-dark h-screen sticky top-0">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary p-2 rounded-lg text-white">
          <span className="material-symbols-outlined text-2xl">
            precision_manufacturing
          </span>
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight">
            Admin PoultrySmart
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Vue d'ensemble système
          </p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const showBadge = item.badge && unreadCount > 0;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`group flex flex-col gap-0.5 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? "bg-primary/10"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined relative text-slate-600 dark:text-slate-400 group-hover:text-primary transition-colors">
                  {item.icon}
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[10px] text-white items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    </span>
                  )}
                </span>
                <span
                  className={`text-sm font-medium ${
                    isActive
                      ? "text-primary"
                      : "text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white"
                  }`}
                >
                  {item.name}
                </span>
                {showBadge && (
                  <span className="ml-auto bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 text-xs font-medium px-2 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <span
                className={`text-xs pl-9 ${
                  isActive
                    ? "text-primary/70"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {item.description}
              </span>
            </Link>
          );
        })}

        <div className="pt-4 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider px-3">
          Système
        </div>
        <Link
          to="/profile"
          className="group flex flex-col gap-0.5 px-3 py-2.5 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-400 group-hover:text-primary transition-colors">
              person
            </span>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
              Profil
            </span>
          </div>
          <span className="text-xs pl-9 text-slate-400 dark:text-slate-500">
            Mon compte et paramètres
          </span>
        </Link>
        <Link
          to="/parametres"
          className="group flex flex-col gap-0.5 px-3 py-2.5 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-600 dark:text-slate-400 group-hover:text-primary transition-colors">
              settings
            </span>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">
              Paramètres
            </span>
          </div>
          <span className="text-xs pl-9 text-slate-400 dark:text-slate-500">
            Configuration du système
          </span>
        </Link>
      </nav>
    </aside>
  );
}
