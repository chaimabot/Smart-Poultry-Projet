// services/pompeService.js (BACKEND)

const Poulailler = require("../models/Poulailler");
const Command = require("../models/Command");
const Module = require("../models/Module");
const { getMqttClient } = require("./mqttService");

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
  /**
   * Envoie une commande pompe à l'ESP32 et met à jour la BD
   * @param {string} id - ObjectId MongoDB du poulailler
   * @param {string} mode - "auto" | "manual"
   * @param {string} action - "on" | "off" (ignoré si changeModeOnly=true)
   * @param {boolean} changeModeOnly - Si true, ne change que le mode (pas l'état)
   */
  async sendPumpCommand(id, mode, action, changeModeOnly = false) {
    const poulailler = await Poulailler.findById(id);
    if (!poulailler) throw new Error("Poulailler introuvable");

    console.log(`[pompeService] Commande:`, {
      poulaillerId: id,
      mode,
      action,
      changeModeOnly,
    });

    // ✅ 1. Mettre à jour la BD
    if (mode) {
      poulailler.actuatorStates.pump.mode = mode;
    }

    if (!changeModeOnly && action) {
      poulailler.actuatorStates.pump.status = action;
    }

    // Si on passe en AUTO, reset la raison
    if (mode === "auto") {
      poulailler.actuatorStates.pump.lastAutoReason = "";
    }

    await poulailler.save();
    console.log(
      `[pompeService] ✅ BD: mode=${poulailler.actuatorStates.pump.mode}, status=${poulailler.actuatorStates.pump.status}`,
    );

    // ✅ 2. Envoi MQTT (seulement si action explicite OU mode manuel)
    const client = getMqttClient();
    if (!client || !client.connected) {
      console.error("[pompeService] MQTT client non connecté");
      throw new Error("MQTT client non connecté");
    }

    const macAddress = await getMacAddress(id);

    // ⚠️ Si changeModeOnly et mode=auto : ne pas envoyer de commande MQTT
    // (le serveur va évaluer juste après et envoyer la bonne commande)
    if (!changeModeOnly && action) {
      const topic = `poulailler/${macAddress}/cmd/pump`;
      const payload = JSON.stringify({
        on: action === "on",
        mode: mode || "manual",
      });

      client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error("[pompeService] ❌ Erreur publish:", err.message);
        } else {
          console.log(`[pompeService] ✅ MQTT: ${topic} → ${payload}`);
        }
      });
    }

    // ✅ 3. Si on passe en AUTO, déclencher immédiatement une évaluation
    if (mode === "auto") {
      console.log(`[pompeService] 🤖 Déclenchement évaluation AUTO immédiate`);
      try {
        const { evaluateAutoControls } = require("./autoControlService");
        // Récupérer la version fraîche
        const freshPoulailler = await Poulailler.findById(id);
        await evaluateAutoControls(freshPoulailler, macAddress, client);
      } catch (e) {
        console.error("[pompeService] Erreur évaluation AUTO:", e.message);
      }
    }

    // ✅ 4. Archiver la commande
    await Command.create({
      poulailler: id,
      typeActionneur: "pompe",
      action: changeModeOnly
        ? "changement_mode"
        : action === "on"
          ? "demarrer"
          : "arreter",
      mode,
      status: "sent",
    });

    return poulailler;
  },

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
        console.log(`[pompeService] Config publiée: ${configTopic}`);

        // ✅ Re-évaluer si en mode AUTO
        if (poulailler.actuatorStates.pump.mode === "auto") {
          const { evaluateAutoControls } = require("./autoControlService");
          await evaluateAutoControls(poulailler, macAddress, client);
        }
      } catch (err) {
        console.warn("[pompeService] Erreur config:", err.message);
      }
    }

    return poulailler.thresholds;
  },

  isRuntimeSafe(startTime) {
    const MAX_SECONDS = 30;
    const duration = (Date.now() - startTime) / 1000;
    return duration < MAX_SECONDS;
  },
};

module.exports = pompeService;
