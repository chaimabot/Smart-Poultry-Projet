const Module = require("../models/Module");
const Poulailler = require("../models/Poulailler");

// GET ALL
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
        .populate("owner", "name email")
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
        ? new Date(m.lastPing).toLocaleString()
        : null,
      poulailler: m.poulailler
        ? { id: m.poulailler._id, name: m.poulailler.name }
        : null,
      owner: m.owner
        ? { id: m.owner._id, name: m.owner.name, email: m.owner.email }
        : null,
      dissociationReason: m.dissociationReason,
      dissociatedAt: m.dissociatedAt,
      createdAt: m.createdAt,
    }));

    res.json({
      data: formatted,
      pagination: { pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// CREATE MODULE (admin ajoute manuellement)
exports.createModule = async (req, res) => {
  try {
    const { macAddress, serialNumber, deviceName, firmwareVersion } = req.body;

    const normalizedMac = Module.normalizeMac(macAddress);
    if (!normalizedMac) {
      return res.status(400).json({ error: "Adresse MAC invalide" });
    }

    const existing = await Module.findOne({ macAddress: normalizedMac });
    if (existing) {
      return res.status(400).json({ error: "Adresse MAC déjà utilisée" });
    }

    const module = await Module.create({
      macAddress: normalizedMac,
      serialNumber: serialNumber || null,
      deviceName: deviceName || null,
      firmwareVersion: firmwareVersion || null,
      status: "pending",
    });

    res
      .status(201)
      .json({ message: "Module créé avec succès", id: module._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// CLAIM (associer à un poulailler)
exports.claimModule = async (req, res) => {
  try {
    const { macAddress, poulaillerId } = req.body;

    const normalizedMac = Module.normalizeMac(macAddress);
    if (!normalizedMac) {
      return res.status(400).json({ error: "Adresse MAC invalide" });
    }

    const module = await Module.findOne({ macAddress: normalizedMac });
    if (!module) {
      return res.status(404).json({ error: "Module introuvable" });
    }

    if (module.status === "associated" || module.status === "offline") {
      return res.status(400).json({
        error:
          module.status === "associated"
            ? "Module déjà associé"
            : "Module hors ligne — dissociez-le d'abord",
      });
    }

    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler) {
      return res.status(404).json({ error: "Poulailler introuvable" });
    }

    module.poulailler = poulaillerId;
    module.owner = req.user?._id || null;
    module.status = "associated";
    module.dissociationReason = null;
    module.dissociatedAt = null;
    await module.save();

    res.json({ message: "Module associé avec succès" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DISSOCIATE
exports.dissociateModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, confirm } = req.body;

    if (!confirm)
      return res.status(400).json({ error: "Confirmation requise" });
    if (!reason || reason.length < 10) {
      return res
        .status(400)
        .json({ error: "Motif invalide (min 10 caractères)" });
    }

    const module = await Module.findById(id);
    if (!module) return res.status(404).json({ error: "Module introuvable" });

    if (module.status !== "associated" && module.status !== "offline") {
      return res.status(400).json({
        error: "Seul un module associé ou hors ligne peut être dissocié",
      });
    }

    module.status = "dissociated";
    module.poulailler = null;
    module.owner = null;
    module.dissociationReason = reason;
    module.dissociatedAt = new Date();
    await module.save();

    res.json({ message: "Module dissocié avec succès" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE
exports.deleteModule = async (req, res) => {
  try {
    const module = await Module.findByIdAndDelete(req.params.id);
    if (!module) return res.status(404).json({ error: "Module introuvable" });
    res.json({ message: "Module supprimé" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POULAILLERS DISPONIBLES
exports.getPendingPoulaillers = async (req, res) => {
  try {
    const occupied = await Module.find({
      status: { $in: ["associated", "offline"] },
      poulailler: { $ne: null },
    }).select("poulailler");

    const occupiedIds = occupied.map((m) => m.poulailler.toString());

    const poulaillers = await Poulailler.find({
      _id: { $nin: occupiedIds },
    }).populate("owner", "name email");

    res.json({
      data: poulaillers.map((p) => ({
        id: p._id,
        name: p.name,
        type: p.type,
        animalCount: p.animalCount,
        owner: p.owner
          ? { id: p.owner._id, name: p.owner.name, email: p.owner.email }
          : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
