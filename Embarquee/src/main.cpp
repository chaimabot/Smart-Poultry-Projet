#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include "config.h"
#include "sensors.h"
#include "actuators.h"
#include "mqtt_handler.h"

// --- Instances globales ---
WiFiClientSecure sClient;
PubSubClient mqttClient(sClient);

// --- Intervalle mesures/MQTT ---
unsigned long lastMeasure = 0;
const unsigned long MEASURE_INTERVAL = 5000; // 5 secondes

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== DEMARRAGE DU POULAILLER INTELLIGENT ===");

  sensors_init();
  actuators_init(); // Lit les fins de course + charge planning NVS

  Serial.print("Connexion WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WIFI] Connecte !");
  Serial.print("[WIFI] IP: ");
  Serial.println(WiFi.localIP());

  mqtt_init(mqttClient, sClient);
  Serial.println("[SYSTEM] Setup termine. Pret.");
}

void loop() {
  // ⚡ PRIORITÉ 1 — Moteur porte (non-bloquant, chaque ms)
  // Doit être appelé à chaque itération de loop() sans délai
  // pour réagir immédiatement aux fins de course
  actuators_doorLoop();

  // PRIORITÉ 2 — Maintenir connexion MQTT + traiter messages entrants
  mqtt_loop(mqttClient);

  // PRIORITÉ 3 — Toutes les 5 secondes : capteurs + relais + MQTT publish
  if (millis() - lastMeasure > MEASURE_INTERVAL) {
    lastMeasure = millis();

    // Lire capteurs
    SensorData data = sensors_read();

    // Planning horaire + automatismes relais (lampe, ventilo, pompe)
    actuators_tick(data.temperature, data.waterLevel, data.co2);

    // Publier mesures et état actionneurs vers HiveMQ
    mqtt_publishMeasures(mqttClient, data);
    mqtt_publishStatus(mqttClient, _state);

    // Log Serial
    Serial.printf("--- Log %lus ---\n", millis() / 1000);
    Serial.printf("Temp: %.1fC | Eau: %.1f%% | CO2: %.0fppm\n",
                  data.temperature, data.waterLevel, data.co2);
    Serial.printf("Porte: %s | Lampe: %s | Pompe: %s | Ventilo: %s\n",
                  actuators_doorStateName(_state.doorState),
                  _state.lampOn ? "ON" : "OFF",
                  _state.pumpOn ? "ON" : "OFF",
                  _state.fanOn  ? "ON" : "OFF");
    Serial.println("-----------------");
  }
}