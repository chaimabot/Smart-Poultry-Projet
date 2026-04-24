const mongoose = require("mongoose");
require("dotenv").config();

async function dropIndex() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[DB] Connecté");

  try {
    await mongoose.connection.collection("modules").dropIndex("serialNumber_1");
    console.log("[OK] Index serialNumber_1 supprimé");
  } catch (err) {
    if (
      err.codeName === "NamespaceNotFound" ||
      err.message.includes("index not found")
    ) {
      console.log("[INFO] Index serialNumber_1 n'existe pas");
    } else {
      console.error("[ERR]", err.message);
    }
  }

  await mongoose.disconnect();
  console.log("[DB] Déconnecté");
}

dropIndex();
