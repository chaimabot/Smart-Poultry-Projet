const User = require("../models/User");

exports.verifyInvite = async (req, res) => {
  const { token } = req.query;
  if (!token)
    return res.status(400).json({ success: false, error: "Token manquant" });

  try {
    const user = await User.findOne({
      inviteToken: token,
      inviteTokenExpires: { $gt: new Date() },
    });

    if (!user)
      return res
        .status(400)
        .json({ success: false, error: "Lien expiré ou invalide" });

    res.json({
      success: true,
      data: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @route POST /api/invite/complete
exports.completeInvite = async (req, res) => {
  const { token, password, firstName, lastName } = req.body;

  if (!token || !password) {
    return res
      .status(400)
      .json({ success: false, error: "Token et mot de passe requis" });
  }

  try {
    const user = await User.findOne({
      inviteToken: token,
      inviteTokenExpires: { $gt: new Date() },
    });

    if (!user)
      return res
        .status(400)
        .json({ success: false, error: "Lien expiré ou invalide" });

    user.password = password; // le pre-save hash automatiquement
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.isActive = true;
    user.inviteToken = null;
    user.inviteTokenExpires = null;
    await user.save();

    res.json({ success: true, message: "Mot de passe défini avec succès" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};
