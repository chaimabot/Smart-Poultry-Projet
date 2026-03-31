#pragma once
#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "config.h"
#include "sensors.h"
#include "actuators.h"

void mqtt_init(PubSubClient& client, WiFiClientSecure& secureClient);
void mqtt_loop(PubSubClient& client);
void mqtt_publishMeasures(PubSubClient& client, const SensorData& data);
void mqtt_publishStatus(PubSubClient& client, const ActuatorState& state);

extern String TOPIC_MEASURES;
extern String TOPIC_STATUS;
extern String TOPIC_CMD_LAMP;
extern String TOPIC_CMD_DOOR;
extern String TOPIC_CMD_FAN;
extern String TOPIC_CMD_SCHEDULE;
extern String TOPIC_CONFIG; // FIX: BUG4 Config topic

void mqtt_requestConfig(PubSubClient& client); // FIX: Request config from backend
