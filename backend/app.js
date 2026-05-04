const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");

//  Winston logger
const logger = require("./utils/logger");
const requestLogger = require("./middlewares/requestLogger");

const { connectMqtt } = require("./services/mqttService");
// Rate limiting - évite authLimiter comme demandé
const {
  perUserLimiter,
  criticalLimiter,
} = require("./middlewares/rateLimiter");

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
    if (!origin || origin === "null") {
      return callback(null, true);
    }
    const allowedOrigins = [
      "http://localhost:19000", // Expo dev
      "http://localhost:8081", // React Native debugger
      "http://127.0.0.1:19000",
      "http://192.168.1.100:19000",
      "http://localhost:5500",
      process.env.MOBILE_APP_URL,
      "https://platfomsmartpoultry.netlify.app",
      "https://platform-jksv2jf2r-chaimabots-projects.vercel.app",
      "https://smartpoultrychaima.vercel.app",
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
  windowMs: 10 * 60 * 10, // 10 minutes
  max: 10000, // Limite chaque IP à 100 requêtes par fenêtre
  message:
    "Trop de requêtes créées à partir de cette IP, veuillez réessayer après 10 minutes",
});
app.use(limiter);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes - SAFE LOAD
let authRoutes,
  poulaillerRoutes,
  alertRoutes,
  systemConfigRoutes,
  modulesRoutes,
  pompeRoutes,
  lampeRoutes,
  ventilateurRoutes,
  porteRoutes,
  devicesRoutes;
try {
  authRoutes = require("./routes/auth");
} catch (e) {
  console.error("[ROUTES] auth fail:", e.message);
}
poulaillerRoutes = require("./routes/poulaillers");
console.log("[ROUTES] ✓ poulaillers chargé");
try {
  alertRoutes = require("./routes/alerts");
} catch (e) {
  console.error("[ROUTES] alerts fail:", e.message);
}
try {
  systemConfigRoutes = require("./routes/systemConfig");
} catch (e) {
  console.error("[ROUTES] systemConfig fail:", e.message);
}
try {
  modulesRoutes = require("./routes/modules");
} catch (e) {
  console.error("[ROUTES] modules fail:", e.message);
}
try {
  pompeRoutes = require("./routes/pompe");
} catch (e) {
  console.error("[ROUTES] pompe fail:", e.message);
}
try {
  lampeRoutes = require("./routes/lampe");
} catch (e) {
  console.error("[ROUTES] lampe fail:", e.message);
}
try {
  ventilateurRoutes = require("./routes/ventilateur");
} catch (e) {
  console.error("[ROUTES] ventilateur fail:", e.message);
}
try {
  devicesRoutes = require("./routes/devices");
} catch (e) {
  console.error("[ROUTES] devices fail:", e.message);
}
// ==================== CHARGEMENT ROUTE PORTE ====================
try {
  porteRoutes = require("./routes/porte");
  console.log("[ROUTES] ✓ porte chargé avec succès");
  app.use("/api/porte", porteRoutes);
} catch (e) {
  console.error("[ROUTES] ✗ porte échoué :", e.message);
  console.error("[ROUTES] Vérifiez que le fichier existe : ./routes/porte.js");
}
if (authRoutes) app.use("/api/auth", authRoutes);
if (poulaillerRoutes) app.use("/api/poulaillers", poulaillerRoutes);
if (alertRoutes) app.use("/api/alerts", alertRoutes);
if (systemConfigRoutes) app.use("/api/system-config", systemConfigRoutes);
if (modulesRoutes) app.use("/api/modules", modulesRoutes);
if (pompeRoutes) app.use("/api/pompe", pompeRoutes);
if (lampeRoutes) app.use("/api/lampe", lampeRoutes);
if (ventilateurRoutes) app.use("/api/ventilateur", ventilateurRoutes);
if (devicesRoutes) app.use("/api/devices", devicesRoutes);

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

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new SocketIOServer(server, {
  cors: {
    origin: [
      "http://localhost:19000",
      "http://localhost:8081",
      "http://127.0.0.1:19000",
      "http://192.168.1.100:19000",

      process.env.MOBILE_APP_URL,
      "https://platfomsmartpoultry.netlify.app",
    ].filter(Boolean),
    credentials: true,
  },
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication token required"));
  }
  // Token validation can be added here
  next();
});

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  // Join poulailler room
  socket.on("joinPoulailler", (poulaillerId) => {
    socket.join(`poulailler:${poulaillerId}`);
    console.log(
      `[SOCKET] Client ${socket.id} joined poulailler: ${poulaillerId}`,
    );
  });

  // Leave poulailler room
  socket.on("leavePoulailler", (poulaillerId) => {
    socket.leave(`poulailler:${poulaillerId}`);
    console.log(
      `[SOCKET] Client ${socket.id} left poulailler: ${poulaillerId}`,
    );
  });

  // Handle commands
  socket.on("command", (data) => {
    console.log(`[SOCKET] Command received:`, data);
    // Command handling can be implemented here
  });

  // Disconnect handler
  socket.on("disconnect", () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
  });
});

// Export io for use in other modules
module.exports.io = io;

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

server.on("error", (err) => {
  console.error(`[SERVER] Erreur: ${err.message}`);
  process.exit(1);
});

// Gestion des rejets de promesse non gérés
process.on("unhandledRejection", (err, promise) => {
  console.log(`Erreur: ${err.message}`);
  server.close(() => process.exit(1));
});
