// hooks/useAuth.js
// ============================================================
// Hook d'authentification — Smart Poultry
// S'appuie sur authService (secureStorage + api axios)
// ============================================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  login as authLogin,
  register as authRegister,
  logout as authLogout,
  checkAuth,
  getUserData,
  getMe,
  updateProfile as authUpdateProfile,
  updatePassword as authUpdatePassword,
} from "../services/authService";
import { secureGet } from "../services/secureStorage";

// ── Context ──────────────────────────────────────────────────
const AuthContext = createContext(null);

// ── Provider ─────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // chargement initial
  const [error, setError] = useState(null);

  // ── Chargement initial depuis secureStorage ──────────────────
  useEffect(() => {
    (async () => {
      try {
        const isAuth = await checkAuth();
        if (isAuth) {
          const [storedToken, storedUser] = await Promise.all([
            secureGet("userToken"),
            getUserData(),
          ]);
          setToken(storedToken);
          setUser(storedUser);
        }
      } catch (e) {
        console.warn("[useAuth] Erreur chargement initial :", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Login ────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const data = await authLogin(email, password);
      // authLogin stocke déjà le token + user dans secureStorage
      const storedToken = await secureGet("userToken");
      setToken(storedToken);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (e) {
      const msg = e?.error || e?.message || "Connexion échouée";
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  // ── Register ─────────────────────────────────────────────────
  const register = useCallback(
    async (firstName, lastName, email, password, phone) => {
      setError(null);
      try {
        const data = await authRegister(
          firstName,
          lastName,
          email,
          password,
          phone,
        );
        const storedToken = await secureGet("userToken");
        setToken(storedToken);
        setUser(data.user);
        return { success: true, user: data.user };
      } catch (e) {
        const msg = e?.error || e?.message || "Inscription échouée";
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [],
  );

  // ── Logout ───────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await authLogout(); // supprime userToken + userData de secureStorage
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  // ── Refresh profil depuis l'API ──────────────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const data = await getMe();
      const fresh = data?.user || data?.data || data;
      setUser(fresh);
      return fresh;
    } catch (e) {
      console.warn("[useAuth] Impossible de rafraîchir le profil :", e);
    }
  }, []);

  // ── Mise à jour du profil ────────────────────────────────────
  const updateProfile = useCallback(async (userData) => {
    setError(null);
    try {
      const data = await authUpdateProfile(userData);
      if (data?.user) setUser(data.user);
      return { success: true };
    } catch (e) {
      const msg = e?.error || e?.message || "Mise à jour échouée";
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  // ── Changement de mot de passe ───────────────────────────────
  const updatePassword = useCallback(async (passwordData) => {
    setError(null);
    try {
      await authUpdatePassword(passwordData);
      return { success: true };
    } catch (e) {
      const msg = e?.error || e?.message || "Changement de mot de passe échoué";
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  // ── Valeur du contexte ───────────────────────────────────────
  const value = {
    token, // JWT — utilisé dans AIAnalysisScreen
    user,
    loading,
    error,
    isAuthenticated: !!token,

    login,
    logout,
    register,
    refreshUser,
    updateProfile,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      "useAuth doit être utilisé à l'intérieur d'un <AuthProvider>.\n" +
        "Assure-toi que <AuthProvider> entoure ton App dans App.js.",
    );
  }
  return ctx;
}

export default useAuth;
