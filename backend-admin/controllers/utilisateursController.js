// controllers/utilisateursController.js
const User = require("../models/User");
const Poulailler = require("../models/Poulailler");

// @desc    Liste des utilisateurs (tous les rôles)
// @route   GET /api/admin/utilisateurs
// @access  Private/Admin
exports.getUtilisateurs = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;

    const query = {};

    if (role) {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password -inviteToken -inviteTokenExpires")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Enrichir avec le nombre de poulaillers pour les breeders
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        let poulaillersCount = 0;
        if (user.role === "eleveur") {
          poulaillersCount = await Poulailler.countDocuments({
            owner: user._id,
            isArchived: false,
          });
        }
        return {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          isActive: user.isActive,
          lastLogin: user.lastLogin,
          poulaillersCount,
          createdAt: user.createdAt,
        };
      }),
    );

    res.json({
      success: true,
      data: enrichedUsers,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[GET USERS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération",
    });
  }
};

// @desc    Obtenir un utilisateur par ID
// @route   GET /api/admin/utilisateurs/:id
// @access  Private/Admin
exports.getUtilisateurById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password -inviteToken -inviteTokenExpires",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error("[GET USER BY ID ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération",
    });
  }
};

// @desc    Basculer le statut d'un utilisateur (activer/désactiver)
// @route   PUT /api/admin/utilisateurs/:id/toggle-status
// @access  Private/Admin
exports.toggleStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }

    // Inverser le statut
    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: user.isActive ? "Utilisateur activé" : "Utilisateur désactivé",
      data: {
        id: user._id,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error("[TOGGLE STATUS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour",
    });
  }
};

// @desc    Supprimer DÉFINITIVEMENT un utilisateur (admin)
// @route   DELETE /api/admin/utilisateurs/:id
// @access  Private/Admin
exports.deleteUtilisateur = async (req, res) => {
  try {
    console.log(
      "[DELETE USER] Starting PERMANENT deletion for ID:",
      req.params.id,
    );

    const user = await User.findById(req.params.id);
    console.log("[DELETE USER] Found user:", user);

    if (!user) {
      console.log("[DELETE USER] User not found");
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }

    // Si c'est un élèveur, on ne peut pas le supprimer via cette route
    if (user.role === "eleveur") {
      console.log("[DELETE USER] Cannot delete eleveur via this route");
      return res.status(400).json({
        success: false,
        error:
          "Pour supprimer un élèveur, utilisez la route /api/admin/eleveurs/:id",
      });
    }

    // SUPPRIMER DÉFINITIVEMENT l'utilisateur
    console.log("[DELETE USER] Permanently deleting user...");
    await User.findByIdAndDelete(req.params.id);
    console.log("[DELETE USER] User permanently deleted!");

    res.json({
      success: true,
      message: "Utilisateur supprimé définitivement",
    });
  } catch (err) {
    console.error("[DELETE USER ERROR]", err);
    console.error("[DELETE USER ERROR STACK]", err.stack);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la suppression: " + err.message,
    });
  }
};
