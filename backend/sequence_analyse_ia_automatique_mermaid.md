sequenceDiagram
  autonumber
  actor ESP32 as ESP32-CAM
  participant API as backend (aiController)
  participant MQTT as mqttService
  participant DB as MongoDB (CaptureRequest/AiAnalysis)
  participant AI as aiService (analyse)
  participant Cloud as cloudinaryService

  Note over API: Analyse IA automatique (déclenchement + capture + analyse)

  API->>DB: verify Poulailler + caméra associée
  API->>DB: create CaptureRequest(status="pending")
  API->>MQTT: publishCameraCommand(poulaillerId, requestId)
  API-->>API: set lock analysisLocks(poulaillerId)

  API->>DB: poll endpoint / capture-status (client)

  ESP32-->>API: POST /api/ai/receive-image
  API->>DB: find/create CaptureRequest(requestId)
  API->>DB: update status="uploading"
  API->>API: processImageAsync(requestId, poulaillerId)

  API->>DB: update status="analyzing"
  API->>DB: read Poulailler + extractFreshSensors()
  API->>AI: analyzeWithCloudflareAI(imageBase64, sensorData)

  alt image inutilisable / fallback capteurs
    AI-->>API: result (imageUsable=false, healthScore/urgency sur capteurs)
  else image exploitable
    AI->>AI: assessImageQuality() + compressImage()
    AI->>AI: callCloudflare (Llama Vision / Gemma fallback)
    AI-->>API: aiResult (imageUsable=true, healthScore/diagnostic/detections)
  end

  API->>Cloud: uploadImage(imageBase64, poulaillerId)
  Cloud-->>API: cloudImage(url, thumbnailUrl, publicId)

  API->>DB: AiAnalysis.create( résultat + imageQuality + sensors)
  API->>DB: update CaptureRequest(status="completed", result={...})

  alt urgence critique ou mortalité détectée
    API->>DB: Alert.create(type="sensor", key="ai-analysis")
  else pas d'alerte
    Note over API,DB: pas d'Alert
  end

  API-->>API: release lock analysisLocks(poulaillerId)

  Note over API: GET /api/ai/capture-status/:requestId
  API-->>ESP32: (côté client) status="completed" + URLs + analyse
  API->>DB: optional delete CaptureRequest après 30s
