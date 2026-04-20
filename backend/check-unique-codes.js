const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();
const Poulailler = require("./models/Poulailler");

async function check() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/smart-poultry",
    );

    const count = await Poulailler.countDocuments({
      $or: [{ uniqueCode: null }, { uniqueCode: { $exists: false } }],
    });
    console.log("✓ Poulaillers sans uniqueCode:", count);

    const all = await Poulailler.find().select("name uniqueCode _id");
    console.log("\n✓ Tous les poulaillers:");
    all.forEach((p) =>
      console.log("  -", p.name, "→", p.uniqueCode || "NONE", `(${p._id})`),
    );

    process.exit(0);
  } catch (err) {
    console.error("✗ Erreur:", err.message);
    process.exit(1);
  }
}

check();
