import api from "./api";
import {
  secureGet,
  secureSet,
  secureRemove,
  secureClearAll,
} from "./secureStorage";

// Permet à l’utilisateur de se connecter et stocke ses informations
export const login = async (email, password) => {
  try {
    const response = await api.post("/auth/login", { email, password });
    if (response.data.token) {
      await secureSet("userToken", response.data.token);
      await secureSet("userData", JSON.stringify(response.data.user));
    }
    return response.data;
  } catch (error) {
    throw error.response
      ? error.response.data
      : { error: "Erreur réseau ou serveur" };
  }
};

// Crée un nouveau compte utilisateur et stocke ses informations
export const register = async (firstName, lastName, email, password, phone) => {
  try {
    const response = await api.post("/auth/register", {
      firstName,
      lastName,
      email,
      password,
      phone,
    });
    if (response.data.token) {
      await secureSet("userToken", response.data.token);
      await secureSet("userData", JSON.stringify(response.data.user));
    }
    return response.data;
  } catch (error) {
    throw error.response
      ? error.response.data
      : { error: "Erreur réseau ou serveur" };
  }
};

// Récupère les informations du profil utilisateur connecté
export const getMe = async () => {
  try {
    const response = await api.get("/auth/me");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère les données utilisateur stockées localement
export const getUserData = async () => {
  const data = await secureGet("userData");
  return data ? JSON.parse(data) : null;
};

// Met à jour les informations du profil utilisateur
export const updateProfile = async (userData) => {
  try {
    const response = await api.put("/auth/updatedetails", userData);
    if (response.data.success) {
      await secureSet("userData", JSON.stringify(response.data.user));
    }
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Permet de changer le mot de passe utilisateur
export const updatePassword = async (passwordData) => {
  try {
    const response = await api.put("/auth/updatepassword", passwordData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Déconnecte l’utilisateur en supprimant ses données stockées
export const logout = async () => {
  await secureRemove("userToken");
  await secureRemove("userData");
};

// Vérifie si l’utilisateur est connecté (token موجود)
export const checkAuth = async () => {
  const token = await secureGet("userToken");
  return !!token;
};
