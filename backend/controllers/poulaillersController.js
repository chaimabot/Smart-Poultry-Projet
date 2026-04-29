const Poulailler = require("../models/Poulailler");
const Dossier = require("../models/Dossier");
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

    const config = {
      tempMin: poulailler.thresholds.temperatureMin || 20,
      tempMax: poulailler.thresholds.temperatureMax || 30,
      waterMin: poulailler.thresholds.waterLevelMin || 25,
      waterHysteresis: 10,
      lampMode: poulailler.actuatorStates?.lamp?.mode || "auto",
      pumpMode: poulailler.actuatorStates?.pump?.mode || "auto",
      fanMode: poulailler.actuatorStates?.ventilation?.mode || "auto",
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
// SCHEMA JOI
// ============================================================
const attachmentSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().required(),
  size: Joi.number().optional().allow(null),
  uri: Joi.string().optional().allow("", null),
  base64: Joi.string().optional().allow("", null),
});

// ✅ FIX : densite est bien présent et optionnel
const poulaillerSchema = Joi.object({
  name: Joi.string().min(2).max(80).optional().allow("", null),
  animalCount: Joi.number().integer().min(1).required().messages({
    "number.base": "Le nombre de volailles doit être un nombre",
    "number.min": "Le nombre de volailles doit être au moins 1",
    "any.required": "Le nombre de volailles est requis",
  }),
  surface: Joi.number().positive().required().messages({
    "number.base": "La surface doit être un nombre",
    "number.positive": "La surface doit être supérieure à 0",
    "any.required": "La surface est requise",
  }),
  densite: Joi.number().optional().allow(null), // ✅ accepté par Joi
  remarque: Joi.string().max(200).optional().allow("", null),
  address: Joi.string().max(300).optional().allow("", null),
  attachments: Joi.array().items(attachmentSchema).optional().default([]),
});

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
// @desc    Créer un nouveau poulailler
// @route   POST /api/poulaillers
// @access  Private
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
    const finalName = value.name?.trim() || generateAutoName(); // ✅ FIX: utilise value.name
    const densite = calculerDensite(value.animalCount, value.surface);

    // ✅ FIX : const poultryData était manquant
    const poultryData = {
      name: finalName,
      animalCount: value.animalCount,
      surface: value.surface,
      densite,
      remarque: value.remarque || null,
      address: value.address || null,
      attachments: normalizeAttachments(value.attachments),
    };

    const poulailler = await Poulailler.create({
      ...poultryData,
      owner: req.user.id,
      status: "PENDING",
      isOnline: false,
      uniqueCode,
      thresholds: { ...defaultThresholds },
    });

    const dossier = await Dossier.create({
      eleveur: req.user.id,
      poulailler: poulailler._id,
      status: "EN_ATTENTE",
      totalAmount: req.body.totalAmount || 0,
      advanceAmount: req.body.advanceAmount || 0,
    });

    console.log(
      `[CREATE REQUEST] Poulailler + Dossier created for user ${req.user.id}`,
    );

    res.status(201).json({
      success: true,
      message: "Demande envoyée à l'administrateur",
      data: {
        poulailler,
        dossier,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Obtenir tous les poulaillers
// @route   GET /api/poulaillers
// @access  Private
// ============================================================
exports.getPoulaillers = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { owner: req.user.id, isArchived: false };
    if (search) query.name = { $regex: search, $options: "i" };

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
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });

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
// ============================================================
exports.updatePoulailler = async (req, res) => {
  try {
    let poulailler = await Poulailler.findById(req.params.id);
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, error: "Action non autorisée" });

    const isArchiveOnly =
      Object.keys(req.body).length === 1 &&
      typeof req.body.isArchived === "boolean";

    if (!isArchiveOnly) {
      const { error, value: validated } = poulaillerSchema.validate(req.body);
      if (error)
        return res
          .status(400)
          .json({ success: false, error: error.details[0].message });

      // ✅ FIX : "delete validated.densite" supprimé — on laisse le middleware pre-save recalculer
      const newCount = validated.animalCount ?? poulailler.animalCount;
      const newSurface = validated.surface ?? poulailler.surface;
      const densite = calculerDensite(newCount, newSurface);

      const fieldsToUpdate = {
        name: validated.name?.trim() || poulailler.name,
        animalCount: validated.animalCount,
        surface: validated.surface,
        densite,
        remarque: validated.remarque ?? poulailler.remarque,
        address: validated.address ?? poulailler.address,
        attachments: normalizeAttachments(validated.attachments),
      };

      if (typeof req.body.isArchived === "boolean")
        fieldsToUpdate.isArchived = req.body.isArchived;

      poulailler = await Poulailler.findByIdAndUpdate(
        req.params.id,
        fieldsToUpdate,
        {
          new: true,
          runValidators: true,
        },
      );

      console.log(
        `[UPDATE POULAILLER] "${poulailler.name}" | Densité: ${densite} | Fichiers: ${fieldsToUpdate.attachments.length}`,
      );
    } else {
      poulailler.isArchived = req.body.isArchived;
      await poulailler.save();
    }

    res.status(200).json({ success: true, data: poulailler });
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
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, error: "Action non autorisée" });

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
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, error: "Action non autorisée" });

    poulailler.isArchived = true;
    await poulailler.save();
    res.status(200).json({ success: true, data: poulailler });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Dashboard summary
// @route   GET /api/poulaillers/summary
// @access  Private
// ============================================================
exports.getPoulaillersSummary = async (req, res) => {
  try {
    const total = await Poulailler.countDocuments({ owner: req.user.id });
    const critical = await Poulailler.countDocuments({
      owner: req.user.id,
      isCritical: true,
    });
    const active = await Poulailler.countDocuments({
      owner: req.user.id,
      status: { $in: ["connecte", "maintenance"] },
    });
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
// @desc    Seuils — GET
// @route   GET /api/poulaillers/:id/thresholds
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
    res.status(200).json({ success: true, data: poulailler.thresholds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Seuils — PUT
// @route   PUT /api/poulaillers/:id/thresholds
// ============================================================
exports.updateThresholds = async (req, res) => {
  try {
    let poulailler = await Poulailler.findById(req.params.id);
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: "Non autorisé" });

    poulailler.thresholds = {
      ...poulailler.thresholds.toObject(),
      ...req.body,
    };
    await poulailler.save();
    await syncConfig(req.params.id, mqttService);
    res.status(200).json({ success: true, data: poulailler.thresholds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Seuils — RESET
// @route   POST /api/poulaillers/:id/thresholds/reset
// ============================================================
exports.resetThresholds = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res.status(403).json({ success: false, error: "Non autorisé" });

    poulailler.thresholds = await getDefaultThresholds();
    await poulailler.save();
    await syncConfig(req.params.id, mqttService);
    res.status(200).json({ success: true, data: poulailler.thresholds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Mesures actuelles
// @route   GET /api/poulaillers/:id/current-measures
// ============================================================
exports.getCurrentMeasures = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });

    if (poulailler.lastMonitoring?.timestamp) {
      return res.status(200).json({
        success: true,
        data: {
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
        },
      });
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
// @desc    Monitoring (historique 24h)
// @route   GET /api/poulaillers/:id/monitoring
// ============================================================
exports.getMonitoringData = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });

    const lastMeasure = await Measure.findOne({
      poulailler: req.params.id,
    }).sort({ timestamp: -1 });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const historyRaw = await Measure.find({
      poulailler: req.params.id,
      timestamp: { $gte: since24h },
    })
      .sort({ timestamp: 1 })
      .select("temperature humidity co2 nh3 dust waterLevel timestamp");

    const history = sampleHistory(historyRaw, 6);

    const measures = lastMeasure
      ? {
          temperature: { current: lastMeasure.temperature, trend: "stable" },
          humidity: { current: lastMeasure.humidity, trend: "stable" },
          co2: { current: lastMeasure.co2 },
          nh3: { current: lastMeasure.nh3 },
          dust: { current: lastMeasure.dust },
          waterLevel: { current: lastMeasure.waterLevel },
          timestamp: lastMeasure.timestamp,
        }
      : {
          temperature: { current: 15 + Math.random() * 15, trend: "up" },
          humidity: { current: 40 + Math.random() * 40, trend: "down" },
          co2: { current: Math.floor(400 + Math.random() * 1000) },
          nh3: { current: parseFloat((2 + Math.random() * 20).toFixed(1)) },
          dust: { current: Math.floor(10 + Math.random() * 100) },
          waterLevel: { current: Math.floor(30 + Math.random() * 60) },
          timestamp: new Date(),
        };

    res.status(200).json({
      success: true,
      data: {
        ...measures,
        actuatorStates: {
          door: poulailler.actuatorStates?.door?.status || "closed",
          ventilation: poulailler.actuatorStates?.ventilation?.status || "off",
          lamp: poulailler.actuatorStates?.lamp?.status || "off",
          pump: poulailler.actuatorStates?.pump?.status || "off",
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
// ============================================================
exports.controlActuator = async (req, res) => {
  try {
    const { actuator, state, mode } = req.body;
    if (!actuator || !state)
      return res
        .status(400)
        .json({ success: false, error: "actuator et state sont requis" });

    const validActuators = ["door", "ventilation", "lamp", "pump"];
    const validStates = {
      door: ["open", "closed"],
      ventilation: ["on", "off"],
      lamp: ["on", "off"],
      pump: ["on", "off"],
    };

    if (!validActuators.includes(actuator))
      return res.status(400).json({
        success: false,
        error: `Actionneur invalide. Valeurs acceptées : ${validActuators.join(" | ")}`,
      });
    if (!validStates[actuator].includes(state))
      return res.status(400).json({
        success: false,
        error: `État invalide pour ${actuator} : ${validStates[actuator].join(" | ")}`,
      });

    const poulailler = await Poulailler.findById(req.params.id);
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });

    poulailler.actuatorStates[actuator].status = state;
    if (mode && ["auto", "manual"].includes(mode))
      poulailler.actuatorStates[actuator].mode = mode;
    await poulailler.save();

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
          : { on: state === "on", mode: mode || "manual" };
      mqttClient.publish(espTopic, JSON.stringify(mqttPayload), { qos: 1 });
      console.log(`[MQTT→ESP32] ${espTopic}: ${JSON.stringify(mqttPayload)}`);
    } else {
      console.warn("[MQTT] Client non connecté pour commande", actuator);
    }

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
      issuedBy: "user",
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
// @desc    Historique mesures
// @route   GET /api/poulaillers/:id/history
// ============================================================
exports.getMeasureHistory = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);
    if (!poulailler)
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    if (poulailler.owner.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });

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
    if (!validSensors.includes(sensor))
      return res.status(400).json({
        success: false,
        error: `Capteur invalide. Valeurs acceptées : ${validSensors.join(", ")}`,
      });

    const periodMap = { "24h": 864e5, "7d": 6048e5, "30d": 2592e6 };
    const since = new Date(
      Date.now() - (periodMap[period] || periodMap["24h"]),
    );

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

exports.syncConfig = syncConfig;
