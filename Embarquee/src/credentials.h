#pragma once

/**
 * ✅ SECURE CREDENTIALS STORAGE
 * Loads WiFi & MQTT credentials from EEPROM instead of hardcoded config.h
 * Fallback to hardcoded values if EEPROM is empty (first boot)
 *
 * IMPORTANT: After first successful WiFi+MQTT connection, update credentials
 * carefully through serial console or MQTT provisioning endpoint
 */

#include <EEPROM.h>
#include <Arduino.h>

// EEPROM Allocation (256 bytes max)
#define EEPROM_SIZE 256
#define EEPROM_ADDR_WIFI_SSID    0      // 32 bytes
#define EEPROM_ADDR_WIFI_PASS    32     // 64 bytes
#define EEPROM_ADDR_MQTT_USER    96     // 32 bytes
#define EEPROM_ADDR_MQTT_PASS    128    // 64 bytes
#define EEPROM_MAGIC_BYTE        192    // 1 byte (0xFF = initialized)

// Fallback defaults (from config.h)
#define DEFAULT_WIFI_SSID      "globalnet"
#define DEFAULT_WIFI_PASSWORD  "changeme"
#define DEFAULT_MQTT_USER      "backend2"
#define DEFAULT_MQTT_PASS      "Smartpoultry2026"

struct Credentials {
  char wifiSSID[32];
  char wifiPassword[64];
  char mqttUser[32];
  char mqttPassword[64];
};

/**
 * Initialize EEPROM and load credentials
 */
void initializeCredentials() {
  EEPROM.begin(EEPROM_SIZE);

  // Check if EEPROM is initialized
  uint8_t magic = EEPROM.read(EEPROM_MAGIC_BYTE);

  if (magic != 0xAA) {
    // First boot: write defaults to EEPROM
    Serial.println("[CREDS] First boot - writing defaults to EEPROM");
    writeCredentialsToEEPROM(
      DEFAULT_WIFI_SSID,
      DEFAULT_WIFI_PASSWORD,
      DEFAULT_MQTT_USER,
      DEFAULT_MQTT_PASS
    );
  }

  Serial.println("[CREDS] ✅ Credentials loaded from EEPROM");
}

/**
 * Read credentials from EEPROM
 * @param creds Credentials struct to fill
 */
void readCredentialsFromEEPROM(Credentials &creds) {
  EEPROM.readString(EEPROM_ADDR_WIFI_SSID, creds.wifiSSID, 32);
  EEPROM.readString(EEPROM_ADDR_WIFI_PASS, creds.wifiPassword, 64);
  EEPROM.readString(EEPROM_ADDR_MQTT_USER, creds.mqttUser, 32);
  EEPROM.readString(EEPROM_ADDR_MQTT_PASS, creds.mqttPassword, 64);
}

/**
 * Write credentials to EEPROM
 * ⚠️ WARNING: Use with caution - can wear out EEPROM if done repeatedly
 */
void writeCredentialsToEEPROM(const char* ssid, const char* password,
                              const char* mqtt_user, const char* mqtt_pass) {
  if (strlen(ssid) >= 32 || strlen(password) >= 64 ||
      strlen(mqtt_user) >= 32 || strlen(mqtt_pass) >= 64) {
    Serial.println("[CREDS] ❌ Credentials too long!");
    return;
  }

  EEPROM.writeString(EEPROM_ADDR_WIFI_SSID, ssid);
  EEPROM.writeString(EEPROM_ADDR_WIFI_PASS, password);
  EEPROM.writeString(EEPROM_ADDR_MQTT_USER, mqtt_user);
  EEPROM.writeString(EEPROM_ADDR_MQTT_PASS, mqtt_pass);
  EEPROM.write(EEPROM_MAGIC_BYTE, 0xAA);  // Mark as initialized
  EEPROM.commit();

  Serial.println("[CREDS] ✅ Credentials written to EEPROM");
  Serial.print("  WiFi: "); Serial.println(ssid);
  Serial.print("  MQTT User: "); Serial.println(mqtt_user);
}

/**
 * DEBUG: Print current credentials from EEPROM
 * (password is hidden for security)
 */
void debugPrintCredentials() {
  Credentials creds;
  readCredentialsFromEEPROM(creds);

  Serial.println("\n[CREDS] Current Credentials (from EEPROM):");
  Serial.print("  WiFi SSID: "); Serial.println(creds.wifiSSID);
  Serial.print("  WiFi Password: "); Serial.println("***");  // Hidden
  Serial.print("  MQTT User: "); Serial.println(creds.mqttUser);
  Serial.print("  MQTT Password: "); Serial.println("***");  // Hidden
  Serial.println();
}
