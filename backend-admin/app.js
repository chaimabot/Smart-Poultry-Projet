const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Charger les variables d'environnement
dotenv.config();

// Connexion à la base de données
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/test")
  .then(() => console.log("[DB] Connecté à MongoDB"))
  .catch((err) => console.error("[DB] Erreur:", err));

const app = express();

// Logger Simple
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Sécurité : En-têtes HTTP
app.use(helmet());

// Sécurité : CORS
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  }),
);

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
const adminRoutes = require("./routes/admin");
const poulaillersRoutes = require("./routes/poulaillers");
const eleveursRoutes = require("./routes/eleveurs");
const modulesRoutes = require("./routes/modules");
const alertesRoutes = require("./routes/alertes");
const logsRoutes = require("./routes/logs");
const rapportsRoutes = require("./routes/rapports");

app.use("/api/admin/dashboard", require("./routes/dashboard"));
app.use("/api/admin/parametres", require("./routes/parametres"));
app.use("/api/admin", adminRoutes); // Routes admin (default-thresholds)
app.use("/api/admin/poulaillers", require("./routes/poulaillersAdmin")); // Routes poulaillers admin
app.use("/api/admin/utilisateurs", require("./routes/utilisateurs")); // Routes utilisateurs
app.use("/api/admin/eleveurs", eleveursRoutes); // Routes breeders
app.use("/api/admin/modules", modulesRoutes); // Routes modules
app.use("/api/admin/alertes", alertesRoutes); // Routes alertes
app.use("/api/admin/logs", logsRoutes); // Routes logs
app.use("/api/admin/rapports", rapportsRoutes); // Routes rapports
app.use("/api/poulaillers", poulaillersRoutes); // Routes poulaillers (seuils)
app.use("/api/auth", authRoutes);

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
const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

// Gestion des rejets de promesse non gérés
process.on("unhandledRejection", (err, promise) => {
  console.log(`Erreur: ${err.message}`);
  // Fermer le serveur et quitter le processus
  server.close(() => process.exit(1));
});
