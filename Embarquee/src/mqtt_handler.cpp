#include "mqtt_handler.h"
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <Preferences.h>
#include "config.h"
#include "actuators.h"
#include "sensors.h"

extern String DEVICE_ID;

String TOPIC_BASE     = "";
String TOPIC_MEASURES = "";
String TOPIC_STATUS   = "";
String TOPIC_CMD_LAMP = "";
String TOPIC_CMD_PUMP = "";
String TOPIC_CMD_FAN  = "";
String TOPIC_CMD_DOOR = "";
String TOPIC_CONFIG   = "";
String TOPIC_CMD_WIFI = "";

extern ActuatorState _state;
extern DoorSchedule  _doorSched;
extern PubSubClient  mqttClient;

// =========================================================
void mqtt_init(PubSubClient& client, WiFiClientSecure& sClient) {
  sClient.setInsecure();
  client.setServer(MQTT_BROKER, MQTT_PORT);
  client.setCallback(onMessage);

  TOPIC_BASE     = "poulailler/" + DEVICE_ID + "/";
  TOPIC_MEASURES = TOPIC_BASE + "measures";
  TOPIC_STATUS   = TOPIC_BASE + "status";
  TOPIC_CMD_LAMP = TOPIC_BASE + "cmd/lamp";
  TOPIC_CMD_PUMP = TOPIC_BASE + "cmd/pump";
  TOPIC_CMD_FAN  = TOPIC_BASE + "cmd/fan";
  TOPIC_CMD_DOOR = TOPIC_BASE + "cmd/door";
  TOPIC_CONFIG   = TOPIC_BASE + "config";
  TOPIC_CMD_WIFI = TOPIC_BASE + "cmd/wifi";

  Serial.println("[MQTT] Topics initialises avec MAC : " + DEVICE_ID);
}

// =========================================================
void mqtt_loop(PubSubClient& client) {
  static unsigned long lastReconnect = 0;

  if (!client.connected()) {
    if (millis() - lastReconnect > 5000) {
      lastReconnect = millis();

      String clientId = "ESP32-" + DEVICE_ID;

      // cleanSession = false → permet de recevoir les messages QoS1
      // publies pendant la deconnexion
      if (client.connect(clientId.c_str(), MQTT_USER, MQTT_PASS,
                         0, 0, 0, 0, false)) {
        Serial.println("[MQTT] Connecte (ID: " + clientId + ")");
        client.subscribe(TOPIC_CMD_LAMP.c_str());
        client.subscribe(TOPIC_CMD_PUMP.c_str());
        client.subscribe(TOPIC_CMD_FAN.c_str());
        client.subscribe(TOPIC_CMD_DOOR.c_str());
        client.subscribe(TOPIC_CONFIG.c_str());
        client.subscribe(TOPIC_CMD_WIFI.c_str());
      } else {
        Serial.printf("[MQTT] Connexion echouee : %d\n", client.state());
      }
    }
  } else {
    client.loop();
  }
}

void mqtt_publishMeasures(PubSubClient& client, const SensorData& data) {
  if (!client.connected()) return;

  StaticJsonDocument<384> doc;
  doc["temperature"]       = round(data.temperature * 10) / 10.0;
  doc["humidity"]          = round(data.humidity * 10) / 10.0;
  doc["airQualityPercent"] = (int)data.airQualityPercent;
  doc["waterLevel"]        = round(data.waterLevel * 10) / 10.0;
  doc["deviceId"]          = DEVICE_ID;

  char buf[512];
  serializeJson(doc, buf);
  client.publish(TOPIC_MEASURES.c_str(), buf, false);
}
// =========================================================
void mqtt_publishStatus(PubSubClient& client, const ActuatorState& state) {
  if (!client.connected()) return;

  StaticJsonDocument<512> doc;
  doc["lampOn"]    = state.lampOn;
  doc["pumpOn"]    = state.pumpOn;
  doc["fanOn"]     = state.fanOn;
  doc["doorOpen"]  = state.doorOpen();
  doc["doorState"] = actuators_doorStateName(state.doorState);
  doc["lampAuto"]  = state.lampAuto;
  doc["pumpAuto"]  = state.pumpAuto;
  doc["fanAuto"]   = state.fanAuto;
  doc["doorAuto"]  = _doorSched.active;
  doc["deviceId"]  = DEVICE_ID;
  doc["wifiSsid"]  = WiFi.SSID();

  char buf[512];
  serializeJson(doc, buf);
  client.publish(TOPIC_STATUS.c_str(), buf);
}

// =========================================================
//  Callback messages entrants
// =========================================================
void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  Serial.printf("[MQTT] Message recu sur %s : %s\n", topic, msg.c_str());

  // Augmente le buffer pour eviter troncature sur SSID/password longs
  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) {
    Serial.print("[MQTT] JSON invalide — ");
    Serial.println(err.c_str());
    return;
  }

  String t = String(topic);

  // -------------------------------------------------------
  // WiFi — sauvegarde NVS et redémarre
  // -------------------------------------------------------
  if (t == TOPIC_CMD_WIFI) {
    const char* ssid = doc["ssid"] | "";
    const char* pass = doc["password"] | "";  // cle "password" (idem serveur)

    Serial.printf("[WIFI] SSID recu : '%s'\n", ssid);
    Serial.printf("[WIFI] PASS recu : '%s'\n", pass);

    if (strlen(ssid) == 0) {
      Serial.println("[WIFI] SSID vide — commande ignoree");
      return;
    }

    // Sauvegarde en NVS
    Preferences prefs;
    prefs.begin("wifi", false);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.end();

    // Verification que la sauvegarde est correcte
    prefs.begin("wifi", true);
    String savedSsid = prefs.getString("ssid", "");
    Serial.printf("[WIFI] NVS verifie — ssid sauvegarde : '%s'\n", savedSsid.c_str());
    prefs.end();

    Serial.println("[WIFI] Sauvegarde OK — redemarrage dans 1s...");

    // Fermeture propre MQTT avant restart
    // (pas d'appel a mqtt_publishStatus ici car WiFi.SSID()
    //  pointe encore sur l'ancien reseau et peut bloquer)
    mqttClient.disconnect();
    delay(1000);
    ESP.restart();
    return;
  }

  // -------------------------------------------------------
  // Porte
  // -------------------------------------------------------
  if (t == TOPIC_CMD_DOOR) {
    const char* action = doc["action"] | "";
    if      (strcmp(action, "open")  == 0) actuators_moveDoor(true);
    else if (strcmp(action, "close") == 0) actuators_moveDoor(false);
    else if (strcmp(action, "stop")  == 0) actuators_stopDoor();
    else Serial.printf("[MQTT] Action porte inconnue : %s\n", action);
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // -------------------------------------------------------
  // Lampe
  // -------------------------------------------------------
  if (t == TOPIC_CMD_LAMP) {
    bool on = doc["on"] | false;
    const char* mode = doc["mode"] | "manual";
    actuators_setLampAuto(strcmp(mode, "auto") == 0);
    actuators_setLamp(on);
    Serial.printf("[MQTT] Lampe -> %s | %s\n", mode, on ? "ON" : "OFF");
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // -------------------------------------------------------
  // Pompe
  // -------------------------------------------------------
  if (t == TOPIC_CMD_PUMP) {
    bool on = doc["on"] | false;
    const char* mode = doc["mode"] | "manual";
    actuators_setPumpAuto(strcmp(mode, "auto") == 0);
    actuators_setPump(on);
    Serial.printf("[MQTT] Pompe -> %s | %s\n", mode, on ? "ON" : "OFF");
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // -------------------------------------------------------
  // Ventilateur
  // -------------------------------------------------------
  if (t == TOPIC_CMD_FAN) {
    bool on = doc["on"] | false;
    const char* mode = doc["mode"] | "manual";
    actuators_setFanAuto(strcmp(mode, "auto") == 0);
    actuators_setFan(on);
    Serial.printf("[MQTT] Ventilateur -> %s | %s\n", mode, on ? "ON" : "OFF");
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // -------------------------------------------------------
  // Config (planning porte + heure + modes)
  // -------------------------------------------------------
  if (t == TOPIC_CONFIG) {
    if (doc.containsKey("doorSched")) {
      _doorSched.openH  = doc["doorSched"]["openH"]  | _doorSched.openH;
      _doorSched.openM  = doc["doorSched"]["openM"]  | _doorSched.openM;
      _doorSched.closeH = doc["doorSched"]["closeH"] | _doorSched.closeH;
      _doorSched.closeM = doc["doorSched"]["closeM"] | _doorSched.closeM;
      _doorSched.active = doc["doorSched"]["active"] | _doorSched.active;
      actuators_saveSched();
      Serial.printf("[MQTT] Planning : O=%02d:%02d F=%02d:%02d actif=%d\n",
        _doorSched.openH, _doorSched.openM,
        _doorSched.closeH, _doorSched.closeM, _doorSched.active);
    }

    if (doc.containsKey("currentTime")) {
      actuators_updateTime(
        doc["currentTime"]["h"] | 0,
        doc["currentTime"]["m"] | 0
      );
    }

    if (doc.containsKey("fanMode")) {
      actuators_setFanAuto(strcmp(doc["fanMode"] | "manual", "auto") == 0);
    }
    if (doc.containsKey("lampMode")) {
      actuators_setLampAuto(strcmp(doc["lampMode"] | "manual", "auto") == 0);
    }
    if (doc.containsKey("pumpMode")) {
      actuators_setPumpAuto(strcmp(doc["pumpMode"] | "manual", "auto") == 0);
    }

    Serial.println("[MQTT] Config appliquee");
    return;
  }

  Serial.printf("[MQTT] Topic non gere : %s\n", t.c_str());
}