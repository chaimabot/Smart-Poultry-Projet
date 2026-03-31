// src/features/auth/Login.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    const user = localStorage.getItem("adminUser");
    if (token && user) {
      // Already logged in, redirect to dashboard
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Appel API au backend
      const response = await axios.post(
        "http://localhost:5001/api/auth/admin/login",
        {
          email,
          password,
        },
      );

      const { success, token, user } = response.data;

      if (success && token) {
        // Stockage du token et des infos utilisateur
        localStorage.setItem("adminToken", token);
        localStorage.setItem("adminUser", JSON.stringify(user));

        console.log("Authentification réussie ! Token stocké :", token);

        // Redirection vers le dashboard admin
        navigate("/dashboard");
      } else {
        setError("Réponse inattendue du serveur");
      }
    } catch (err: any) {
      if (err.response) {
        // Erreurs du backend (401, 403, 400, etc.)
        const { data, status } = err.response;

        if (status === 401 || status === 403) {
          setError(
            data.error ||
              "Identifiants incorrects ou accès réservé aux administrateurs",
          );
        } else if (status === 400) {
          setError(data.error || "Veuillez vérifier les champs saisis");
        } else {
          setError("Erreur serveur - veuillez réessayer plus tard");
        }
      } else if (err.request) {
        // Pas de réponse du serveur (serveur éteint, CORS, réseau)
        setError(
          "Impossible de contacter le serveur. Vérifiez qu'il est lancé sur le port 5001.",
        );
      } else {
        setError("Une erreur inattendue est survenue");
      }
      console.error("Erreur lors de la connexion :", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Fond décoratif */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-primary/5 dark:from-primary/10 dark:to-primary/10" />
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary to-indigo-600 rounded-2xl shadow-xl mb-4">
            <span className="material-symbols-outlined text-white text-4xl">
              precision_manufacturing
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            PoultrySmart <span className="text-primary">Admin</span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-2 font-medium">
            Système de gestion sécurisé
          </p>
        </div>

        {/* Card login */}
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/50 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40 p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Connexion administrateur
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-2 text-sm">
              Identifiants réservés au personnel autorisé
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-rose-500">
                error
              </span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Email professionnel
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
                  <span className="material-symbols-outlined">mail</span>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all dark:text-white placeholder:text-slate-400"
                  placeholder="admin@smartpoultry.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Mot de passe
                </label>
                <a
                  href="#"
                  className="text-sm text-primary hover:text-primary-dark font-medium transition-colors"
                >
                  Mot de passe oublié ?
                </a>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 dark:text-slate-400">
                  <span className="material-symbols-outlined">lock</span>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all dark:text-white placeholder:text-slate-400"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <span className="material-symbols-outlined">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            {/* Bouton Soumettre */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-dark hover:to-indigo-700 text-white font-semibold py-4 rounded-xl shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined animate-spin">
                    refresh
                  </span>
                  Connexion en cours...
                </>
              ) : (
                <>
                  Se connecter au Dashboard
                  <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>© {new Date().getFullYear()} PoultrySmart Admin</p>
            <p className="mt-1 text-xs">Système sécurisé • Version 2.4.0</p>
          </div>
        </div>
      </div>
    </div>
  );
}
