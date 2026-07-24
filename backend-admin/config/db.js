"use strict";

const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost/test",
      {
        // ✅ Garde la connexion vivante
        heartbeatFrequencyMS: 10000, // ping MongoDB toutes les 10s
        socketTimeoutMS: 45000, // coupe un socket inactif après 45s
        connectTimeoutMS: 10000, // 10s max pour se connecter
        serverSelectionTimeoutMS: 10000, // 10s pour trouver un serveur dispo

        // ✅ Pool de connexions
        maxPoolSize: 10,
        minPoolSize: 2, // garde 2 connexions toujours ouvertes
      },
    );

    console.log(`[DB] MongoDB Connecté: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[DB] Erreur de connexion: ${error.message}`);
    process.exit(1);
  }
};

// ✅ Logs des événements de connexion
mongoose.connection.on("disconnected", () => {
  console.warn("[DB] Déconnecté — reconnexion automatique en cours...");
});

mongoose.connection.on("reconnected", () => {
  console.log("[DB] Reconnecté avec succès ✓");
});

mongoose.connection.on("error", (err) => {
  console.error("[DB] Erreur Mongoose:", err.message);
});

// ✅ Fermeture propre à l'arrêt du serveur
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("[DB] Connexion fermée proprement");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await mongoose.connection.close();
  console.log("[DB] Connexion fermée proprement");
  process.exit(0);
});

module.exports = connectDB;
