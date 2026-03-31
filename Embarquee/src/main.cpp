#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

#include "config.h"
#include "sensors.h"
#include "actuators.h"
#include "mqtt_handler.h"

WiFiClientSecure secureClient;
PubSubClient     mqttClient(secureClient);

unsigned long lastMeasureTime = 0;

static void connectWiFi() {
  Serial.printf("[WiFi] Connexion a %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connecte — IP: %s\n",
    WiFi.localIP().toString().c_str());
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n====== Smart Poultry ESP32 ======");
  Serial.println("Test MQ-135 GPIO34(AO) GPIO25(DO)");
  Serial.println("Mesures toutes 5s:");
  Serial.println("  DHT22 T/H(GPIO4)");
  Serial.println("  MQ135 ADC/Air%/NH3ppm/DO(GPIO34/25)");
  Serial.println("  HC-SR04 Eau(5/18)");
  Serial.println("=================================\n");

  sensors_init();
  actuators_init();
  actuators_setLampAuto(true);
  // actuators_setFanAuto(true); // FIX: BUG3 - Default manual au boot, configurable via MQTT
  connectWiFi();
  mqtt_init(mqttClient, secureClient);

  Serial.println("[BOOT] Pret - Attends MQ135 valeurs dans 5s...\n");
}

void loop() {
  mqtt_loop(mqttClient);

  // [MOTOR] Motor control tick - advance stepper sequence
  actuators_doorMotorTick();

  unsigned long now = millis();
  if (now - lastMeasureTime >= MEASURE_INTERVAL_MS) {
    lastMeasureTime = now;

    Serial.println("---=== LECTURE CAPTEURS ===---");
    SensorData data = sensors_read();
    Serial.println("MQTT OK | FAN/LAMPE auto");
    actuators_tick(data.temperature, data.humidity, data.co2, data.nh3, data.airQualityPercent, data.nh3DigitalAlert);
    mqtt_publishMeasures(mqttClient, data);
    // ✅ FIX: Publish status every 5 seconds instead of 30s
    // This reduces lag when user toggles actuators
    if (millis() % 5000 < 500) mqtt_publishStatus(mqttClient, actuators_getState());
    Serial.println("----------------------------\n");
  }
}
