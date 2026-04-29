const mongoose = require("mongoose");
const Poulailler = require("../models/Poulailler");
const Dossier = require("../models/Dossier");

// ============================================================
// HELPERS
// ============================================================
function generateAutoName() {
  return (
    "Poulailler-" + Math.random().toString(36).substring(2, 6).toUpperCase()
  );
}

function generateUniqueCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function calculerDensite(animalCount, surface) {
  if (!animalCount || !surface || surface <= 0) return null;
  return parseFloat((animalCount / surface).toFixed(2));
}

function normalizeAttachments(attachments = []) {
  return attachments.map((f) => ({
    name: f.name,
    type: f.type,
    size: f.size || null,
    uri: f.uri || null,
    base64: f.base64 || null,
  }));
}

// ============================================================
// @desc    CREATE POULAILLER + DOSSIER
// ============================================================
exports.createPoulailler = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("=== CREATE START ===");
    console.log("USER:", req.user);

    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Utilisateur non authentifié",
      });
    }

    const {
      name,
      animalCount,
      surface,
      remarque,
      address,
      attachments = [],
      totalAmount = 0,
      advanceAmount = 0,
    } = req.body;

    // =========================================================
    // 1️⃣ CREATE POULAILLER
    // =========================================================
    const [poulailler] = await Poulailler.create(
      [
        {
          name: name || generateAutoName(),
          animalCount,
          surface,
          densite: calculerDensite(animalCount, surface),
          owner: userId,
          status: "en_attente_module",
          uniqueCode: generateUniqueCode(),
          remarque: remarque || null,
          address: address || null,
          attachments: normalizeAttachments(attachments),
        },
      ],
      { session },
    );

    console.log("✅ Poulailler créé:", poulailler._id);

    // =========================================================
    // 2️⃣ CREATE DOSSIER (OBLIGATOIRE)
    // =========================================================
    const [dossier] = await Dossier.create(
      [
        {
          eleveur: userId,
          poulailler: poulailler._id,
          status: "EN_ATTENTE",
          source: "mobile-app",
          totalAmount,
          advanceAmount,
          remainedAmount: totalAmount - advanceAmount,
        },
      ],
      { session },
    );

    console.log("✅ Dossier créé:", dossier._id);

    // =========================================================
    // 3️⃣ COMMIT
    // =========================================================
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Poulailler et dossier créés avec succès",
      data: {
        poulailler,
        dossier,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("❌ ERREUR CREATE:", err);

    return res.status(500).json({
      success: false,
      message: "Erreur serveur",
      error: err.message,
    });
  }
};

// ============================================================
// @desc    GET ALL POULAILLERS
// ============================================================
exports.getPoulaillers = async (req, res) => {
  try {
    const data = await Poulailler.find({
      owner: req.user.id,
      isArchived: false,
    }).sort({ createdAt: -1 });

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};

// ============================================================
// @desc    GET ONE POULAILLER
// ============================================================
exports.getPoulailler = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) return res.status(404).json({ success: false });

    if (poulailler.owner.toString() !== req.user.id)
      return res.status(403).json({ success: false });

    res.json({ success: true, data: poulailler });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// ============================================================
// @desc    UPDATE POULAILLER
// ============================================================
exports.updatePoulailler = async (req, res) => {
  try {
    const p = await Poulailler.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false });

    if (p.owner.toString() !== req.user.id)
      return res.status(403).json({ success: false });

    const densite = calculerDensite(
      req.body.animalCount || p.animalCount,
      req.body.surface || p.surface,
    );

    const updated = await Poulailler.findByIdAndUpdate(
      req.params.id,
      { ...req.body, densite },
      { new: true },
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// ============================================================
// @desc    DELETE POULAILLER
// ============================================================
exports.deletePoulailler = async (req, res) => {
  try {
    const p = await Poulailler.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false });

    if (p.owner.toString() !== req.user.id)
      return res.status(403).json({ success: false });

    await Poulailler.deleteOne({ _id: req.params.id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};
