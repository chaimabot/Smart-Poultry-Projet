const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const User = require("./models/User");
const Poulailler = require("./models/Poulailler");
const Dossier = require("./models/Dossier");

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/test")
  .then(() => console.log("[DB] Connecté à MongoDB - test DB"))
  .catch((err) => console.error("[DB] Erreur:", err));

async function seed() {
  try {
    // Supprimer si existants (évite dup)
    await User.deleteOne({ email: "ahmed.benali@example.com" });
    await Dossier.deleteOne({ contractNumber: "CTR-001" });

    // 1. Créer utilisateur éleveur
    const eleveur = await User.create({
      firstName: "Ahmed",
      lastName: "Ben Ali",
      email: "ahmed.benali@example.com",
      phone: "22123456",
      password: "password123",
      role: "eleveur",
      isActive: true,
      status: "pending",
    });

    // 2. Créer poulailler
    const poulailler = await Poulailler.create({
      owner: eleveur._id,
      name: "Poulailler Nord",
      type: "pondeuses",
      animalCount: 200,
      description: "Poulailler de test",
      location: "Ben Arous",
      status: "connecte",
    });

    // 3. Créer dossier
    const dossier = await Dossier.create({
      eleveur: eleveur._id,
      poulailler: poulailler._id,
      totalAmount: 5000,
      advanceAmount: 1000,
      remainedAmount: 4000,
      status: "EN_ATTENTE",
      contractNumber: "CTR-001",
    });

    console.log("✅ Seed réussi dans 'test' DB:", {
      userId: eleveur._id,
      poulaillerId: poulailler._id,
      dossierId: dossier._id,
    });
  } catch (error) {
    console.error("❌ Seed erreur:", error);
  } finally {
    mongoose.connection.close();
  }
}

seed();
