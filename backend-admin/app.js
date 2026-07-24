const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");

// Créer le dossier uploads/contrats s'il n'existe pas
if (!fs.existsSync("uploads/contrats")) {
  fs.mkdirSync("uploads/contrats", { recursive: true });
}

// Session timeout middleware
const {
  updateActivity,
  checkSessionTimeout,
} = require("./middlewares/sessionTimeout");

// Charger les variables d'environnement
dotenv.config();

// Connexion à la base de données
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/test")
  .then(() => console.log("[DB] Connecté à MongoDB"))
  .catch((err) => console.error("[DB] Erreur:", err));

const app = express();

// Logger Simple (pour debug)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Sécurité : En-têtes HTTP
app.use(helmet());

// Sécurité : CORS - Whitelist origins
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:3000",
      "http://192.168.1.100:5173",
      process.env.WEB_ADMIN_URL,
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
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
  max: 100,
  message: "Trop de requêtes, réessaye dans 10 min",
});
//app.use(limiter);

// Body Parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Servir les fichiers uploadés
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Session Timeout
app.use(updateActivity);

// Routes
const modulesRoutes = require("./routes/modules");
app.use("/api/admin/modules", modulesRoutes);

const dashboardRoutes = require("./routes/dashboard");
app.use("/api/admin/dashboard", dashboardRoutes);

const parametresRoutes = require("./routes/parametres");
app.use("/api/admin/parametres", parametresRoutes);

const poulaillersAdminRoutes = require("./routes/poulaillersAdmin");
app.use("/api/admin/poulaillers", poulaillersAdminRoutes);

const utilisateursRoutes = require("./routes/utilisateurs");
app.use("/api/admin/utilisateurs", utilisateursRoutes);

const eleveursRoutes = require("./routes/eleveurs");
app.use("/api/admin/eleveurs", eleveursRoutes);

const camerasRouter = require("./routes/cameras");
app.use("/api/admin/cameras", camerasRouter);

const alertesRoutes = require("./routes/alertes");
app.use("/api/admin/alertes", alertesRoutes);

const logsRoutes = require("./routes/logs");
app.use("/api/admin/logs", logsRoutes);

const rapportsRoutes = require("./routes/rapports");
app.use("/api/admin/rapports", rapportsRoutes);

const dossierRoutes = require("./routes/dossier");
app.use("/api/admin/dossiers", dossierRoutes);

const analysesIARoutes = require("./routes/analysesIA");
app.use("/api/admin/analyses-ia", analysesIARoutes);

// Route générique admin
const adminRoutes = require("./routes/admin");
app.use("/api/admin", adminRoutes);

// Autres routes
const poulaillersRoutes = require("./routes/poulaillers");
app.use("/api/poulaillers", poulaillersRoutes);

const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// Route de base
app.get("/", (req, res) => {
  res.send("API Smart Poultry est en ligne");
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route non trouvée" });
});

// Erreur globale
app.use((err, req, res, next) => {
  console.error("Erreur Globale:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Erreur interne du serveur",
  });
});

// Port
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

process.on("unhandledRejection", (err) => {
  console.log(`Erreur: ${err.message}`);
  server.close(() => process.exit(1));
});
