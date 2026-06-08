classDiagram
direction LR

%% =====================
%% Entities / Models (exactement ceux utilisés dans la partie IA)
%% =====================
class Poulailler
class Camera
class Capturerequest
class AiAnalysis
class ChatHistory
class Alert

%% =====================
%% Controllers (exactement ceux présents dans le code IA)
%% =====================
class AiController

%% =====================
%% Relations (exactement les dépendances visibles)
%% =====================
AiController --> Poulailler : checkAccess()
AiController --> Camera : verifyCameraLinked()/findByIdAndUpdate()
AiController --> Capturerequest : create/findOne/findOneAndUpdate/delete
AiController --> AiAnalysis : create/find/findOneAndUpdate
AiController --> ChatHistory : findOne/findOneAndUpdate/delete
AiController --> Alert : create

%% =====================
%% Relations métier entre entités (déduites du schéma et du code)
%% =====================
Poulailler "1" o-- "0.._" Camera
Poulailler "1" o-- "0.._" Capturerequest
Poulailler "1" o-- "0.._" AiAnalysis
Poulailler "1" o-- "0.._" ChatHistory
Poulailler "1" o-- "0..\*" Alert

Capturerequest "0..1" --> AiAnalysis : result.analysis (quand completed)
