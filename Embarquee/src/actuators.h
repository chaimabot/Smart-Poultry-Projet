#pragma once
#include <Arduino.h>
#include "config.h"

// =========================================================
//  État de la porte (machine à états explicite)
// =========================================================
enum DoorState {
  DOOR_UNKNOWN = 0,  // Démarrage, position inconnue
  DOOR_OPEN    = 1,  // Fin de course OPEN déclenché
  DOOR_CLOSED  = 2,  // Fin de course CLOSE déclenché
  DOOR_OPENING = 3,  // En mouvement vers ouverture
  DOOR_CLOSING = 4,  // En mouvement vers fermeture
  DOOR_BLOCKED = 5   // Timeout dépassé — alarme
};

struct ActuatorState {
  bool lampOn   = false;
  bool lampAuto = false;
  bool pumpOn   = false;
  bool pumpAuto = false;
  bool fanOn    = false;
  bool fanAuto  = true;

  DoorState doorState = DOOR_UNKNOWN;

  // Rétro-compatibilité booléenne
  bool doorOpen() const {
    return doorState == DOOR_OPEN || doorState == DOOR_OPENING;
  }
};

struct DoorSchedule {
  int  openH  = 7;
  int  openM  = 0;
  int  closeH = 18;
  int  closeM = 0;
  bool active = false;
};

struct Thresholds {
  float tempMin         = DEFAULT_TEMP_MIN;
  float tempMax         = DEFAULT_TEMP_MAX;
  float waterMin        = DEFAULT_WATER_MIN;
  float waterHysteresis = DEFAULT_WATER_HYSTERESIS;
float airQualityMin = DEFAULT_AIR_QUALITY_MIN;
};

extern ActuatorState _state;
extern Thresholds    _th;
extern DoorSchedule  _doorSched;

// ---- API publique ----------------------------------------

// Initialisation hardware
void actuators_init();

// ⚡ À appeler dans chaque loop() — pilote le moteur pas-à-pas
//    sans bloquer (non-bloquant, comme dans le test standalone)
void actuators_doorLoop();

// À appeler toutes les 5s — logique relais + planning horaire
void actuators_tick(float temp, float water, float airQuality);
// Heure courante (reçue via MQTT)
void actuators_updateTime(int h, int m);

// Persistance planning NVS
void actuators_saveSched();
void actuators_loadSched();

// Commandes porte
void actuators_moveDoor(bool open);  // true=ouvrir, false=fermer
void actuators_stopDoor();

// Commandes relais
void actuators_setLamp(bool on);
void actuators_setLampAuto(bool autoMode);
void actuators_setPump(bool on);
void actuators_setPumpAuto(bool autoMode);
void actuators_setFan(bool on);
void actuators_setFanAuto(bool autoMode);

// Utilitaire log
const char* actuators_doorStateName(DoorState s);