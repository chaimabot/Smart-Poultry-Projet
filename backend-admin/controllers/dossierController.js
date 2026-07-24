const Dossier = require("../models/Dossier");
const Poulailler = require("../models/Poulailler");
const User = require("../models/User");
const Module = require("../models/Module");

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function computeRemained(dossier) {
  const total = dossier.totalAmount ?? 0;
  const advance = dossier.advanceAmount ?? 0;
  return Math.max(0, total - advance);
}

function getEleveurId(dossier) {
  const raw =
    dossier.eleveur ?? dossier.user ?? dossier.userId ?? dossier.client ?? null;
  if (!raw) return null;
  return raw._id ?? raw;
}

function resolveContractNumber(dossier) {
  if (dossier.contractNumber) return dossier.contractNumber;
  return `SP-${String(dossier._id).slice(-6).toUpperCase()}`;
}

function resolveEleveurId(d) {
  if (d.eleveur && typeof d.eleveur === "object" && d.eleveur._id) {
    return d.eleveur._id.toString();
  }
  if (d.eleveur) return d.eleveur.toString();
  if (d.user) return d.user.toString();
  if (d.userId) return d.userId.toString();
  if (d.client) return d.client.toString();
  return null;
}

function sanitizeEleveur(eleveur) {
  if (!eleveur) return eleveur;
  const { inviteToken, ...rest } = eleveur;
  return { ...rest, hasInviteToken: !!inviteToken };
}

function formatPoulailler(p) {
  if (!p) return null;
  const plain = p.toObject ? p.toObject() : p;
  const surface =
    typeof plain.surface === "number" && plain.surface > 0 ? plain.surface : 0;
  const animalCount =
    typeof plain.animalCount === "number" ? plain.animalCount : 0;

  return {
    ...plain,
    surface,
    animalCount,
    densite: surface > 0 ? +(animalCount / surface).toFixed(2) : 0,
    codeUnique: plain.uniqueCode ?? plain.codeUnique ?? null,
    dernierPing: plain.lastCommunicationAt ?? null,
    alertesActives: plain.isCritical ? 1 : 0,
    archived: plain.isArchived ?? false,
    alertSeverity: plain.isCritical ? "critique" : "ok",
    lastMeasure: plain.lastMonitoring
      ? {
          temperature: plain.lastMonitoring.temperature ?? null,
          humidity: plain.lastMonitoring.humidity ?? null,
          co2: plain.lastMonitoring.co2 ?? null,
          nh3: plain.lastMonitoring.nh3 ?? null,
          waterLevel: plain.lastMonitoring.waterLevel ?? null,
          dust: plain.lastMonitoring.dust ?? null,
        }
      : null,
    lastMeasureDate: plain.lastMeasureAt ?? null,
    lastAlertDate: plain.lastAlert ?? null,
    installationDate: plain.installationDate ?? null,
    thresholds: plain.seuils
      ? {
          tempMin: plain.seuils.temperatureMin ?? null,
          tempMax: plain.seuils.temperatureMax ?? null,
          humMin: plain.seuils.humidityMin ?? null,
          humMax: plain.seuils.humidityMax ?? null,
          co2Max: plain.seuils.co2Max ?? null,
          nh3Max: plain.seuils.nh3Max ?? null,
          dustMax: plain.seuils.dustMax ?? null,
          waterMin: plain.seuils.waterLevelMin ?? null,
        }
      : null,
    autoThresholds: plain.autoThresholds
      ? {
          tempVentilo: plain.autoThresholds.ventiloThresholdTemp ?? 28,
          co2Ventilo: plain.autoThresholds.ventiloThresholdCO2 ?? 1500,
          doorOpen: plain.autoThresholds.doorOpenTime ?? "07:00",
          doorClose: plain.autoThresholds.doorCloseTime ?? "19:00",
        }
      : null,
    actuators: plain.actuatorStates
      ? [
          {
            name: "Porte",
            icon: "door",
            state:
              plain.actuatorStates.door?.status === "open"
                ? "Ouverte"
                : "Fermée",
            mode:
              plain.actuatorStates.door?.mode === "auto" ? "Auto" : "Manuel",
          },
          {
            name: "Ventilation",
            icon: "wind",
            state:
              plain.actuatorStates.ventilation?.status === "on"
                ? "Allumée"
                : "Éteinte",
            mode:
              plain.actuatorStates.ventilation?.mode === "auto"
                ? "Auto"
                : "Manuel",
          },
        ]
      : [],
  };
}

function buildEmptyPoulailler() {
  return {
    name: "Non renseigné",
    type: null,
    animalCount: 0,
    surface: 0,
    densite: 0,
    location: null,
    description: null,
    status: "en_attente_module",
    isOnline: false,
    isArchived: false,
    isCritical: false,
    uniqueCode: null,
    codeUnique: null,
    installationDate: null,
    lastCommunicationAt: null,
    dernierPing: null,
    lastMeasureAt: null,
    lastMeasureDate: null,
    lastAlert: null,
    lastAlertDate: null,
    lastMonitoring: null,
    lastMeasure: null,
    alertesActives: 0,
    archived: false,
    alertSeverity: "ok",
    seuils: {},
    thresholds: null,
    autoThresholds: {
      tempVentilo: 28,
      co2Ventilo: 1500,
      doorOpen: "07:00",
      doorClose: "19:00",
    },
    actuatorStates: {
      door: { status: "closed", mode: "auto" },
      ventilation: { status: "off", mode: "auto" },
    },
    actuators: [
      { name: "Porte", icon: "door", state: "Fermée", mode: "Auto" },
      { name: "Ventilation", icon: "wind", state: "Éteinte", mode: "Auto" },
    ],
  };
}

const STATUT_ORDRE = ["AVANCE_PAYEE", "EN_ATTENTE", "TERMINE", "ANNULE"];

function choisirRepresentant(existant, nouveau) {
  const scoreExist = STATUT_ORDRE.indexOf(existant.status) ?? 99;
  const scoreNouv = STATUT_ORDRE.indexOf(nouveau.status) ?? 99;
  return scoreNouv < scoreExist ? nouveau : existant;
}

async function resolveDossierIds(req) {
  const ids = req.body?._dossiersIds;
  if (Array.isArray(ids) && ids.length > 0) return ids;
  return [req.params.id];
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Récupérer tous les dossiers avec poulaillers et éleveurs
// @route   GET /api/admin/dossiers
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const getDossiers = async (req, res) => {
  try {
    // ── Étape 1 : charger tous les dossiers ───────────────────────────────
    const dossiers = await Dossier.find()
      .populate(
        "eleveur",
        "firstName lastName phone email adresse status isActive inviteToken",
      )
      .populate("poulailler")
      .lean();

    // Normalisation contractNumber
    for (const d of dossiers) {
      if (!d.contractNumber) {
        d.contractNumber = `SP-${String(d._id).slice(-6).toUpperCase()}`;
      }
    }

    // ── Étape 2 : collecter tous les eleveurIds uniques ───────────────────
    const eleveurIds = new Set();
    for (const d of dossiers) {
      const eid = resolveEleveurId(d);
      if (eid) eleveurIds.add(eid);
    }

    // ── Étape 3 : charger TOUS les poulaillers actifs par owner ───────────
    const poulaillersByOwner = new Map();

    if (eleveurIds.size > 0) {
      const tousLesPoulaillers = await Poulailler.find({
        owner: { $in: Array.from(eleveurIds) },
        isArchived: { $ne: true },
      }).lean();

      for (const p of tousLesPoulaillers) {
        const ownerId = p.owner?.toString();
        if (!ownerId) continue;
        if (!poulaillersByOwner.has(ownerId)) {
          poulaillersByOwner.set(ownerId, []);
        }
        poulaillersByOwner.get(ownerId).push(formatPoulailler(p));
      }
    }

    console.log("\n========== POULAILLERS PAR OWNER ==========");
    poulaillersByOwner.forEach((pls, ownerId) => {
      console.log(
        `owner=${ownerId} → ${pls.length} poulailler(s):`,
        pls.map((p) => p.name),
      );
    });

    // ── Étape 4 : regroupement par éleveur ───────────────────────────────
    const parEleveur = new Map();

    for (const d of dossiers) {
      const eleveurId = resolveEleveurId(d);

      if (!eleveurId) {
        console.warn("⚠️ Dossier sans éleveur ignoré :", d._id);
        continue;
      }

      const poulaillerPopulate = d.poulailler
        ? formatPoulailler(d.poulailler)
        : null;

      if (!parEleveur.has(eleveurId)) {
        parEleveur.set(eleveurId, {
          ...d,
          contractNumber: resolveContractNumber(d),
          poulailler: poulaillerPopulate ?? buildEmptyPoulailler(),
          tousPoulaillers: poulaillerPopulate ? [poulaillerPopulate] : [],
          totalAmount: d.totalAmount ?? 0,
          advanceAmount: d.advanceAmount ?? 0,
          remainedAmount: Math.max(
            0,
            (d.totalAmount ?? 0) - (d.advanceAmount ?? 0),
          ),
          _dossiersIds: [d._id.toString()],
        });
      } else {
        const rep = parEleveur.get(eleveurId);

        const meilleur = choisirRepresentant(rep, d);
        if (meilleur._id.toString() !== rep._id.toString()) {
          const savedPoulaillers = rep.tousPoulaillers;
          const savedIds = rep._dossiersIds;
          const savedTotal = rep.totalAmount + (d.totalAmount ?? 0);
          const savedAdvance = rep.advanceAmount + (d.advanceAmount ?? 0);

          parEleveur.set(eleveurId, {
            ...d,
            contractNumber: resolveContractNumber(d),
            poulailler: poulaillerPopulate ?? rep.poulailler,
            tousPoulaillers: savedPoulaillers,
            totalAmount: savedTotal,
            advanceAmount: savedAdvance,
            remainedAmount: Math.max(0, savedTotal - savedAdvance),
            _dossiersIds: savedIds,
          });
        } else {
          rep.totalAmount += d.totalAmount ?? 0;
          rep.advanceAmount += d.advanceAmount ?? 0;
          rep.remainedAmount = Math.max(0, rep.totalAmount - rep.advanceAmount);
        }

        const repCourant = parEleveur.get(eleveurId);
        if (!repCourant._dossiersIds.includes(d._id.toString())) {
          repCourant._dossiersIds.push(d._id.toString());
        }

        if (poulaillerPopulate) {
          const pId = poulaillerPopulate._id?.toString();
          const dejaPresent = repCourant.tousPoulaillers.some(
            (p) => p._id?.toString() === pId,
          );
          if (!dejaPresent) {
            repCourant.tousPoulaillers.push(poulaillerPopulate);
          }
        }
      }
    }

    // ── Étape 5 : remplacer tousPoulaillers par la liste owner réelle ─────
    for (const [eleveurId, groupe] of parEleveur.entries()) {
      const poulaillerOwner = poulaillersByOwner.get(eleveurId) ?? [];

      if (poulaillerOwner.length > 0) {
        const tousMerges = [...poulaillerOwner];

        for (const pp of groupe.tousPoulaillers) {
          const ppId = pp._id?.toString();
          if (ppId && !tousMerges.some((p) => p._id?.toString() === ppId)) {
            tousMerges.push(pp);
          }
        }

        groupe.tousPoulaillers = tousMerges;

        const poulaillerActuelId = groupe.poulailler?._id?.toString();
        const existeDansOwner = poulaillerOwner.some(
          (p) => p._id?.toString() === poulaillerActuelId,
        );
        if (!existeDansOwner) {
          groupe.poulailler = poulaillerOwner[0];
        }
      }
    }

    // ── Étape 5b : recalculer esp32Installe DYNAMIQUEMENT ─────────────────
    for (const [eleveurId, groupe] of parEleveur.entries()) {
      const poulaillersDuGroupe = poulaillersByOwner.get(eleveurId) ?? [];

      if (poulaillersDuGroupe.length === 0) {
        if (!groupe.etapes) {
          groupe.etapes = {
            dossierValide: false,
            contratSigne: false,
            esp32Installe: false,
            invitationEnvoyee: false,
          };
        } else {
          groupe.etapes.esp32Installe = false;
        }
        continue;
      }

      const poulaillerIds = poulaillersDuGroupe
        .map((p) => p._id)
        .filter(Boolean);

      const nbCouverts = await Module.countDocuments({
        poulailler: { $in: poulaillerIds },
        status: "associated",
      });

      const esp32InstalleCalcule =
        nbCouverts >= poulaillerIds.length && poulaillerIds.length > 0;

      if (!groupe.etapes) {
        groupe.etapes = {
          dossierValide: false,
          contratSigne: false,
          esp32Installe: esp32InstalleCalcule,
          invitationEnvoyee: false,
        };
      } else {
        groupe.etapes.esp32Installe = esp32InstalleCalcule;
      }
    }

    // ── Étape 6 : résultat final — sanitize eleveur ───────────────────────
    const result = Array.from(parEleveur.values()).map((d) => ({
      ...d,
      tousPoulaillers: Array.isArray(d.tousPoulaillers)
        ? d.tousPoulaillers
        : [],
      eleveur: sanitizeEleveur(d.eleveur),
    }));

    console.log("\n========== RÉSULTAT FINAL ==========");
    result.forEach((d) => {
      const nom =
        `${d.eleveur?.firstName ?? "?"} ${d.eleveur?.lastName ?? ""}`.trim();
      console.log({
        eleveur: nom,
        nbPoulaillers: d.tousPoulaillers?.length ?? 0,
        poulaillers: d.tousPoulaillers?.map((p) => `${p.name}`) ?? [],
        nbDossiers: d._dossiersIds?.length ?? 1,
        status: d.status,
        esp32Installe: d.etapes?.esp32Installe ?? false,
        hasInviteToken: d.eleveur?.hasInviteToken ?? false,
      });
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

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Valider le paiement
// @route   PATCH /api/admin/dossiers/validate/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const validateDossier = async (req, res) => {
  try {
    const dossiersIds = await resolveDossierIds(req);

    const dossier = await Dossier.findById(req.params.id).populate(
      "eleveur",
      "firstName lastName phone email adresse password status isActive inviteToken",
    );

    if (!dossier) {
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
    }

    if (dossier.status !== "EN_ATTENTE") {
      return res.status(400).json({
        success: false,
        message:
          dossier.status === "AVANCE_PAYEE"
            ? "Ce dossier a déjà été validé (avance payée)."
            : `Ce dossier est déjà traité (statut : ${dossier.status}).`,
      });
    }

    const adminId = req.user?._id ?? req.user?.id;

    await Dossier.updateMany(
      { _id: { $in: dossiersIds } },
      {
        $set: {
          status: "AVANCE_PAYEE",
          dateValidation: new Date(),
          validatedBy: adminId,
          "etapes.dossierValide": true,
        },
      },
    );

    const tousDossiers = await Dossier.find({
      _id: { $in: dossiersIds },
    }).lean();

    const poulaillerIds = tousDossiers.map((d) => d.poulailler).filter(Boolean);

    if (poulaillerIds.length > 0) {
      await Poulailler.updateMany(
        { _id: { $in: poulaillerIds } },
        {
          $set: {
            status: "en_attente_module",
            isActive: true,
            installationDate: new Date(),
          },
        },
      );
    }

    let userUpdated = null;
    if (dossier.eleveur) {
      const eleveurId = dossier.eleveur._id ?? dossier.eleveur;
      const existingUser = await User.findById(eleveurId);

      if (existingUser) {
        existingUser.status = "active";
        existingUser.isActive = true;
        existingUser.role = "eleveur";
        userUpdated = await existingUser.save();
      } else {
        const eleveurData = dossier.eleveur;
        userUpdated = await User.create({
          _id: eleveurId,
          status: "active",
          isActive: true,
          role: "eleveur",
          firstName: eleveurData?.firstName ?? "Eleveur",
          lastName: eleveurData?.lastName ?? "",
          email:
            eleveurData?.email ?? `eleveur-${String(eleveurId)}@poulailler.app`,
          password:
            eleveurData?.password ?? `TempPass_${String(eleveurId).slice(-6)}!`,
        });
      }
    }

    const dossierFinal = await Dossier.findById(req.params.id)
      .populate(
        "eleveur",
        "firstName lastName phone email adresse status isActive inviteToken",
      )
      .populate("poulailler")
      .lean();

    if (!dossierFinal.contractNumber) {
      dossierFinal.contractNumber = `SP-${String(dossierFinal._id).slice(-6).toUpperCase()}`;
    }

    const totalAmount = dossierFinal.totalAmount ?? 0;
    const advanceAmount = dossierFinal.advanceAmount ?? 0;
    const poulaillerFormate = dossierFinal.poulailler
      ? formatPoulailler(dossierFinal.poulailler)
      : buildEmptyPoulailler();

    const eleveurIdFinal = resolveEleveurId(dossierFinal);
    const tousPoulaillersEleveur = eleveurIdFinal
      ? await Poulailler.find({
          owner: eleveurIdFinal,
          isArchived: { $ne: true },
        }).lean()
      : [];

    return res.json({
      success: true,
      message:
        "Dossier validé avec succès. Tous les poulaillers sont en cours d'installation.",
      data: {
        dossier: {
          ...dossierFinal,
          eleveur: sanitizeEleveur(dossierFinal.eleveur),
          remainedAmount: Math.max(0, totalAmount - advanceAmount),
          poulailler: poulaillerFormate,
          tousPoulaillers:
            tousPoulaillersEleveur.length > 0
              ? tousPoulaillersEleveur.map(formatPoulailler)
              : [poulaillerFormate],
          _dossiersIds: dossiersIds,
        },
        user: userUpdated
          ? {
              _id: userUpdated._id,
              firstName: userUpdated.firstName,
              lastName: userUpdated.lastName,
              email: userUpdated.email,
              role: userUpdated.role,
              status: userUpdated.status,
              isActive: userUpdated.isActive,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[VALIDATE DOSSIER ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la validation du dossier",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Mettre à jour une étape BPMN
// @route   PATCH /api/admin/dossiers/:id/etape
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const updateEtape = async (req, res) => {
  try {
    const { etape, valeur } = req.body;

    const etapesAutorisees = [
      "dossierValide",
      "contratSigne",
      "esp32Installe",
      "invitationEnvoyee",
    ];

    if (!etapesAutorisees.includes(etape)) {
      return res.status(400).json({
        success: false,
        message: `Étape invalide. Valeurs autorisées : ${etapesAutorisees.join(", ")}`,
      });
    }

    if (typeof valeur !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Le champ 'valeur' doit être un booléen.",
      });
    }

    const dossiersIds = await resolveDossierIds(req);

    await Dossier.updateMany(
      { _id: { $in: dossiersIds } },
      { $set: { [`etapes.${etape}`]: valeur } },
    );

    const dossier = await Dossier.findById(req.params.id)
      .populate(
        "eleveur",
        "firstName lastName phone email adresse status isActive inviteToken",
      )
      .populate("poulailler");

    if (!dossier) {
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
    }

    const dossierObj = dossier.toObject ? dossier.toObject() : dossier;
    if (!dossierObj.contractNumber) {
      dossierObj.contractNumber = `SP-${String(dossierObj._id).slice(-6).toUpperCase()}`;
    }

    return res.json({
      success: true,
      message: `Étape "${etape}" mise à jour avec succès sur ${dossiersIds.length} dossier(s).`,
      data: {
        ...dossierObj,
        eleveur: sanitizeEleveur(dossierObj.eleveur),
      },
    });
  } catch (error) {
    console.error("[UPDATE ETAPE ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la mise à jour de l'étape",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Marquer le contrat comme signé
// @route   PATCH /api/admin/dossiers/:id/contrat-signe
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const marquerContratSigne = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) {
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
    }

    if (dossier.status === "ANNULE") {
      return res.status(400).json({
        success: false,
        message: "Impossible de signer un contrat pour un dossier annulé.",
      });
    }
    if (dossier.status === "TERMINE") {
      return res.status(400).json({
        success: false,
        message: "Ce dossier est déjà clôturé.",
      });
    }

    const dossiersIds = await resolveDossierIds(req);

    const updateFields = {
      "etapes.contratSigne": true,
      contratSigneDate: new Date(),
    };

    if (req.file) {
      updateFields.contratSignePdfUrl = `/uploads/contrats/${req.file.filename}`;
    }

    await Dossier.updateMany(
      { _id: { $in: dossiersIds } },
      { $set: updateFields },
    );

    const dossierMaj = await Dossier.findById(req.params.id)
      .populate(
        "eleveur",
        "firstName lastName phone email adresse status isActive inviteToken",
      )
      .populate("poulailler")
      .lean();

    if (!dossierMaj.contractNumber) {
      dossierMaj.contractNumber = `SP-${String(dossierMaj._id).slice(-6).toUpperCase()}`;
    }

    return res.json({
      success: true,
      message: "Contrat marqué comme signé avec succès.",
      data: {
        ...dossierMaj,
        eleveur: sanitizeEleveur(dossierMaj.eleveur),
      },
    });
  } catch (error) {
    console.error("[MARQUER CONTRAT SIGNE ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la confirmation de signature du contrat",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Clôturer le dossier
// @route   PATCH /api/admin/dossiers/clore/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const cloreDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) {
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
    }

    if (dossier.status === "EN_ATTENTE") {
      return res.status(400).json({
        success: false,
        message: "Un dossier en attente doit être validé avant d'être clôturé.",
      });
    }
    if (dossier.status === "TERMINE") {
      return res
        .status(400)
        .json({ success: false, message: "Ce dossier est déjà clôturé." });
    }
    if (dossier.status === "ANNULE") {
      return res.status(400).json({
        success: false,
        message: "Un dossier annulé ne peut pas être clôturé.",
      });
    }

    const { motifCloture } = req.body;
    if (!motifCloture?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Un motif de clôture est obligatoire.",
      });
    }

    const dossiersIds = await resolveDossierIds(req);
    const adminId = req.user?._id ?? req.user?.id;

    await Dossier.updateMany(
      { _id: { $in: dossiersIds } },
      {
        $set: {
          status: "TERMINE",
          dateCloture: new Date(),
          motifCloture: motifCloture.trim(),
          cloreBy: adminId,
        },
      },
    );

    const eleveurId = getEleveurId(dossier);
    if (eleveurId) {
      await User.findByIdAndUpdate(eleveurId, {
        $set: { status: "inactive", isActive: false },
      });
    }

    const dossierFinal = await Dossier.findById(req.params.id)
      .populate(
        "eleveur",
        "firstName lastName phone email adresse status isActive inviteToken",
      )
      .populate("poulailler")
      .lean();

    if (!dossierFinal.contractNumber) {
      dossierFinal.contractNumber = `SP-${String(dossierFinal._id).slice(-6).toUpperCase()}`;
    }

    return res.json({
      success: true,
      message:
        "Dossier clôturé avec succès. L'accès mobile de l'éleveur a été désactivé.",
      data: {
        ...dossierFinal,
        eleveur: sanitizeEleveur(dossierFinal.eleveur),
        remainedAmount: computeRemained(dossierFinal),
      },
    });
  } catch (error) {
    console.error("[CLORE DOSSIER ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la clôture du dossier",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Annuler le dossier
// @route   PATCH /api/admin/dossiers/annuler/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const annulerDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) {
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
    }

    if (dossier.status === "TERMINE") {
      return res.status(400).json({
        success: false,
        message: "Un dossier clôturé ne peut pas être annulé.",
      });
    }
    if (dossier.status === "ANNULE") {
      return res
        .status(400)
        .json({ success: false, message: "Ce dossier est déjà annulé." });
    }

    const { motifAnnulation } = req.body;
    if (!motifAnnulation?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Un motif d'annulation est obligatoire.",
      });
    }

    const avanceDejaPercue = dossier.status === "AVANCE_PAYEE";

    const dossiersIds = await resolveDossierIds(req);
    const adminId = req.user?._id ?? req.user?.id;

    await Dossier.updateMany(
      { _id: { $in: dossiersIds } },
      {
        $set: {
          status: "ANNULE",
          dateAnnulation: new Date(),
          motifAnnulation: motifAnnulation.trim(),
          annulePar: adminId,
        },
      },
    );

    const eleveurId = getEleveurId(dossier);
    if (avanceDejaPercue && eleveurId) {
      await User.findByIdAndUpdate(eleveurId, {
        $set: { status: "inactive", isActive: false },
      });
    }

    const dossierFinal = await Dossier.findById(req.params.id)
      .populate(
        "eleveur",
        "firstName lastName phone email adresse status isActive inviteToken",
      )
      .populate("poulailler")
      .lean();

    if (!dossierFinal.contractNumber) {
      dossierFinal.contractNumber = `SP-${String(dossierFinal._id).slice(-6).toUpperCase()}`;
    }

    return res.json({
      success: true,
      avanceDejaPercue,
      message: avanceDejaPercue
        ? "Dossier annulé. L'avance perçue devra être régularisée manuellement. Accès mobile désactivé."
        : "Dossier annulé. Aucune avance n'avait encore été perçue.",
      data: {
        ...dossierFinal,
        eleveur: sanitizeEleveur(dossierFinal.eleveur),
        remainedAmount: computeRemained(dossierFinal),
      },
    });
  } catch (error) {
    console.error("[ANNULER DOSSIER ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de l'annulation du dossier",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Mettre à jour les montants financiers
// @route   PUT /api/admin/dossiers/:id/finance
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const updateFinance = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) {
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
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

    if (isNaN(totalAmount) || totalAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "Le montant total est invalide (doit être un nombre positif).",
      });
    }
    if (isNaN(advanceAmount) || advanceAmount < 0) {
      return res.status(400).json({
        success: false,
        message:
          "Le montant de l'avance est invalide (doit être un nombre positif).",
      });
    }
    if (advanceAmount > totalAmount) {
      return res.status(400).json({
        success: false,
        message: `L'avance (${advanceAmount}) ne peut pas dépasser le montant total (${totalAmount}).`,
      });
    }

    const remainedAmount = Math.max(0, totalAmount - advanceAmount);

    const dossierMaj = await Dossier.findByIdAndUpdate(
      req.params.id,
      { $set: { totalAmount, advanceAmount, remainedAmount } },
      { new: true },
    )
      .populate(
        "eleveur",
        "firstName lastName phone email adresse status isActive",
      )
      .populate("poulailler")
      .lean();

    if (!dossierMaj.contractNumber) {
      dossierMaj.contractNumber = `SP-${String(dossierMaj._id).slice(-6).toUpperCase()}`;
    }

    return res.json({
      success: true,
      message: "Informations financières mises à jour avec succès.",
      data: { ...dossierMaj, totalAmount, advanceAmount, remainedAmount },
    });
  } catch (error) {
    console.error("[UPDATE FINANCE ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de la mise à jour des informations financières",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Supprimer définitivement
// @route   DELETE /api/admin/dossiers/:id
// @access  Private/Admin
// ─────────────────────────────────────────────────────────────────────────────
const deleteDossier = async (req, res) => {
  try {
    const dossier = await Dossier.findById(req.params.id);
    if (!dossier) {
      return res
        .status(404)
        .json({ success: false, message: "Dossier non trouvé" });
    }

    if (!["EN_ATTENTE", "ANNULE"].includes(dossier.status)) {
      return res.status(400).json({
        success: false,
        message:
          "Seuls les dossiers en attente ou annulés peuvent être supprimés définitivement.",
      });
    }

    const dossiersIds = await resolveDossierIds(req);
    await Dossier.deleteMany({ _id: { $in: dossiersIds } });

    return res.json({
      success: true,
      message: `${dossiersIds.length} dossier(s) supprimé(s) définitivement.`,
    });
  } catch (error) {
    console.error("[DELETE DOSSIER ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la suppression du dossier",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getDossiers,
  validateDossier,
  updateEtape,
  marquerContratSigne,
  cloreDossier,
  annulerDossier,
  deleteDossier,
  updateFinance,
};
