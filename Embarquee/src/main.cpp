#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <Preferences.h>
#include <esp_wifi.h>
#include "config.h"
#include "sensors.h"
#include "actuators.h"
#include "mqtt_handler.h"

String DEVICE_ID = "";

WiFiClientSecure sClient;
PubSubClient     mqttClient(sClient);

unsigned long lastMeasure   = 0;
unsigned long lastWifiRetry = 0;
bool          wifiConnected = false;

const unsigned long MEASURE_INTERVAL     = 5000;
const unsigned long WIFI_RETRY_MS        = 20000;
const unsigned long WIFI_CONNECT_TIMEOUT = 12000;

// =========================================================
//  NVS : lecture / écriture des credentials WiFi
// =========================================================
static void readWifiCreds(String& ssid, String& pass) {
  Preferences prefs;
  if (!prefs.begin("wifi", true)) {
    Serial.println("[NVS] Namespace 'wifi' absent — utilisation du WiFi par defaut");
    ssid = "";
    pass = "";
    return;
  }
  ssid = prefs.getString("ssid", "");
  pass = prefs.getString("pass", "");
  prefs.end();
}

static void saveWifiCreds(const String& ssid, const String& pass) {
  Preferences prefs;
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  Serial.printf("[NVS] Credentials sauvegardes — SSID: %s\n", ssid.c_str());
}

// =========================================================
//  Connexion WiFi (retourne true si connecté)
// =========================================================
static bool connectToWifi(const String& ssid, const String& pass) {
  if (ssid.length() == 0) return false;

  Serial.printf("[WIFI] Connexion a : %s\n", ssid.c_str());
  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(ssid.c_str(), pass.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_CONNECT_TIMEOUT) {
      WiFi.disconnect(true);
      Serial.println("[WIFI] Timeout — echec connexion");
      return false;
    }
    delay(300);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("[WIFI] Connecte ! IP : " + WiFi.localIP().toString());
  Serial.println("[WIFI] SSID         : " + WiFi.SSID());
  return true;
}

// =========================================================
//  tryConnectWifi
//  Priorité :
//    1. Credentials sauvegardés en NVS (changés via app)
//    2. WiFi par défaut embarqué dans config.h
// =========================================================
static bool tryConnectWifi() {
  String ssid, pass;
  readWifiCreds(ssid, pass);

  // ── 1. Essai avec les credentials NVS ────────────────────
  if (ssid.length() > 0) {
    Serial.println("[WIFI] Credentials NVS trouves — tentative...");
    if (connectToWifi(ssid, pass)) return true;
    Serial.println("[WIFI] NVS invalide — tentative avec WiFi par defaut...");
  } else {
    Serial.println("[WIFI] NVS vide — tentative avec WiFi par defaut...");
  }

  // ── 2. Fallback : WiFi embarqué dans config.h ────────────
  String defaultSsid = String(DEFAULT_WIFI_SSID);
  String defaultPass = String(DEFAULT_WIFI_PASSWORD);

  if (defaultSsid.length() == 0) {
    Serial.println("[WIFI] Pas de WiFi par defaut configure dans config.h");
    return false;
  }

  Serial.println("[WIFI] Utilisation du WiFi par defaut : " + defaultSsid);
  if (connectToWifi(defaultSsid, defaultPass)) {
    //   FIX : Ne pas écraser le NVS avec le WiFi par défaut
    // L'ESP32 garde les credentials NVS pour réessayer au prochain démarrage
    return true;
  }

  Serial.println("[WIFI] Echec connexion WiFi par defaut aussi.");
  return false;
}

// =========================================================
//  Setup
// =========================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== DEMARRAGE DU POULAILLER INTELLIGENT ===");

  sensors_init();
  actuators_init();

  // DEVICE_ID depuis adresse MAC
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char macStr[13];
  snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  DEVICE_ID = String(macStr);
  Serial.println("[DEVICE] ID (MAC): " + DEVICE_ID);

  // Init topics MQTT
  mqtt_init(mqttClient, sClient);

  // Connexion WiFi
  wifiConnected = tryConnectWifi();

  if (!wifiConnected) {
    Serial.println("[WIFI] Aucun WiFi disponible — ESP32 hors ligne.");
    Serial.println("[WIFI] Verifie DEFAULT_WIFI_SSID dans config.h");
  }

  Serial.println("[SYSTEM] Setup termine. Pret.");
}

// =========================================================
//  Loop
// =========================================================
void loop() {
  actuators_doorLoop();

  // Reconnexion WiFi si perdu
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiConnected) {
      Serial.println("[WIFI] Connexion perdue...");
      wifiConnected = false;
    }
    if (millis() - lastWifiRetry > WIFI_RETRY_MS) {
      lastWifiRetry = millis();
      Serial.println("[WIFI] Retry...");
      wifiConnected = tryConnectWifi();
    }
  } else {
    wifiConnected = true;
  }

  mqtt_loop(mqttClient);

  // Mesures toutes les 5s
  if (millis() - lastMeasure > MEASURE_INTERVAL) {
    lastMeasure = millis();

    SensorData data = sensors_read();
    actuators_tick(data.temperature, data.waterLevel, data.airQualityPercent);

    if (WiFi.status() == WL_CONNECTED) {
      mqtt_publishMeasures(mqttClient, data);
      mqtt_publishStatus(mqttClient, _state);
    }

    Serial.printf("--- Log %lus | WiFi:%s ---\n",
                  millis() / 1000,
                  wifiConnected ? WiFi.SSID().c_str() : "HORS LIGNE");
    Serial.printf("Temp: %.1fC | Eau: %.1f%% | Air: %.0f%%\n",
                  data.temperature, data.waterLevel, data.airQualityPercent);
    Serial.printf("Porte: %s | Lampe: %s | Pompe: %s | Ventilo: %s\n",
                  actuators_doorStateName(_state.doorState),
                  _state.lampOn ? "ON" : "OFF",
                  _state.pumpOn ? "ON" : "OFF",
                  _state.fanOn  ? "ON" : "OFF");
    Serial.println("-----------------");
  }
}