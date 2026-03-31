#include "sensors.h"

static DHT dht(PIN_DHT, DHT_TYPE);

void sensors_init() {
  dht.begin();
  analogReadResolution(12);
  pinMode(PIN_MQ135_DO, INPUT_PULLUP);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  Serial.println("[SENSORS] Init OK (DHT MQ135 HC-SR04)");
}

float sensors_temperature() { 
  float t = dht.readTemperature(); 
  return t;
}
float sensors_humidity() { 
  float h = dht.readHumidity(); 
  return h;
}

float sensors_co2() {
  // Test code : moyenne 10 lectures
  long somme = 0;
  for(int i = 0; i < 10; i++) {
    somme += analogRead(PIN_MQ135);
    delay(2);
  }
  int valeurBrute = somme / 10;
  Serial.printf("  MQ135 RAW ADC: %d\n", valeurBrute);
  return (valeurBrute / 4095.0f) * MQ135_MAX_PPM;
}

bool sensors_mq135Do() {
  int etat = digitalRead(PIN_MQ135_DO);
  Serial.printf("  MQ135 DO (25): %s\n", etat == LOW ? "ALERT" : "OK");
  return etat == LOW;
}

float sensors_airQualityPercent() {
  float co2 = sensors_co2();
  float pct = (1.0f - (co2 / MQ135_MAX_PPM)) * 100.0f;
  Serial.printf("  MQ135 Air: %.1f%% (CO2: %.0fppm)\n", pct, co2);
  return pct;
}

float sensors_nh3() { 
  float nh3 = sensors_co2() / 40.0f; 
  Serial.printf("  MQ135 NH3: %.1fppm\n", nh3);
  return nh3;
}

float sensors_waterLevel() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long duration = pulseIn(PIN_ECHO, HIGH, 30000);
  float level;
  if (duration == 0) {
    level = -1.0f;
  } else {
    float dist = duration * 0.034f / 2.0f;
    level = constrain(100.0f - (dist / HCSR04_MAX_CM * 100.0f), 0.0f, 100.0f);
  }
  Serial.printf("  Eau HC-SR04: %.0f%%\n", level);
  return level;
}

SensorData sensors_read() {
  Serial.println("  DHT22 T/H:");
  SensorData data = {0};
  data.temperature = sensors_temperature();
  Serial.printf("    T=%.1f°C\n", data.temperature);
  data.humidity = sensors_humidity();
  Serial.printf("    H=%.1f%%\n", data.humidity);
  
  data.nh3DigitalAlert = sensors_mq135Do();
  data.airQualityPercent = sensors_airQualityPercent();
  data.nh3 = sensors_nh3();
  data.co2 = sensors_co2(); // dernier pour log
  
  data.dust = 0.0f;
  data.waterLevel = sensors_waterLevel();
  data.valid = true; // force display même si DHT invalide
  
  // Alerte test code
  float valeurBruteApprox = data.co2 * 4095.0f / MQ135_MAX_PPM;
  if (data.nh3DigitalAlert || valeurBruteApprox > 2000 || data.nh3 > DEFAULT_NH3_MAX) {
    Serial.println("  [ !!! DANGER NH3 - VENTILATION REQUISE !!! ]");
  } else {
    Serial.println("  [ Qualite Air : OK ]");
  }
  
  return data;
}
