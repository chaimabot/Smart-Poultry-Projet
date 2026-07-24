const Module = require("../models/Module");
const Poulailler = require("../models/Poulailler");
const Dossier = require("../models/Dossier");

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
      return res.status(400).json({
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

// ─── CLAIM (associer un module à un poulailler) ───────────────────────────────
/**
 * Associer un module ESP32 à un poulailler.
 *
 * Logique esp32Installe :
 *   On marque l'étape à TRUE seulement si TOUS les poulaillers actifs
 *   de l'éleveur ont désormais un module associé.
 *   Un seul module associé sur plusieurs poulaillers → FALSE.
 */
exports.claimModule = async (req, res) => {
  try {
    // ── 1. Validation des entrées ─────────────────────────────────────────
    const { macAddress, poulaillerId } = req.body;

    if (!macAddress || !poulaillerId) {
      return res.status(400).json({
        success: false,
        error: "Les champs 'macAddress' et 'poulaillerId' sont obligatoires",
      });
    }

    // ── 2. Normalisation MAC ──────────────────────────────────────────────
    const normalizedMac = Module.normalizeMac(macAddress);
    if (!normalizedMac) {
      return res.status(400).json({
        success: false,
        error:
          "Adresse MAC invalide. Format attendu: XX:XX:XX:XX:XX:XX ou XXXXXXXXXXXX",
      });
    }

    // ── 3. Vérification du module ─────────────────────────────────────────
    const module = await Module.findOne({ macAddress: normalizedMac });
    if (!module) {
      return res.status(404).json({
        success: false,
        error: `Module avec MAC ${normalizedMac} introuvable`,
      });
    }

    // ── 4. Statuts incompatibles ──────────────────────────────────────────
    if (module.status === "associated") {
      return res.status(400).json({
        success: false,
        error: `Le module ${module.deviceName || module.macAddress} est déjà associé à un poulailler`,
      });
    }
    if (module.status === "offline") {
      return res.status(400).json({
        success: false,
        error: `Le module ${module.deviceName || module.macAddress} est hors ligne. Dissociez-le d'abord.`,
      });
    }

    // ── 5. Vérification du poulailler ─────────────────────────────────────
    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: `Poulailler avec ID ${poulaillerId} introuvable`,
      });
    }

    // ── 6. Association du module ──────────────────────────────────────────
    module.poulailler = poulaillerId;
    module.owner = req.user?._id || null;
    module.status = "associated";
    module.dissociationReason = null;
    module.dissociatedAt = null;
    await module.save();

    // ── 7. Récupérer l'éleveur owner du poulailler ───────────────────────
    const eleveurId = poulailler.owner ?? null;

    // ── 8. Calculer esp32Installe : tous les poulaillers couverts ? ───────
    //
    //   RÈGLE : esp32Installe = true  ssi  chaque poulailler actif de
    //   l'éleveur possède exactement un module au statut "associated".
    //
    let esp32InstalleTotal = false;

    if (eleveurId) {
      const tousPoulaillers = await Poulailler.find({
        owner: eleveurId,
        isArchived: { $ne: true },
      })
        .select("_id")
        .lean();

      const poulaillerIds = tousPoulaillers.map((p) => p._id);

      if (poulaillerIds.length > 0) {
        const nbCouverts = await Module.countDocuments({
          poulailler: { $in: poulaillerIds },
          status: "associated",
        });
        esp32InstalleTotal = nbCouverts >= poulaillerIds.length;
      }
    }

    // ── 9. Mettre à jour les dossiers de l'éleveur ───────────────────────
    //
    //   On utilise updateMany + $set pour éviter les problèmes de
    //   markModified sur les sous-documents non typés.
    //
    let dossiersUpdated = false;

    if (eleveurId) {
      const result = await Dossier.updateMany(
        {
          $or: [
            { eleveur: eleveurId },
            { user: eleveurId },
            { userId: eleveurId },
            { client: eleveurId },
          ],
        },
        { $set: { "etapes.esp32Installe": esp32InstalleTotal } },
      );
      dossiersUpdated = result.modifiedCount > 0 || result.matchedCount > 0;
    }

    // ── 10. Réponse ───────────────────────────────────────────────────────
    res.json({
      success: true,
      message: "Module associé avec succès",
      data: {
        module: {
          id: module._id,
          deviceName: module.deviceName,
          macAddress: module.macAddress,
          status: module.status,
        },
        poulailler: {
          id: poulailler._id,
          name: poulailler.name,
        },
        esp32InstalleTotal, // true = tous les poulaillers de l'éleveur sont couverts
        dossiersUpdated,
      },
    });
  } catch (err) {
    console.error("[claimModule]", err);

    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        error: `Erreur de validation: ${messages.join(", ")}`,
      });
    }
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || "champ";
      return res.status(400).json({
        success: false,
        error: `Conflit: ${field} déjà utilisé`,
      });
    }

    res.status(500).json({
      success: false,
      error: err.message || "Erreur interne lors de l'association du module",
    });
  }
};

// ─── DISSOCIATE ───────────────────────────────────────────────────────────────
/**
 * Dissocier un module.
 *
 * Après dissociation, esp32Installe repasse forcément à false
 * (au moins un poulailler n'est plus couvert).
 * getDossiers le recalcule dynamiquement, mais on met aussi à jour
 * la base immédiatement pour la cohérence en temps réel.
 */
exports.dissociateModule = async (req, res) => {
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

    // Récupérer l'éleveur AVANT de détacher le module
    const ancienPoulaillerId = module.poulailler;
    let eleveurId = null;

    if (ancienPoulaillerId) {
      const ancienPoulailler =
        await Poulailler.findById(ancienPoulaillerId).select("owner");
      eleveurId = ancienPoulailler?.owner ?? null;
    }

    // Détacher le module
    module.status = "dissociated";
    module.poulailler = null;
    module.owner = null;
    module.dissociationReason = reason.trim();
    module.dissociatedAt = new Date();
    await module.save();

    // Repasser esp32Installe à false pour tous les dossiers de l'éleveur
    // (au moins un poulailler n'est plus couvert après dissociation)
    if (eleveurId) {
      await Dossier.updateMany(
        {
          $or: [
            { eleveur: eleveurId },
            { user: eleveurId },
            { userId: eleveurId },
            { client: eleveurId },
          ],
        },
        { $set: { "etapes.esp32Installe": false } },
      );
    }

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
