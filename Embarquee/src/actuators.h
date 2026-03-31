#pragma once
#include <Arduino.h>
#include "config.h"

struct ActuatorState {
  bool fanOn     = false;
  bool fanAuto   = false;
  bool lampOn    = false;
  bool lampAuto  = false;
  bool doorOpen  = false;
  bool doorAuto  = false;
  int  openHour  = 6;
  int  openMin   = 0;
  int  closeHour = 20;
  int  closeMin  = 0;
};

struct FanThresholds { // FIX: Complete thresholds incl lamp
  float tempMin;
  float tempMax;
  float co2Max;
  float nh3Max;
  float airQualityMin;
};


void          actuators_init();
ActuatorState actuators_getState();

void actuators_setFan(bool on);
void actuators_setFanAuto(bool enabled);
void actuators_setLamp(bool on);        // ← AJOUTÉ
void actuators_moveDoor(bool open);     // Commande MQTT: action "open" ou "close"
void actuators_doorMotorTick();         // À appeler dans loop() pour gérer la séquence moteur
void actuators_setDoorAuto(bool enabled);
void actuators_setSchedule(int openH, int openM, int closeH, int closeM);
void actuators_tick(float temperature, float humidity, float co2, float nh3, float airQualityPercent, bool nh3Alert);

void actuators_applyThresholds(FanThresholds t); // FIX: Apply dynamic thresholds


void actuators_setLampAuto(bool enabled);
