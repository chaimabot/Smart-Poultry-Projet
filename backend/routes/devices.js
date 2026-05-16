// routes/deviceRoutes.js
const express = require("express");
const router = express.Router();
const Camera = require("../models/Camera");
const Poulailler = require("../models/Poulailler");
const { protect } = require("../middlewares/auth");

// GET /api/devices/by-poulailler/:poulaillerId
// Retourne la caméra ESP32-CAM associée (utilisé par usePoultryState.js)
router.get("/by-poulailler/:poulaillerId", protect, async (req, res) => {
  try {
    const camera = await Camera.findOne({
      poulailler: req.params.poulaillerId,
      status: { $nin: ["pending", "dissociated"] },
    }).select(
      "macAddress deviceName status lastPing streamUrl firmwareVersion",
    );

    if (!camera) {
      return res.status(404).json({
        success: false,
        error: "Aucune caméra active associée à ce poulailler",
      });
    }

    res.json({
      success: true,
      data: {
        macAddress: camera.macAddress,
        deviceName: camera.deviceName,
        status: camera.status,
        lastPing: camera.lastPing,
        streamUrl: camera.streamUrl,
        firmwareVersion: camera.firmwareVersion,
      },
    });
  } catch (err) {
    console.error("[DeviceRoute] Erreur:", err.message);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
});

// PATCH /api/devices/:macAddress/ping
// L'ESP32 appelle cette route au démarrage
router.patch("/:macAddress/ping", async (req, res) => {
  try {
    const normalizedMac = Camera.normalizeMac(req.params.macAddress);
    if (!normalizedMac) {
      return res.status(400).json({ success: false, error: "MAC invalide" });
    }

    const camera = await Camera.findOneAndUpdate(
      { macAddress: normalizedMac },
      { lastPing: new Date(), status: "associated" },
      { new: true },
    );

    if (!camera) {
      return res.status(404).json({
        success: false,
        error: "Caméra non enregistrée — associez-la d'abord dans l'app mobile",
      });
    }

    res.json({ success: true, data: camera });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/register
// L'ESP32 s'enregistre automatiquement au premier démarrage
router.post("/register", async (req, res) => {
  try {
    const { macAddress } = req.body;
    const normalizedMac = Camera.normalizeMac(macAddress);

    if (!normalizedMac) {
      return res.status(400).json({ success: false, error: "MAC invalide" });
    }

    let camera = await Camera.findOne({ macAddress: normalizedMac });

    if (!camera) {
      const ids = await Camera.generateIdentifiers();
      camera = await Camera.create({
        macAddress: normalizedMac,
        serialNumber: ids.serialNumber,
        deviceName: ids.deviceName,
        status: "pending",
      });
      console.log(`[Device] Nouvelle caméra enregistrée : ${normalizedMac}`);
    }

    res.json({
      success: true,
      data: {
        macAddress: camera.macAddress,
        serialNumber: camera.serialNumber,
        status: camera.status,
        message:
          camera.status === "pending"
            ? "Caméra enregistrée. Associez-la à un poulailler dans l'app."
            : "Caméra déjà enregistrée",
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/associate
// L'app mobile lie une caméra à un poulailler
router.post("/associate", protect, async (req, res) => {
  try {
    const { macAddress, poulaillerId } = req.body;
    const normalizedMac = Camera.normalizeMac(macAddress);

    if (!normalizedMac || !poulaillerId) {
      return res.status(400).json({
        success: false,
        error: "macAddress et poulaillerId requis",
      });
    }

    // Vérifie propriétaire
    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler || poulailler.owner.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, error: "Accès non autorisé" });
    }

    // Dissocie l'ancienne caméra
    await Camera.updateMany(
      { poulailler: poulaillerId },
      { $set: { poulailler: null, status: "dissociated" } },
    );

    // Associe la nouvelle
    const camera = await Camera.findOneAndUpdate(
      { macAddress: normalizedMac },
      {
        $set: {
          poulailler: poulaillerId,
          status: "associated",
          owner: req.user.id,
          dissociatedAt: null,
          dissociationReason: null,
        },
      },
      { new: true },
    );

    if (!camera) {
      return res.status(404).json({
        success: false,
        error: "Caméra non trouvée — démarrez d'abord l'ESP32",
      });
    }

    // Met à jour le statut du poulailler
    poulailler.status = "connecte";
    await poulailler.save();

    res.json({ success: true, data: camera });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
