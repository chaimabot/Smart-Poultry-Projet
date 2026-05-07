const AiAnalysis = require("../models/AiAnalysis");
const Poulailler = require("../models/Poulailler");

// IMPORTANT:
// Dans ton code, aiCronJob.js appelle waitForImage() et routes/ai.js appelle receiveImage().
// Comme le fichier uploadController.js est absent, Render/Express ne peut pas monter correctement la route.
// Ce contrôleur fournit une base fonctionnelle et attendue par le projet.

// Mémoire volatile: associe un image (base64) à un poulaillerId le temps d'une attente.
const pending = new Map();

function setPendingImage(poulaillerId, image) {
  const entry = pending.get(poulaillerId);
  if (!entry) return;

  entry.image = image;
  entry.resolver?.({ image });
  entry.resolver = null;
}

// ============================================================
// Route appelée par le mécanisme ESP32/trigger (capture puis envoi image)
// ============================================================
// Supporte plusieurs formes de payload :
// - { poulaillerId, imageBase64 }
// - { poulaillerId, image }
// - { id: poulaillerId, imageBase64 }
// - ou bien upload qui envoie directement au bon poulaillerId via body.poulaillerId
exports.receiveImage = async (req, res) => {
  try {
    const poulaillerId =
      req.body?.poulaillerId || req.body?.id || req.params?.poulaillerId;

    const image = req.body?.imageBase64 || req.body?.image;

    if (!poulaillerId) {
      return res
        .status(400)
        .json({ success: false, error: "poulaillerId requis" });
    }
    if (!image) {
      return res
        .status(400)
        .json({ success: false, error: "imageBase64/image requis" });
    }

    setPendingImage(poulaillerId.toString(), image);

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// Attend une image envoyée ensuite par receiveImage()
// ============================================================
// signature utilisée:
// waitForImage(id, sensorData, "auto")
exports.waitForImage = async (
  poulaillerId,
  sensorData,
  triggeredBy,
  timeoutMs = 30000,
) => {
  const id = poulaillerId.toString();

  // Si une image a déjà été mise (rare), on la retourne.
  const existing = pending.get(id);
  if (existing?.image) return { image: existing.image };

  let timeoutHandle;

  const result = await new Promise((resolve, reject) => {
    const entry = pending.get(id) || { image: null, resolver: null };

    const resolver = (payload) => {
      clearTimeout(timeoutHandle);
      pending.delete(id);
      resolve(payload);
    };

    entry.resolver = resolver;
    pending.set(id, entry);

    timeoutHandle = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout attente image pour poulailler ${id}`));
    }, timeoutMs);
  });

  return result;
};
