const Poulailler = require("../models/Poulailler");
const Command = require("../models/Command");
const Module = require("../models/Module");
const { getMqttClient } = require("./mqttService");

// ============================================================================
// HELPER : obtenir la macAddress du device associé au poulailler
// ============================================================================
const getMacAddress = async (poulaillerId) => {
  const device = await Module.findOne({ poulailler: poulaillerId });
  if (!device?.macAddress) {
    throw new Error(
      `Aucun device/MAC trouvé pour le poulailler ${poulaillerId}`,
    );
  }
  return device.macAddress;
};

const pompeService = {
  // ============================================================================
  // Envoyer une commande pompe à l'ESP32 et logger en BD
  // @param {string} id             — ObjectId MongoDB du poulailler
  // @param {string} mode           — "auto" | "manual"
  // @param {string} action         — "on" | "off"
  // @param {boolean} changeModeOnly — Si true, ne change que le mode
  // ============================================================================
  async sendPumpCommand(id, mode, action, changeModeOnly = false) {
    const poulailler = await Poulailler.findById(id);
    if (!poulailler) throw new Error("Poulailler introuvable");

    const previousMode = poulailler.actuatorStates.pump.mode;
    const previousState = poulailler.actuatorStates.pump.status;

    console.log(`[pompeService] Commande reçue:`, {
      poulaillerId: id,
      mode,
      action,
      changeModeOnly,
      previousMode,
      previousState,
    });

    // ✅ Si changeModeOnly, on ne change que le mode
    if (changeModeOnly && mode) {
      poulailler.actuatorStates.pump.mode = mode;
      console.log(
        `[pompeService] Mode changé: ${previousMode} → ${mode} (état conservé: ${previousState})`,
      );
    } else {
      // ✅ Changement normal : mode + état
      if (mode) {
        poulailler.actuatorStates.pump.mode = mode;
      }
      if (action) {
        poulailler.actuatorStates.pump.status = action;
      }
      console.log(
        `[pompeService] État changé: ${previousState} → ${action || previousState}, Mode: ${previousMode} → ${mode || previousMode}`,
      );
    }

    await poulailler.save();

    // ✅ Publication MQTT avec l'état ACTUEL
    const client = getMqttClient();
    if (!client || !client.connected) {
      console.error("[pompeService] MQTT client non connecté");
      throw new Error("MQTT client non connecté");
    }

    const macAddress = await getMacAddress(id);
    const topic = `poulailler/${macAddress}/cmd/pump`;

    // ✅ Utiliser l'état actuel (pas forcé à action)
    const currentState = poulailler.actuatorStates.pump.status;
    const currentMode = poulailler.actuatorStates.pump.mode;

    const payload = JSON.stringify({
      on: currentState === "on",
      mode: currentMode,
    });

    client.publish(topic, payload, { qos: 1 });
    console.log(`[pompeService] MQTT publié sur ${topic}:`, payload);

    // Archivage de la commande
    const command = await Command.create({
      poulailler: id,
      typeActionneur: "pompe",
      action: changeModeOnly ? "changer_mode" : action || previousState,
      mode: currentMode,
      status: "sent",
    });

    console.log(`[pompeService] Commande sauvegardée:`, command._id);
    return command;
  },

  // ============================================================================
  // Mettre à jour les seuils eau et synchroniser avec l'ESP32
  // ============================================================================
  async updateAndSyncThresholds(id, waterLevelMin, waterHysteresis) {
    const poulailler = await Poulailler.findByIdAndUpdate(
      id,
      {
        "thresholds.waterLevelMin": waterLevelMin,
        "thresholds.waterHysteresis": waterHysteresis,
      },
      { new: true },
    );

    if (!poulailler) throw new Error("Erreur mise à jour DB");

    console.log(`[pompeService] Seuils mis à jour:`, {
      poulaillerId: id,
      waterLevelMin,
      waterHysteresis,
    });

    const client = getMqttClient();
    if (client && client.connected) {
      try {
        const macAddress = await getMacAddress(id);
        const configTopic = `poulailler/${macAddress}/config`;
        const configPayload = JSON.stringify({
          waterMin: waterLevelMin,
          waterHysteresis: waterHysteresis,
        });

        client.publish(configTopic, configPayload, { qos: 1 });
        console.log(`[pompeService] Config MQTT publiée sur ${configTopic}`);
      } catch (err) {
        console.warn(
          "[pompeService] Impossible d'envoyer la config MQTT:",
          err.message,
        );
      }
    }

    return poulailler.thresholds;
  },

  // Sécurité : vérifie si la pompe tourne depuis trop longtemps
  isRuntimeSafe(startTime) {
    const MAX_SECONDS = 30;
    const duration = (Date.now() - startTime) / 1000;
    return duration < MAX_SECONDS;
  },
};

module.exports = pompeService;
