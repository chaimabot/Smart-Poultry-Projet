const Poulailler = require("../models/Poulailler");
const Dossier = require("../models/Dossier"); // FIX #1 : import manquant — Dossier.create() était appelé
// sans que le modèle soit jamais requis → ReferenceError au runtime
const Measure = require("../models/Measure");
const Command = require("../models/Command");
const SystemConfig = require("../models/SystemConfig");
const Joi = require("joi");
const mqttService = require("../services/mqttService");
const { createActuatorAlert } = require("../services/alertService");

// ============================================================
// SYNC CONFIG → ESP32
// ============================================================
async function syncConfig(poulaillerId, mqttSvc) {
  try {
    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler) return;

    const mqttClient = mqttSvc.getMqttClient();
    if (!mqttClient || !mqttClient.connected) {
      console.warn("[SYNC CONFIG] MQTT non connecté");
      return;
    }

    const id = poulailler.uniqueCode || poulailler._id.toString();
    const topic = `poulailler/${id}/config`;

    // FIX #2 : opérateur || avec valeur 0 — si un seuil est volontairement 0,
    //          `|| 20` l'écrase par le fallback. Utilisation de ?? (nullish coalescing)
    //          pour ne tomber sur le fallback que si la valeur est null/undefined.
    const config = {
      tempMin: poulailler.thresholds.temperatureMin ?? 20,
      tempMax: poulailler.thresholds.temperatureMax ?? 30,
      waterMin: poulailler.thresholds.waterLevelMin ?? 25,
      waterHysteresis: 10,
      lampMode: poulailler.actuatorStates?.lamp?.mode ?? "auto",
      pumpMode: poulailler.actuatorStates?.pump?.mode ?? "auto",
      fanMode: poulailler.actuatorStates?.ventilation?.mode ?? "auto",
    };

    mqttClient.publish(topic, JSON.stringify(config), {
      qos: 1,
      retain: false,
    });
    console.log(`[SYNC CONFIG] Envoyé sur ${topic}:`, config);
  } catch (err) {
    console.error("[SYNC CONFIG] Erreur:", err.message);
  }
}

// ============================================================
// VALIDATION JOI
// Options communes :
//   stripUnknown : ignore les champs inconnus au lieu de les rejeter
//                  (évite les 400 sur des champs mobiles supplémentaires)
//   abortEarly   : remonte toutes les erreurs en une seule réponse
//   convert      : caste "12" → 12, "true" → true automatiquement
//                  (fréquent depuis FormData React Native / multipart)
// ============================================================
const JOI_OPTS = { stripUnknown: true, abortEarly: false, convert: true };

const poulaillerSchema = Joi.object({
  name: Joi.string().min(3).max(80).required(),
  animalCount: Joi.number().integer().min(1).required(),
  surface: Joi.number().positive().required(),
  remarque: Joi.string().max(200).allow("", null).default(null),
  address: Joi.string().max(300).allow("", null).default(null),
  attachments: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        type: Joi.string().required(),
        size: Joi.number().allow(null).default(null),
        uri: Joi.string().allow(null, "").default(null),
        base64: Joi.string().allow(null, "").default(null),
      }).unknown(true), // tolère d'éventuels champs supplémentaires
    )
    .default([]),
  totalAmount: Joi.number().min(0).default(0),
  advanceAmount: Joi.number().min(0).default(0),
});

// Schéma allégé pour la mise à jour (champs éditables seulement)
const updatePoulaillerSchema = Joi.object({
  name: Joi.string().min(3).max(80),
  animalCount: Joi.number().integer().min(1),
  surface: Joi.number().positive(),
  remarque: Joi.string().max(200).allow("", null),
  address: Joi.string().max(300).allow("", null),
  attachments: Joi.array().items(Joi.object()),
  isArchived: Joi.boolean(),
});

// ============================================================
// HELPERS
// ============================================================
function generateUniqueCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function getDefaultThresholds() {
  try {
    return await SystemConfig.getDefaultThresholds();
  } catch (err) {
    console.error("[getDefaultThresholds] Erreur:", err.message);
    return {
      temperatureMin: 18,
      temperatureMax: 28,
      humidityMin: 40,
      humidityMax: 70,
      airQualityMin: 20, // ← remplace co2Max, nh3Max, dustMax
      waterLevelMin: 20,
    };
  }
}

function sampleHistory(arr, n) {
  if (!arr || arr.length === 0) return [];
  if (arr.length <= n) return arr;
  const step = Math.floor(arr.length / n);
  return Array.from({ length: n }, (_, i) => arr[i * step]);
}
function getActuatorAlertReason(poulailler, actuator, state, triggeredBy) {
  if (triggeredBy !== "auto") return null;

  const m = poulailler.lastMonitoring || {};
  const t = poulailler.thresholds || {};

  if (actuator === "ventilation" && state === "on") {
    if (
      m.temperature != null &&
      t.temperatureMax != null &&
      m.temperature > t.temperatureMax
    ) {
      return "température trop élevée";
    }
    if (
      m.humidity != null &&
      t.humidityMax != null &&
      m.humidity > t.humidityMax
    ) {
      return "humidité trop élevée";
    }
    if (m.co2 != null && t.co2Max != null && m.co2 > t.co2Max) {
      return "qualité de l'air dégradée";
    }
    if (m.nh3 != null && t.nh3Max != null && m.nh3 > t.nh3Max) {
      return "gaz toxique détecté";
    }
    if (m.dust != null && t.dustMax != null && m.dust > t.dustMax) {
      return "poussière trop élevée";
    }
    return "conditions du poulailler anormales";
  }

  if (actuator === "lamp" && state === "on") {
    if (
      m.temperature != null &&
      t.temperatureMin != null &&
      m.temperature < t.temperatureMin
    ) {
      return "température trop basse";
    }
    return "besoin de chauffage";
  }

  if (actuator === "pump" && state === "on") {
    if (
      m.waterLevel != null &&
      t.waterLevelMin != null &&
      m.waterLevel < t.waterLevelMin
    ) {
      return "niveau d'eau bas";
    }
    return "remplissage nécessaire";
  }

  return null;
}
// ============================================================
// @desc    Créer un nouveau poulailler
// @route   POST /api/poulaillers
// @access  Private (Eleveur)
// ============================================================
exports.createPoulailler = async (req, res) => {
  // FIX DOSSIER #1 : stripUnknown:true — sans cette option, tout champ inattendu
  //   dans req.body (ex: un champ envoyé par le mobile non déclaré dans le schéma Joi)
  //   provoquait une erreur de validation Joi et bloquait la fonction avant même
  //   d'atteindre Poulailler.create() ou Dossier.create().
  const { error, value } = poulaillerSchema.validate(req.body, JOI_OPTS);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details.map((d) => d.message).join(", "),
    });
  }

  // FIX DOSSIER #2 : création atomique avec rollback.
  //   Dans la version précédente, si Dossier.create() échouait après que
  //   Poulailler.create() avait réussi, le poulailler était créé en base
  //   sans aucun dossier associé, et l'erreur était avalée par le catch générique
  //   sans aucune trace exploitable. Désormais :
  //   - le poulailler créé est supprimé (rollback) si le dossier échoue
  //   - les deux erreurs (Poulailler + Dossier) sont loguées séparément
  let poulailler = null;

  try {
    const defaultThresholds = await getDefaultThresholds();
    const uniqueCode = generateUniqueCode();

    poulailler = await Poulailler.create({
      name: value.name.trim(),
      animalCount: value.animalCount,
      surface: value.surface,
      remarque: value.remarque ?? null,
      address: value.address ?? null,
      attachments: value.attachments ?? [],
      owner: req.user.id,
      status: "en_attente_module",
      uniqueCode,
      thresholds: { ...defaultThresholds },
    });

    console.log(`[CREATE] Poulailler créé : ${poulailler._id} (${uniqueCode})`);
  } catch (err) {
    console.error("[CREATE] Échec Poulailler.create() :", err.message);
    return res
      .status(500)
      .json({ success: false, error: "Impossible de créer le poulailler." });
  }

  let dossier = null;

  try {
    // Generate a unique contract number based on timestamp + random
    const contractNumber = `CTR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    dossier = await Dossier.create({
      eleveur: req.user.id,
      poulailler: poulailler._id,
      status: "EN_ATTENTE",
      contractNumber, // FIX: Generate unique contractNumber to avoid duplicate key error on null values
      totalAmount: value.totalAmount ?? 0,
      advanceAmount: value.advanceAmount ?? 0,
    });

    console.log(
      `[CREATE] Dossier créé : ${dossier._id} pour poulailler ${poulailler._id}`,
    );
  } catch (err) {
    // Rollback : suppression du poulailler déjà inséré pour éviter un état incohérent
    console.error(
      "[CREATE] Échec Dossier.create() — rollback poulailler :",
      err.message,
    );
    await Poulailler.deleteOne({ _id: poulailler._id }).catch((e) =>
      console.error("[CREATE] Rollback échoué :", e.message),
    );
    return res.status(500).json({
      success: false,
      error: "Impossible de créer le dossier. L'opération a été annulée.",
    });
  }

  return res.status(201).json({
    success: true,
    message: "Demande envoyée à l'administrateur",
    data: { poulailler, dossier },
  });
};

// ============================================================
// @desc    Obtenir tous les poulaillers de l'utilisateur connecté
// @route   GET /api/poulaillers
// @access  Private
// ============================================================
exports.getPoulaillers = async (req, res) => {
  try {
    const { search } = req.query;
    const query = { owner: req.user.id, isArchived: false };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const poulaillers = await Poulailler.find(query).sort({ createdAt: -1 });

    res
      .status(200)
      .json({ success: true, count: poulaillers.length, data: poulaillers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Obtenir un poulailler par ID
// @route   GET /api/poulaillers/:id
// @access  Private
// ============================================================
exports.getPoulailler = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé à ce poulailler" });
    }

    res.status(200).json({ success: true, data: poulailler });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Mettre à jour un poulailler
// @route   PUT /api/poulaillers/:id
// @access  Private
// FIX #9 : le bloc de validation était cassé — la condition
//          `Object.keys(req.body).length === 1 && isArchived` court-circuitait
//          la validation pour n'importe quelle restauration, même avec des
//          champs invalides supplémentaires. Remplacé par un schéma Joi unifié
//          (updatePoulaillerSchema) qui accepte tous les champs optionnellement,
//          y compris isArchived.
// ============================================================
exports.updatePoulailler = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "Action non autorisée sur ce poulailler",
      });
    }

    const { error, value } = updatePoulaillerSchema.validate(
      req.body,
      JOI_OPTS,
    );
    if (error) {
      return res
        .status(400)
        .json({ success: false, error: error.details[0].message });
    }

    // FIX #10 : findByIdAndUpdate avec des champs undefined les envoie quand même
    //           dans le $set, effaçant les valeurs existantes. On ne construit
    //           l'objet qu'avec les clés effectivement présentes dans la requête.
    const fieldsToUpdate = {};
    const allowed = [
      "name",
      "animalCount",
      "surface",
      "remarque",
      "address",
      "attachments",
      "isArchived",
    ];
    for (const key of allowed) {
      if (value[key] !== undefined) fieldsToUpdate[key] = value[key];
    }

    const updated = await Poulailler.findByIdAndUpdate(
      req.params.id,
      fieldsToUpdate,
      { new: true, runValidators: true },
      // FIX #11 : returnDocument: "after" est l'option Mongo Driver, pas Mongoose.
      //           L'option Mongoose correcte est { new: true }.
    );

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Supprimer un poulailler
// @route   DELETE /api/poulaillers/:id
// @access  Private
// ============================================================
exports.deletePoulailler = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "Action non autorisée sur ce poulailler",
      });
    }

    await Poulailler.deleteOne({ _id: req.params.id });

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Archiver un poulailler
// @route   POST /api/poulaillers/:id/archive
// @access  Private
// ============================================================
exports.archivePoulailler = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "Action non autorisée sur ce poulailler",
      });
    }

    poulailler.isArchived = true;
    await poulailler.save();

    res.status(200).json({ success: true, data: poulailler });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Résumé statistique dashboard
// @route   GET /api/poulaillers/summary
// @access  Private
// ============================================================
exports.getPoulaillersSummary = async (req, res) => {
  try {
    const [total, critical, active] = await Promise.all([
      // FIX #12 : trois countDocuments séquentiels → un Promise.all parallèle.
      //           Pas un bug fonctionnel mais une regression de performance notable.
      Poulailler.countDocuments({ owner: req.user.id }),
      Poulailler.countDocuments({ owner: req.user.id, isCritical: true }),
      Poulailler.countDocuments({
        owner: req.user.id,
        status: { $in: ["connecte", "maintenance"] },
      }),
    ]);

    res.status(200).json({ success: true, data: { total, critical, active } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Poulaillers critiques
// @route   GET /api/poulaillers/critical
// @access  Private
// ============================================================
exports.getCriticalPoulaillers = async (req, res) => {
  try {
    const poulaillers = await Poulailler.find({
      owner: req.user.id,
      isCritical: true,
      isArchived: false,
    }).sort({ updatedAt: -1 });

    res
      .status(200)
      .json({ success: true, count: poulaillers.length, data: poulaillers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Obtenir les seuils
// @route   GET /api/poulaillers/:id/thresholds
// @access  Private
// ============================================================
exports.getThresholds = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: "Non autorisé" });

    const t = poulailler.thresholds.toObject();

    // Normaliser : mapper les anciens champs → airQualityMin
    const normalized = {
      temperatureMin: t.temperatureMin,
      temperatureMax: t.temperatureMax,
      humidityMin: t.humidityMin,
      humidityMax: t.humidityMax,
      airQualityMin: t.airQualityMin ?? t.co2Max ?? 20, // ← fallback anciens champs
      waterLevelMin: t.waterLevelMin,
    };

    res.status(200).json({ success: true, data: normalized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Mettre à jour les seuils
// @route   PUT /api/poulaillers/:id/thresholds
// @access  Private
// ============================================================
exports.updateThresholds = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: "Non autorisé" });

    const t = poulailler.thresholds.toObject();

    // Supprimer les anciens champs de la BD au passage
    const { co2Max, nh3Max, dustMax, ...cleanOld } = t;

    poulailler.thresholds = {
      ...cleanOld,
      ...req.body, // contient airQualityMin envoyé par le mobile
    };

    await poulailler.save();
    await syncConfig(req.params.id, mqttService);

    // Retourner normalisé
    const saved = poulailler.thresholds.toObject();
    const { co2Max: _c, nh3Max: _n, dustMax: _d, ...normalized } = saved;

    res.status(200).json({ success: true, data: normalized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Réinitialiser les seuils par défaut
// @route   POST /api/poulaillers/:id/thresholds/reset
// @access  Private
// ============================================================
exports.resetThresholds = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: "Non autorisé" });
    }

    const defaultThresholds = await getDefaultThresholds();
    poulailler.thresholds = { ...defaultThresholds };
    await poulailler.save();

    console.log("[RESET THRESHOLDS] Seuils réinitialisés:", defaultThresholds);

    await syncConfig(req.params.id, mqttService);

    res.status(200).json({ success: true, data: poulailler.thresholds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Mesures actuelles (cache lastMonitoring)
// @route   GET /api/poulaillers/:id/current-measures
// @access  Private
// ============================================================
exports.getCurrentMeasures = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });
    }

    if (poulailler.lastMonitoring?.timestamp) {
      const data = {
        temperature: {
          current: poulailler.lastMonitoring.temperature,
          trend: "stable",
        },
        humidity: {
          current: poulailler.lastMonitoring.humidity,
          trend: "stable",
        },
        co2: { current: poulailler.lastMonitoring.co2 },
        nh3: { current: poulailler.lastMonitoring.nh3 },
        dust: { current: poulailler.lastMonitoring.dust },
        waterLevel: { current: poulailler.lastMonitoring.waterLevel },
        timestamp: poulailler.lastMonitoring.timestamp,
        actuatorStates: poulailler.actuatorStates,
        status: "connected",
      };
      return res.status(200).json({ success: true, data });
    }

    res.status(200).json({
      success: true,
      data: null,
      message:
        "Aucune mesure disponible. Le module ESP32 n'est pas encore connecté.",
      status: "not_connected",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Poulaillers archivés
// @route   GET /api/poulaillers/archives
// @access  Private
// ============================================================
exports.getArchivedPoulaillers = async (req, res) => {
  try {
    const poulaillers = await Poulailler.find({
      owner: req.user.id,
      isArchived: true,
    }).sort({ createdAt: -1 });

    res
      .status(200)
      .json({ success: true, count: poulaillers.length, data: poulaillers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Monitoring complet (historique 24h)
// @route   GET /api/poulaillers/:id/monitoring
// @access  Private
// FIX #14 : fallback avec Math.random() — si aucune mesure n'existe,
//           le contrôleur renvoyait des données aléatoires inventées
//           comme si c'était de vraies mesures. Le client ne peut pas
//           distinguer un vrai 0 d'un fallback. Remplacé par une réponse
//           explicite indiquant l'absence de données.
// ============================================================
exports.getMonitoringData = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });
    }

    const [lastMeasure, historyRaw] = await Promise.all([
      Measure.findOne({ poulailler: req.params.id }).sort({ timestamp: -1 }),
      Measure.find({
        poulailler: req.params.id,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      })
        .sort({ timestamp: 1 })
        .select("temperature humidity co2 nh3 dust waterLevel timestamp"),
    ]);

    if (!lastMeasure) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "Aucune mesure disponible pour ce poulailler.",
        status: "no_data",
      });
    }

    const history = sampleHistory(historyRaw, 6);

    res.status(200).json({
      success: true,
      data: {
        temperature: { current: lastMeasure.temperature, trend: "stable" },
        humidity: { current: lastMeasure.humidity, trend: "stable" },
        co2: { current: lastMeasure.co2 },
        nh3: { current: lastMeasure.nh3 },
        dust: { current: lastMeasure.dust },
        waterLevel: { current: lastMeasure.waterLevel },
        timestamp: lastMeasure.timestamp,
        actuatorStates: {
          door: poulailler.actuatorStates?.door?.status ?? "closed",
          ventilation: poulailler.actuatorStates?.ventilation?.status ?? "off",
          lamp: poulailler.actuatorStates?.lamp?.status ?? "off",
          pump: poulailler.actuatorStates?.pump?.status ?? "off",
        },
        history: history.map((m) => m.temperature ?? 0),
        historyFull: history,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Contrôler un actionneur
// @route   PATCH /api/poulaillers/:id/actuators
// @access  Private
// ============================================================
exports.controlActuator = async (req, res) => {
  try {
    const { actuator, state, mode } = req.body;

    if (!actuator || !state) {
      return res
        .status(400)
        .json({ success: false, error: "actuator et state sont requis" });
    }

    const validActuators = ["door", "ventilation", "lamp", "pump"];
    const validStates = {
      door: ["open", "closed"],
      ventilation: ["on", "off"],
      lamp: ["on", "off"],
      pump: ["on", "off"],
    };

    if (!validActuators.includes(actuator)) {
      return res.status(400).json({
        success: false,
        error: `Actionneur invalide. Valeurs acceptées : ${validActuators.join(" | ")}`,
      });
    }
    if (!validStates[actuator].includes(state)) {
      return res.status(400).json({
        success: false,
        error: `État invalide pour ${actuator} : ${validStates[actuator].join(" | ")}`,
      });
    }

    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });
    }

    poulailler.actuatorStates[actuator].status = state;
    if (mode && ["auto", "manual"].includes(mode)) {
      poulailler.actuatorStates[actuator].mode = mode;
    }
    await poulailler.save();

    // Publication MQTT
    const mqttClient = mqttService.getMqttClient();
    if (mqttClient && mqttClient.connected) {
      const poulaillerId = poulailler.uniqueCode || poulailler._id.toString();
      const topicMap = {
        door: "door",
        ventilation: "fan",
        lamp: "lamp",
        pump: "pump",
      };
      const espTopic = `poulailler/${poulaillerId}/cmd/${topicMap[actuator]}`;

      const mqttPayload =
        actuator === "door"
          ? { action: state === "open" ? "open" : "stop" }
          : { on: state === "on", mode: mode ?? "manual" };
      // FIX #15 : `mode || "manual"` remplacé par `mode ?? "manual"` — si mode
      //           est une chaîne vide "", || bascule sur "manual" ce qui est
      //           trompeur. ?? ne bascule que sur null/undefined.

      mqttClient.publish(espTopic, JSON.stringify(mqttPayload), { qos: 1 });
      console.log(`[MQTT→ESP32] ${espTopic}: ${JSON.stringify(mqttPayload)}`);
    } else {
      console.warn("[MQTT] Client non connecté pour commande", actuator);
    }

    // Enregistrement commande en base
    const typeMap = {
      door: "porte",
      ventilation: "ventilateur",
      lamp: "lampe",
      pump: "pompe",
    };
    const actionMapFr = {
      door: { open: "ouvrir", closed: "fermer" },
      ventilation: { on: "demarrer", off: "arreter" },
      lamp: { on: "allumer", off: "eteindre" },
      pump: { on: "demarrer", off: "arreter" },
    };

    await Command.create({
      poulailler: poulailler._id,
      typeActionneur: typeMap[actuator],
      action: actionMapFr[actuator][state],
      issuedBy: req.user.id, // FIX #16 : "user" (string littérale) remplacé par
      // req.user.id pour traçabilité réelle de l'auteur.
      source: "mobile-app",
      status: "sent",
    });

    await syncConfig(req.params.id, mqttService);

    res.status(200).json({
      success: true,
      data: {
        actuator,
        state,
        mode: poulailler.actuatorStates[actuator].mode,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Historique des mesures par capteur et période
// @route   GET /api/poulaillers/:id/history?sensor=temperature&period=24h
// @access  Private
// ============================================================
exports.getMeasureHistory = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });
    }

    const sensor = req.query.sensor || "temperature";
    const period = req.query.period || "24h";

    const validSensors = [
      "temperature",
      "humidity",
      "co2",
      "nh3",
      "dust",
      "waterLevel",
    ];
    if (!validSensors.includes(sensor)) {
      return res.status(400).json({
        success: false,
        error: `Capteur invalide. Valeurs acceptées : ${validSensors.join(", ")}`,
      });
    }

    // FIX #17 : période invalide → silencieusement remplacée par "24h" sans avertir
    //           le client. Maintenant on retourne une erreur explicite.
    const periodMap = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    if (!periodMap[period]) {
      return res.status(400).json({
        success: false,
        error: `Période invalide. Valeurs acceptées : ${Object.keys(periodMap).join(", ")}`,
      });
    }

    const since = new Date(Date.now() - periodMap[period]);

    const measures = await Measure.find({
      poulailler: req.params.id,
      timestamp: { $gte: since },
      [sensor]: { $exists: true, $ne: null },
    })
      .sort({ timestamp: 1 })
      .select(`timestamp ${sensor}`);

    const data = measures.map((m) => ({
      timestamp: m.timestamp,
      value: m[sensor],
    }));

    res
      .status(200)
      .json({ success: true, sensor, period, count: data.length, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Obtenir l'historique des commandes d'un poulailler
// @route   GET /api/poulaillers/:id/commands
// @access  Private
// ============================================================
exports.getPoulaillerCommands = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });
    }

    const commands = await Command.find({ poulailler: req.params.id })
      .populate("issuedBy", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      count: commands.length,
      data: commands,
    });
  } catch (err) {
    console.error("[COMMANDS] Erreur:", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// Export syncConfig pour usage dans mqttService
exports.syncConfig = syncConfig;
