/**
 * Migration: Ajouter uniqueCode à tous les poulaillers existants sans code
 * Utilisation: node migrations/addUniqueCodesToExistingPoulaillers.js
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const Poulailler = require("../models/Poulailler");

function generateUniqueCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function migrate() {
  try {
    // Connexion à MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/smart-poultry",
    );
    console.log("[MIGRATION] Connecté à MongoDB");

    // Trouver tous les poulaillers sans uniqueCode
    const poulaillersSansCode = await Poulailler.find({
      $or: [{ uniqueCode: null }, { uniqueCode: { $exists: false } }],
    });

    console.log(
      `[MIGRATION] Trouvé ${poulaillersSansCode.length} poulaillers sans uniqueCode`,
    );

    if (poulaillersSansCode.length === 0) {
      console.log("[MIGRATION] Aucun poulailler à migrer");
      process.exit(0);
    }

    // Ajouter un uniqueCode unique à chacun
    let updated = 0;
    for (const poulailler of poulaillersSansCode) {
      let uniqueCode;
      let isUnique = false;

      // S'assurer que le code est vraiment unique
      while (!isUnique) {
        uniqueCode = generateUniqueCode();
        const exists = await Poulailler.findOne({ uniqueCode });
        isUnique = !exists;
      }

      poulailler.uniqueCode = uniqueCode;
      await poulailler.save();
      updated++;

      console.log(`✅ ${poulailler.name} (${poulailler._id}) → ${uniqueCode}`);
    }

    console.log(
      `\n[MIGRATION] Migration complétée : ${updated} poulaillers mis à jour`,
    );
    process.exit(0);
  } catch (error) {
    console.error("[MIGRATION] Erreur:", error);
    process.exit(1);
  }
}

migrate();
