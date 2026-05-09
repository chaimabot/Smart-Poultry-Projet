#pragma once
#include <Arduino.h>
#include <DHT.h>
#include "config.h"

struct SensorData {
  float temperature;
  float humidity;
  float airQualityPercent;
  float waterLevel;
};

void sensors_init();
SensorData sensors_read();