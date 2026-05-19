#pragma once
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "sensors.h"
#include "actuators.h"

extern String DEVICE_ID;

void mqtt_init(PubSubClient& client, WiFiClientSecure& sClient);
void mqtt_loop(PubSubClient& client);
void mqtt_publishMeasures(PubSubClient& client, const SensorData& data);
void mqtt_publishStatus(PubSubClient& client, const ActuatorState& state);
void onMessage(char* topic, byte* payload, unsigned int length);

extern String TOPIC_MEASURES;
extern String TOPIC_STATUS;
extern String TOPIC_CMD_LAMP;
extern String TOPIC_CMD_PUMP;
extern String TOPIC_CMD_FAN;
extern String TOPIC_CMD_DOOR;
extern String TOPIC_CONFIG;
extern String TOPIC_CMD_WIFI;  