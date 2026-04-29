const Dossier = require("../models/Dossier");
const Poulailler = require("../models/Poulailler");
const User = require("../models/User");

// ─────────────────────────────────────────────────────────────
// @desc    Récupérer tous les dossiers + poulaillers de chaque éleveur
// @route   GET /api/admin/dossiers
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const getDossiers = async (req, res) => {
  try {
    const dossiers = await Dossier.find()
      .populate("eleveur", "firstName lastName phone email adresse")
      .populate("poulailler")
      .lean();

    const result = dossiers.map((d) => {
      const p = d.poulailler || {};

      const surface =
        typeof p.surface === "number" && p.surface > 0 ? p.surface : 0;

      const animalCount = typeof p.animalCount === "number" ? p.animalCount : 0;

      const densite = surface > 0 ? animalCount / surface : 0;

      const totalAmount = d.totalAmount ?? 0;
      const advanceAmount = d.advanceAmount ?? 0;

      return {
        ...d,

        // sécurité frontend
        poulailler: {
          ...p,
          surface,
          animalCount,
          densite, // 🔥 ajouté proprement ici
        },

        // recalcul propre backend
        remainedAmount: totalAmount - advanceAmount,
      };
    });

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (err) {
    console.error("[GET DOSSIERS ERROR]", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération des dossiers",
    });
  }
};
// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEmptyPoulailler() {
  return {
    name: "Non renseigné",
    type: null,
    animalCount: 0,
    surface: 0,
    location: null,
    description: null,
    status: "en_attente_module",
    isOnline: false,
    isArchived: false,
    isCritical: false,
    uniqueCode: null,
    installationDate: null,
    lastCommunicationAt: null,
    lastMeasureAt: null,
    lastAlert: null,
    lastMonitoring: null,
    seuils: {},
    autoThresholds: {
      ventiloThresholdTemp: 28,
      ventiloThresholdCO2: 1500,
      doorOpenTime: "07:00",
      doorCloseTime: "19:00",
    },
    actuatorStates: {
      door: { status: "closed", mode: "auto" },
      ventilation: { status: "off", mode: "auto" },
    },
  };
}

/**
 * Normalise un document Poulailler pour l'API :
 * - expose `codeUnique` en plus de `uniqueCode` (compatibilité frontend)
 * - expose `dernierPing` alias de `lastCommunicationAt`
 * - expose `alertesActives` calculé depuis `isCritical`
 * - expose `lastMeasure` à partir de `lastMonitoring`
 */
function formatPoulailler(p) {
  return {
    ...p,
    // Alias frontend
    codeUnique: p.uniqueCode ?? p.codeUnique ?? null,
    dernierPing: p.lastCommunicationAt ?? null,
    alertesActives: p.isCritical ? 1 : 0,

    // Capteurs de la dernière mesure — structure attendue par le frontend
    lastMeasure: p.lastMonitoring
      ? {
          temperature: p.lastMonitoring.temperature ?? null,
          humidity: p.lastMonitoring.humidity ?? null,
          co2: p.lastMonitoring.co2 ?? null,
          nh3: p.lastMonitoring.nh3 ?? null,
          waterLevel: p.lastMonitoring.waterLevel ?? null,
          dust: p.lastMonitoring.dust ?? null,
        }
      : null,

    // Seuils de monitoring exposés proprement
    thresholds: p.seuils
      ? {
          tempMin: p.seuils.temperatureMin ?? null,
          tempMax: p.seuils.temperatureMax ?? null,
          humMin: p.seuils.humidityMin ?? null,
          humMax: p.seuils.humidityMax ?? null,
          co2Max: p.seuils.co2Max ?? null,
          nh3Max: p.seuils.nh3Max ?? null,
          dustMax: p.seuils.dustMax ?? null,
          waterMin: p.seuils.waterLevelMin ?? null,
        }
      : null,

    // Seuils automatiques
    autoThresholds: p.autoThresholds
      ? {
          tempVentilo: p.autoThresholds.ventiloThresholdTemp ?? 28,
          co2Ventilo: p.autoThresholds.ventiloThresholdCO2 ?? 1500,
          doorOpen: p.autoThresholds.doorOpenTime ?? "07:00",
          doorClose: p.autoThresholds.doorCloseTime ?? "19:00",
        }
      : null,

    // Actionneurs — format compatible avec le composant ActuatorCard
    actuators: p.actuatorStates
      ? [
          {
            name: "Porte",
            icon: "🚪",
            state:
              p.actuatorStates.door?.status === "open" ? "Ouverte" : "Fermée",
            mode: p.actuatorStates.door?.mode === "auto" ? "Auto" : "Manuel",
          },
          {
            name: "Ventilation",
            icon: "💨",
            state:
              p.actuatorStates.ventilation?.status === "on"
                ? "Allumée"
                : "Éteinte",
            mode:
              p.actuatorStates.ventilation?.mode === "auto" ? "Auto" : "Manuel",
          },
        ]
      : [],

    // Dates ISO string pour le frontend
    lastMeasureDate: p.lastMeasureAt ?? null,
    lastAlertDate: p.lastAlert ?? null,
    installationDate: p.installationDate ?? null,
    archived: p.isArchived ?? false,
    alertSeverity: p.isCritical ? "critique" : "ok",
  };
}

// Helper : résoudre l'ID éleveur peu importe le nom du champ
function getEleveurId(dossier) {
  return (
    dossier.eleveur ?? dossier.user ?? dossier.userId ?? dossier.client ?? null
  );
}

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

    // =========================================================
    // 1. VALIDATION DOSSIER
    // =========================================================
    dossier.status = "AVANCE_PAYEE";
    dossier.dateValidation = new Date();
    dossier.validatedBy = req.user.id;

    // =========================================================
    // 2. ACTIVER / PRÉPARER POULAILLER
    // =========================================================
    let poulaillerUpdated = null;

    if (dossier.poulailler) {
      poulaillerUpdated = await Poulailler.findByIdAndUpdate(
        dossier.poulailler,
        {
          status: "en_installation",
          isActive: true,
          installationDate: new Date(),
        },
        { new: true },
      );
    }

    // =========================================================
    // 3. ACTIVER ÉLEVEUR (COMPTE EXISTANT OU NON)
    // =========================================================
    let userUpdated = null;

    if (dossier.eleveur) {
      const user = await User.findById(dossier.eleveur);

      if (user) {
        // si compte existe déjà → juste activer
        user.status = "active";
        user.isActive = true;
        user.role = "eleveur";

        userUpdated = await user.save();
      } else {
        // ⚠️ cas rare : dossier lié mais user supprimé → fallback
        userUpdated = await User.create({
          _id: dossier.eleveur,
          status: "active",
          isActive: true,
          role: "eleveur",
        });
      }
    }

    // =========================================================
    // 4. SAUVEGARDE DOSSIER
    // =========================================================
    await dossier.save();

    // =========================================================
    // 5. RESPONSE PROPRE
    // =========================================================
    return res.json({
      success: true,
      message: "Dossier validé. Poulailler en installation.",
      data: {
        dossier,
        poulailler: poulaillerUpdated,
        user: userUpdated,
      },
    });
  } catch (error) {
    console.error("Erreur validateDossier:", error);

    return res.status(500).json({
      success: false,
      message: "Erreur lors de la validation du dossier",
    });
  }
};
// ─────────────────────────────────────────────────────────────
// @desc    Clôturer définitivement un dossier (TERMINE)
// @route   PATCH /api/admin/dossiers/clore/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const cloreDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier)
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
    if (dossier.status === "EN_ATTENTE")
      return res.status(400).json({
        success: false,
        message:
          "Un dossier en attente ne peut pas être clôturé directement. Veuillez d'abord le valider.",
      });
    if (dossier.status === "TERMINE")
      return res
        .status(400)
        .json({ success: false, message: "Ce dossier est déjà clôturé." });
    if (dossier.status === "ANNULE")
      return res.status(400).json({
        success: false,
        message: "Un dossier annulé ne peut pas être clôturé.",
      });

    const { motifCloture } = req.body;
    if (!motifCloture?.trim())
      return res.status(400).json({
        success: false,
        message: "Un motif de clôture est obligatoire.",
      });

    dossier.status = "TERMINE";
    dossier.dateCloture = Date.now();
    dossier.motifCloture = motifCloture.trim();
    dossier.cloreBy = req.user.id;

    const eleveurId = getEleveurId(dossier);
    if (eleveurId)
      await User.findByIdAndUpdate(eleveurId, {
        status: "inactive",
        isActive: false,
      });

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
// @route   PATCH /api/admin/dossiers/annuler/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const annulerDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier)
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
    if (dossier.status === "TERMINE")
      return res.status(400).json({
        success: false,
        message: "Un dossier clôturé ne peut pas être annulé.",
      });
    if (dossier.status === "ANNULE")
      return res
        .status(400)
        .json({ success: false, message: "Ce dossier est déjà annulé." });

    const { motifAnnulation } = req.body;
    if (!motifAnnulation?.trim())
      return res.status(400).json({
        success: false,
        message: "Un motif d'annulation est obligatoire.",
      });

    const avanceDejaPercue = dossier.status === "AVANCE_PAYEE";
    dossier.status = "ANNULE";
    dossier.dateAnnulation = Date.now();
    dossier.motifAnnulation = motifAnnulation.trim();
    dossier.annulePar = req.user.id;

    const eleveurId = getEleveurId(dossier);
    if (avanceDejaPercue && eleveurId) {
      await User.findByIdAndUpdate(eleveurId, {
        status: "inactive",
        isActive: false,
      });
    }

    await dossier.save();
    res.json({
      success: true,
      message: avanceDejaPercue
        ? "Dossier annulé. L'avance perçue reste à régulariser manuellement. Accès mobile désactivé."
        : "Dossier annulé. Aucune avance n'avait été perçue.",
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
// @desc    Mettre à jour les informations financières
// @route   PUT /api/admin/dossiers/:id/finance
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────
const updateFinance = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier)
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
    if (dossier.status === "TERMINE")
      return res.status(400).json({
        success: false,
        message: "Impossible de modifier les finances d'un dossier clôturé.",
      });
    if (dossier.status === "ANNULE")
      return res.status(400).json({
        success: false,
        message: "Impossible de modifier les finances d'un dossier annulé.",
      });

    const totalAmount =
      req.body.totalAmount !== undefined
        ? parseFloat(req.body.totalAmount)
        : dossier.totalAmount;
    const advanceAmount =
      req.body.advanceAmount !== undefined
        ? parseFloat(req.body.advanceAmount)
        : dossier.advanceAmount;

    if (isNaN(totalAmount) || isNaN(advanceAmount))
      return res.status(400).json({
        success: false,
        message: "Les montants fournis sont invalides.",
      });
    if (advanceAmount > totalAmount)
      return res.status(400).json({
        success: false,
        message: "L'avance ne peut pas dépasser le montant total.",
      });

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
    if (!dossier)
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });

    await dossier.deleteOne();
    res.json({ success: true, message: "Dossier supprimé définitivement." });
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
