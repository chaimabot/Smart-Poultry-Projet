#pragma once

// ====================== WIFI & MQTT ======================
#define WIFI_SSID       "globalnet"
#define WIFI_PASSWORD   "changeme"
#define MQTT_BROKER     "372f445aface456abb82e44117d9d92b.s1.eu.hivemq.cloud"
#define MQTT_PORT       8883
#define MQTT_USER       "backend2"
#define MQTT_PASS       "Smartpoultry2026"

// POULAILLER_ID supprimé — l'identifiant est désormais l'adresse MAC WiFi.
// Accessible via la variable globale DEVICE_ID (définie dans main.cpp).

// ====================== PINS GPIO ======================
// Capteurs
#define PIN_DHT          4
#define PIN_MQ135        34
#define PIN_MQ135_DO     35
#define PIN_WATER_LEVEL  32

// Moteur porte
#define PIN_MOTOR_IN1    23
#define PIN_MOTOR_IN2    22
#define PIN_MOTOR_IN3    21
#define PIN_MOTOR_IN4    17
#define PIN_SWITCH_OPEN   27  // Capteur porte ouverte
#define PIN_SWITCH_CLOSE  14  // Capteur porte fermée

// Actionneurs (Relais Active-Low sauf lampe)
#define PIN_LAMPE        25
#define PIN_VENTILATEUR  26
#define PIN_PUMP         13

// ====================== PARAMÈTRES ======================
#define DHT_TYPE                DHT22
#define MEASURE_INTERVAL_MS     5000
#define MQ135_MAX_PPM           2000.0f

// ====================== SEUILS (VALEURS PAR DÉFAUT / FALLBACK) ======================
// Ces valeurs sont utilisées uniquement si le Backend est hors-ligne.
// Dès la connexion, l'ESP32 recevra les vrais seuils de la BD.
#define DEFAULT_TEMP_MIN         20.0f
#define DEFAULT_TEMP_MAX         30.0f
#define DEFAULT_WATER_MIN        25.0f
#define DEFAULT_WATER_HYSTERESIS 10.0f
#define DEFAULT_CO2_MAX          1000.0f