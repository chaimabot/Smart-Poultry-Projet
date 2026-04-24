const Dossier = require("../models/Dossier");
const Poulailler = require("../models/Poulailler");
const User = require("../models/User");

// ─────────────────────────────────────────────────────────────
// @desc    Récupérer tous les dossiers + tous les poulaillers de chaque éleveur
// @route   GET /api/admin/dossiers
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const getDossiers = async (req, res) => {
  try {
    const dossiers = await Dossier.find()
      .populate("eleveur", "firstName lastName phone email adresse")
      .populate("poulailler", "name animalCount location description surface")
      .lean()
      .sort({ createdAt: -1 });

    const eleveurIds = [
      ...new Set(
        dossiers.map((d) => d.eleveur?._id?.toString()).filter(Boolean),
      ),
    ];

    const tousLesPoulaillers = await Poulailler.find({
      owner: { $in: eleveurIds },
    })
      .select("owner name animalCount surface description location")
      .lean();

    const poulaillersByEleveur = {};
    tousLesPoulaillers.forEach((p) => {
      const ownerId = p.owner?.toString();
      if (!ownerId) return;
      if (!poulaillersByEleveur[ownerId]) poulaillersByEleveur[ownerId] = [];
      poulaillersByEleveur[ownerId].push(p);
    });

    const sanitizedDossiers = dossiers.map((dossier) => {
      const eleveurId = dossier.eleveur?._id?.toString();
      const tousPoulaillers = eleveurId
        ? (poulaillersByEleveur[eleveurId] ?? [])
        : [];

      return {
        ...dossier,
        eleveur: dossier.eleveur ?? {
          firstName: "Inconnu",
          lastName: "",
          phone: "",
          email: "",
          adresse: "",
        },
        poulailler: dossier.poulailler ?? {
          name: "Inconnu",
          animalCount: 0,
          surface: 0,
          location: "",
          description: "",
        },
        tousPoulaillers,
        nbPoulaillers: tousPoulaillers.length,
        totalVolailles: tousPoulaillers.reduce(
          (sum, p) => sum + (p.animalCount ?? 0),
          0,
        ),
      };
    });

    res.json({
      success: true,
      count: sanitizedDossiers.length,
      data: sanitizedDossiers,
    });
  } catch (error) {
    console.error("Erreur getDossiers:", {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des dossiers",
    });
  }
};

// ─────────────────────────────────────────────────────────────
// @desc    Valider le paiement d'un dossier et activer le compte éleveur
// @route   PATCH /api/admin/dossiers/validate/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const validateDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: "Dossier non trouvé",
      });
    }

    if (dossier.status !== "EN_ATTENTE") {
      return res.status(400).json({
        success: false,
        message: "Ce dossier est déjà traité.",
      });
    }

    dossier.status = "AVANCE_PAYEE";
    dossier.dateValidation = Date.now();
    dossier.validatedBy = req.user.id;

    if (dossier.eleveur) {
      await User.findByIdAndUpdate(dossier.eleveur, {
        status: "active",
        isActive: true,
        role: "eleveur",
      });
    }

    await dossier.save();

    res.json({
      success: true,
      message: "Dossier validé avec succès. Compte éleveur activé.",
      data: dossier,
    });
  } catch (error) {
    console.error("Erreur validateDossier:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la validation du dossier",
    });
  }
};

// ─────────────────────────────────────────────────────────────
// @desc    Clôturer définitivement un dossier (TERMINE) + désactiver l'éleveur
// @route   PATCH /api/admin/dossiers/clore/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const cloreDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: "Dossier non trouvé",
      });
    }

    if (dossier.status === "EN_ATTENTE") {
      return res.status(400).json({
        success: false,
        message:
          "Un dossier en attente ne peut pas être clôturé directement. Veuillez d'abord le valider.",
      });
    }

    if (dossier.status === "TERMINE") {
      return res.status(400).json({
        success: false,
        message: "Ce dossier est déjà clôturé.",
      });
    }

    if (dossier.status === "ANNULE") {
      return res.status(400).json({
        success: false,
        message: "Un dossier annulé ne peut pas être clôturé.",
      });
    }

    const { motifCloture } = req.body;
    if (!motifCloture || !motifCloture.trim()) {
      return res.status(400).json({
        success: false,
        message: "Un motif de clôture est obligatoire.",
      });
    }

    dossier.status = "TERMINE";
    dossier.dateCloture = Date.now();
    dossier.motifCloture = motifCloture.trim();
    dossier.cloreBy = req.user.id;

    if (dossier.eleveur) {
      await User.findByIdAndUpdate(dossier.eleveur, {
        status: "inactive",
        isActive: false,
      });
    }

    await dossier.save();

    res.json({
      success: true,
      message:
        "Dossier clôturé avec succès. Accès mobile de l'éleveur désactivé.",
      data: dossier,
    });
  } catch (error) {
    console.error("Erreur cloreDossier:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la clôture du dossier",
    });
  }
};

// ─────────────────────────────────────────────────────────────
// @desc    Annuler un dossier
//          - EN_ATTENTE  → ANNULE  (aucune avance perçue, aucune action User)
//          - AVANCE_PAYEE → ANNULE (avance perçue ; désactive l'éleveur)
//          - TERMINE      → ❌ interdit (irréversible)
//          - ANNULE       → ❌ déjà annulé
// @route   PATCH /api/admin/dossiers/annuler/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const annulerDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: "Dossier non trouvé",
      });
    }

    // Clôturé → annulation impossible
    if (dossier.status === "TERMINE") {
      return res.status(400).json({
        success: false,
        message:
          "Un dossier clôturé (TERMINÉ) ne peut pas être annulé. Cette opération est irréversible.",
      });
    }

    if (dossier.status === "ANNULE") {
      return res.status(400).json({
        success: false,
        message: "Ce dossier est déjà annulé.",
      });
    }

    const { motifAnnulation } = req.body;
    if (!motifAnnulation || !motifAnnulation.trim()) {
      return res.status(400).json({
        success: false,
        message: "Un motif d'annulation est obligatoire.",
      });
    }

    const avanceDejaPercue = dossier.status === "AVANCE_PAYEE";

    dossier.status = "ANNULE";
    dossier.dateAnnulation = Date.now();
    dossier.motifAnnulation = motifAnnulation.trim();
    dossier.annulePar = req.user.id;

    // Si l'avance avait été perçue, le compte mobile est désactivé
    if (avanceDejaPercue && dossier.eleveur) {
      await User.findByIdAndUpdate(dossier.eleveur, {
        status: "inactive",
        isActive: false,
      });
    }

    await dossier.save();

    const message = avanceDejaPercue
      ? "Dossier annulé. L'avance perçue reste à régulariser manuellement. Accès mobile désactivé."
      : "Dossier annulé. Aucune avance n'avait été perçue.";

    res.json({
      success: true,
      message,
      avanceDejaPercue,
      data: dossier,
    });
  } catch (error) {
    console.error("Erreur annulerDossier:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'annulation du dossier",
    });
  }
};

// ─────────────────────────────────────────────────────────────
// @desc    Mettre à jour les informations financières d'un dossier
// @route   PUT /api/admin/dossiers/:id/finance
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const updateFinance = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: "Dossier non trouvé",
      });
    }

    if (dossier.status === "TERMINE") {
      return res.status(400).json({
        success: false,
        message: "Impossible de modifier les finances d'un dossier clôturé.",
      });
    }

    if (dossier.status === "ANNULE") {
      return res.status(400).json({
        success: false,
        message: "Impossible de modifier les finances d'un dossier annulé.",
      });
    }

    const totalAmount =
      req.body.totalAmount !== undefined
        ? parseFloat(req.body.totalAmount)
        : dossier.totalAmount;

    const advanceAmount =
      req.body.advanceAmount !== undefined
        ? parseFloat(req.body.advanceAmount)
        : dossier.advanceAmount;

    if (isNaN(totalAmount) || isNaN(advanceAmount)) {
      return res.status(400).json({
        success: false,
        message: "Les montants fournis sont invalides.",
      });
    }

    if (advanceAmount > totalAmount) {
      return res.status(400).json({
        success: false,
        message: "L'avance ne peut pas dépasser le montant total.",
      });
    }

    dossier.totalAmount = totalAmount;
    dossier.advanceAmount = advanceAmount;
    dossier.remainedAmount = totalAmount - advanceAmount;

    await dossier.save();

    res.json({
      success: true,
      message: "Finances mises à jour avec succès",
      data: dossier,
    });
  } catch (error) {
    console.error("Erreur updateFinance:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la mise à jour des finances",
    });
  }
};
// ─────────────────────────────────────────────────────────────
// @desc    Supprimer définitivement un dossier
// @route   DELETE /api/admin/dossiers/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const deleteDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        success: false,
        message: "Dossier non trouvé",
      });
    }

    // On supprime sans vérifier le statut
    await dossier.deleteOne();

    res.json({
      success: true,
      message: "Dossier supprimé définitivement.",
    });
  } catch (error) {
    console.error("Erreur deleteDossier:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la suppression",
    });
  }
};

module.exports = {
  getDossiers,
  validateDossier,
  cloreDossier,
  annulerDossier,
  deleteDossier,
  updateFinance,
};
