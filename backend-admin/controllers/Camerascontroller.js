const Camera = require("../models/Camera");
const Poulailler = require("../models/Poulailler");

// ─── GET ALL ─────────────────────────────────────────────────────────────────
exports.getAllCameras = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { macAddress: { $regex: search, $options: "i" } },
        { serialNumber: { $regex: search, $options: "i" } },
        { deviceName: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const [cameras, total] = await Promise.all([
      Camera.find(query)
        .populate("poulailler", "name")
        .populate("owner", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Camera.countDocuments(query),
    ]);

    const formatted = cameras.map((c) => ({
      id: c._id,
      serialNumber: c.serialNumber,
      macAddress: c.macAddress,
      deviceName: c.deviceName,
      firmwareVersion: c.firmwareVersion,
      streamUrl: c.streamUrl,
      status: c.status,
      lastPing: c.lastPing,
      lastPingFormatted: c.lastPing
        ? new Date(c.lastPing).toLocaleString("fr-FR")
        : null,
      poulailler: c.poulailler
        ? { id: c.poulailler._id, name: c.poulailler.name }
        : null,
      owner: c.owner
        ? {
            id: c.owner._id,
            name: `${c.owner.firstName} ${c.owner.lastName}`,
            email: c.owner.email,
          }
        : null,
      dissociationReason: c.dissociationReason,
      dissociatedAt: c.dissociatedAt,
      createdAt: c.createdAt,
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[getAllCameras]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── CREATE CAMERA (admin) ────────────────────────────────────────────────────
exports.createCamera = async (req, res) => {
  try {
    const { macAddress, streamUrl, firmwareVersion } = req.body;

    if (!macAddress) {
      return res
        .status(400)
        .json({ success: false, error: "L'adresse MAC est requise" });
    }

    const normalizedMac = Camera.normalizeMac(macAddress);
    if (!normalizedMac) {
      return res.status(400).json({
        success: false,
        error: "Adresse MAC invalide (format : XX:XX:XX:XX:XX:XX)",
      });
    }

    const existing = await Camera.findOne({ macAddress: normalizedMac });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, error: "Adresse MAC déjà utilisée" });
    }

    // Valider streamUrl si fourni
    if (streamUrl && !/^https?:\/\/.+/.test(streamUrl.trim())) {
      return res.status(400).json({
        success: false,
        error: "L'URL du flux doit commencer par http:// ou https://",
      });
    }

    const { serialNumber, deviceName } = await Camera.generateIdentifiers();

    const camera = await Camera.create({
      macAddress: normalizedMac,
      serialNumber,
      deviceName,
      firmwareVersion: firmwareVersion?.trim() || null,
      streamUrl: streamUrl?.trim() || null,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Caméra ESP32-CAM créée avec succès",
      id: camera._id,
      data: {
        id: camera._id,
        macAddress: camera.macAddress,
        serialNumber: camera.serialNumber,
        deviceName: camera.deviceName,
        firmwareVersion: camera.firmwareVersion,
        streamUrl: camera.streamUrl,
        status: camera.status,
        createdAt: camera.createdAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || "champ";
      return res
        .status(400)
        .json({ success: false, error: `Conflit : ${field} déjà utilisé` });
    }
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res
        .status(400)
        .json({ success: false, error: messages.join(", ") });
    }
    console.error("[createCamera]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── CLAIM (associer à un poulailler) ────────────────────────────────────────
exports.claimCamera = async (req, res) => {
  try {
    const { macAddress, poulaillerId } = req.body;

    if (!macAddress || !poulaillerId) {
      return res.status(400).json({
        success: false,
        error: "macAddress et poulaillerId sont requis",
      });
    }

    const normalizedMac = Camera.normalizeMac(macAddress);
    if (!normalizedMac) {
      return res
        .status(400)
        .json({ success: false, error: "Adresse MAC invalide" });
    }

    const camera = await Camera.findOne({ macAddress: normalizedMac });
    if (!camera) {
      return res
        .status(404)
        .json({ success: false, error: "Caméra introuvable" });
    }

    if (camera.status === "associated") {
      return res.status(400).json({
        success: false,
        error: "Caméra déjà associée à un poulailler",
      });
    }
    if (camera.status === "offline") {
      return res.status(400).json({
        success: false,
        error: "Caméra hors ligne — dissociez-la d'abord",
      });
    }

    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler introuvable" });
    }

    camera.poulailler = poulaillerId;
    camera.owner = req.user?._id || null;
    camera.status = "associated";
    camera.dissociationReason = null;
    camera.dissociatedAt = null;
    await camera.save();

    res.json({ success: true, message: "Caméra associée avec succès" });
  } catch (err) {
    console.error("[claimCamera]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DISSOCIATE ───────────────────────────────────────────────────────────────
exports.dissociateCamera = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, confirm } = req.body;

    if (!confirm) {
      return res.status(400).json({
        success: false,
        error: "Confirmation requise (confirm: true)",
      });
    }
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: "Motif invalide (minimum 10 caractères)",
      });
    }

    const camera = await Camera.findById(id);
    if (!camera) {
      return res
        .status(404)
        .json({ success: false, error: "Caméra introuvable" });
    }

    if (camera.status !== "associated" && camera.status !== "offline") {
      return res.status(400).json({
        success: false,
        error: "Seule une caméra associée ou hors ligne peut être dissociée",
      });
    }

    camera.status = "dissociated";
    camera.poulailler = null;
    camera.owner = null;
    camera.dissociationReason = reason.trim();
    camera.dissociatedAt = new Date();
    await camera.save();

    res.json({ success: true, message: "Caméra dissociée avec succès" });
  } catch (err) {
    console.error("[dissociateCamera]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteCamera = async (req, res) => {
  try {
    const camera = await Camera.findByIdAndDelete(req.params.id);
    if (!camera) {
      return res
        .status(404)
        .json({ success: false, error: "Caméra introuvable" });
    }
    res.json({ success: true, message: "Caméra supprimée avec succès" });
  } catch (err) {
    console.error("[deleteCamera]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POULAILLERS DISPONIBLES (sans caméra associée) ──────────────────────────
// Note : un poulailler peut avoir à la fois un module ESP32 ET une caméra.
// Cette route retourne les poulaillers sans caméra associée (indépendamment
// des modules). Si vous voulez filtrer les deux en même temps, croisez les
// résultats côté frontend ou créez une route consolidée.

exports.getPendingPoulaillersForCameras = async (req, res) => {
  try {
    const occupied = await Camera.find({
      status: { $in: ["associated", "offline"] },
      poulailler: { $ne: null },
    }).select("poulailler");

    const occupiedIds = occupied.map((c) => c.poulailler.toString());

    const poulaillers = await Poulailler.find({
      _id: { $nin: occupiedIds },
    }).populate("owner", "firstName lastName email");

    res.json({
      success: true,
      data: poulaillers.map((p) => ({
        id: p._id,
        name: p.name,
        type: p.type,
        animalCount: p.animalCount,
        owner: p.owner
          ? {
              id: p.owner._id,
              name: `${p.owner.firstName} ${p.owner.lastName}`,
              email: p.owner.email,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("[getPendingPoulaillersForCameras]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── UPDATE STREAM URL ────────────────────────────────────────────────────────
// PATCH /:id/stream — permet de mettre à jour l'URL MJPEG après création

exports.updateStreamUrl = async (req, res) => {
  try {
    const { streamUrl } = req.body;

    if (streamUrl && !/^https?:\/\/.+/.test(streamUrl.trim())) {
      return res.status(400).json({
        success: false,
        error: "L'URL du flux doit commencer par http:// ou https://",
      });
    }

    const camera = await Camera.findByIdAndUpdate(
      req.params.id,
      { streamUrl: streamUrl?.trim() || null },
      { new: true, runValidators: true },
    );

    if (!camera) {
      return res
        .status(404)
        .json({ success: false, error: "Caméra introuvable" });
    }

    res.json({
      success: true,
      message: "URL du flux mise à jour",
      streamUrl: camera.streamUrl,
    });
  } catch (err) {
    console.error("[updateStreamUrl]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
