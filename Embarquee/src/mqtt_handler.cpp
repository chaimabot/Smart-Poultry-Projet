#include "mqtt_handler.h"
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include "config.h"
#include "actuators.h"
#include "sensors.h"

String TOPIC_BASE     = "poulailler/" + String(POULAILLER_ID) + "/";
String TOPIC_MEASURES = TOPIC_BASE + "measures";
String TOPIC_STATUS   = TOPIC_BASE + "status";
String TOPIC_CMD_LAMP = TOPIC_BASE + "cmd/lamp";
String TOPIC_CMD_PUMP = TOPIC_BASE + "cmd/pump";
String TOPIC_CMD_FAN  = TOPIC_BASE + "cmd/fan";
String TOPIC_CMD_DOOR = TOPIC_BASE + "cmd/door";
String TOPIC_CONFIG   = TOPIC_BASE + "config";

extern Thresholds    _th;
extern ActuatorState _state;
extern DoorSchedule  _doorSched;
extern PubSubClient  mqttClient;

// =========================================================
void mqtt_init(PubSubClient& client, WiFiClientSecure& sClient) {
  sClient.setInsecure(); // Ajouter CA cert en production
  client.setServer(MQTT_BROKER, MQTT_PORT);
  client.setCallback(onMessage);
  Serial.println("[MQTT] Client configuré");
}

// =========================================================
void mqtt_loop(PubSubClient& client) {
  static unsigned long lastReconnect = 0;
  if (!client.connected()) {
    if (millis() - lastReconnect > 5000) {
      lastReconnect = millis();
      String clientId = "ESP32-" + String(POULAILLER_ID);
      if (client.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
        Serial.println("[MQTT] Connecté au broker");
        client.subscribe(TOPIC_CMD_LAMP.c_str());
        client.subscribe(TOPIC_CMD_PUMP.c_str());
        client.subscribe(TOPIC_CMD_FAN.c_str());
        client.subscribe(TOPIC_CMD_DOOR.c_str());
        client.subscribe(TOPIC_CONFIG.c_str());
      } else {
        Serial.printf("[MQTT] Connexion échouée : %d\n", client.state());
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
  doc["temperature"]      = round(data.temperature * 10) / 10.0;
  doc["humidity"]         = round(data.humidity    * 10) / 10.0;
  doc["co2"]              = (int)data.co2;
  doc["nh3"]              = round(data.nh3         * 10) / 10.0;
  doc["airQualityPercent"]= (int)data.airQualityPercent;
  doc["nh3DigitalAlert"]  = data.nh3DigitalAlert;
  doc["waterLevel"]       = round(data.waterLevel  * 10) / 10.0;
  doc["timestamp"]        = millis();

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
  // Champ booléen rétro-compat + état riche texte
  doc["doorOpen"]  = state.doorOpen();          // true si OPEN ou OPENING
  doc["doorState"] = actuators_doorStateName(state.doorState); // "OPEN","CLOSED","OPENING"...
  doc["lampAuto"]  = state.lampAuto;
  doc["pumpAuto"]  = state.pumpAuto;
  doc["fanAuto"]   = state.fanAuto;
  doc["doorAuto"]  = _doorSched.active;

  char buf[512];
  serializeJson(doc, buf);
  client.publish(TOPIC_STATUS.c_str(), buf);
}

// =========================================================
//  Callback messages entrants
// =========================================================
void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  StaticJsonDocument<768> doc;
  if (deserializeJson(doc, msg)) {
    Serial.println("[MQTT] JSON invalide — message ignoré");
    return;
  }

  String t = String(topic);

  // ---- Commandes porte --------------------------------
  if (t == TOPIC_CMD_DOOR) {
    const char* action = doc["action"];
    if (!action) return;

    if      (strcmp(action, "open")  == 0) actuators_moveDoor(true);
    else if (strcmp(action, "close") == 0) actuators_moveDoor(false);
    else if (strcmp(action, "stop")  == 0) actuators_stopDoor();
    else {
      Serial.printf("[MQTT] Action porte inconnue : %s\n", action);
    }
    // Publier le nouvel état immédiatement
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // ---- Commandes lampe --------------------------------
  if (t == TOPIC_CMD_LAMP) {
    bool on = doc["on"] | false;
    const char* mode = doc["mode"];
    actuators_setLamp(on);
    if      (mode && strcmp(mode, "manual") == 0) actuators_setLampAuto(false);
    else if (mode && strcmp(mode, "auto")   == 0) actuators_setLampAuto(true);
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // ---- Commandes pompe --------------------------------
  if (t == TOPIC_CMD_PUMP) {
    bool on = doc["on"] | false;
    const char* mode = doc["mode"];
    actuators_setPump(on);
    if      (mode && strcmp(mode, "manual") == 0) actuators_setPumpAuto(false);
    else if (mode && strcmp(mode, "auto")   == 0) actuators_setPumpAuto(true);
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // ---- Commandes ventilateur --------------------------
  if (t == TOPIC_CMD_FAN) {
    bool on = doc["on"] | false;
    const char* mode = doc["mode"];
    actuators_setFan(on);
    if      (mode && strcmp(mode, "manual") == 0) actuators_setFanAuto(false);
    else if (mode && strcmp(mode, "auto")   == 0) actuators_setFanAuto(true);
    mqtt_publishStatus(mqttClient, _state);
    return;
  }

  // ---- Configuration & planning -----------------------
  if (t == TOPIC_CONFIG) {
    if (doc.containsKey("doorSched")) {
      _doorSched.openH  = doc["doorSched"]["openH"]  | _doorSched.openH;
      _doorSched.openM  = doc["doorSched"]["openM"]  | _doorSched.openM;
      _doorSched.closeH = doc["doorSched"]["closeH"] | _doorSched.closeH;
      _doorSched.closeM = doc["doorSched"]["closeM"] | _doorSched.closeM;
      _doorSched.active = doc["doorSched"]["active"] | _doorSched.active;
      actuators_saveSched();
      Serial.printf("[MQTT] Planning mis à jour : O=%02d:%02d F=%02d:%02d actif=%d\n",
        _doorSched.openH, _doorSched.openM,
        _doorSched.closeH, _doorSched.closeM,
        _doorSched.active);
    }
    if (doc.containsKey("currentTime")) {
      actuators_updateTime(
        doc["currentTime"]["h"] | 0,
        doc["currentTime"]["m"] | 0
      );
    }
    if (doc.containsKey("tempMin"))  _th.tempMin  = doc["tempMin"];
    if (doc.containsKey("tempMax"))  _th.tempMax  = doc["tempMax"];
    if (doc.containsKey("waterMin")) _th.waterMin = doc["waterMin"];

    mqtt_publishStatus(mqttClient, _state);
  }
}