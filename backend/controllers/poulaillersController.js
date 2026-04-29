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
    console.log("=== CREATE POULAILLER + DOSSIER ===");

    // =====================================================
    // 1️⃣ VALIDATION
    // =====================================================
    const { error, value } = poulaillerSchema.validate(req.body, {
      stripUnknown: true,
    });

    if (error) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    // =====================================================
    // 2️⃣ CREATE POULAILLER
    // =====================================================
    const poulailler = await Poulailler.create(
      [
        {
          name: value.name || generateAutoName(),
          animalCount: value.animalCount,
          surface: value.surface,
          densite: calculerDensite(value.animalCount, value.surface),
          owner: req.user.id,
          uniqueCode: generateUniqueCode(),
          status: "en_attente_module",
          attachments: normalizeAttachments(value.attachments),
          remarque: value.remarque || null,
          address: value.address || null,
        },
      ],
      { session },
    );

    console.log("✅ Poulailler créé:", poulailler[0]._id);

    // =====================================================
    // 3️⃣ CREATE DOSSIER (IMPORTANT)
    // =====================================================
    const dossier = await Dossier.create(
      [
        {
          eleveur: req.user.id,
          poulailler: poulailler[0]._id,
          status: "EN_ATTENTE",
          source: "mobile-app",
          totalAmount: 0,
          advanceAmount: 0,
          remainedAmount: 0,
        },
      ],
      { session },
    );

    console.log("✅ Dossier créé:", dossier[0]._id);

    // =====================================================
    // 4️⃣ COMMIT
    // =====================================================
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Poulailler + dossier créés avec succès",
      data: {
        poulailler: poulailler[0],
        dossier: dossier[0],
      },
    });
  } catch (err) {
    // =====================================================
    // ❌ ROLLBACK SI ERREUR
    // =====================================================
    await session.abortTransaction();
    session.endSession();

    console.error("❌ ERREUR GLOBAL:", err.message);
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Erreur serveur",
      error: err.message,
    });
  }
};
exports.createPoulailler = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("=== CREATE POULAILLER + DOSSIER ===");

    // =====================================================
    // 1️⃣ VALIDATION
    // =====================================================
    const { error, value } = poulaillerSchema.validate(req.body, {
      stripUnknown: true,
    });

    if (error) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    // =====================================================
    // 2️⃣ CREATE POULAILLER
    // =====================================================
    const poulailler = await Poulailler.create(
      [
        {
          name: value.name || generateAutoName(),
          animalCount: value.animalCount,
          surface: value.surface,
          densite: calculerDensite(value.animalCount, value.surface),
          owner: req.user.id,
          uniqueCode: generateUniqueCode(),
          status: "en_attente_module",
          attachments: normalizeAttachments(value.attachments),
          remarque: value.remarque || null,
          address: value.address || null,
        },
      ],
      { session },
    );

    console.log("✅ Poulailler créé:", poulailler[0]._id);

    // =====================================================
    // 3️⃣ CREATE DOSSIER (IMPORTANT)
    // =====================================================
    const dossier = await Dossier.create(
      [
        {
          eleveur: req.user.id,
          poulailler: poulailler[0]._id,
          status: "EN_ATTENTE",
          source: "mobile-app",
          totalAmount: 0,
          advanceAmount: 0,
          remainedAmount: 0,
        },
      ],
      { session },
    );

    console.log("✅ Dossier créé:", dossier[0]._id);

    // =====================================================
    // 4️⃣ COMMIT
    // =====================================================
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Poulailler + dossier créés avec succès",
      data: {
        poulailler: poulailler[0],
        dossier: dossier[0],
      },
    });
  } catch (err) {
    // =====================================================
    // ❌ ROLLBACK SI ERREUR
    // =====================================================
    await session.abortTransaction();
    session.endSession();

    console.error("❌ ERREUR GLOBAL:", err.message);
    console.error(err);

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
