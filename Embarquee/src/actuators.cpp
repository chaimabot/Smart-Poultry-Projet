#include "actuators.h"

static ActuatorState _state;
static FanThresholds thresholds = {DEFAULT_TEMP_MIN, DEFAULT_TEMP_MAX, DEFAULT_CO2_MAX, DEFAULT_NH3_MAX, 70.0f};

// ============================================================
// STEPPER MOTOR STATE MACHINE
// ============================================================
enum DoorMotorState {
  DOOR_IDLE,        // Moteur arrêté
  DOOR_OPENING,     // En train d'ouvrir
  DOOR_CLOSING,     // En train de fermer
  DOOR_OPEN,        // Portefull ouverte (arrêtée)
  DOOR_CLOSED       // Porte fermée (arrêtée)
};

static DoorMotorState _doorMotorState = DOOR_IDLE;
static unsigned long _lastStepTime = 0;
static int _stepIndex = 0;  // 0-7 pour 8-step half-step sequence

// Séquence 8-pas half-step validée
// {IN1, IN2, IN3, IN4}
static const uint8_t STEPPER_SEQUENCE[8][4] = {
  {1,0,0,0},
  {1,1,0,0},
  {0,1,0,0},
  {0,1,1,0},
  {0,0,1,0},
  {0,0,1,1},
  {0,0,0,1},
  {1,0,0,1}
};

// ============================================================
// Helper: Set stepper pins to given sequence step
// ============================================================
static void _setStepperStep(int stepIdx) {
  if (stepIdx < 0 || stepIdx >= 8) return;
  digitalWrite(PIN_STEPPER_IN1, STEPPER_SEQUENCE[stepIdx][0] ? HIGH : LOW);
  digitalWrite(PIN_STEPPER_IN2, STEPPER_SEQUENCE[stepIdx][1] ? HIGH : LOW);
  digitalWrite(PIN_STEPPER_IN3, STEPPER_SEQUENCE[stepIdx][2] ? HIGH : LOW);
  digitalWrite(PIN_STEPPER_IN4, STEPPER_SEQUENCE[stepIdx][3] ? HIGH : LOW);
}

// ============================================================
// Helper: Turn off all stepper pins
// ============================================================
static void _stopStepper() {
  digitalWrite(PIN_STEPPER_IN1, LOW);
  digitalWrite(PIN_STEPPER_IN2, LOW);
  digitalWrite(PIN_STEPPER_IN3, LOW);
  digitalWrite(PIN_STEPPER_IN4, LOW);
}

// ============================================================
// Init
// ============================================================
void actuators_init() {
  pinMode(PIN_LAMPE, OUTPUT);
  digitalWrite(PIN_LAMPE, LOW);
  pinMode(PIN_VENTILATEUR, OUTPUT);
  digitalWrite(PIN_VENTILATEUR, HIGH);
  
  // Stepper pins
  pinMode(PIN_STEPPER_IN1, OUTPUT);
  pinMode(PIN_STEPPER_IN2, OUTPUT);
  pinMode(PIN_STEPPER_IN3, OUTPUT);
  pinMode(PIN_STEPPER_IN4, OUTPUT);
  _stopStepper();
  
  // End switches
  pinMode(PIN_SWITCH_OPEN, INPUT_PULLUP);
  pinMode(PIN_SWITCH_CLOSE, INPUT_PULLUP);

  _state.fanOn = false;
  _state.fanAuto = false;
  _state.lampOn = false;
  _state.lampAuto = false;
  _state.doorOpen = false;
  _state.doorAuto = false;
  _doorMotorState = DOOR_IDLE;
  _lastStepTime = 0;
  _stepIndex = 0;

  Serial.println("[ACTUATORS] Init OK - Stepper motor ready");
}

// Getters
ActuatorState actuators_getState() {
  return _state;
}

// Fan
void actuators_setFan(bool on) {
  _state.fanOn = on;
  if (on) {
    digitalWrite(PIN_VENTILATEUR, LOW);
    Serial.println("[FAN] ON");
  } else {
    digitalWrite(PIN_VENTILATEUR, HIGH);
    Serial.println("[FAN] OFF");
  }
}

void actuators_setFanAuto(bool enabled) {
  _state.fanAuto = enabled;
  Serial.printf("[FAN AUTO] %s\n", enabled ? "ON" : "OFF");
}

// Lamp
void actuators_setLamp(bool on) {
  _state.lampOn = on;
  digitalWrite(PIN_LAMPE, on ? HIGH : LOW);
  Serial.printf("[LAMP] %s\n", on ? "ON" : "OFF");
}

void actuators_setLampAuto(bool enabled) {
  _state.lampAuto = enabled;
  Serial.printf("[LAMP AUTO] %s\n", enabled ? "ON" : "OFF");
}

// ============================================================
// DOOR CONTROL — MQTT Command
// ============================================================
void actuators_moveDoor(bool open) {
  if (open) {
    // Start opening sequence: 0 → 7
    _doorMotorState = DOOR_OPENING;
    _stepIndex = 0;
    _lastStepTime = millis();
    Serial.println("[DOOR] START OPENING (0→7)");
  } else {
    // Start closing sequence: 7 → 0
    _doorMotorState = DOOR_CLOSING;
    _stepIndex = 7;
    _lastStepTime = millis();
    Serial.println("[DOOR] START CLOSING (7→0)");
  }
}

void actuators_setDoorAuto(bool enabled) {
  _state.doorAuto = enabled;
  Serial.printf("[DOOR AUTO] %s\n", enabled ? "ON" : "OFF");
}

void actuators_setSchedule(int openH, int openM, int closeH, int closeM) {
  _state.openHour = openH;
  _state.openMin = openM;
  _state.closeHour = closeH;
  _state.closeMin = closeM;
  _state.doorAuto = true;
  Serial.printf("[SCHEDULE] %02d:%02d / %02d:%02d\n", openH, openM, closeH, closeM);
}

// ============================================================
// DOOR MOTOR TICK — Call from loop() to advance stepper
// ============================================================
void actuators_doorMotorTick() {
  if (_doorMotorState == DOOR_IDLE || _doorMotorState == DOOR_OPEN || _doorMotorState == DOOR_CLOSED) {
    return;
  }

  unsigned long now = millis();
  if (now - _lastStepTime < STEPPER_STEP_DELAY_MS) {
    return; // Not yet time for next step
  }

  _lastStepTime = now;

  if (_doorMotorState == DOOR_OPENING) {
    // Check if reached open end switch (LOW = reached)
    if (digitalRead(PIN_SWITCH_OPEN) == LOW) {
      Serial.println("[DOOR] OPEN end switch reached!");
      _stopStepper();
      _doorMotorState = DOOR_OPEN;
      _state.doorOpen = true;
      return;
    }
    
    // Move to next step: 0→7
    _setStepperStep(_stepIndex);
    Serial.printf("[DOOR OPENING] Step %d\n", _stepIndex);
    _stepIndex++;
    if (_stepIndex > 7) _stepIndex = 0; // Wrap around

  } else if (_doorMotorState == DOOR_CLOSING) {
    // Check if reached close end switch (LOW = reached)
    if (digitalRead(PIN_SWITCH_CLOSE) == LOW) {
      Serial.println("[DOOR] CLOSE end switch reached!");
      _stopStepper();
      _doorMotorState = DOOR_CLOSED;
      _state.doorOpen = false;
      return;
    }

    // Move to next step: 7→0
    _setStepperStep(_stepIndex);
    Serial.printf("[DOOR CLOSING] Step %d\n", _stepIndex);
    _stepIndex--;
    if (_stepIndex < 0) _stepIndex = 7; // Wrap around
  }
}

// Thresholds
void actuators_applyThresholds(FanThresholds t) {
  thresholds = t;
  Serial.printf("[THRESHOLDS] Tmin=%.1f Tmax=%.1f CO2=%.0f NH3=%.1f AQ=%.0f\n", 
    thresholds.tempMin, thresholds.tempMax, thresholds.co2Max, thresholds.nh3Max, thresholds.airQualityMin);
}

// Tick logic (lamp & fan auto)
void actuators_tick(float temperature, float humidity, float co2, float nh3, float airQualityPercent, bool nh3Alert) {
  if (_state.lampAuto) {
    bool shouldHeat = temperature < thresholds.tempMin;
    if (shouldHeat != _state.lampOn) {
      actuators_setLamp(shouldHeat);
    }
  }

  if (_state.fanAuto) {
    bool shouldRun = (temperature > thresholds.tempMax) ||
                     (co2 > thresholds.co2Max) ||
                     (nh3 > thresholds.nh3Max) ||
                     nh3Alert ||
                     (airQualityPercent < thresholds.airQualityMin);
    if (shouldRun != _state.fanOn) {
      actuators_setFan(shouldRun);
    }
  }
}
