import api from "./api";
import {
  secureGet,
  secureSet,
  secureRemove,
  secureClearAll,
} from "./secureStorage";

export const login = async (email, password) => {
  try {
    const response = await api.post("/auth/login", { email, password });
    if (response.data.token) {
      // ✅ Store token securely (encrypted)
      await secureSet("userToken", response.data.token);
      // User data can be in regular storage
      await secureSet("userData", JSON.stringify(response.data.user));
    }
    return response.data;
  } catch (error) {
    throw error.response
      ? error.response.data
      : { error: "Erreur réseau ou serveur" };
  }
};

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
      // ✅ Store token securely (encrypted)
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

export const getMe = async () => {
  try {
    const response = await api.get("/auth/me");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const getUserData = async () => {
  const data = await secureGet("userData");
  return data ? JSON.parse(data) : null;
};

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

export const updatePassword = async (passwordData) => {
  try {
    const response = await api.put("/auth/updatepassword", passwordData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const logout = async () => {
  // ✅ Clear all data securely
  await secureRemove("userToken");
  await secureRemove("userData");
};

export const checkAuth = async () => {
  // ✅ Check token from secure storage
  const token = await secureGet("userToken");
  return !!token;
};
