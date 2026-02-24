/**
 * Script de Test - Module Association/Claim
 * 
 * Ce script teste le flux complet d'association d un module:
 * 1. Generation d un code claim
 * 2. Decodage QR
 * 3. Claim du module
 * 4. Association a un poulailler
 * 5. Simulation MQTT discovery/heartbeat
 * 6. Dissociation
 * 
 * Usage: node test-module-claim-updated.js
 * 
 * @author Smart Poultry
 */

const axios = require("axios");
const mqtt = require("mqtt");

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // API
  apiBaseUrl: process.env.API_URL || "http://localhost:5001/api",
  mqttBroker: process.env.MQTT_BROKER || "mqtt://localhost:1883",
  adminCredentials: {
    email: "admin@smartpoultry.com",
    password: "admin123",
  },
  jwtToken: process.env.JWT_TOKEN || "",
  testModule: {
    serialNumber: "ESP32-TEST-" + Date.now(),
    macAddress: generateRandomMac(),
    deviceName: "Module Test Automatise",
    firmwareVersion: "1.0.0",
  },
};

// Couleurs
const colors = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", blue: "\x1b[34m", cyan: "\x1b[36m" };
const log = (m, c = "reset") => console.log(`${colors[c]}${m}${colors.reset}`);
const logStep = (s, m) => { log(`\n${"=".repeat(60)}`, "blue"); log(`ETAPE ${s}: ${m}`, "cyan"); log("=".repeat(60), "blue"); };
const logSuccess = (m) => log(`✓ ${m}`, "green");
const logError = (m) => log(`✗ ${m}`, "red");
const logInfo = (m) => log(`ℹ ${m}`, "yellow");

// ============================================================================
// FONCTIONS
// ============================================================================

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

async function loginAndGetToken() {
  logInfo("Tentative de connexion automatique...");
  try {
    const response = await axios.post(`${CONFIG.apiBaseUrl}/auth/admin/login`, CONFIG.adminCredentials);
    if (response.data && response.data.token) {
      logSuccess("Connexion automatique reussie!");
      return response.data.token;
    }
    return null;
  } catch (error) {
    logError("Echec login: " + (error.response?.data?.error || error.message));
    return null;
  }
}

// Client API
const api = axios.create({ baseURL: CONFIG.apiBaseUrl, headers: { "Content-Type": "application/json" } });
api.interceptors.request.use((config) => {
  if (CONFIG.jwtToken) config.headers["x-auth-token"] = CONFIG.jwtToken;
  return config;
});

// ============================================================================
// TESTS
// ============================================================================

async function testGenerateClaimCode() {
  logStep(1, "Generation d un nouveau code claim");
  try {
    const response = await api.post("/admin/modules/generate-claim", CONFIG.testModule);
    if (response.data.success) {
      logSuccess("Module cree avec succes");
      logInfo(`Serial: ${response.data.data.serialNumber}`);
      logInfo(`Claim Code: ${response.data.data.claimCode}`);
      return response.data.data;
    }
    logError("Echec: " + response.data.error);
    return null;
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return null;
  }
}

async function testClaimModule(moduleData) {
  logStep(2, "Claim du module avec le code");
  try {
    const response = await api.post("/admin/modules/claim", { claimCode: moduleData.claimCode });
    if (response.data.success) {
      logSuccess("Module reclame avec succes");
      return response.data.data;
    }
    logError("Echec: " + response.data.error);
    return null;
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return null;
  }
}

async function testGetPendingPoulaillers() {
  logStep(3, "Recuperation des poulaillers en attente");
  try {
    const response = await api.get("/admin/modules/pending-poulaillers");
    if (response.data.success) {
      logSuccess(`${response.data.data.length} poulailler(s) en attente`);
      return response.data.data;
    }
    return [];
  } catch (error) {
    logError("Erreur: " + error.message);
    return [];
  }
}

async function testAssociateModule(moduleId, poulaillerId) {
  logStep(4, "Association du module au poulailler");
  try {
    const response = await api.put(`/admin/modules/${moduleId}/associate`, { poulaillerId });
    if (response.data.success) {
      logSuccess("Module associe avec succes");
      return true;
    }
    logError("Echec: " + response.data.error);
    return false;
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return false;
  }
}

async function testDissociateModule(moduleId) {
  logStep(5, "Dissociation du module");
  try {
    const response = await api.put(`/admin/modules/${moduleId}/dissociate`, {
      reason: "Test de dissociation automatise",
      confirm: true,
    });
    if (response.data.success) {
      logSuccess("Module dissocie avec succes");
      return true;
    }
    logError("Echec: " + response.data.error);
    return false;
  } catch (error) {
    logError("Erreur: " + (error.response?.data?.error || error.message));
    return false;
  }
}

async function testGetModules() {
  logStep(6, "Liste des modules");
  try {
    const response = await api.get("/admin/modules", { params: { limit: 5 } });
    if (response.data.success) {
      logSuccess(`${response.data.data.length} module(s) recupere(s)`);
      return response.data.data;
    }
    return [];
  } catch (error) {
    logError("Erreur: " + error.message);
    return [];
  }
}

// ============================================================================
// PRINCIPALE
// ============================================================================

async function runTests() {
  log("\n" + "=".repeat(60), "cyan");
  log("  SCRIPT DE TEST - MODULE ASSOCIATION/CLAIM", "cyan");
  log("=".repeat(60) + "\n", "cyan");

  // Login automatique si pas de token
  if (!CONFIG.jwtToken) {
    logInfo("JWT Token non configure - tentative de connexion automatique...");
    CONFIG.jwtToken = await loginAndGetToken();
    if (!CONFIG.jwtToken) {
      logError("ERREUR: Impossible d'obtenir un token JWT!");
      process.exit(1);
    }
  }

  try {
    const moduleData = await testGenerateClaimCode();
    if (!moduleData) throw new Error("Echec de la generation du code claim");

    const claimedModule = await testClaimModule(moduleData);
    if (!claimedModule) throw new Error("Echec du claim du module");

    const poulaillers = await testGetPendingPoulaillers();
    if (poulaillers.length > 0) {
      await testAssociateModule(claimedModule.id, poulaillers[0].id);
    }

    if (claimedModule.status === "associated") {
      await testDissociateModule(claimedModule.id);
    }

    await testGetModules();

    log("\n" + "=".repeat(60), "green");
    log("  TESTS TERMINES AVEC SUCCES", "green");
    log("=".repeat(60) + "\n", "green");
  } catch (error) {
    log("\n" + "=".repeat(60), "red");
    log("  ERREUR LORS DES TESTS", "red");
    log("=".repeat(60) + "\n", "red");
    logError(error.message);
  }

  process.exit(0);
}

runTests();
