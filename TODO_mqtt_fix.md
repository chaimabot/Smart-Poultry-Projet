# MQTT Real-time Sensors & Commands Fix

## Steps:

- [x] 1. Update mobile/src/services/mqttService.js publishToPoultry with specific topics & JSON format.
- [ ] 2. Update mobile/src/features/poultry/screens/PoultryDetailScreen.js handleMqttMessage to process /measures & /status topics.
- [ ] 3. Unify connection state (remove mqttStatus).
- [ ] 4. Restart expo: cd mobile && npx expo start --clear
- [ ] 5. Test sensors update real-time, lamp/fan toggle.

Progress: Step 1.
