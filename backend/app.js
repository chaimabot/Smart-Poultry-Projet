const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { connectMqtt } = require("./services/mqttService");

// Charger les variables d'environnement
dotenv.config();

// Connexion à la base de données
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/smart-poultry")
  .then(() => console.log("[DB] Connecté à MongoDB"))
  .catch((err) => console.error("[DB] Erreur:", err));

// Initialiser MQTT
connectMqtt();

const app = express();

// Logger Simple
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Sécurité : En-têtes HTTP
app.use(helmet());

// Sécurité : CORS
app.use(cors());

// Sécurité : Rate Limiting
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // Limite chaque IP à 100 requêtes par fenêtre
  message:
    "Trop de requêtes créées à partir de cette IP, veuillez réessayer après 10 minutes",
});
app.use(limiter);

// Middleware Body Parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes
const authRoutes = require("./routes/auth");
const poulaillerRoutes = require("./routes/poulaillers");
const alertRoutes = require("./routes/alerts");
const systemConfigRoutes = require("./routes/systemConfig");
const moduleRoutes = require("./routes/modules");

app.use("/api/auth", authRoutes);
app.use("/api/poulaillers", poulaillerRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/system-config", systemConfigRoutes);
app.use("/api/modules", moduleRoutes);

// Route de base
app.get("/", (req, res) => {
  res.send("API Smart Poultry est en ligne");
});

// Gestion des erreurs 404
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: "Route non trouvée" });
});

// Middleware Global d'Erreur
app.use((err, req, res, next) => {
  console.error("Erreur Globale:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Erreur interne du serveur",
  });
});

// Port d'écoute
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

// Gestion des rejets de promesse non gérés
process.on("unhandledRejection", (err, promise) => {
  console.log(`Erreur: ${err.message}`);
  // Fermer le serveur et quitter le processus
  server.close(() => process.exit(1));
});
