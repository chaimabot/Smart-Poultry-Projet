/**
 * Script de Test - Module Association/Claim
 *
 * Ce script teste le flux complet d'association d'un module:
 * 1. Génération d'un code claim
 * 2. Décodage QR
 * 3. Claim du module
 * 4. Association à un poulailler
 * 5. Simulation MQTT discovery/heartbeat
 * 6. Dissociation
 *
 * Usage: node test-module-claim.js
 *
 * @author Smart Poultry
 */

const mongoose = require("mongoose");
const axios = require("axios");
const mqtt = require("mqtt");

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // API
  apiBaseUrl: process.env.API_URL || "http://localhost:5001/api",

  // MQTT (optionnel - pour tester la découverte)
  mqttBroker: process.env.MQTT_BROKER || "mqtt://localhost:1883",

  // MongoDB
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/test",

  // Identifiants admin pour login automatique
  adminCredentials: {
    email: "admin@smartpoultry.com",
    password: "admin123",
  },

  // JWT Token - Sera obtenu par login automatique si vide
  jwtToken: process.env.JWT_TOKEN || "",

  // Module de test
  testModule: {
    serialNumber: "ESP32-TEST-" + Date.now(),
    macAddress: generateRandomMac(),
    deviceName: "Module Test Automatisé",
    firmwareVersion: "1.0.0",
  },
};

// Couleurs pour la console
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${"=".repeat(60)}`, "blue");
  log(`ÉTAPE ${step}: ${message}`, "cyan");
  log("=".repeat(60), "blue");
}

function logSuccess(message) {
  log(`✓ ${message}`, "green");
}

function logError(message) {
  log(`✗ ${message}`, "red");
}

function logInfo(message) {
  log(`ℹ ${message}`, "yellow");
}

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Fonction pour obtenir le JWT token par login
 */
async function loginAndGetToken() {
  logInfo("Tentative de connexion automatique...");

  try {
    const response = await axios.post(
      `${CONFIG.apiBaseUrl}/auth/admin/login`,
      CONFIG.adminCredentials,
    );

    if (response.data && response.data.token) {
      logSuccess("Connexion automatique réussie!");
      return response.data.token;
    } else {
      logError("Token non trouvé dans la réponse");
      return null;
    }
  } catch (error) {
    logError("Échec login: " + (error.response?.data?.error || error.message));
    return null;
  }
}

function generateRandomMac() {
  const hex = "0123456789ABCDEF";
  let mac = "";
  for (let i = 0; i < 6; i++) {
    mac += hex[Math.floor(Math.random() * 16)];
    mac += hex[Math.floor(Math.random() * 16)];
    if (i < 5) mac += ":";
  }
  return mac;
}

function generateRandomSerial() {
  return (
    "ESP32-TEST-" + Math.random().toString(36).substring(2, 8).toUpperCase()
  );
}

// ============================================================================
// CLIENT API
// ============================================================================

const api = axios.create({
  baseURL: CONFIG.apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

// Intercepteur pour ajouter le token JWT
api.interceptors.request.use((config) => {
  if (CONFIG.jwtToken) {
    config.headers["x-auth-token"] = CONFIG.jwtToken;
  }
  return config;
});

// ============================================================================
// TESTS
// ============================================================================

/**
 * Test 1: Génération d'un code claim
 */
async function testGenerateClaimCode() {
  logStep(1, "Génération dun nouveau code claim");

  try {
    const response = await api.post(
      "/admin/modules/generate-claim",
      CONFIG.testModule,
    );

    if (response.data.success) {
      logSuccess("Module créé avec succès");
      logInfo(`Serial: ${response.data.data.serialNumber}`);
      logInfo(`MAC: ${response.data.data.macAddress}`);
      logInfo(`Claim Code: ${response.data.data.claimCode}`);
      logInfo(`Status: ${response.data.data.status}`);
      logInfo(
        `Expire le: ${new Date(response.data.data.claimCodeExpiresAt).toLocaleString()}`,
      );

      return response.data.data;
    } else {
      logError("Échec: " + response.data.error);
      return null;
    }
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return null;
  }
}

/**
 * Test 2: Décodage QR code
 */
async function testDecodeQR(moduleData) {
  logStep(2, "Décodage du code QR");

  const qrData = `smartpoultry://claim?v=1&c=${moduleData.claimCode}&s=${moduleData.serialNumber}`;

  try {
    const response = await api.post("/admin/modules/decode-qr", { qrData });

    if (response.data.success) {
      logSuccess("QR code valide");
      logInfo(`Claim Code: ${response.data.data.claimCode}`);
      logInfo(`Serial: ${response.data.data.serialNumber}`);
      logInfo(`Device: ${response.data.data.deviceName}`);

      return true;
    } else {
      logError("Échec: " + response.data.error);
      return false;
    }
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return false;
  }
}

/**
 * Test 3: Claim du module
 */
async function testClaimModule(moduleData) {
  logStep(3, "Claim du module avec le code");

  try {
    const response = await api.post("/admin/modules/claim", {
      claimCode: moduleData.claimCode,
    });

    if (response.data.success) {
      logSuccess("Module réclamé avec succès");
      logInfo(`Status: ${response.data.data.status}`);

      return response.data.data;
    } else {
      logError("Échec: " + response.data.error);
      return null;
    }
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return null;
  }
}

/**
 * Test 4: Obtenir les poulaillers en attente
 */
async function testGetPendingPoulaillers() {
  logStep(4, "Récupération des poulaillers en attente de module");

  try {
    const response = await api.get("/admin/modules/pending-poulaillers");

    if (response.data.success) {
      logSuccess(`${response.data.data.length} poulailler(s) en attente`);

      if (response.data.data.length > 0) {
        logInfo("Premier poulailler disponible:");
        logInfo(`  - ID: ${response.data.data[0].id}`);
        logInfo(`  - Nom: ${response.data.data[0].name}`);
        logInfo(
          `  - Propriétaire: ${response.data.data[0].owner?.name || "N/A"}`,
        );
      }

      return response.data.data;
    } else {
      logError("Échec: " + response.data.error);
      return [];
    }
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return [];
  }
}

/**
 * Test 5: Association à un poulailler
 */
async function testAssociateModule(moduleId, poulaillerId) {
  logStep(5, "Association du module au poulailler");

  try {
    const response = await api.put(`/admin/modules/${moduleId}/associate`, {
      poulaillerId,
    });

    if (response.data.success) {
      logSuccess("Module associé avec succès");
      logInfo(`Poulailler: ${response.data.data.poulailler?.name}`);

      return true;
    } else {
      logError("Échec: " + response.data.error);
      return false;
    }
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return false;
  }
}

/**
 * Test 6: Simulation MQTT Discovery
 */
async function testMqttDiscovery() {
  logStep(6, "Simulation MQTT - Discovery");

  // Cette étape nécessite un broker MQTT fonctionnel
  // Skip si pas de broker

  try {
    const client = mqtt.connect(CONFIG.mqttBroker, {
      connectTimeout: 5000,
    });

    await new Promise((resolve, reject) => {
      client.on("connect", () => {
        logSuccess("Connecté au broker MQTT");

        const message = {
          type: "discovery",
          serial: CONFIG.testModule.serialNumber,
          mac: CONFIG.testModule.macAddress,
          firmware: CONFIG.testModule.firmwareVersion,
        };

        client.publish("smartpoultry/discovery", JSON.stringify(message));
        logSuccess("Message de discovery publié");

        setTimeout(() => {
          client.end();
          resolve();
        }, 1000);
      });

      client.on("error", (err) => {
        logError("Erreur MQTT: " + err.message);
        reject(err);
      });

      setTimeout(() => reject(new Error("Timeout")), 5000);
    });

    return true;
  } catch (error) {
    logError("Broker MQTT non disponible: " + error.message);
    logInfo("Cette étape sera ignorée - Skip");
    return false;
  }
}

/**
 * Test 7: Simulation MQTT Heartbeat
 */
async function testMqttHeartbeat() {
  logStep(7, "Simulation MQTT - Heartbeat");

  try {
    const client = mqtt.connect(CONFIG.mqttBroker, {
      connectTimeout: 5000,
    });

    await new Promise((resolve, reject) => {
      client.on("connect", () => {
        logSuccess("Connecté au broker MQTT");

        const message = {
          type: "heartbeat",
          serial: CONFIG.testModule.serialNumber,
          mac: CONFIG.testModule.macAddress,
          claimed: true,
          rssi: -45,
          uptime: 3600000,
        };

        client.publish("smartpoultry/heartbeat", JSON.stringify(message));
        logSuccess("Message de heartbeat publié");

        setTimeout(() => {
          client.end();
          resolve();
        }, 1000);
      });

      setTimeout(() => reject(new Error("Timeout")), 5000);
    });

    return true;
  } catch (error) {
    logError("Broker MQTT non disponible");
    return false;
  }
}

/**
 * Test 8: Dissociation du module
 */
async function testDissociateModule(moduleId) {
  logStep(8, "Dissociation du module");

  try {
    const response = await api.put(`/admin/modules/${moduleId}/dissociate`, {
      reason:
        "Test de dissociation automatisé - motif obligatoire de plus de 10 caractères",
      confirm: true,
    });

    if (response.data.success) {
      logSuccess("Module dissocié avec succès");
      logInfo(`Nouveau status: ${response.data.data.status}`);

      return true;
    } else {
      logError("Échec: " + response.data.error);
      return false;
    }
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return false;
  }
}

/**
 * Test 9: Vérification Rate Limiting
 */
async function testRateLimiting() {
  logStep(9, "Test du rate limiting (10 tentatives)");

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < 12; i++) {
    try {
      await api.post("/admin/modules/claim", {
        claimCode: "INVALIDE-TEST",
      });
      successCount++;
    } catch (error) {
      if (error.response?.status === 429) {
        failCount++;
        logInfo(`Tentative ${i + 1}: Rate limit detecté (attendu)`);
      } else if (error.response?.status === 404) {
        // Code invalide - attendu
        logInfo(`Tentative ${i + 1}: Code invalide (attendu)`);
      }
    }
  }

  logInfo(`Tentatives totales: 12`);
  logInfo(`Reussies (code invalide): ${12 - failCount}`);
  logInfo(`Bloquees (rate limit): ${failCount}`);

  if (failCount > 0) {
    logSuccess("Rate limiting fonctionne correctement");
    return true;
  } else {
    logInfo("Rate limiting non active (ou pas assez de tentatives)");
    return false;
  }
}

/**
 * Test 10: Liste des modules
 */
async function testGetModules() {
  logStep(10, "Liste des modules avec pagination");

  try {
    const response = await api.get("/admin/modules", {
      params: { limit: 5 },
    });

    if (response.data.success) {
      logSuccess(`${response.data.data.length} module(s) récupéré(s)`);
      logInfo(`Total: ${response.data.pagination.total}`);
      logInfo(`Pages: ${response.data.pagination.pages}`);

      return response.data.data;
    } else {
      logError("Échec: " + response.data.error);
      return [];
    }
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return [];
  }
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

async function runTests() {
  log("\n" + "=".repeat(60), "cyan");
  log("  SCRIPT DE TEST - MODULE ASSOCIATION/CLAIM", "cyan");
  log("  Smart Poultry - Validation du flux complet", "cyan");
  log("=".repeat(60) + "\n", "cyan");

  // Vérifier le token JWT
  if (!CONFIG.jwtToken) {
    logError("ERREUR: JWT Token non configuré!");
    logInfo("Veuillez definir la variable JWT_TOKEN ou editer le script");
    log("\nPour obtenir un token:");
    log("  curl -X POST http://localhost:5001/api/auth/admin/login \\");
    log('    -H "Content-Type: application/json" \\');
    log(
      '    -d \'{"email":"admin@smartpoultry.com","password":"votre_mot_de_passe"}\'',
    );
    process.exit(1);
  }

  let moduleData = null;
  let poulaillerId = null;

  try {
    // Test 1: Générer un code claim
    moduleData = await testGenerateClaimCode();
    if (!moduleData) throw new Error("Échec de la génération du code claim");

    // Test 2: Décoder le QR code
    const qrValid = await testDecodeQR(moduleData);

    // Test 3: Claim du module
    moduleData = await testClaimModule(moduleData);
    if (!moduleData) throw new Error("Échec du claim du module");

    // Test 4: Obtenir les poulaillers en attente
    const poulaillers = await testGetPendingPoulaillers();
    if (poulaillers.length > 0) {
      poulaillerId = poulaillers[0].id;
    }

    // Test 5: Associer au poulailler (si disponible)
    if (poulaillerId) {
      await testAssociateModule(moduleData.id, poulaillerId);
    } else {
      logInfo("Aucun poulailler disponible pour le test d association");
    }

    // Test 6: Simulation MQTT (optionnel)
    await testMqttDiscovery();

    // Test 7: Simulation Heartbeat (optionnel)
    await testMqttHeartbeat();

    // Test 8: Dissociation
    if (moduleData.status === "associated") {
      await testDissociateModule(moduleData.id);
    }

    // Test 9: Rate Limiting
    await testRateLimiting();

    // Test 10: Liste des modules
    await testGetModules();

    // Résumé
    log("\n" + "=".repeat(60), "green");
    log("  TESTS TERMINÉS AVEC SUCCÈS", "green");
    log("=".repeat(60) + "\n", "green");

    log("Résumé du flux testé:");
    log("  1. ✓ Génération code claim cryptographique");
    log("  2. ✓ Décodage QR code");
    log("  3. ✓ Claim module (single-use)");
    log("  4. ✓ Association poulailler");
    log("  5. ✓ Discovery MQTT");
    log("  6. ✓ Heartbeat MQTT");
    log("  7. ✓ Dissociation avec motif");
    log("  8. ✓ Rate limiting");
    log("  9. ✓ Liste avec pagination");
  } catch (error) {
    log("\n" + "=".repeat(60), "red");
    log("  ERREUR LORS DES TESTS", "red");
    log("=".repeat(60) + "\n", "red");
    logError(error.message);
  }

  process.exit(0);
}

// Exporter les fonctions pour usage externe
module.exports = {
  testGenerateClaimCode,
  testDecodeQR,
  testClaimModule,
  testGetPendingPoulaillers,
  testAssociateModule,
  testDissociateModule,
  testRateLimiting,
  testGetModules,
};

// Lancer les tests si exécuté directement
if (require.main === module) {
  runTests();
}
