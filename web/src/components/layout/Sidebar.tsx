import { Link, useLocation } from "react-router-dom";

const navItems = [
  { name: "Tableau de bord", path: "/dashboard", icon: "dashboard" },
  {
    name: "Administrateurs",
    path: "/utilisateurs",
    icon: "admin_panel_settings",
  },
  { name: "Poulaillers", path: "/poulaillers", icon: "house" },
  { name: "Modules", path: "/modules", icon: "sensors" },
  { name: "Rapports", path: "/rapports", icon: "analytics" },
  { name: "Alertes", path: "/alertes", icon: "notifications" },
  { name: "Journaux", path: "/logs", icon: "description" },
];

export default function Sidebar() {
  const location = useLocation();

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
            Vue d’ensemble système
          </p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}

        <div className="pt-4 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider px-3">
          Système
        </div>
        <Link
          to="/profile"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            location.pathname === "/profile"
              ? "bg-primary/10 text-primary"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <span className="material-symbols-outlined">person</span>
          Profil
        </Link>
        <Link
          to="/parametres"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            location.pathname === "/parametres"
              ? "bg-primary/10 text-primary"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <span className="material-symbols-outlined">settings</span>
          Paramètres
        </Link>
      </nav>
    </aside>
  );
}
