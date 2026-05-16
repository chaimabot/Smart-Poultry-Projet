// services/cloudinaryService.js
// Upload images sur Cloudinary (GRATUIT)

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

async function uploadImage(base64, poulaillerId) {
  try {
    const cleanBase64 = base64.includes("data:image")
      ? base64
      : `data:image/jpeg;base64,${base64}`;

    const result = await cloudinary.uploader.upload(cleanBase64, {
      folder: `smart-poultry/${poulaillerId}`,
      public_id: `analysis_${Date.now()}`,
      resource_type: "image",
      format: "jpg",
      transformation: [
        { quality: "auto:good" },
        { width: 1280, crop: "limit" },
      ],
    });

    console.log(`[Cloudinary] Upload OK: ${result.secure_url}`);

    return {
      url: result.secure_url,
      thumbnailUrl: result.secure_url.replace(
        "/upload/",
        "/upload/w_300,h_200,c_fill/",
      ),
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
    };
  } catch (err) {
    console.error("[Cloudinary] Erreur:", err.message);
    throw err;
  }
}

async function deleteImage(publicId) {
  await cloudinary.uploader.destroy(publicId);
  console.log(`[Cloudinary] Supprimé: ${publicId}`);
}

module.exports = {
  uploadImage,
  deleteImage,
};
