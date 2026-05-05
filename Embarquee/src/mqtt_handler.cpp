#include "mqtt_handler.h"
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include "config.h"
#include "actuators.h"
#include "sensors.h"

// --- DEVICE_ID défini dans main.cpp (adresse MAC WiFi) ---
extern String DEVICE_ID;

// Topics initialisés dynamiquement dans mqtt_init()
String TOPIC_BASE     = "";
String TOPIC_MEASURES = "";
String TOPIC_STATUS   = "";
String TOPIC_CMD_LAMP = "";
String TOPIC_CMD_PUMP = "";
String TOPIC_CMD_FAN  = "";
String TOPIC_CMD_DOOR = "";
String TOPIC_CONFIG   = "";

extern Thresholds    _th;
extern ActuatorState _state;
extern DoorSchedule  _doorSched;
extern PubSubClient  mqttClient;

// =========================================================
void mqtt_init(PubSubClient& client, WiFiClientSecure& sClient) {
  sClient.setInsecure(); // Ajouter CA cert en production
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

  Serial.println("[MQTT] Client configure. Topics initialises avec MAC : " + DEVICE_ID);
  Serial.println("[MQTT] Topic base : " + TOPIC_BASE);
}

// =========================================================
void mqtt_loop(PubSubClient& client) {
  static unsigned long lastReconnect = 0;

  if (!client.connected()) {
    if (millis() - lastReconnect > 5000) {
      lastReconnect = millis();

      String clientId = "ESP32-" + DEVICE_ID;
      if (client.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
        Serial.println("[MQTT] Connecte au broker (ID: " + clientId + ")");
        client.subscribe(TOPIC_CMD_LAMP.c_str());
        client.subscribe(TOPIC_CMD_PUMP.c_str());
        client.subscribe(TOPIC_CMD_FAN.c_str());
        client.subscribe(TOPIC_CMD_DOOR.c_str());
        client.subscribe(TOPIC_CONFIG.c_str());
      } else {
        Serial.printf("[MQTT] Connexion echouee : %d\n", client.state());
      }
    }
  } else {
    client.loop();
  }
}

// =========================================================
void mqtt_publishMeasures(PubSubClient& client, const SensorData& data) {
  if (!client.connected()) return;

  StaticJsonDocument<384> doc;
  doc["temperature"]       = round(data.temperature * 10) / 10.0;
  doc["humidity"]          = round(data.humidity * 10) / 10.0;
  doc["co2"]               = (int)data.co2;
  doc["nh3"]               = round(data.nh3 * 10) / 10.0;
  doc["airQualityPercent"]  = (int)data.airQualityPercent;
  doc["nh3DigitalAlert"]    = data.nh3DigitalAlert;
  doc["waterLevel"]        = round(data.waterLevel * 10) / 10.0;
  doc["timestamp"]         = millis();
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

  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  StaticJsonDocument<768> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) {
    Serial.print("[MQTT] JSON invalide — ");
    Serial.println(err.c_str());
    return;
  }

  String t = String(topic);

  // -------------------------------------------------------
  // Porte
  // -------------------------------------------------------
  if (t == TOPIC_CMD_DOOR) {
    const char* action = doc["action"] | "";
    if (strcmp(action, "open") == 0) {
      actuators_moveDoor(true);
    } else if (strcmp(action, "close") == 0) {
      actuators_moveDoor(false);
    } else if (strcmp(action, "stop") == 0) {
      actuators_stopDoor();
    } else {
      Serial.printf("[MQTT] Action porte inconnue : %s\n", action);
    }

    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // -------------------------------------------------------
  // Lampe
  // -------------------------------------------------------
  if (t == TOPIC_CMD_LAMP) {
    bool on = doc["on"] | false;
    const char* mode = doc["mode"] | "manual";

    if (strcmp(mode, "auto") == 0) {
      actuators_setLampAuto(true);
      Serial.println("[MQTT] Lampe -> AUTO");
    } else {
      actuators_setLampAuto(false);
      Serial.println("[MQTT] Lampe -> MANUAL");
    }

    actuators_setLamp(on);
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // -------------------------------------------------------
  // Pompe
  // -------------------------------------------------------
  if (t == TOPIC_CMD_PUMP) {
    bool on = doc["on"] | false;
    const char* mode = doc["mode"] | "manual";

    if (strcmp(mode, "auto") == 0) {
      actuators_setPumpAuto(true);
      Serial.println("[MQTT] Pompe -> AUTO");
    } else {
      actuators_setPumpAuto(false);
      Serial.println("[MQTT] Pompe -> MANUAL");
    }

    actuators_setPump(on);
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // -------------------------------------------------------
  // Ventilateur
  // -------------------------------------------------------
  if (t == TOPIC_CMD_FAN) {
    bool on = doc["on"] | false;
    const char* mode = doc["mode"] | "manual";

    if (strcmp(mode, "auto") == 0) {
      actuators_setFanAuto(true);
      Serial.println("[MQTT] Ventilateur -> AUTO");
    } else {
      actuators_setFanAuto(false);
      Serial.println("[MQTT] Ventilateur -> MANUAL");
    }

    actuators_setFan(on);
    Serial.printf("[MQTT] FAN cmd reçue — mode=%s on=%d\n", mode, on ? 1 : 0);

    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // -------------------------------------------------------
  // Configuration & planning
  // -------------------------------------------------------
  if (t == TOPIC_CONFIG) {
    if (doc.containsKey("doorSched")) {
      _doorSched.openH  = doc["doorSched"]["openH"]  | _doorSched.openH;
      _doorSched.openM  = doc["doorSched"]["openM"]  | _doorSched.openM;
      _doorSched.closeH = doc["doorSched"]["closeH"] | _doorSched.closeH;
      _doorSched.closeM = doc["doorSched"]["closeM"] | _doorSched.closeM;
      _doorSched.active = doc["doorSched"]["active"] | _doorSched.active;

      actuators_saveSched();

      Serial.printf(
        "[MQTT] Planning mis à jour : O=%02d:%02d F=%02d:%02d actif=%d\n",
        _doorSched.openH, _doorSched.openM,
        _doorSched.closeH, _doorSched.closeM,
        _doorSched.active
      );
    }

    if (doc.containsKey("currentTime")) {
      actuators_updateTime(
        doc["currentTime"]["h"] | 0,
        doc["currentTime"]["m"] | 0
      );
    }

    if (doc.containsKey("tempMin"))  _th.tempMin  = doc["tempMin"];
    if (doc.containsKey("tempMax"))  _th.tempMax  = doc["tempMax"];
    if (doc.containsKey("waterMin")) _th.waterMin  = doc["waterMin"];
    if (doc.containsKey("co2Max"))   _th.co2Max   = doc["co2Max"];

    // ✅ Restaurer les modes depuis la BD (envoyés par le backend)
    if (doc.containsKey("fanMode")) {
      bool isAuto = strcmp(doc["fanMode"] | "manual", "auto") == 0;
      actuators_setFanAuto(isAuto);
      Serial.printf("[MQTT] fanMode restaure -> %s\n", isAuto ? "AUTO" : "MANUAL");
    }
    if (doc.containsKey("lampMode")) {
      bool isAuto = strcmp(doc["lampMode"] | "manual", "auto") == 0;
      actuators_setLampAuto(isAuto);
      Serial.printf("[MQTT] lampMode restaure -> %s\n", isAuto ? "AUTO" : "MANUAL");
    }
    if (doc.containsKey("pumpMode")) {
      bool isAuto = strcmp(doc["pumpMode"] | "manual", "auto") == 0;
      actuators_setPumpAuto(isAuto);
      Serial.printf("[MQTT] pumpMode restaure -> %s\n", isAuto ? "AUTO" : "MANUAL");
    }

    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  Serial.printf("[MQTT] Topic non géré : %s\n", t.c_str());
}