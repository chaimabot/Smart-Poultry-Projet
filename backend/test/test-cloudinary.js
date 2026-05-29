// test-cloudinary.js
// Teste votre connexion Cloudinary

require("dotenv").config();
const cloudinary = require("../services/cloudinaryService");

async function test() {
  try {
    // Image test en base64 (1 pixel rouge)
    const testBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    console.log("Test upload Cloudinary...");
    const result = await cloudinary.uploadImage(testBase64, "test-poulailler");

    console.log("✅ SUCCÈS !");
    console.log("URL:", result.url);
    console.log("Thumbnail:", result.thumbnailUrl);
  } catch (err) {
    console.error("❌ ERREUR:", err.message);
  }
}

test();
