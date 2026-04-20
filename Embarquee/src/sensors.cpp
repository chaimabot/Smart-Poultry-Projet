#include "sensors.h"

static DHT dht(PIN_DHT, DHT_TYPE);

void sensors_init() {
  dht.begin();
  analogReadResolution(12);
  
  pinMode(PIN_MQ135_DO, INPUT_PULLUP);
  pinMode(PIN_WATER_LEVEL, INPUT);
  
  Serial.println("[SENSORS] Initialisé");
}

SensorData sensors_read() {
  SensorData d = {};  // Initialisation à zéro

  d.temperature = dht.readTemperature();
  d.humidity = dht.readHumidity();

  // Gestion des erreurs de lecture DHT
  if (isnan(d.temperature)) d.temperature = 0.0f;
  if (isnan(d.humidity))    d.humidity = 0.0f;

  // MQ135
  int mqVal = analogRead(PIN_MQ135);
  d.co2 = (mqVal / 4095.0f) * MQ135_MAX_PPM;
  d.nh3 = d.co2 / 40.0f; 
  d.airQualityPercent = 100.0f - (mqVal / 4095.0f * 100.0f);
  d.nh3DigitalAlert = (digitalRead(PIN_MQ135_DO) == LOW);

  // Niveau d'eau
  int waterRaw = analogRead(PIN_WATER_LEVEL);
  d.waterLevel = (waterRaw / 4095.0f) * 100.0f;
  if (d.waterLevel > 100.0f) d.waterLevel = 100.0f;
  if (d.waterLevel < 0.0f)   d.waterLevel = 0.0f;

  return d;
}