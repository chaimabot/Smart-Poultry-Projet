const Poulailler = require("../models/Poulailler");
const Dossier = require("../models/Dossier"); // FIX #1 : import manquant — Dossier.create() était appelé
// sans que le modèle soit jamais requis → ReferenceError au runtime
const Measure = require("../models/Measure");
const Command = require("../models/Command");
const SystemConfig = require("../models/SystemConfig");
const Joi = require("joi");
const mqttService = require("../services/mqttService");

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
// FIX #3 : le schéma Joi ne validait pas les champs réellement
//          utilisés à la création (surface, remarque, address,
//          attachments). Les champs type/description/location/photoUrl
//          étaient validés mais n'existent pas dans le modèle Mongoose,
//          entraînant des écritures silencieusement ignorées.
//          Le schéma est maintenant aligné sur le modèle Poulailler.
// ============================================================
const poulaillerSchema = Joi.object({
  name: Joi.string().min(3).max(80).required(),
  animalCount: Joi.number().integer().min(1).required(),
  surface: Joi.number().min(0.1).required(),
  remarque: Joi.string().max(200).allow("", null).default(null),
  address: Joi.string().max(300).allow("", null).default(null),
  attachments: Joi.array().items(Joi.object()).default([]),
  // champs financiers transmis au dossier (optionnels)
  totalAmount: Joi.number().min(0).default(0),
  advanceAmount: Joi.number().min(0).default(0),
});

// Schéma allégé pour la mise à jour (champs éditables seulement)
const updatePoulaillerSchema = Joi.object({
  name: Joi.string().min(3).max(80),
  animalCount: Joi.number().integer().min(1),
  surface: Joi.number().min(0.1),
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
      co2Max: 1500,
      nh3Max: 25,
      dustMax: 150,
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

// ============================================================
// @desc    Créer un nouveau poulailler
// @route   POST /api/poulaillers
// @access  Private (Eleveur)
// ============================================================
exports.createPoulailler = async (req, res) => {
  try {
    const { error, value } = poulaillerSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, error: error.details[0].message });
    }

    const defaultThresholds = await getDefaultThresholds();
    const uniqueCode = generateUniqueCode();

    // FIX #4 : generateAutoName() et calculerDensite() étaient appelées
    //          sans être jamais définies dans ce fichier → ReferenceError.
    //          - name : value.name est déjà validé required() par Joi, le fallback était inutile.
    //          - densite : le middleware pre("save") du modèle Poulailler recalcule
    //            automatiquement la densité ; pas besoin de la calculer ici.
    const name = value.name.trim();

    // FIX #5 : normalizeAttachments() était appelée sans être définie → ReferenceError.
    //          Remplacement par un accès direct à value.attachments (déjà validé par Joi).
    const attachments = value.attachments ?? [];

    // FIX #6 : status "PENDING" n'existe pas dans l'enum du modèle Poulailler
    //          ("en_attente_module" | "connecte" | "hors_ligne" | "maintenance").
    //          Utilisation de la valeur correcte de l'enum.
    // FIX #7 : isOnline n'est pas un champ du modèle Poulailler → ignoré silencieusement.
    //          Supprimé pour éviter toute confusion.
    const poulailler = await Poulailler.create({
      name,
      animalCount: value.animalCount,
      surface: value.surface,
      remarque: value.remarque ?? null,
      address: value.address ?? null,
      attachments,
      owner: req.user.id,
      status: "en_attente_module", // valeur correcte de l'enum
      uniqueCode,
      thresholds: { ...defaultThresholds },
    });

    // FIX #8 : createdAt est géré automatiquement par { timestamps: true } dans
    //          le schéma Dossier. Passer createdAt: Date.now() en dur écrase
    //          le comportement Mongoose et peut provoquer un cast error (Number
    //          au lieu de Date). Champ supprimé.
    const dossier = await Dossier.create({
      eleveur: req.user.id,
      poulailler: poulailler._id,
      status: "EN_ATTENTE",
      totalAmount: value.totalAmount ?? 0,
      advanceAmount: value.advanceAmount ?? 0,
    });

    console.log(
      `[CREATE REQUEST] Poulailler + Dossier créés pour user ${req.user.id}`,
    );

    res.status(201).json({
      success: true,
      message: "Demande envoyée à l'administrateur",
      data: { poulailler, dossier },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
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
      return res
        .status(403)
        .json({
          success: false,
          error: "Action non autorisée sur ce poulailler",
        });
    }

    const { error, value } = updatePoulaillerSchema.validate(req.body);
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
      return res
        .status(403)
        .json({
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
      return res
        .status(403)
        .json({
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

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: "Non autorisé" });
    }

    res.status(200).json({ success: true, data: poulailler.thresholds });
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

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }
    if (poulailler.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: "Non autorisé" });
    }

    poulailler.thresholds = {
      ...poulailler.thresholds.toObject(),
      ...req.body,
    };
    // FIX #13 : poulailler.thresholds est un sous-document Mongoose, pas un
    //           plain object. Le spread `{ ...poulailler.thresholds }` copie les
    //           propriétés du prototype Mongoose (getters/setters) ce qui peut
    //           perdre des valeurs. `.toObject()` produit un plain object fiable.
    await poulailler.save();

    await syncConfig(req.params.id, mqttService);

    res.status(200).json({ success: true, data: poulailler.thresholds });
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

// Export syncConfig pour usage dans mqttService
exports.syncConfig = syncConfig;
