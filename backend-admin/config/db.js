const mongoose = require("mongoose");

// Fonction de connexion à la base de données MongoDB
const connectDB = async () => {
  try {
    // Connexion à MongoDB sans options dépréciées (les drivers récents gèrent cela automatiquement)
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost/test",
    );

    console.log(`MongoDB Connecté: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Erreur de connexion MongoDB: ${error.message}`);
    process.exit(1); // Arrêter le processus avec échec
  }
};

module.exports = connectDB;
