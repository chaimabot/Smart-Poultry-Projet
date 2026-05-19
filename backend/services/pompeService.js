// services/pompeService.js

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
  async sendPumpCommand(id, mode, action, changeModeOnly = false) {
    const poulailler = await Poulailler.findById(id);
    if (!poulailler) throw new Error("Poulailler introuvable");

    console.log(`[pompeService] Commande:`, {
      poulaillerId: id,
      mode,
      action,
      changeModeOnly,
    });

    // ✅ Détecter si on passe d'AUTO à MANUEL
    const previousMode = poulailler.actuatorStates.pump.mode;
    const isAutoToManual = previousMode === "auto" && mode === "manual";

    // ── 1. Mettre à jour la BD ──────────────────────────────────────────
    if (mode) {
      poulailler.actuatorStates.pump.mode = mode;
    }

    // ✅ Si AUTO → MANUEL : forcer status=off
    if (isAutoToManual) {
      console.log(
        `[pompeService] 🛑 Passage AUTO → MANUEL : arrêt forcé de la pompe`,
      );
      poulailler.actuatorStates.pump.status = "off";
      poulailler.actuatorStates.pump.lastAutoReason = "";
    } else if (!changeModeOnly && action) {
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

    // ── 2. Envoi MQTT ───────────────────────────────────────────────────
    const client = getMqttClient();
    if (!client || !client.connected) {
      console.error("[pompeService] MQTT client non connecté");
      throw new Error("MQTT client non connecté");
    }

    const macAddress = await getMacAddress(id);
    const topic = `poulailler/${macAddress}/cmd/pump`;

    // ✅ Si AUTO → MANUEL : envoyer OFF immédiatement à l'ESP32
    if (isAutoToManual) {
      const payload = JSON.stringify({ on: false, mode: "manual" });

      client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error("[pompeService] ❌ Erreur publish arrêt:", err.message);
        } else {
          console.log(
            `[pompeService] ✅ Arrêt forcé MQTT: ${topic} → ${payload}`,
          );
        }
      });
    }
    // ✅ Sinon : envoi normal si action explicite
    else if (!changeModeOnly && action) {
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

    // ── 3. Si on passe en AUTO, déclencher évaluation immédiate ──────────
    if (mode === "auto") {
      console.log(`[pompeService] 🤖 Déclenchement évaluation AUTO immédiate`);
      try {
        const { evaluateAutoControls } = require("./autoControlService");
        const freshPoulailler = await Poulailler.findById(id);
        await evaluateAutoControls(freshPoulailler, macAddress, client);
      } catch (e) {
        console.error("[pompeService] Erreur évaluation AUTO:", e.message);
      }
    }

    // ── 4. Archiver la commande ─────────────────────────────────────────
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
        console.log(`[pompeService] Config publiée: ${configTopic}`);

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
