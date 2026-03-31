#pragma once
#include <Arduino.h>
#include <DHT.h>
#include "config.h"

struct SensorData {
  float temperature;
  float humidity;
  float co2;
  float nh3;
  float airQualityPercent;
  bool  nh3DigitalAlert;
  float dust;
  float waterLevel;
  bool  valid;
};

void       sensors_init();
SensorData sensors_read();
float      sensors_temperature();
float      sensors_humidity();
float      sensors_co2();
float      sensors_nh3();
float      sensors_waterLevel();