const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/test")
  .then(() => {
    console.log("Connecté à MongoDB");
    testDelete();
  })
  .catch((err) => console.error("Erreur de connexion:", err));

async function testDelete() {
  const User = require("./models/User");

  try {
    // Lister tous les utilisateurs
    const users = await User.find({}).select("-password");
    console.log("\n=== Tous les utilisateurs ===");
    users.forEach((u) => {
      console.log(
        `ID: ${u._id}, Email: ${u.email}, Role: ${u.role}, Status: ${u.status}`,
      );
    });

    // Tester la suppression d'un utilisateur
    if (users.length > 0) {
      const testUser = users[0];
      console.log(
        `\n=== Test suppression utilisateur ${testUser.email} (${testUser.role}) ===`,
      );

      // Simuler la suppression
      testUser.status = "archived";
      testUser.isActive = false;
      await testUser.save();

      console.log("Utilisateur archivé avec succès!");
      console.log(
        `Nouveau statut: ${testUser.status}, isActive: ${testUser.isActive}`,
      );
    }
  } catch (err) {
    console.error("Erreur:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\nDéconnecté de MongoDB");
  }
}
