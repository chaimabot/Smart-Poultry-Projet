const Poulailler = require("../models/Poulailler");
const Measure = require("../models/Measure");
const Command = require("../models/Command");
const SystemConfig = require("../models/SystemConfig");
const Joi = require("joi");
const mqttService = require("../services/mqttService");

// ============================================================
// SYNC CONFIG → ESP32
// BUG CORRIGÉ #1 : tempMin et waterMin étaient absents du payload
// L'ESP32 ne pouvait pas ajuster lampe ni pompe correctement
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
      waterHysteresis: 10, // ← Ajouté
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

// Validation Joi pour la création/mise à jour de poulailler
const poulaillerSchema = Joi.object({
  name: Joi.string().min(3).max(50).required(),
  type: Joi.string()
    .valid("pondeuses", "chair", "dindes", "canards", "autre")
    .required(),
  animalCount: Joi.number().min(1).required(),
  description: Joi.string().max(200).allow("", null),
  location: Joi.string().allow("", null),
  photoUrl: Joi.string().allow("", null),
});

// ============================================================
// HELPER : générer un code unique pour le poulailler
// ============================================================
function generateUniqueCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ============================================================
// HELPER : obtenir les seuils par défaut depuis SystemConfig
// ============================================================
async function getDefaultThresholds() {
  try {
    const config = await SystemConfig.getDefaultThresholds();
    return config;
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

// ============================================================
// HELPER : échantillonner un tableau à N points max
// ============================================================
function sampleHistory(arr, n) {
  if (!arr || arr.length === 0) return [];
  if (arr.length <= n) return arr;
  const step = Math.floor(arr.length / n);
  return Array.from({ length: n }, (_, i) => arr[i * step]);
}

// @desc    Créer un nouveau poulailler
// @route   POST /api/poulaillers
// @access  Private (Eleveur)
exports.createPoulailler = async (req, res) => {
  try {
    const { error } = poulaillerSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, error: error.details[0].message });
    }

    const defaultThresholds = await getDefaultThresholds();
    const uniqueCode = generateUniqueCode();

    const poulailler = await Poulailler.create({
      ...req.body,
      owner: req.user.id,
      status: "en_attente_module",
      thresholds: { ...defaultThresholds },
      uniqueCode,
    });

    console.log(
      "[CREATE POULAILLER] Seuils par défaut appliqués:",
      defaultThresholds,
    );
    console.log("[CREATE POULAILLER] uniqueCode généré:", uniqueCode);

    res.status(201).json({ success: true, data: poulailler });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Obtenir tous les poulaillers de l'utilisateur connecté
// @route   GET /api/poulaillers
// @access  Private
exports.getPoulaillers = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { owner: req.user.id };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const poulaillers = await Poulailler.find({
      ...query,
      isArchived: false,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: poulaillers.length,
      data: poulaillers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Obtenir un poulailler par ID
// @route   GET /api/poulaillers/:id
// @access  Private
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

// @desc    Mettre à jour un poulailler
// @route   PUT /api/poulaillers/:id
// @access  Private
exports.updatePoulailler = async (req, res) => {
  try {
    let poulailler = await Poulailler.findById(req.params.id);

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

    if (
      Object.keys(req.body).length === 1 &&
      typeof req.body.isArchived === "boolean"
    ) {
      // pas de validation complète pour restauration
    } else {
      const { error } = poulaillerSchema.validate(req.body);
      if (error) {
        return res
          .status(400)
          .json({ success: false, error: error.details[0].message });
      }
    }

    const fieldsToUpdate = {
      name: req.body.name,
      type: req.body.type,
      animalCount: req.body.animalCount,
      description: req.body.description,
      location: req.body.location,
      photoUrl: req.body.photoUrl,
    };

    if (typeof req.body.isArchived === "boolean") {
      fieldsToUpdate.isArchived = req.body.isArchived;
    }

    poulailler = await Poulailler.findByIdAndUpdate(
      req.params.id,
      fieldsToUpdate,
      { returnDocument: "after", runValidators: true },
    );

    res.status(200).json({ success: true, data: poulailler });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Supprimer un poulailler
// @route   DELETE /api/poulaillers/:id
// @access  Private
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

// @desc    Archiver un poulailler
// @route   POST /api/poulaillers/:id/archive
// @access  Private
exports.archivePoulailler = async (req, res) => {
  try {
    let poulailler = await Poulailler.findById(req.params.id);

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

// @desc    Obtenir le résumé statistique pour le dashboard
// @route   GET /api/poulaillers/summary
// @access  Private
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

// @desc    Obtenir les poulaillers critiques uniquement
// @route   GET /api/poulaillers/critical
// @access  Private
exports.getCriticalPoulaillers = async (req, res) => {
  try {
    const poulaillers = await Poulailler.find({
      owner: req.user.id,
      isCritical: true,
      isArchived: false,
    }).sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: poulaillers.length,
      data: poulaillers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Obtenir les seuils d'un poulailler
// @route   GET /api/poulaillers/:id/thresholds
// @access  Private
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

// @desc    Mettre à jour les seuils
// @route   PUT /api/poulaillers/:id/thresholds
// @access  Private
exports.updateThresholds = async (req, res) => {
  try {
    let poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    if (poulailler.owner.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: "Non autorisé" });
    }

    poulailler.thresholds = { ...poulailler.thresholds, ...req.body };
    await poulailler.save();

    // Synchroniser les nouveaux seuils avec l'ESP32 immédiatement
    await syncConfig(req.params.id, mqttService);

    res.status(200).json({ success: true, data: poulailler.thresholds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Réinitialiser les seuils par défaut (depuis SystemConfig)
// @route   POST /api/poulaillers/:id/thresholds/reset
// @access  Private
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

    // Synchroniser les seuils réinitialisés avec l'ESP32
    await syncConfig(req.params.id, mqttService);

    res.status(200).json({ success: true, data: poulailler.thresholds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Obtenir les mesures actuelles (depuis MQTT ou dernière mesure)
// @route   GET /api/poulaillers/:id/current-measures
// @access  Private
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

    if (poulailler.lastMonitoring && poulailler.lastMonitoring.timestamp) {
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

// @desc    Obtenir les poulaillers archivés
// @route   GET /api/poulaillers/archives
// @access  Private
exports.getArchivedPoulaillers = async (req, res) => {
  try {
    const poulaillers = await Poulailler.find({
      owner: req.user.id,
      isArchived: true,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: poulaillers.length,
      data: poulaillers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Obtenir les données de monitoring complètes (avec historique 24h)
// @route   GET /api/poulaillers/:id/monitoring
// @access  Private
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

// @desc    Contrôler un actionneur (porte / ventilation / lampe / pompe)
// @route   PATCH /api/poulaillers/:id/actuators
// @access  Private
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
        // BUG CORRIGÉ #2 : message d'erreur mis à jour pour inclure tous les actionneurs valides
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

    // Publier MQTT vers ESP32
    const mqttClient = mqttService.getMqttClient();
    if (mqttClient && mqttClient.connected) {
      // Utiliser uniqueCode si disponible, sinon l'ID MongoDB
      const poulaillerId = poulailler.uniqueCode || poulailler._id.toString();

      // Topic par actionneur (cohérent avec ce que l'ESP32 écoute)
      const topicMap = {
        door: "door",
        ventilation: "fan",
        lamp: "lamp",
        pump: "pump",
      };

      const espTopic = `poulailler/${poulaillerId}/cmd/${topicMap[actuator]}`;

      // Format du payload selon l'actionneur
      let mqttPayload;
      if (actuator === "door") {
        // La porte utilise {"action": "open"/"stop"}
        mqttPayload = {
          action: state === "open" ? "open" : "stop",
        };
      } else {
        // Ventilateur, lampe, pompe utilisent {"on": true/false, "mode": "auto"/"manual"}
        mqttPayload = {
          on: state === "on",
          mode: mode || "manual",
        };
      }

      console.log(
        `[MQTT PAYLOAD] actuator=${actuator} state=${state} mode=${mode} payload=${JSON.stringify(mqttPayload)}`,
      );
      mqttClient.publish(espTopic, JSON.stringify(mqttPayload), { qos: 1 });
      console.log(`[MQTT→ESP32] ${espTopic}: ${JSON.stringify(mqttPayload)}`);
    } else {
      console.warn("[MQTT] Client non connecté pour commande", actuator);
    }

    // Enregistrement de la commande en base
    // BUG CORRIGÉ #2 & #8 : typeMap inclut "pompe", actionMap en français pour la DB
    const typeMap = {
      door: "porte",
      ventilation: "ventilateur",
      lamp: "lampe",
      pump: "pompe", // AJOUT
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

    // Sync config thresholds après toute commande actionneur
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

// @desc    Obtenir l'historique des mesures par capteur et période
// @route   GET /api/poulaillers/:id/history?sensor=temperature&period=24h
// @access  Private
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

    const periodMap = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    const duration = periodMap[period] || periodMap["24h"];
    const since = new Date(Date.now() - duration);

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

    res.status(200).json({
      success: true,
      sensor,
      period,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// Export syncConfig pour usage dans mqttService
exports.syncConfig = syncConfig;
