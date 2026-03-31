#include "mqtt_handler.h"
#include <ArduinoJson.h>
#include "actuators.h"  // For FanThresholds and thresholds access

String TOPIC_MEASURES;
String TOPIC_STATUS;
String TOPIC_CMD_LAMP;
String TOPIC_CMD_DOOR;
String TOPIC_CMD_FAN;
String TOPIC_CMD_SCHEDULE;
String TOPIC_CONFIG; // FIX: BUG4 poulailler/{ID}/config

static PubSubClient* _client = nullptr;

// Callback MQTT messages
static void onMessage(char* topic, byte* payload, unsigned int length) {
  String t = String(topic);
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.printf("[MQTT] <- %s : %s\n", topic, msg.c_str());

  StaticJsonDocument<256> doc;
  deserializeJson(doc, msg);
  if (doc.isNull()) {
    Serial.println("[MQTT] JSON invalide");
    return;
  }

  if (t == TOPIC_CMD_LAMP) {
    const char* mode = doc["mode"] | "";
    if (strcmp(mode, "auto") == 0) {
      actuators_setLampAuto(true);
    } else {
      actuators_setLampAuto(false);
      const char* action = doc["action"] | "";
      actuators_setLamp(strcmp(action, "on") == 0 || strcmp(action, "1") == 0);
    }
    return;
  }

  if (t == TOPIC_CMD_FAN) {
    const char* mode = doc["mode"] | "";
    if (strcmp(mode, "auto") == 0) {
      actuators_setFanAuto(true);
    } else {
      actuators_setFanAuto(false);
      const char* action = doc["action"] | "";
      Serial.printf("[MQTT FAN CMD] action='%s'\n", action); // DEBUG
      if (strcmp(action, "on") == 0 || strcmp(action, "start") == 0 || strcmp(action, "demarrer") == 0 || strcmp(action, "1") == 0) {
        actuators_setFan(true);
      } else {
        actuators_setFan(false);
      }
    }
    return;
  }

  if (t == TOPIC_CMD_DOOR) {
    const char* mode = doc["mode"] | "";
    if (strcmp(mode, "auto") == 0) {
      actuators_setDoorAuto(true);
    } else {
      actuators_setDoorAuto(false);
      const char* action = doc["action"] | "";
      actuators_moveDoor(strcmp(action, "open") == 0 || strcmp(action, "ouvrir") == 0);
    }
    return;
  }

  if (t == TOPIC_CMD_SCHEDULE) {
    actuators_setSchedule(doc["openHour"] | 6, doc["openMin"] | 0, doc["closeHour"] | 20, doc["closeMin"] | 0);
    return;
  }

  // FIX: BUG4 Backend config → thresholds/fanMode
  if (t == TOPIC_CONFIG) {
    FanThresholds th;
    th.tempMax = doc["tempMax"] | 28.0f;
    th.co2Max = doc["co2Max"] | 2000.0f;
    th.nh3Max = doc["nh3Max"] | 50.0f;
    th.airQualityMin = doc["airQualityMin"] | 70.0f;
    actuators_applyThresholds(th);

    const char* fanMode = doc["fanMode"] | "manual";
    actuators_setFanAuto(strcmp(fanMode, "auto") == 0);
    Serial.println("[MQTT CONFIG] Updated");
    return;
  }
}

// Connect & subscribe
static void connectMQTT(PubSubClient& client) {
  String clientId = "ESP32_" + String(POULAILLER_ID) + "_" + String(millis());
  while (!client.connected()) {
    Serial.printf("[MQTT] Connecting...\n");
    if (client.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println("[MQTT] Connected!");
      client.subscribe(TOPIC_CMD_LAMP.c_str());
      client.subscribe(TOPIC_CMD_FAN.c_str());
      client.subscribe(TOPIC_CMD_DOOR.c_str());
      client.subscribe(TOPIC_CMD_SCHEDULE.c_str());
      client.subscribe(TOPIC_CONFIG.c_str()); // FIX: BUG4
    } else {
      Serial.printf("[MQTT] Fail %d. Retry 5s\n", client.state());
      delay(5000);
    }
  }
}

void mqtt_init(PubSubClient& client, WiFiClientSecure& secureClient) {
  _client = &client;
  secureClient.setInsecure();

  String base = "poulailler/" + String(POULAILLER_ID);
  TOPIC_MEASURES = base + "/measures";
  TOPIC_STATUS = base + "/status";
  TOPIC_CMD_LAMP = base + "/commands/lamp";
  TOPIC_CMD_FAN = base + "/commands/fan";
  TOPIC_CMD_DOOR = base + "/commands/door";
  TOPIC_CMD_SCHEDULE = base + "/commands/schedule";
  TOPIC_CONFIG = base + "/config"; // FIX: BUG4

  Serial.printf("[MQTT] Base topic: %s\n", base.c_str());

  client.setServer(MQTT_BROKER, MQTT_PORT);
  client.setCallback(onMessage);
  client.setKeepAlive(MQTT_KEEPALIVE);
  client.setSocketTimeout(MQTT_TIMEOUT);
  client.setBufferSize(512);

  connectMQTT(client);
  mqtt_requestConfig(client); // FIX: Get initial config
}

void mqtt_loop(PubSubClient& client) {
  if (!client.connected()) connectMQTT(client);
  client.loop();
}

void mqtt_publishMeasures(PubSubClient& client, const SensorData& data) {
  StaticJsonDocument<512> doc;
  doc["poulaillerId"] = POULAILLER_ID;
  doc["timestamp"] = millis();
  doc["temperature"] = data.temperature;
  doc["humidity"] = data.humidity;
  doc["co2"] = data.co2;
  doc["nh3"] = data.nh3;
  doc["airQualityPercent"] = data.airQualityPercent;
  doc["nh3DigitalAlert"] = data.nh3DigitalAlert;
  doc["dust"] = data.dust;
  doc["waterLevel"] = data.waterLevel;

  char buf[512];
  serializeJson(doc, buf);
  client.publish(TOPIC_MEASURES.c_str(), buf, true);
  Serial.printf("[MQTT SEND] T%.1f CO2%.0f NH3%.1f\n", data.temperature, data.co2, data.nh3);
}

void mqtt_requestConfig(PubSubClient& client) { // FIX: BUG4
  String topic = "poulailler/" + String(POULAILLER_ID) + "/config/get";
  client.publish(topic.c_str(), "{}", true);
  Serial.println("[MQTT] Config requested");
}

void mqtt_publishStatus(PubSubClient& client, const ActuatorState& state) {
  StaticJsonDocument<200> doc;
  doc["fan"] = state.fanOn;
  doc["lamp"] = state.lampOn;
  doc["fanAuto"] = state.fanAuto;
  doc["door"] = state.doorOpen;  // true = ouverte, false = fermée

  char buf[200];
  serializeJson(doc, buf);
  client.publish(TOPIC_STATUS.c_str(), buf, true); // Retained
  Serial.printf("[STATUS] fan=%s fanAuto=%s door=%s\n", 
    state.fanOn ? "ON" : "OFF", 
    state.fanAuto ? "AUTO" : "MAN",
    state.doorOpen ? "OPEN" : "CLOSED");
}
