#include "actuators.h"
#include <Preferences.h>

// =========================================================
//  Variables globales exportées
// =========================================================
ActuatorState _state;
Thresholds    _th;
DoorSchedule  _doorSched;
Preferences   prefs;

// ---- Heure courante (reçue via MQTT config) --------------
static int _currentH = -1;
static int _currentM = -1;

// ---- Anti-déclenchement multiple sur la même minute ------
static int _lastOpenTriggeredM  = -1;
static int _lastCloseTriggeredM = -1;

// =========================================================
//  Moteur pas-à-pas 28BYJ-48 — séquence half-step
// =========================================================
static const uint8_t STEPPER_SEQ[8][4] = {
  {1, 0, 0, 0},
  {1, 1, 0, 0},
  {0, 1, 0, 0},
  {0, 1, 1, 0},
  {0, 0, 1, 0},
  {0, 0, 1, 1},
  {0, 0, 0, 1},
  {1, 0, 0, 1}
};

static int           _stepperStep  = 0;
static unsigned long _lastStepTime = 0;

static const unsigned int  STEPPER_DELAY_MS = 5;
static const unsigned long DOOR_TIMEOUT_MS  = 25000UL;
static unsigned long       _doorMoveStart   = 0;

// =========================================================
//  Utilitaires internes
// =========================================================

static void stepper_off() {
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  digitalWrite(PIN_MOTOR_IN3, LOW);
  digitalWrite(PIN_MOTOR_IN4, LOW);
}

static void stepper_applyStep() {
  digitalWrite(PIN_MOTOR_IN1, STEPPER_SEQ[_stepperStep][0] ? HIGH : LOW);
  digitalWrite(PIN_MOTOR_IN2, STEPPER_SEQ[_stepperStep][1] ? HIGH : LOW);
  digitalWrite(PIN_MOTOR_IN3, STEPPER_SEQ[_stepperStep][2] ? HIGH : LOW);
  digitalWrite(PIN_MOTOR_IN4, STEPPER_SEQ[_stepperStep][3] ? HIGH : LOW);
}

static bool switch_isOpen()   { return digitalRead(PIN_SWITCH_OPEN)  == LOW; }
static bool switch_isClosed() { return digitalRead(PIN_SWITCH_CLOSE) == LOW; }

const char* actuators_doorStateName(DoorState s) {
  switch (s) {
    case DOOR_UNKNOWN: return "UNKNOWN";
    case DOOR_OPEN:    return "OPEN";
    case DOOR_CLOSED:  return "CLOSED";
    case DOOR_OPENING: return "OPENING";
    case DOOR_CLOSING: return "CLOSING";
    case DOOR_BLOCKED: return "BLOCKED";
    default:           return "?";
  }
}

// =========================================================
//  Init hardware - CORRIGÉ (Pas de mouvement au démarrage)
// =========================================================
void actuators_init() {
  // Relais
  pinMode(PIN_PUMP,        OUTPUT);
  pinMode(PIN_VENTILATEUR, OUTPUT);
  pinMode(PIN_LAMPE,       OUTPUT);
  digitalWrite(PIN_PUMP,        HIGH); 
  digitalWrite(PIN_VENTILATEUR, HIGH); 
  digitalWrite(PIN_LAMPE,       LOW);  

  // Fins de course
  pinMode(PIN_SWITCH_OPEN,  INPUT_PULLUP);
  pinMode(PIN_SWITCH_CLOSE, INPUT_PULLUP);

  // Moteur
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  pinMode(PIN_MOTOR_IN3, OUTPUT);
  pinMode(PIN_MOTOR_IN4, OUTPUT);
  stepper_off();

  // Planning depuis Flash NVS
  actuators_loadSched();

  // --- LOGIQUE DE DÉMARRAGE CORRIGÉE ---
  if (switch_isOpen()) {
    _state.doorState = DOOR_OPEN;
    Serial.println("[DOOR] Demarrage : porte detectee OUVERTE");
  } else if (switch_isClosed()) {
    _state.doorState = DOOR_CLOSED;
    Serial.println("[DOOR] Demarrage : porte detectee FERMEE");
  } else {
    // On reste immobile même si la position est inconnue
    _state.doorState = DOOR_UNKNOWN;
    Serial.println("[DOOR] Demarrage : position INCONNUE (Attente commande)");
    // La ligne actuators_moveDoor(false); a été supprimée pour éviter l'ouverture/fermeture directe.
  }

  Serial.println("[ACTUATORS] Initialise.");
}

// =========================================================
//  Persistance planning NVS
// =========================================================
void actuators_loadSched() {
  prefs.begin("poultry", true);
  _doorSched.openH  = prefs.getInt ("oh",     7);
  _doorSched.openM  = prefs.getInt ("om",     0);
  _doorSched.closeH = prefs.getInt ("ch",    18);
  _doorSched.closeM = prefs.getInt ("cm",     0);
  _doorSched.active = prefs.getBool("active", false);
  prefs.end();
}

void actuators_saveSched() {
  prefs.begin("poultry", false);
  prefs.putInt ("oh",     _doorSched.openH);
  prefs.putInt ("om",     _doorSched.openM);
  prefs.putInt ("ch",     _doorSched.closeH);
  prefs.putInt ("cm",     _doorSched.closeM);
  prefs.putBool("active", _doorSched.active);
  prefs.end();
}

void actuators_updateTime(int h, int m) {
  _currentH = h;
  _currentM = m;
}

// =========================================================
//  Commandes porte
// =========================================================
void actuators_stopDoor() {
  stepper_off();
  _state.doorState = switch_isOpen()   ? DOOR_OPEN
                   : switch_isClosed() ? DOOR_CLOSED
                   : DOOR_UNKNOWN;
  Serial.printf("[DOOR] Stop -> etat : %s\n", actuators_doorStateName(_state.doorState));
}

void actuators_moveDoor(bool open) {
  if (open && (switch_isOpen() || _state.doorState == DOOR_OPEN)) {
    _state.doorState = DOOR_OPEN;
    Serial.println("[DOOR] OUVRIR ignoree : deja ouverte");
    return;
  }
  if (!open && (switch_isClosed() || _state.doorState == DOOR_CLOSED)) {
    _state.doorState = DOOR_CLOSED;
    Serial.println("[DOOR] FERMER ignoree : deja fermee");
    return;
  }
  if (open  && _state.doorState == DOOR_OPENING) return;
  if (!open && _state.doorState == DOOR_CLOSING) return;

  _state.doorState = open ? DOOR_OPENING : DOOR_CLOSING;
  _doorMoveStart   = millis();
  _lastStepTime    = 0; 
  Serial.printf("[DOOR] Commande : %s\n", open ? "OUVRIR" : "FERMER");
}

void actuators_doorLoop() {
  if (_state.doorState != DOOR_OPENING && _state.doorState != DOOR_CLOSING) return;

  bool atOpen  = switch_isOpen();
  bool atClose = switch_isClosed();

  if (_state.doorState == DOOR_OPENING && atOpen) {
    stepper_off();
    _state.doorState = DOOR_OPEN;
    Serial.println("[DOOR] *** Porte OUVERTE (Fin de course) ***");
    return;
  }
  if (_state.doorState == DOOR_CLOSING && atClose) {
    stepper_off();
    _state.doorState = DOOR_CLOSED;
    Serial.println("[DOOR] *** Porte FERMEE (Fin de course) ***");
    return;
  }

  if (millis() - _doorMoveStart > DOOR_TIMEOUT_MS) {
    stepper_off();
    _state.doorState = DOOR_BLOCKED;
    Serial.println("[DOOR] *** TIMEOUT 25s (BLOQUE) ***");
    return;
  }

  if (millis() - _lastStepTime >= STEPPER_DELAY_MS) {
    _lastStepTime = millis();
    if (_state.doorState == DOOR_OPENING) {
      _stepperStep = (_stepperStep + 1) % 8;
    } else {
      _stepperStep = (_stepperStep - 1 + 8) % 8;
    }
    stepper_applyStep();
  }
}

void actuators_tick(float temp, float water, float co2) {
  if (_doorSched.active && _currentH != -1) {
    if (_currentH == _doorSched.openH && _currentM == _doorSched.openM) {
      if (_lastOpenTriggeredM != _currentM) {
        _lastOpenTriggeredM = _currentM;
        if (_state.doorState != DOOR_OPEN && _state.doorState != DOOR_OPENING) {
          actuators_moveDoor(true);
        }
      }
    }
    if (_currentH == _doorSched.closeH && _currentM == _doorSched.closeM) {
      if (_lastCloseTriggeredM != _currentM) {
        _lastCloseTriggeredM = _currentM;
        if (_state.doorState != DOOR_CLOSED && _state.doorState != DOOR_CLOSING) {
          actuators_moveDoor(false);
        }
      }
    }
  }

  // Automatismes relais
  if (_state.lampAuto) {
    if      (temp < _th.tempMin) actuators_setLamp(true);
    else if (temp > _th.tempMax) actuators_setLamp(false);
  }
  if (_state.fanAuto) {
    if (temp > _th.tempMax || co2 > 1000.0f) actuators_setFan(true);
    else                                      actuators_setFan(false);
  }
  if (_state.pumpAuto) {
    if      (water < _th.waterMin && !_state.pumpOn) actuators_setPump(true);
    else if (water > (_th.waterMin + _th.waterHysteresis) && _state.pumpOn) actuators_setPump(false);
  }
}

// =========================================================
//  Setters relais
// =========================================================
void actuators_setLamp(bool on) {
  _state.lampOn = on;
  digitalWrite(PIN_LAMPE, on ? HIGH : LOW);
}
void actuators_setLampAuto(bool autoMode) { _state.lampAuto = autoMode; }

void actuators_setPump(bool on) {
  _state.pumpOn = on;
  digitalWrite(PIN_PUMP, on ? LOW : HIGH);
}
void actuators_setPumpAuto(bool autoMode) { _state.pumpAuto = autoMode; }

void actuators_setFan(bool on) {
  _state.fanOn = on;
  digitalWrite(PIN_VENTILATEUR, on ? LOW : HIGH);
}
void actuators_setFanAuto(bool autoMode) { _state.fanAuto = autoMode; }