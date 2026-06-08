classDiagram
direction LR

%% =====================
%% Entités (DB)
%% =====================
class Poulailler {
+name : String
+animalCount : Number
+surface : Number
+lastMonitoring : Monitoring
+thresholds : Object
}

class Camera {
+poulailler : ObjectId
+macAddress : String
+status : String
}

class CaptureRequest {
+requestId : String
+poulaillerId : ObjectId
+status : String
+error : String
+result : Mixed
}

class AiAnalysis {
+poultryId : ObjectId
+triggeredBy : String
+sensors : Object
+result : Result
+image : {url,thumbnailUrl,publicId}
+cameraMac : String
}

class ChatHistory {
+poulaillerId : ObjectId
+userId : ObjectId
+messages : Message[]
}

class Message {
+role : user|assistant
+content : String
+createdAt : Date
}

class Alert {
+poulailler : ObjectId
+type : String
+key : String
+message : String
+severity : String
}

%% =====================
%% Relations (entités)
%% =====================
Poulailler "1" -- "0.._" Camera
Poulailler "1" -- "0.._" CaptureRequest
Poulailler "1" -- "0.._" AiAnalysis
Poulailler "1" -- "0.._" ChatHistory
Poulailler "1" -- "0..\*" Alert

CaptureRequest "0..1" --> "1" AiAnalysis : contient résultat
AiAnalysis "0.._" --> "0.._" Alert : déclenche si critique/mortalité

ChatHistory "1" o-- "0..\*" Message : conversation
