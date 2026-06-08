sequenceDiagram
autonumber
actor User as Utilisateur
participant API as backend (aiController)
participant DB as MongoDB (ChatHistory/AiAnalysis)
participant AI as aiService (chatWithGemma)

Note over API: Consultation Dr. Gemma (chat vétérinaire)

User->>API: POST /api/ai/chat {question, poulaillerId}

API->>DB: checkAccess(poulaillerId, req.user.id)

API->>DB: ChatHistory.findOne(poulaillerId, userId)
DB-->>API: history.messages (derniers ~6)

API->>DB: AiAnalysis.findOne(sort desc createdAt)
DB-->>API: lastAnalysis (healthScore, urgencyLevel, diagnostic, advices, sensors)

API->>API: extractFreshSensors(poulailler)
API->>API: build context (temp/humidity/airQuality/waterLevel + last analysis)

API->>AI: chatWithGemma(question, context, history)
alt Cloudflare activé
AI->>AI: buildSystemPrompt(context)
AI->>AI: callCloudflare(Gemma)
AI-->>API: answer (texte)
else fallback
AI-->>API: buildFallbackAnswer(question, context)
end

API->>DB: ChatHistory.findOneAndUpdate($push messages)
DB-->>API: updated chat

API-->>User: 200 {answer, context (lastHealthScore/lastUrgency/lastAnalysisDate)}
