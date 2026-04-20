import axios from "axios";
import { secureGet } from "./secureStorage";
import { API_URL } from "../config/config";

// Crée une instance Axios avec configuration de base (URL, timeout, headers)
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Ajoute automatiquement le token JWT dans chaque requête envoyée au backend
api.interceptors.request.use(
  async (config) => {
    const token = await secureGet("userToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export default api;
