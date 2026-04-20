# Smart-Poultry MQTT Fix TODO

Status: [ ] Not started

## Breakdown of Approved Plan

1. [x] **Define MQTT topics** in src/mqtt_handler.cpp using POULAILLER_ID.
2. [x] **Implement mqtt_init()**: Server, SSL insecure, callback, initial connect.
3. [x] **Implement mqtt_loop()**: Reconnect logic, client.loop().
4. [x] **Implement mqtt_publishMeasures()**: Json SensorData → TOPIC_MEASURES.
5. [x] **Update TODO**: Mark 1-4 done.
6. [x] **Build test**: pio run → success (no linker/compiler errors).
7. [ ] **Upload test**: pio run --target upload.
8. [ ] **Runtime verify**: Serial monitor, HiveMQ console.

**Current Step: 6. Build test running...**
