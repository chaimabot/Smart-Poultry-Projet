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

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(requestLogger);
app.use(helmet());

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || origin === "null") {
      return callback(null, true);
    }
    const allowedOrigins = [
      "http://localhost:19000",
      "http://localhost:8081",
      "http://127.0.0.1:19000",
      "http://192.168.1.100:19000",
      "http://localhost:5500",
      process.env.MOBILE_APP_URL,
      "https://platfomsmartpoultry.netlify.app",
      "https://platform-jksv2jf2r-chaimabots-projects.vercel.app",
      "https://smartpoultrychaima.vercel.app",
      "https://smart-poultry-reset.vercel.app",
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

const limiter = rateLimit({
  windowMs: 10 * 60 * 10,
  max: 10000,
  message:
    "Trop de requêtes créées à partir de cette IP, veuillez réessayer après 10 minutes",
});
app.use(limiter);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ============================================================
// CHARGEMENT DES ROUTES
// ============================================================
let authRoutes,
  poulaillerRoutes,
  alertRoutes,
  systemConfigRoutes,
  modulesRoutes,
  pompeRoutes,
  lampeRoutes,
  ventilateurRoutes,
  porteRoutes,
  devicesRoutes,
  wifi; // ← nouveau

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
  console.log("[ROUTES] Attempting to load lampe routes...");
  lampeRoutes = require("./routes/lampe");
  console.log("[ROUTES] ✓ lampeRoutes loaded successfully");
} catch (e) {
  console.error("[ROUTES] ✗ lampe fail - FULL ERROR:", e);
  console.error("[ROUTES] Stack:", e.stack);
  console.error(
    "[ROUTES] Checking files: ./routes/lampe.js exists?",
    require("fs").existsSync("./routes/lampe.js"),
  );
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

// ── Wifi ──────────────────────────────────────────────────
try {
  wifi = require("./routes/wifi");
  console.log("[ROUTES] ✓ wifi chargé");
} catch (e) {
  console.error("[ROUTES] wifi fail:", e.message);
}

// ── Porte ─────────────────────────────────────────────────
try {
  porteRoutes = require("./routes/porte");
  console.log("[ROUTES] ✓ porte chargé avec succès");
  app.use("/api/porte", porteRoutes);
} catch (e) {
  console.error("[ROUTES] ✗ porte échoué :", e.message);
  console.error("[ROUTES] Vérifiez que le fichier existe : ./routes/porte.js");
}

// ============================================================
// MONTAGE DES ROUTES
// ============================================================
if (authRoutes) app.use("/api/auth", authRoutes);
if (poulaillerRoutes) app.use("/api/poulaillers", poulaillerRoutes);
if (alertRoutes) app.use("/api/alerts", alertRoutes);
if (systemConfigRoutes) app.use("/api/system-config", systemConfigRoutes);
if (modulesRoutes) app.use("/api/modules", modulesRoutes);
if (pompeRoutes) app.use("/api/pompe", pompeRoutes);
if (devicesRoutes) app.use("/api/devices", devicesRoutes);
if (wifi) app.use("/api/wifi", wifi); // ← nouveau
if (ventilateurRoutes) app.use("/api/ventilateur", ventilateurRoutes);

if (lampeRoutes) {
  console.log("[ROUTES] Mounting /api/lampe ✓");
  app.use("/api/lampe", lampeRoutes);
} else {
  console.error("[ROUTES] ❌ SKIPPING /api/lampe mount - routes undefined!");
}

// ── AI Routes ─────────────────────────────────────────────────────────────────
// ✅ FIX : le check "typeof aiRoutes.use !== function" était incorrect et
//    masquait toute erreur de chargement (ex: module manquant dans aiRoute.js).
//    Désormais le stack complet est loggé pour débogage sur Render.
try {
  const aiRoutes = require("./routes/aiRoute");
  app.use("/api/ai", aiRoutes);
  console.log("[ROUTES] ✓ /api/ai monté avec succès");
} catch (e) {
  console.error("[ROUTES] ✗ /api/ai ÉCHEC — stack complet :");
  console.error(e.stack || e.message);
}
try {
  const inviteRoutes = require("./routes/invite");
  app.use("/api/invite", inviteRoutes);
  console.log("[ROUTES] ✓ invite chargé");
} catch (e) {
  console.error("[ROUTES] invite fail:", e.message);
}

// ============================================================
// ROUTES DE BASE
// ============================================================
app.get("/", (req, res) => {
  res.send("API Smart Poultry est en ligne");
});

// ✅ Route de diagnostic — vérifie quelles routes sont montées (utile sur Render)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    routes: [
      "/api/auth",
      "/api/poulaillers",
      "/api/ai",
      "/api/devices",
      "/api/alerts",
    ],
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/upload-image", (req, res) => {
  console.log("IMAGE RECUE");
  res.json({ success: true });
});

// 404
app.use((req, res, next) => {
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

// ============================================================
// SERVEUR HTTP + SOCKET.IO
// ============================================================
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

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

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication token required"));
  }
  next();
});

io.on("connection", (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  socket.on("joinPoulailler", (poulaillerId) => {
    socket.join(`poulailler:${poulaillerId}`);
    console.log(
      `[SOCKET] Client ${socket.id} joined poulailler: ${poulaillerId}`,
    );
  });

  socket.on("leavePoulailler", (poulaillerId) => {
    socket.leave(`poulailler:${poulaillerId}`);
    console.log(
      `[SOCKET] Client ${socket.id} left poulailler: ${poulaillerId}`,
    );
  });

  socket.on("command", (data) => {
    console.log(`[SOCKET] Command received:`, data);
  });

  socket.on("disconnect", () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
  });
});

module.exports.io = io;

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

server.on("error", (err) => {
  console.error(`[SERVER] Erreur: ${err.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (err, promise) => {
  console.log(`Erreur: ${err.message}`);
  server.close(() => process.exit(1));
});
