// ============================================================
// SCRIPT : Génération d'alertes de test
// USAGE  : node seeder_alerts.js <poultryId>
// EXEMPLE: node seeder_alerts.js 69922a3125a75caca0afedcb
// ============================================================

const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const alertSchema = new mongoose.Schema(
  {
    poulailler: {
      type: mongoose.Schema.ObjectId,
      ref: "Poulailler",
      required: true,
    },
    parameter: {
      type: String,
      enum: ["temperature", "humidity", "co2", "nh3", "dust", "waterLevel"],
    },
    value: Number,
    threshold: Number,
    direction: { type: String, enum: ["above", "below"] },
    severity: {
      type: String,
      enum: ["warning", "critical"],
      default: "warning",
    },
    read: { type: Boolean, default: false },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const Alert = mongoose.models.Alert || mongoose.model("Alert", alertSchema);

const poultryId = process.argv[2];
if (!poultryId || !mongoose.Types.ObjectId.isValid(poultryId)) {
  console.error("❌  ID invalide. Usage: node seeder_alerts.js <poultryId>");
  process.exit(1);
}

const SAMPLES = [
  {
    parameter: "temperature",
    value: 32.5,
    threshold: 28,
    direction: "above",
    severity: "critical",
    read: false,
  },
  {
    parameter: "temperature",
    value: 15.2,
    threshold: 18,
    direction: "below",
    severity: "warning",
    read: false,
  },
  {
    parameter: "humidity",
    value: 85,
    threshold: 70,
    direction: "above",
    severity: "warning",
    read: false,
  },
  {
    parameter: "humidity",
    value: 32,
    threshold: 40,
    direction: "below",
    severity: "warning",
    read: true,
  },
  {
    parameter: "co2",
    value: 1850,
    threshold: 1500,
    direction: "above",
    severity: "critical",
    read: false,
  },
  {
    parameter: "co2",
    value: 1620,
    threshold: 1500,
    direction: "above",
    severity: "warning",
    read: true,
  },
  {
    parameter: "nh3",
    value: 28,
    threshold: 25,
    direction: "above",
    severity: "warning",
    read: false,
  },
  {
    parameter: "nh3",
    value: 35,
    threshold: 25,
    direction: "above",
    severity: "critical",
    read: true,
  },
  {
    parameter: "dust",
    value: 180,
    threshold: 150,
    direction: "above",
    severity: "warning",
    read: false,
  },
  {
    parameter: "waterLevel",
    value: 15,
    threshold: 20,
    direction: "below",
    severity: "critical",
    read: false,
  },
  {
    parameter: "waterLevel",
    value: 18,
    threshold: 20,
    direction: "below",
    severity: "warning",
    read: true,
  },
  {
    parameter: "temperature",
    value: 29.8,
    threshold: 28,
    direction: "above",
    severity: "warning",
    read: true,
  },
];

async function seed() {
  try {
    const mongoUri =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      process.env.MONGO_URL ||
      process.env.DATABASE_URL ||
      process.env.DB_URI;

    if (!mongoUri) {
      console.error("❌  Variable MongoDB introuvable dans .env");
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("✅  MongoDB connecté");

    const id = new mongoose.Types.ObjectId(poultryId);

    const deleted = await Alert.deleteMany({ poulailler: id });
    console.log(`🗑️   ${deleted.deletedCount} alerte(s) supprimée(s)`);

    const now = Date.now();
    const alerts = SAMPLES.map((s, i) => ({
      ...s,
      poulailler: id,
      createdAt: new Date(now - i * 2 * 60 * 60 * 1000), // espacées de 2h
      updatedAt: new Date(now - i * 2 * 60 * 60 * 1000),
    }));

    await Alert.insertMany(alerts);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`✅  ${alerts.length} alertes insérées !`);
    console.log(`    • Non lues  : ${alerts.filter((a) => !a.read).length}`);
    console.log(`    • Lues      : ${alerts.filter((a) => a.read).length}`);
    console.log(
      `    • Critiques : ${alerts.filter((a) => a.severity === "critical").length}`,
    );
    console.log(
      `    • Attention : ${alerts.filter((a) => a.severity === "warning").length}`,
    );
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n🧪  Test Postman :");
    console.log(`    GET  /api/alerts?poulaillerId=${poultryId}`);
    console.log(`    GET  /api/alerts/stats?poulaillerId=${poultryId}`);
    console.log(
      `    POST /api/alerts/read  body: { "poulaillerId": "${poultryId}" }`,
    );
  } catch (err) {
    console.error("❌  Erreur :", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌  MongoDB déconnecté");
    process.exit(0);
  }
}

seed();
