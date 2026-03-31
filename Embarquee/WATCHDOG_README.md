# 🛡️ ESP32 Watchdog Timer Integration

## Overview

Le watchdog détecte et reprend automatiquement si l'ESP32 freeze.

**Fichier:** `src/watchdog.h`
**Timeout:** 30 secondes (customizable)

## Integration dans main.cpp

### 1. Header inclusion

```cpp
#include "watchdog.h"
```

### 2. Dans setup()

```cpp
void setup() {
  Serial.begin(115200);
  delay(500);

  // ... other setup code ...

  // Initialize watchdog (MUST be after Serial, before loop)
  initializeWatchdog();

  // ... rest of setup ...
}
```

### 3. Dans loop()

```cpp
void loop() {
  // Feed watchdog at EVERY iteration
  // This shows ESP32 is still responsive
  feedWatchdog();

  mqtt_loop(mqttClient);

  unsigned long now = millis();
  if (now - lastMeasureTime >= MEASURE_INTERVAL_MS) {
    lastMeasureTime = now;

    // ... sensor reading code ...

    feedWatchdog();  // ← Also feed after long operations

    // ... actuator code ...
  }

  // Small delay to prevent overwhelming the loop
  delay(10);
}
```

## How It Works

1. **Initialization:** watchdog started with 30s timeout
2. **Main loop:** Calls `feedWatchdog()` regularly
3. **If loop freezes:** Watchdog timer expires
4. **Automatic reboot:** ESP32 restarts automatically

## Monitoring Reboots

Check if reboot was caused by watchdog:

```cpp
void setup() {
  esp_reset_reason_t reason = esp_reset_cause();

  if (reason == ESP_RST_TASK_WDT) {
    Serial.println("⚠️ Previous reboot caused by WATCHDOG (freeze detected)");
  }
}
```

## Timeout Customization

Change timeout in `watchdog.h`:

```cpp
#define WATCHDOG_TIMEOUT_SECONDS 60  // Increase to 60s if needed
```

## Testing Watchdog

```cpp
// Add to loop() temporarily to test:
void testWatchdog() {
  Serial.println("Testing watchdog - blocking for 35 seconds...");
  delay(35000);  // Will trigger watchdog at 30s
  Serial.println("This won't print - watchdog already rebooted!");
}
```

After calling, ESP32 will reboot after 30s and serial monitor will show:

```
[WDT] ✅ Watchdog enabled (timeout: 30s)
Testing watchdog - blocking for 35 seconds...
ets Jul  29 2019 12:21:46 rst:0x8 (TG1WDT_SYS_RESET)
⚠️ Previous reboot caused by WATCHDOG (freeze detected)
```

## Best Practices

✅ **DO:**

- Feed watchdog multiple times in loop() if doing long operations
- Keep loop() responsive (< 1 second without feeding)
- Test watchdog before production

❌ **DON'T:**

- Forget to call `feedWatchdog()` - will trigger false resets
- Call `delay()` for very long periods without feeding
- Disable watchdog in production

## Files Created

- ✅ NEW: `src/watchdog.h` - Watchdog manager
- ⚠️ TODO: Update `src/main.cpp` - Integration
