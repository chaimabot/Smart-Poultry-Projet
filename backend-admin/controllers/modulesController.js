const Module = require("../models/Module");
const Poulailler = require("../models/Poulailler");

// ─── GET ALL ─────────────────────────────────────────────────────────────────
exports.getAllModules = async (req, res) => {
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
    const [modules, total] = await Promise.all([
      Module.find(query)
        .populate("poulailler", "name")
        .populate("owner", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Module.countDocuments(query),
    ]);

    const formatted = modules.map((m) => ({
      id: m._id,
      serialNumber: m.serialNumber,
      macAddress: m.macAddress,
      deviceName: m.deviceName,
      firmwareVersion: m.firmwareVersion,
      status: m.status,
      lastPing: m.lastPing,
      lastPingFormatted: m.lastPing
        ? new Date(m.lastPing).toLocaleString("fr-FR")
        : null,
      poulailler: m.poulailler
        ? { id: m.poulailler._id, name: m.poulailler.name }
        : null,
      owner: m.owner
        ? {
            id: m.owner._id,
            name: `${m.owner.firstName} ${m.owner.lastName}`,
            email: m.owner.email,
          }
        : null,
      dissociationReason: m.dissociationReason,
      dissociatedAt: m.dissociatedAt,
      createdAt: m.createdAt,
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
    console.error("[getAllModules]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── CREATE MODULE (admin) ────────────────────────────────────────────────────
exports.createModule = async (req, res) => {
  try {
    const { macAddress, serialNumber, deviceName, firmwareVersion } = req.body;

    if (!macAddress) {
      return res
        .status(400)
        .json({ success: false, error: "L'adresse MAC est requise" });
    }

    const normalizedMac = Module.normalizeMac(macAddress);
    if (!normalizedMac) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Adresse MAC invalide (format: XX:XX:XX:XX:XX:XX)",
        });
    }

    const existing = await Module.findOne({ macAddress: normalizedMac });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, error: "Adresse MAC déjà utilisée" });
    }

    const module = await Module.create({
      macAddress: normalizedMac,
      serialNumber: serialNumber?.trim().toUpperCase() || null,
      deviceName: deviceName?.trim() || null,
      firmwareVersion: firmwareVersion?.trim() || null,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Module créé avec succès",
      id: module._id,
      data: {
        id: module._id,
        macAddress: module.macAddress,
        serialNumber: module.serialNumber,
        deviceName: module.deviceName,
        firmwareVersion: module.firmwareVersion,
        status: module.status,
        createdAt: module.createdAt,
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
    console.error("[createModule]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── CLAIM (associer à un poulailler) ────────────────────────────────────────
exports.claimModule = async (req, res) => {
  try {
    const { macAddress, poulaillerId } = req.body;

    if (!macAddress || !poulaillerId) {
      return res.status(400).json({
        success: false,
        error: "macAddress et poulaillerId sont requis",
      });
    }

    const normalizedMac = Module.normalizeMac(macAddress);
    if (!normalizedMac) {
      return res
        .status(400)
        .json({ success: false, error: "Adresse MAC invalide" });
    }

    const module = await Module.findOne({ macAddress: normalizedMac });
    if (!module) {
      return res
        .status(404)
        .json({ success: false, error: "Module introuvable" });
    }

    if (module.status === "associated") {
      return res
        .status(400)
        .json({ success: false, error: "Module déjà associé à un poulailler" });
    }
    if (module.status === "offline") {
      return res
        .status(400)
        .json({
          success: false,
          error: "Module hors ligne — dissociez-le d'abord",
        });
    }

    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler introuvable" });
    }

    module.poulailler = poulaillerId;
    module.owner = req.user?._id || null;
    module.status = "associated";
    module.dissociationReason = null;
    module.dissociatedAt = null;
    await module.save();

    res.json({ success: true, message: "Module associé avec succès" });
  } catch (err) {
    console.error("[claimModule]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DISSOCIATE ───────────────────────────────────────────────────────────────
exports.dissociateModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, confirm } = req.body;

    if (!confirm) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Confirmation requise (confirm: true)",
        });
    }
    if (!reason || reason.trim().length < 10) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Motif invalide (minimum 10 caractères)",
        });
    }

    const module = await Module.findById(id);
    if (!module) {
      return res
        .status(404)
        .json({ success: false, error: "Module introuvable" });
    }

    if (module.status !== "associated" && module.status !== "offline") {
      return res.status(400).json({
        success: false,
        error: "Seul un module associé ou hors ligne peut être dissocié",
      });
    }

    module.status = "dissociated";
    module.poulailler = null;
    module.owner = null;
    module.dissociationReason = reason.trim();
    module.dissociatedAt = new Date();
    await module.save();

    res.json({ success: true, message: "Module dissocié avec succès" });
  } catch (err) {
    console.error("[dissociateModule]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteModule = async (req, res) => {
  try {
    const module = await Module.findByIdAndDelete(req.params.id);
    if (!module) {
      return res
        .status(404)
        .json({ success: false, error: "Module introuvable" });
    }
    res.json({ success: true, message: "Module supprimé avec succès" });
  } catch (err) {
    console.error("[deleteModule]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POULAILLERS DISPONIBLES (sans module associé) ───────────────────────────
exports.getPendingPoulaillers = async (req, res) => {
  try {
    const occupied = await Module.find({
      status: { $in: ["associated", "offline"] },
      poulailler: { $ne: null },
    }).select("poulailler");

    const occupiedIds = occupied.map((m) => m.poulailler.toString());

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
    console.error("[getPendingPoulaillers]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
