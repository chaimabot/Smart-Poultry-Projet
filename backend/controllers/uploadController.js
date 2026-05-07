// ============================================================
// uploadController.js
//
// FIX MAJEUR : résolution du mismatch entre le DEVICE_ID envoyé
// par l'ESP32 (= MongoDB _id du poulailler) et la clé utilisée
// dans la Map pending.
//
// L'ESP32 envoie maintenant directement le MongoDB _id comme
// poulaillerId, donc setPendingImage() utilise le même id que
// waitForImage() appelé par le cron/controller.
// ============================================================

// Structure d'une entrée pending :
// {
//   image: string | null,     ← base64 de l'image si déjà reçue
//   resolver: Function | null ← resolve() de la Promise waitForImage si déjà en attente
// }
const pending = new Map();

// ============================================================
// INTERNE — appelé par receiveImage() pour débloquer waitForImage()
// ou stocker l'image en avance si personne n'écoute encore.
// ============================================================
function setPendingImage(poulaillerId, image) {
  const id = poulaillerId.toString().trim();
  const entry = pending.get(id);

  if (entry?.resolver) {
    // waitForImage() est déjà en attente → on résout la Promise immédiatement
    const resolve = entry.resolver;
    pending.delete(id);
    resolve({ image });
    console.log(`[UPLOAD] ✓ Image débloquée pour poulailler ${id}`);
  } else {
    // Personne n'écoute encore → on stocke l'image pour que waitForImage() la trouve
    pending.set(id, { image, resolver: null });
    console.log(`[UPLOAD] Image mise en attente pour poulailler ${id}`);

    // Nettoyage auto après 60 s si personne ne vient chercher l'image
    setTimeout(() => {
      const current = pending.get(id);
      if (current?.image && !current?.resolver) {
        pending.delete(id);
        console.warn(
          `[UPLOAD] Image expirée et supprimée pour poulailler ${id}`,
        );
      }
    }, 60000);
  }
}

// ============================================================
// @desc   Reçoit l'image depuis l'ESP32
// @route  POST /api/ai/upload-image  (public, pas de JWT)
// @body   { poulaillerId, image }
// ============================================================
exports.receiveImage = async (req, res) => {
  try {
    // FIX : accepter plusieurs noms de champs pour la robustesse
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

    // Taille estimée de l'image décodée
    const estimatedKb = Math.round((image.length * 3) / 4 / 1024);

    // FIX : refuser les images trop petites (probablement corrompues)
    if (estimatedKb < 3) {
      console.warn(
        `[UPLOAD] Image rejetée pour ${poulaillerId} : trop petite (${estimatedKb} Ko)`,
      );
      return res.status(400).json({
        success: false,
        error: `Image trop petite (${estimatedKb} Ko) — capture probablement corrompue`,
      });
    }

    console.log(
      `[UPLOAD] Image reçue pour poulailler ${poulaillerId} — ${estimatedKb} Ko estimés`,
    );

    // FIX : normalisation de l'id (trim pour éviter les espaces parasites)
    setPendingImage(poulaillerId.toString().trim(), image);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[UPLOAD] Erreur receiveImage :", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// Attend l'image pour un poulailler donné.
// Si l'image est déjà en mémoire (arrivée avant l'appel),
// elle est retournée immédiatement sans attendre.
//
// @param  poulaillerId  string | ObjectId
// @param  sensorData    object  (non utilisé ici, transmis pour traçabilité)
// @param  triggeredBy   "auto" | "manual"
// @param  timeoutMs     délai max en ms (défaut 30 s)
// @returns Promise<{ image: string }>
// ============================================================
exports.waitForImage = async (
  poulaillerId,
  sensorData,
  triggeredBy,
  timeoutMs = 30000,
) => {
  const id = poulaillerId.toString().trim();

  // Cas rapide : l'image est déjà arrivée avant qu'on commence à écouter
  const existing = pending.get(id);
  if (existing?.image) {
    console.log(`[UPLOAD] Image déjà disponible pour poulailler ${id}`);
    pending.delete(id);
    return { image: existing.image };
  }

  // Cas normal : on s'enregistre comme listener et on attend
  return new Promise((resolve, reject) => {
    let timeoutHandle;

    const entry = pending.get(id) || { image: null, resolver: null };

    entry.resolver = (payload) => {
      clearTimeout(timeoutHandle);
      resolve(payload);
    };

    pending.set(id, entry);

    timeoutHandle = setTimeout(() => {
      // Nettoyer l'entrée pour éviter les fuites mémoire
      const current = pending.get(id);
      if (current && !current.image) {
        pending.delete(id);
      }
      console.error(
        `[UPLOAD] Timeout (${timeoutMs}ms) dépassé pour poulailler ${id}`,
      );
      reject(new Error(`Timeout attente image pour poulailler ${id}`));
    }, timeoutMs);
  });
};
