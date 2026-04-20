const DoorSchedule = require("../models/DoorSchedule");
const DoorEvent = require("../models/DoorEvent");
const { createDoorAlert } = require("../services/alertService");
const { publishDoorConfig } = require("../services/porteService");

// In-memory tracking of door motion times (to detect timeouts)
const doorMotionTracker = new Map();

/**
 * Mark door motion as started
 */
const trackDoorMotion = (poulaillerId, action) => {
  doorMotionTracker.set(poulaillerId, {
    action,
    startTime: Date.now(),
  });
};

/**
 * Check if door motion timed out (> 30s without reaching end switch)
 * ✅ CORRIGÉ — createDoorAlert appelé avec la bonne signature
 */
const mongoose = require("mongoose"); // FIX mongoose scope

const checkDoorTimeout = async (poulaillerId) => {
  if (!mongoose.Types.ObjectId.isValid(poulaillerId)) return;

  const motion = doorMotionTracker.get(poulaillerId);
  if (!motion) return;

  const elapsed = Date.now() - motion.startTime;
  if (elapsed > 30000) {
    try {
      await createDoorAlert(poulaillerId, "timeout", "auto");
      doorMotionTracker.delete(poulaillerId);
      console.log(`[DOOR] Timeout détecté pour ${poulaillerId}`);
    } catch (error) {
      console.error("[DOOR] Alert fail:", error.message);
    }
  }
};

/**
 * Record door motion completed successfully
 * ✅ CORRIGÉ — createDoorAlert appelé avec la bonne signature
 */
const recordDoorCompletion = async (poulaillerId, action) => {
  doorMotionTracker.delete(poulaillerId);

  // ✅ Signature correcte : (poultryId, eventKey, triggeredBy)
  const eventKey = action === "open" ? "scheduled_open" : "scheduled_close";
  await createDoorAlert(poulaillerId, eventKey, "scheduled");

  console.log(
    `[DOOR] Completion enregistrée : ${eventKey} pour ${poulaillerId}`,
  );
};

// GET /api/poulaillers/:id/door/schedule
exports.getDoorSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    let schedule = await DoorSchedule.findOne({ poulaillerId: id });

    if (!schedule) {
      schedule = new DoorSchedule({
        poulaillerId: id,
        openHour: 7,
        openMinute: 0,
        closeHour: 18,
        closeMinute: 0,
        enabled: true,
      });
      await schedule.save();
    }

    res.json({
      success: true,
      data: {
        openHour: schedule.openHour,
        openMinute: schedule.openMinute,
        closeHour: schedule.closeHour,
        closeMinute: schedule.closeMinute,
        enabled: schedule.enabled,
      },
    });
  } catch (error) {
    console.error("[DOOR] getDoorSchedule error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/poulaillers/:id/door/schedule
exports.updateDoorSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { openHour, openMinute, closeHour, closeMinute, enabled } = req.body;

    if (
      openHour === undefined ||
      openMinute === undefined ||
      closeHour === undefined ||
      closeMinute === undefined
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: openHour, openMinute, closeHour, closeMinute",
      });
    }

    if (
      ![openHour, closeHour].every((h) => h >= 0 && h <= 23) ||
      ![openMinute, closeMinute].every((m) => m >= 0 && m <= 59)
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid hour (0-23) or minute (0-59)",
      });
    }

    let schedule = await DoorSchedule.findOne({ poulaillerId: id });

    if (!schedule) {
      schedule = new DoorSchedule({
        poulaillerId: id,
        openHour,
        openMinute,
        closeHour,
        closeMinute,
        enabled: enabled !== undefined ? enabled : true,
      });
    } else {
      schedule.openHour = openHour;
      schedule.openMinute = openMinute;
      schedule.closeHour = closeHour;
      schedule.closeMinute = closeMinute;
      if (enabled !== undefined) schedule.enabled = enabled;
    }

    await schedule.save();

    try {
      await publishDoorConfig(id, schedule);
      console.log("[DOOR] Planning publie vers ESP32", {
        poulaillerId: id,
        openHour: schedule.openHour,
        openMinute: schedule.openMinute,
        closeHour: schedule.closeHour,
        closeMinute: schedule.closeMinute,
        enabled: schedule.enabled,
      });
    } catch (publishError) {
      console.error("[DOOR] publishDoorConfig error:", publishError.message);
      return res.status(502).json({
        success: false,
        error: `Planning sauvegarde, mais envoi MQTT impossible: ${publishError.message}`,
      });
    }

    res.json({
      success: true,
      message: "Door schedule updated",
      data: {
        openHour: schedule.openHour,
        openMinute: schedule.openMinute,
        closeHour: schedule.closeHour,
        closeMinute: schedule.closeMinute,
        enabled: schedule.enabled,
      },
    });
  } catch (error) {
    console.error("[DOOR] updateDoorSchedule error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/poulaillers/:id/door/history
exports.getDoorHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const events = await DoorEvent.find({ poulaillerId: id })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: events.map((event) => ({
        action: event.action,
        source: event.source,
        timestamp: event.timestamp,
      })),
    });
  } catch (error) {
    console.error("[DOOR] getDoorHistory error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Export helpers for MQTT handler and cron jobs
exports.trackDoorMotion = trackDoorMotion;
exports.recordDoorCompletion = recordDoorCompletion;
exports.checkDoorTimeout = checkDoorTimeout;
