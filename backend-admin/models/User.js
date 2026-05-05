const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
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
      select: false, // Ne pas renvoyer le mot de passe par défaut
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
    // Invitation system fields
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
      enum: ["pending", "active", "inactive", "archived"],
      default: "pending",
    },
    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Chiffrer le mot de passe avant de sauvegarder - REMOVED to fix toggle status
// userSchema.pre("save", function (next) { ... }); // Commented out - causes "next is not a function" error

// Méthode pour vérifier le mot de passe
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
