#pragma once

/**
 * ✅ WATCHDOG TIMER
 * Prevents ESP32 from becoming unresponsive
 * Automatically reboots if main loop freezes for > 30 seconds
 */

#include <esp_task_wdt.h>
#include <Arduino.h>

// Watchdog timeout in seconds
#define WATCHDOG_TIMEOUT_SECONDS 30

/**
 * Initialize the ESP32 internal watchdog
 * Call this in setup()
 */
void initializeWatchdog() {
  Serial.println("[WDT] Initializing watchdog timer...");

  // Enable watchdog on current task (loop)
  esp_task_wdt_init(WATCHDOG_TIMEOUT_SECONDS, true);
  esp_task_wdt_add(NULL);  // Add current task to watchdog

  Serial.printf("[WDT] ✅ Watchdog enabled (timeout: %ds)\n", WATCHDOG_TIMEOUT_SECONDS);
}

/**
 * Feed the watchdog (reset the timer)
 * Call this in main loop() to show we're alive
 */
void feedWatchdog() {
  esp_task_wdt_reset();
}

/**
 * Manual reboot (useful for testing)
 */
void forceReboot(const char* reason = "Manual reboot") {
  Serial.printf("[WDT] ⚠️ Forcing reboot: %s\n", reason);
  delay(500);
  esp_restart();
}
