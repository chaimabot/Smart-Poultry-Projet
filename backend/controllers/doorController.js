const DoorSchedule = require("../models/DoorSchedule");
const DoorEvent = require("../models/DoorEvent");
const { createDoorAlert } = require("../services/alertService");

// In-memory tracking of door motion times (to detect timeouts)
const doorMotionTracker = new Map();

/**
 * Mark door motion as started
 * Used to detect if motor is stuck after 30s
 */
const trackDoorMotion = (poulaillerId, action) => {
  doorMotionTracker.set(poulaillerId, {
    action,
    startTime: Date.now(),
  });
};

/**
 * Check if door motion timed out (> 30s without reaching end switch)
 */
const checkDoorTimeout = async (poulaillerId) => {
  const motion = doorMotionTracker.get(poulaillerId);
  if (!motion) return;

  const elapsed = Date.now() - motion.startTime;
  if (elapsed > 30000) {
    // Motor stuck for more than 30s
    await createDoorAlert(
      poulaillerId,
      "door_timeout",
      "danger",
      "⚠️ Moteur porte bloqué (fin de course non atteinte après 30s)"
    );
    doorMotionTracker.delete(poulaillerId);
  }
};

/**
 * Record door motion completed successfully
 */
const recordDoorCompletion = async (poulaillerId, action) => {
  doorMotionTracker.delete(poulaillerId);

  const messages = {
    open: "✅ Porte ouverte à l'heure programmée",
    close: "✅ Porte fermée à l'heure programmée",
  };

  await createDoorAlert(
    poulaillerId,
    `door_${action}`,
    "info",
    messages[action] || `Porte ${action}`
  );
};

exports.getDoorSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    let schedule = await DoorSchedule.findOne({ poulaillerId: id });

    // If no schedule exists, create default one
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

    // Validation
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
