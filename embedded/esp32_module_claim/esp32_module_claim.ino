/**
 * ESP32 Module - Discovery & Claim Logic
 * 
 * Ce code implémente la logique de découverte et de claim pour les modules ESP32
 * selon le protocole Smart Poultry.
 * 
 * Protocole:
 * - Première connexion: publish sur topic "smartpoultry/discovery" avec serial/MAC
 * - Heartbeat périodique sur topic "smartpoultry/heartbeat"
 * - QR Code contient: smartpoultry://claim?v=1&c=CODECLAIM&s=SERIAL-MAC
 * 
 * @author Smart Poultry
 * @version 1.0.0
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_system.h>

// ============================================================================
// CONFIGURATION - À MODIFIER
// ============================================================================

// WiFi credentials
const char* WIFI_SSID = "Your_WiFi_SSID";
const char* WIFI_PASSWORD = "Your_WiFi_Password";

// MQTT Broker
const char* MQTT_SERVER = "mqtt.smartpoultry.local";
const int MQTT_PORT = 1883;
const char* MQTT_CLIENT_ID_PREFIX = "ESP32_";

// Topics MQTT
const char* TOPIC_DISCOVERY = "smartpoultry/discovery";
const char* TOPIC_HEARTBEAT = "smartpoultry/heartbeat";
const char* TOPIC_CLAIM_STATUS = "smartpoultry/claim/status";
const char* TOPIC_CLAIM_RESPONSE = "smartpoultry/claim/response";

// ============================================================================
// VARIABLES GLOBALES
// ============================================================================

// Identifiants uniques du module
String deviceSerial;    // Numéro de série (ex: ESP32-001)
String macAddress;      // Adresse MAC (ex: XX:XX:XX:XX:XX:XX)

// Claim code (reçu lors du claim)
String claimCode = "";

// État de connexion
bool isConnected = false;
bool isClaimed = false;

// WiFi et MQTT clients
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Timers
unsigned long lastHeartbeat = 0;
unsigned long lastReconnectAttempt = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 secondes
const unsigned long RECONNECT_INTERVAL = 5000;   // 5 secondes

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Génère un identifiant unique basé sur la MAC address
 */
String generateUniqueId() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buffer[18];
  snprintf(buffer, sizeof(buffer), "%02X%02X%02X%02X%02X%02X", 
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(buffer);
}

/**
 * Formate l'adresse MAC pour l'affichage (XX:XX:XX:XX:XX:XX)
 */
String formatMacAddress() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buffer[18];
  snprintf(buffer, sizeof(buffer), "%02X:%02X:%02X:%02X:%02X:%02X", 
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(buffer);
}

/**
 * Affiche les informations de diagnostic
 */
void printDeviceInfo() {
  Serial.println("========== INFORMATIONS MODULE ==========");
  Serial.printf("MAC Address: %s\n", macAddress.c_str());
  Serial.printf("Serial: %s\n", deviceSerial.c_str());
  Serial.printf("WiFi SSID: %s\n", WiFi.SSID().c_str());
  Serial.printf("IP Address: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Claim Status: %s\n", isClaimed ? "Claimed" : "Not Claimed");
  Serial.printf("Claim Code: %s\n", claimCode.isEmpty() ? "None" : claimCode.c_str());
  Serial.println("=========================================");
}

/**
 * Callback pour les messages MQTT reçus
 */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("\n[MQTT] Message reçu sur topic: %s\n", topic);
  
  // Convertir le payload en string
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';
  
  Serial.printf("[MQTT] Payload: %s\n", message);
  
  // Traiter la réponse de claim
  if (String(topic) == TOPIC_CLAIM_RESPONSE) {
    handleClaimResponse(message);
  }
}

/**
 * Traite la réponse du serveur après un claim
 */
void handleClaimResponse(const char* jsonResponse) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, jsonResponse);
  
  if (error) {
    Serial.printf("[ERROR] JSON parse error: %s\n", error.c_str());
    return;
  }
  
  bool success = doc["success"] | false;
  const char* message = doc["message"] | "Unknown response";
  
  if (success) {
    Serial.println("[CLAIM] Claim successful!");
    isClaimed = true;
    
    // Sauvegarder le claim code en EEPROM ou flash
    if (doc.containsKey("data") && doc["data"].containsKey("claimCode")) {
      claimCode = doc["data"]["claimCode"].as<String>();
      Serial.printf("[CLAIM] Claim code: %s\n", claimCode.c_str());
      saveClaimCode(claimCode);
    }
  } else {
    Serial.printf("[CLAIM] Claim failed: %s\n", message);
  }
}

/**
 * Sauvegarde le claim code en mémoire permanente (implémentation simplifiée)
 * NOTE: En production, utiliser Preferences ou EEPROM
 */
void saveClaimCode(const String& code) {
  // Placeholder: implémenter la sauvegarde permanente
  // Preferences would be ideal for this
  Serial.println("[STORAGE] Claim code saved (placeholder)");
}

/**
 * Charge le claim code depuis la mémoire permanente
 */
String loadClaimCode() {
  // Placeholder: implémenter le chargement depuis la mémoire permanente
  // Return empty string if not found
  return "";
}

// ============================================================================
// FONCTIONS MQTT
// ============================================================================

/**
 * Se connecte au broker MQTT
 */
boolean mqttConnect() {
  // Générer un client ID unique
  String clientId = String(MQTT_CLIENT_ID_PREFIX) + macAddress;
  
  Serial.printf("[MQTT] Attempting connection as %s...\n", clientId.c_str());
  
  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("[MQTT] Connected!");
    
    // S'abonner aux topics de réponse
    mqttClient.subscribe(TOPIC_CLAIM_RESPONSE);
    
    return true;
  } else {
    Serial.printf("[MQTT] Failed, rc=%d\n", mqttClient.state());
    return false;
  }
}

/**
 * Publie un message de découverte (première connexion)
 */
void publishDiscovery() {
  StaticJsonDocument<256> doc;
  
  doc["type"] = "discovery";
  doc["serial"] = deviceSerial;
  doc["mac"] = macAddress;
  doc["firmware"] = "1.0.0";  // Version firmware
  doc["timestamp"] = millis();
  
  String json;
  serializeJson(doc, json);
  
  Serial.printf("[MQTT] Publishing discovery: %s\n", json.c_str());
  
  if (mqttClient.publish(TOPIC_DISCOVERY, json.c_str())) {
    Serial.println("[MQTT] Discovery published successfully");
  } else {
    Serial.println("[MQTT] Failed to publish discovery");
  }
}

/**
 * Publie un heartbeat périodique
 */
void publishHeartbeat() {
  StaticJsonDocument<256> doc;
  
  doc["type"] = "heartbeat";
  doc["serial"] = deviceSerial;
  doc["mac"] = macAddress;
  doc["claimed"] = isClaimed;
  doc["claimCode"] = claimCode;
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis();
  doc["timestamp"] = millis();
  
  String json;
  serializeJson(doc, json);
  
  if (mqttClient.publish(TOPIC_HEARTBEAT, json.c_str())) {
    Serial.println("[MQTT] Heartbeat published");
  }
}

/**
 * Effectue une demande de claim (si on connaît le code)
 */
void requestClaim(const String& code) {
  StaticJsonDocument<256> doc;
  
  doc["type"] = "claim_request";
  doc["serial"] = deviceSerial;
  doc["mac"] = macAddress;
  doc["claimCode"] = code;
  doc["firmware"] = "1.0.0";
  
  String json;
  serializeJson(doc, json);
  
  Serial.printf("[MQTT] Requesting claim with code: %s\n", code.c_str());
  
  // Publier sur le topic de claim
  String claimTopic = String(TOPIC_CLAIM_STATUS) + "/" + macAddress;
  mqttClient.publish(claimTopic.c_str(), json.c_str());
}

// ============================================================================
// FONCTIONS WIFI
// ============================================================================

/**
 * Se connecte au WiFi
 */
void setupWiFi() {
  delay(10);
  
  Serial.println();
  Serial.print("[WIFI] Connecting to ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.printf("[WIFI] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println();
    Serial.println("[WIFI] Connection failed!");
  }
}

// ============================================================================
// SETUP & LOOP
// ============================================================================

void setup() {
  // Initialiser le port série
  Serial.begin(115200);
  Serial.println();
  Serial.println("========================================");
  Serial.println("  Smart Poultry ESP32 Module");
  Serial.println("  Version: 1.0.0");
  Serial.println("========================================");
  
  // Générer les identifiants uniques
  macAddress = formatMacAddress();
  deviceSerial = "ESP32-" + generateUniqueId().substring(0, 6);
  
  // Charger le claim code sauvegardé (si existant)
  claimCode = loadClaimCode();
  isClaimed = !claimCode.isEmpty();
  
  // Connecter au WiFi
  setupWiFi();
  
  // Configurer le client MQTT
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  
  // Informations du module
  printDeviceInfo();
}

void loop() {
  unsigned long currentMillis = millis();
  
  // Vérifier la connexion WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection lost, reconnecting...");
    setupWiFi();
    return;
  }
  
  // Vérifier la connexion MQTT
  if (!mqttClient.connected()) {
    if (currentMillis - lastReconnectAttempt > RECONNECT_INTERVAL) {
      lastReconnectAttempt = currentMillis;
      if (mqttConnect()) {
        lastReconnectAttempt = 0;
        
        // Première connexion: publier discovery
        if (!isClaimed) {
          publishDiscovery();
        }
      }
    }
  } else {
    // MQTT connecté
    mqttClient.loop();
    
    // Publier le heartbeat périodiquement
    if (currentMillis - lastHeartbeat > HEARTBEAT_INTERVAL) {
      lastHeartbeat = currentMillis;
      publishHeartbeat();
    }
  }
  
  // Traitement série (pour les commandes manuelles)
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    if (command.startsWith("CLAIM:")) {
      // Commande pour claimer manuellement
      String code = command.substring(6);
      code.trim();
      if (code.length() > 0 && mqttClient.connected()) {
        requestClaim(code);
      }
    } else if (command == "INFO") {
      printDeviceInfo();
    } else if (command == "DISCOVER") {
      if (mqttClient.connected()) {
        publishDiscovery();
      }
    } else if (command == "HELP") {
      Serial.println("Available commands:");
      Serial.println("  CLAIM:<code>  - Request claim with code");
      Serial.println("  INFO          - Show device info");
      Serial.println("  DISCOVER      - Send discovery message");
      Serial.println("  HELP          - Show this help");
    }
  }
}
