// services/pompeService.js (BACKEND)

const Poulailler = require("../models/Poulailler");
const Command = require("../models/Command");
const Module = require("../models/Module");
const { getMqttClient, markManualCommand } = require("./mqttService");

const getMacAddress = async (poulaillerId) => {
  const device = await Module.findOne({ poulailler: poulaillerId });
  if (!device?.macAddress) {
    throw new Error(`Aucun device/MAC trouvé pour ${poulaillerId}`);
  }
  return device.macAddress;
};

const pompeService = {
  async sendPumpCommand(id, mode, action, changeModeOnly = false) {
    const poulailler = await Poulailler.findById(id);
    if (!poulailler) throw new Error("Poulailler introuvable");

    console.log(`\n[pompeService] ═══════════════════════════════════════`);
    console.log(`[pompeService] Commande:`, {
      id,
      mode,
      action,
      changeModeOnly,
    });

    const previousMode = poulailler.actuatorStates.pump.mode;
    const previousStatus = poulailler.actuatorStates.pump.status;
    const isAutoToManual = previousMode === "auto" && mode === "manual";

    console.log(
      `[pompeService] Mode actuel: ${previousMode} (status: ${previousStatus})`,
    );
    console.log(`[pompeService] AUTO → MANUEL ? ${isAutoToManual}`);

    // Mise à jour BD
    if (mode) {
      poulailler.actuatorStates.pump.mode = mode;
    }

    if (isAutoToManual) {
      console.log(`[pompeService]    AUTO → MANUEL : ARRÊT FORCÉ`);
      poulailler.actuatorStates.pump.status = "off";
      poulailler.actuatorStates.pump.lastAutoReason = "";
    } else if (!changeModeOnly && action) {
      poulailler.actuatorStates.pump.status = action;
    } else if (mode === "auto") {
      poulailler.actuatorStates.pump.status = "off";
      poulailler.actuatorStates.pump.lastAutoReason = "";
    }

    await poulailler.save();
    console.log(
      `[pompeService]   BD: mode=${poulailler.actuatorStates.pump.mode}, status=${poulailler.actuatorStates.pump.status}`,
    );

    // Envoi MQTT
    const client = getMqttClient();
    if (!client || !client.connected) {
      throw new Error("MQTT client non connecté");
    }

    const macAddress = await getMacAddress(id);
    const topic = `poulailler/${macAddress}/cmd/pump`;

    if (isAutoToManual) {
      const payload = JSON.stringify({ on: false, mode: "manual" });
      console.log(`[pompeService]    Envoi ARRÊT FORCÉ: ${topic} → ${payload}`);

      //   Marquer commande manuelle pour bloquer les status pendant 3s
      markManualCommand(macAddress, "pump");

      client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[pompeService] ❌ Erreur:`, err.message);
        } else {
          console.log(`[pompeService]   Arrêt forcé envoyé`);
        }
      });
    } else if (!changeModeOnly && action) {
      const payload = JSON.stringify({
        on: action === "on",
        mode: mode || "manual",
      });
      console.log(`[pompeService] 📤 ${topic} → ${payload}`);

      //   Marquer commande manuelle
      if (mode === "manual") {
        markManualCommand(macAddress, "pump");
      }

      client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[pompeService] ❌ Erreur:`, err.message);
        } else {
          console.log(`[pompeService]   MQTT envoyé`);
        }
      });
    }

    // Déclencher évaluation AUTO immédiate
    if (mode === "auto" && !isAutoToManual) {
      console.log(`[pompeService] 🤖 Évaluation AUTO immédiate`);
      try {
        const { evaluateAutoControls } = require("./autoControlService");
        const freshPoulailler = await Poulailler.findById(id);
        await evaluateAutoControls(freshPoulailler, macAddress, client);
      } catch (e) {
        console.error(`[pompeService] Erreur évaluation:`, e.message);
      }
    }

    // Archive
    await Command.create({
      poulailler: id,
      typeActionneur: "pompe",
      action: isAutoToManual
        ? "arret_changement_mode"
        : changeModeOnly
          ? "changement_mode"
          : action === "on"
            ? "demarrer"
            : "arreter",
      mode,
      status: "sent",
    });

    console.log(`[pompeService] ═══════════════════════════════════════\n`);
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
        console.log(`[pompeService] Config: ${configTopic}`);

        if (poulailler.actuatorStates.pump.mode === "auto") {
          const { evaluateAutoControls } = require("./autoControlService");
          await evaluateAutoControls(poulailler, macAddress, client);
        }
      } catch (err) {
        console.warn(`[pompeService] Erreur config:`, err.message);
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
