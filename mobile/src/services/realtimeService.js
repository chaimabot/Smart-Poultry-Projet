import io from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../config/config";

let socket = null;

// Établit la connexion Socket.io avec authentification via token
const connect = async (token) => {
  if (!token) throw new Error("Token required");

  // Supprime /api pour avoir l'URL de base du serveur (ex: http://192.168.1.3:5000)
  const url = API_URL.replace("/api", "");

  console.log("[SOCKET] Attempting connection to:", url);

  socket = io(url, {
    auth: { token },
    transports: ["websocket"], // Vous pouvez garder "websocket" ici, Socket.io gérera le protocole tout seul
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
  });

  return new Promise((resolve, reject) => {
    socket.on("connect", () => {
      console.log("[SOCKET] Mobile connected successfully");
      resolve(socket);
    });

    socket.on("connect_error", (err) => {
      console.warn("[SOCKET] Connect error details:", err.message);
      reject(err);
    });
  });
};

// Coupe la connexion Socket.io et libère la ressource
const disconnect = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    console.log("[SOCKET] Disconnected");
  }
};

// Rejoint une room poulailler pour recevoir ses données spécifiques
const joinPoulailler = (poulaillerId) => {
  if (socket && socket.connected) {
    socket.emit("joinPoulailler", poulaillerId);
  }
};

// Quitte la room poulailler pour arrêter la réception des données
const leavePoulailler = (poulaillerId) => {
  if (socket && socket.connected) {
    socket.emit("leavePoulailler", poulaillerId);
  }
};

// Envoie une commande (porte, ventilateur, etc.) au backend
const sendCommand = (poulaillerId, command, value = null) => {
  if (socket && socket.connected) {
    socket.emit("command", { poulaillerId, command, value });
    console.log("[SOCKET] Command sent:", { poulaillerId, command, value });
  } else {
    console.warn("[SOCKET] Not connected, command ignored");
  }
};

// Écoute les mesures des capteurs en temps réel
const onMeasures = (callback) => {
  if (socket) {
    socket.on("measures", (data) => {
      callback(data);
    });
  }
};

// Écoute l’état des actionneurs (porte, ventilateur, lampe)
const onStatus = (callback) => {
  if (socket) {
    socket.on("status", callback);
  }
};

// Retourne true si le socket est actuellement connecté
const getConnectionState = () => socket && socket.connected;

export {
  connect,
  disconnect,
  joinPoulailler,
  leavePoulailler,
  sendCommand,
  onMeasures,
  onStatus,
  getConnectionState,
};

export default {
  connect,
  disconnect,
  joinPoulailler,
  leavePoulailler,
  sendCommand,
  onMeasures,
  onStatus,
  getConnectionState,
};
