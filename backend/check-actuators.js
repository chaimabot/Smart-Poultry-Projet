const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();
const Poulailler = require("./models/Poulailler");

async function check() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/smart-poultry",
    );

    const poulaillers = await Poulailler.find().select("name actuatorStates");
    console.log("\n✓ État des actionneurs:\n");
    poulaillers.forEach((p) => {
      console.log(`${p.name}:`);
      console.log(
        `  Ventilation: status=${p.actuatorStates.ventilation.status}, mode=${p.actuatorStates.ventilation.mode}`,
      );
      console.log(
        `  Lampe: status=${p.actuatorStates.lamp.status}, mode=${p.actuatorStates.lamp.mode}`,
      );
      console.log(
        `  Porte: status=${p.actuatorStates.door.status}, mode=${p.actuatorStates.door.mode}`,
      );
      console.log("");
    });

    process.exit(0);
  } catch (err) {
    console.error("✗ Erreur:", err.message);
    process.exit(1);
  }
}

check();
