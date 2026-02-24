const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

// Charger les variables d'environnement
dotenv.config();

// User Model
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "Veuillez ajouter un email"],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      "Veuillez ajouter un email valide",
    ],
  },
  password: {
    type: String,
    required: [true, "Veuillez ajouter un mot de passe"],
    minlength: 6,
    select: false,
  },
  firstName: {
    type: String,
    required: [true, "Veuillez ajouter un prénom"],
  },
  lastName: {
    type: String,
    required: [true, "Veuillez ajouter un nom"],
  },
  phone: {
    type: String,
    default: null,
  },
  photoUrl: {
    type: String,
    default: null,
  },
  role: {
    type: String,
    enum: ["eleveur", "admin"],
    default: "eleveur",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  inviteToken: {
    type: String,
    default: null,
  },
  inviteTokenExpires: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ["active", "pending", "archived"],
    default: "pending",
  },
  lastLogin: {
    type: Date,
    default: null,
  },
});

// Chiffrer le mot de passe avant de sauvegarder
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Méthode pour vérifier le mot de passe
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

const createAdmin = async () => {
  try {
    // Connexion à MongoDB
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/test";
    await mongoose.connect(mongoUri);
    console.log("[DB] Connecté à MongoDB");

    // Données de l'admin
    const adminData = {
      firstName: "Admin",
      lastName: "Principal",
      email: "admin@smartpoultry.com",
      password: "admin123",
      phone: "+33123456789",
      role: "admin",
      isActive: true,
      status: "active",
    };

    // Vérifier si l'admin existe déjà
    const existingAdmin = await User.findOne({ email: adminData.email });

    if (existingAdmin) {
      console.log("\n⚠️  Un administrateur existe déjà avec cet email!");
      console.log("   Email:", existingAdmin.email);
      console.log("   Rôle:", existingAdmin.role);
      console.log("   Actif:", existingAdmin.isActive);
      console.log(
        "\n💡 Pour changer le mot de passe, utilisez update-password.js",
      );
    } else {
      // Créer l'admin
      const admin = await User.create(adminData);
      console.log("\n✅ Administrateur créé avec succès!");
      console.log("   Email:", admin.email);
      console.log("   Mot de passe: admin123");
      console.log("   Rôle:", admin.role);
    }
  } catch (err) {
    console.error("\n❌ Erreur:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\n[DB] Déconnecté de MongoDB");
  }
};

createAdmin();
