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
  float waterLevel;
};

void sensors_init();
SensorData sensors_read();