const dotenv = require("dotenv");
dotenv.config(); // ← DOIT ÊTRE EN PREMIER, avant tout autre require()

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// ✅ NEW: Winston logger
const logger = require("./utils/logger");
const requestLogger = require("./middlewares/requestLogger");

const { connectMqtt } = require("./services/mqttService");
// ✅ NEW: Per-user rate limiting
const { perUserLimiter, authLimiter, criticalLimiter } = require("./middlewares/rateLimiter");

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

// ✅ NEW: Winston request logging (replaces console.log)
app.use(requestLogger);

// Sécurité : En-têtes HTTP
app.use(helmet());

// Sécurité : CORS - Whitelist origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "http://localhost:19000", // Expo dev
      "http://localhost:8081", // React Native debugger
      "http://127.0.0.1:19000",
      "http://192.168.1.100:19000", // Local network
      process.env.MOBILE_APP_URL, // Production mobile
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] ⚠️ Blocked origin: ${origin}`);
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
};

app.use(cors(corsOptions));

// Sécurité : Rate Limiting
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // Limite chaque IP à 100 requêtes par fenêtre
  message:
    "Trop de requêtes créées à partir de cette IP, veuillez réessayer après 10 minutes",
});
app.use(limiter);

// ✅ NEW: Per-user rate limiting (after protect middleware on protected routes)
// This is applied on specific routes in their respective route files

// Middleware Body Parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes
const authRoutes = require("./routes/auth");
const poulaillerRoutes = require("./routes/poulaillers");
const alertRoutes = require("./routes/alerts");
const systemConfigRoutes = require("./routes/systemConfig");
const modulesRoutes = require("./routes/modules");

app.use("/api/auth", authRoutes);
app.use("/api/poulaillers", poulaillerRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/system-config", systemConfigRoutes);
app.use("/api/modules", modulesRoutes);

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
  server.close(() => process.exit(1));
});
