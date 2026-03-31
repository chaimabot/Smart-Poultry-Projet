# 🔒 ESP32 Secure Credentials Setup

## Overview

L'ESP32 stocke les credentials WiFi et MQTT en **EEPROM** (mémoire flash) au lieu de hardcoder en `config.h`.

**Fichier:** `src/credentials.h`

## Integration dans main.cpp

### 1. Header inclusion

```cpp
#include "credentials.h"
```

### 2. Dans setup()

```cpp
void setup() {
  Serial.begin(115200);
  // ...

  // Initialize credentials from EEPROM (fallback to defaults on first boot)
  initializeCredentials();

  // DEBUG: Uncomment to print current credentials
  // debugPrintCredentials();

  // Connect to WiFi with credentials from EEPROM
  Credentials creds;
  readCredentialsFromEEPROM(creds);
  connectWiFi(creds.wifiSSID, creds.wifiPassword);

  // ...
}
```

### 3. Mettre à jour connectWiFi()

```cpp
static void connectWiFi(const char* ssid, const char* password) {
  Serial.printf("[WiFi] Connexion a %s\n", ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WiFi] Connecte — IP: %s\n", WiFi.localIP().toString().c_str());
}
```

### 4. MQTT Connection

```cpp
// Dans mqtt_handler.cpp ou mqtt_handler.h
Credentials creds;
readCredentialsFromEEPROM(creds);

const char* username = creds.mqttUser;
const char* password = creds.mqttPassword;
// ... pass to MQTT client
```

## Changing Credentials (After First Boot)

### Method 1: Serial Console (Firmware Upload Required)

1. Upload updated firmware with new defaults in `config.h`
2. ESP32 détects magic byte = 0 lors startup
3. Écrit nouvelles valeurs en EEPROM

### Method 2: MQTT Provisioning (Recommended)

Add endpoint `/system/credentials/update` via MQTT topic:

```
Topic: poulailler/{id}/commands/system
Payload: {"command":"update_creds","wifi_ssid":"newSSID","mqtt_user":"newUser"}
```

### Method 3: Web Captive Portal (Future)

- Si WiFi down → ESP32 ouvre access point
- Admin connects et configure via web form
- Credentials saved to EEPROM

## Security Notes

✅ **Améliorations:**

- Credentials en EEPROM (pas en .ino source)
- Fallback sécurisé si EEPROM vide
- Magic byte prevents accidental writes

⚠️ **Limitations AC:**

- EEPROM not encrypted (local read still possible with JTAG)
- Solution complète: Use ESP32 NVS encryption partition

🔮 **Future:**

- NVS (Non-Volatile Storage) encryption
- Secure boot + flash encryption
- Factory reset partition

## Debugging

Print credentials (passwords hidden):

```cpp
debugPrintCredentials();

// Output:
// [CREDS] Current Credentials (from EEPROM):
//   WiFi SSID: globalnet
//   WiFi Password: ***
//   MQTT User: backend2
//   MQTT Password: ***
```

## Files Modified/Created

- ✅ NEW: `src/credentials.h` - Storage management
- ⚠️ TODO: Update `src/main.cpp` - Integration
- ⚠️ TODO: Update `src/mqtt_handler.cpp` - Use from EEPROM
