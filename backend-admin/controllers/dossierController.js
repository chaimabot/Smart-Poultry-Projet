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
    const dossiersBruts = await Dossier.find().lean().sort({ createdAt: -1 });

    if (dossiersBruts.length === 0) {
      return res.json({ success: true, count: 0, data: [] });
    }

    // ── Extraire les IDs ─────────────────────────────────────────────────────
    const eleveurIds = [
      ...new Set(
        dossiersBruts.map((d) => d.eleveur?.toString()).filter(Boolean),
      ),
    ];
    const poulaillerIds = [
      ...new Set(
        dossiersBruts.map((d) => d.poulailler?.toString()).filter(Boolean),
      ),
    ];

    // ── Requêtes parallèles ──────────────────────────────────────────────────
    const [users, poulaillersPrincipaux, tousLesPoulaillers] =
      await Promise.all([
        // Tous les champs utiles du schéma User
        User.find({ _id: { $in: eleveurIds } })
          .select(
            "firstName lastName phone email photoUrl role status isActive lastLogin createdAt",
          )
          .lean(),

        // Poulailler principal référencé dans le dossier — tous les champs du schéma
        Poulailler.find({ _id: { $in: poulaillerIds } })
          .select(
            "name type animalCount description location photoUrl status " +
              "isOnline isArchived isCritical uniqueCode moduleId " +
              "installationDate lastCommunicationAt lastMeasureAt lastAlert lastCriticalCheck " +
              "lastMonitoring seuils autoThresholds actuatorStates owner createdAt",
          )
          .lean(),

        // Tous les poulaillers appartenant aux éleveurs concernés
        Poulailler.find({ owner: { $in: eleveurIds } })
          .select(
            "owner name type animalCount description location photoUrl status " +
              "isOnline isArchived isCritical uniqueCode moduleId " +
              "installationDate lastCommunicationAt lastMeasureAt lastAlert lastCriticalCheck " +
              "lastMonitoring seuils autoThresholds actuatorStates createdAt",
          )
          .lean(),
      ]);

    // ── Maps ─────────────────────────────────────────────────────────────────
    const userMap = {};
    users.forEach((u) => {
      userMap[u._id.toString()] = u;
    });

    const poulaillerMap = {};
    poulaillersPrincipaux.forEach((p) => {
      poulaillerMap[p._id.toString()] = p;
    });

    const poulaillersByEleveur = {};
    tousLesPoulaillers.forEach((p) => {
      const ownerId = p.owner?.toString();
      if (!ownerId) return;
      if (!poulaillersByEleveur[ownerId]) poulaillersByEleveur[ownerId] = [];
      poulaillersByEleveur[ownerId].push(p);
    });

    // ── Construire la réponse ─────────────────────────────────────────────────
    const sanitizedDossiers = dossiersBruts.map((dossier) => {
      const eleveurId = dossier.eleveur?.toString();
      const poulailler1Id = dossier.poulailler?.toString();

      const eleveur = eleveurId
        ? (userMap[eleveurId] ?? {
            firstName: "Inconnu",
            lastName: "",
            phone: null,
            email: "",
            photoUrl: null,
            role: "eleveur",
            status: "pending",
            isActive: false,
          })
        : {
            firstName: "Inconnu",
            lastName: "",
            phone: null,
            email: "",
            photoUrl: null,
            role: "eleveur",
            status: "pending",
            isActive: false,
          };

      const poulailler = poulailler1Id
        ? (poulaillerMap[poulailler1Id] ?? buildEmptyPoulailler())
        : buildEmptyPoulailler();

      const tousPoulaillers = eleveurId
        ? (poulaillersByEleveur[eleveurId] ?? [])
        : [];

      return {
        ...dossier,
        eleveur,
        poulailler: formatPoulailler(poulailler),
        tousPoulaillers: tousPoulaillers.map(formatPoulailler),
        nbPoulaillers: tousPoulaillers.length,
        totalVolailles: tousPoulaillers.reduce(
          (s, p) => s + (p.animalCount ?? 0),
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
    console.error("Erreur getDossiers:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des dossiers",
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

    if (!dossier)
      return res.status(404).json({
        success: false,
        message: "Dossier non trouvé",
      });

    if (dossier.status !== "EN_ATTENTE")
      return res.status(400).json({
        success: false,
        message: "Ce dossier est déjà traité.",
      });

    // ✅ Validation admin du dossier
    dossier.status = "AVANCE_PAYEE";
    dossier.dateValidation = Date.now();
    dossier.validatedBy = req.user.id;

    // ✅ IMPORTANT : déclenche préparation poulailler
    if (dossier.poulailler) {
      await Poulailler.findByIdAndUpdate(dossier.poulailler, {
        status: "en_installation",
        isActive: true,
        installationDate: new Date(),
      });
    }

    await dossier.save();

    res.json({
      success: true,
      message: "Dossier validé. L’installation du poulailler peut commencer.",
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
