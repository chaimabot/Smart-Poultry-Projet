#pragma once

// ============================================================
//  WIFI
// ============================================================
#define WIFI_SSID      "globalnet"
#define WIFI_PASSWORD  "changeme"

// ============================================================
//  MQTT — HiveMQ Cloud TLS port 8883
// ============================================================
#define MQTT_BROKER  "372f445aface456abb82e44117d9d92b.s1.eu.hivemq.cloud"
#define MQTT_PORT    8883
#define MQTT_USER    "backend2"
#define MQTT_PASS    "Smartpoultry2026"

#define TOPIC_PREFIX   "smartpoultry_proj2025"
#define POULAILLER_ID  "POULAILLER_001"

// ============================================================
//  PINS GPIO — Capteurs
// ============================================================
#define PIN_DHT        4
#define PIN_MQ135      34   // Analogique (ADC)
#define PIN_MQ135_DO   35   // ← corrigé : 35 (entrée digitale, plus de conflit avec lampe)
#define PIN_TRIG       5
#define PIN_ECHO       18

// ============================================================
//  PINS GPIO — Actionneurs
// ============================================================
// Lampe branchée DIRECTEMENT sur GPIO 25 (pas via relais)
// Résistance 220Ω obligatoire en série si LED breadboard
#define PIN_LAMPE      25   // GPIO direct → digitalWrite HIGH/LOW

// Ventilateur via relais (courant > capacité GPIO)
#define PIN_VENTILATEUR 26  // GPIO 26 → Relais canal 1

#define PIN_LED_LAMP   PIN_LAMPE
#define PIN_LED_FAN    PIN_VENTILATEUR
#define PIN_FAN        PIN_VENTILATEUR

// ============================================================
//  MOTEUR PORTE PAS-À-PAS (Half-step 8 pas)
// ============================================================
#define PIN_STEPPER_IN1     23   // IN1
#define PIN_STEPPER_IN2     22   // IN2
#define PIN_STEPPER_IN3     21   // IN3
#define PIN_STEPPER_IN4     17   // IN4
#define PIN_SWITCH_OPEN     14   // Fin de course OUVERTURE (INPUT_PULLUP, LOW = atteint)
#define PIN_SWITCH_CLOSE    27   // Fin de course FERMETURE (INPUT_PULLUP, LOW = atteint)
#define STEPPER_STEP_DELAY_MS 10 // Délai entre chaque pas (10ms = séquence rapide)
#define STEPPER_HALF_STEP_SEQ_LEN 8

// ============================================================
//  CAPTEURS
// ============================================================
#define DHT_TYPE       DHT22
#define MQ135_MAX_PPM  2000.0f
#define HCSR04_MAX_CM  400.0f

// ============================================================
//  TIMING
// ============================================================
#define MEASURE_INTERVAL_MS  5000
#define MQTT_KEEPALIVE       60
#define MQTT_TIMEOUT         30

// ============================================================
//  SEUILS PAR DÉFAUT
// ============================================================
#define DEFAULT_TEMP_MIN     10.0f
#define DEFAULT_TEMP_MAX     35.0f
#define DEFAULT_HUMID_MAX    80.0f
#define DEFAULT_CO2_MAX      1000.0f
#define DEFAULT_NH3_MAX      25.0f
#define DEFAULT_WATER_MIN    20.0f