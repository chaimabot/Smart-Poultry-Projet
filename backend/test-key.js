// test-key.js
require("dotenv").config();

console.log("=== VÉRIFICATION .env ===");
console.log("PORT:", process.env.PORT);
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "  " : "❌");
console.log(
  "GEMINI_API_KEY:",
  process.env.GEMINI_API_KEY
    ? "  (" + process.env.GEMINI_API_KEY.substring(0, 15) + "...)"
    : "❌",
);
console.log("MQTT_BROKER:", process.env.MQTT_BROKER);
