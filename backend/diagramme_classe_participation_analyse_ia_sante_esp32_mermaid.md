classDiagram
direction LR

%% =====================
%% Controllers / orchestrateurs IA (existants)
%% =====================
class AiController

%% =====================
%% Services IA / externes (existants)
%% =====================
class aiService
class aiCronJob
class cloudinaryService

%% =====================
%% Entités / modèles (existants dans la partie IA)
%% =====================
class Poulailler
class Camera
class Capturerequest
class AiAnalysis
class ChatHistory
class Alert

%% =====================
%% Relations (dépendances visibles dans le code)
%% =====================
AiController --> aiService : analyzeWithCloudflareAI()/chatWithGemma()/extractFreshSensors()
AiController --> cloudinaryService : cloudinary.uploadImage()
AiController --> aiCronJob : (job auto analyse/relance)

AiController --> Poulailler : checkAccess()/extractFreshSensors(source)
AiController --> Camera : verifyCameraLinked()/findOne/lastPing/status
AiController --> Capturerequest : create/find/findOneAndUpdate/delete
AiController --> AiAnalysis : create/find/findOneAndUpdate
AiController --> ChatHistory : findOne/findOneAndUpdate/delete
AiController --> Alert : create (si urgency critique ou mortalité)

%% =====================
%% Relations métier entre entités (schémas Mongoose + usages)
%% =====================
Poulailler "1" o-- "0.._" Camera
Poulailler "1" o-- "0.._" Capturerequest
Poulailler "1" o-- "0.._" AiAnalysis
Poulailler "1" o-- "0.._" ChatHistory
Poulailler "1" o-- "0..\*" Alert

Capturerequest "0..1" --> AiAnalysis : result.analysis (à completed)

%% =====================
%% Notes (captures ESP32-CAM + analyse IA)
%% =====================
note for AiController "Capture ESP32-CAM : receiveImageFromESP -> processImageAsync"
note for AiService "Analyse image : analyzeWithCloudflareAI + fallback capteurs"
note for cloudinaryService "Upload image : cloudinary.uploadImage"
