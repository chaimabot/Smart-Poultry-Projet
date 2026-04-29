# Diagramme de Classes – Sprint 1
## Gestion des Utilisateurs, Profil, Poulaillers, Dossiers et Modules

---

## Vue d'ensemble

Ce diagramme présente les entités principales du Sprint 1 avec leurs attributs, types de données, contraintes et relations.

---

## Diagramme de Classes (Mermaid)

```mermaid
classDiagram
    direction LR

    %% ===================== CLASSES =====================

    class User {
        +ObjectId _id
        +String email [UK, required]
        +String password [required, min:6, select:false]
        +String firstName [required]
        +String lastName [required]
        +String phone [default: null]
        +String photoUrl [default: null]
        +String role [enum: eleveur|admin, default: eleveur]
        +Boolean isActive [default: true]
        +String inviteToken [default: null]
        +Date inviteTokenExpires [default: null]
        +Date lastLogin [default: null]
        +Date createdAt
        +Date updatedAt
        +matchPassword(enteredPassword) Boolean
        +pre('save') hashPassword()
    }

    class Poulailler {
        +ObjectId _id
        +ObjectId owner [FK → User, required]
        +String name [required, min:3, max:50]
        +Number animalCount [required, min:1]
        +String description [max:200, default: null]
        +String location [default: null]
        +String photoUrl [default: null]
        +String status [enum, default: en_attente_module]
        +Date installationDate [default: Date.now]
        +Boolean isOnline [default: false]
        +Boolean isArchived [default: false]
        +Date lastCommunicationAt [default: null]
        +String uniqueCode [UK, sparse]
        +ObjectId moduleId [FK → Module, default: null]
        +Thresholds thresholds
        +AutoThresholds autoThresholds
        +ActuatorStates actuatorStates
        +Boolean isCritical [default: false]
        +Date lastAlert [default: null]
        +Date lastCriticalCheck [default: null]
        +Date lastMeasureAt [default: null]
        +LastMonitoring lastMonitoring
        +Date createdAt
        +Date updatedAt
    }

    class Thresholds {
        +Number temperatureMin [default: 18]
        +Number temperatureMax [default: 28]
        +Number humidityMin [default: 40]
        +Number humidityMax [default: 70]
        +Number co2Max [default: 1500]
        +Number nh3Max [default: 25]
        +Number dustMax [default: 150]
        +Number waterLevelMin [default: 20]
    }

    class AutoThresholds {
        +Number ventiloThresholdTemp [default: 28]
        +Number ventiloThresholdCO2 [default: 1500]
        +String doorOpenTime [default: "07:00"]
        +String doorCloseTime [default: "19:00"]
    }

    class ActuatorStates {
        +Actuator door
        +Actuator ventilation
        +Actuator lamp
        +Actuator pump
    }

    class Actuator {
        +String status [enum: on|off|open|closed]
        +String mode [enum: auto|manual, default: auto]
    }

    class LastMonitoring {
        +Number temperature
        +Number humidity
        +Number co2
        +Number nh3
        +Number airQualityPercent
        +Boolean nh3DigitalAlert
        +Number dust
        +Number waterLevel
        +Date timestamp
    }

    class Dossier {
        +ObjectId _id
        +ObjectId eleveur [FK → User, required]
        +ObjectId poulailler [FK → Poulailler, required]
        +String contractNumber [UK, required]
        +Number totalAmount [required, default: 0]
        +Number advanceAmount [default: 0]
        +Number remainedAmount [default: 0]
        +String status [enum: EN_ATTENTE|AVANCE_PAYEE|TERMINE|ANNULE, default: EN_ATTENTE]
        +String equipmentList [default: "Boîtier IoT ESP32, ..."]
        +Date dateValidation [default: null]
        +Date dateCloture [default: null]
        +String motifCloture [default: null]
        +Date dateAnnulation [default: null]
        +String motifAnnulation [default: null]
        +ObjectId validatedBy [FK → User, default: null]
        +ObjectId cloreBy [FK → User, default: null]
        +ObjectId annulePar [FK → User, default: null]
        +String motDePasseTemporaire [default: null]
        +Date createdAt
        +Date updatedAt
        +pre('save') generateContractNumber()
    }

    class Module {
        +ObjectId _id
        +String serialNumber [default: null]
        +String macAddress [UK, required]
        +String deviceName [max:50, default: null]
        +String firmwareVersion [default: null]
        +String status [enum: pending|associated|offline|dissociated, default: pending]
        +ObjectId poulailler [FK → Poulailler, default: null]
        +ObjectId owner [FK → User, default: null]
        +Date lastPing [default: null]
        +String claimCode [default: null]
        +Date claimCodeExpiresAt [default: null]
        +Date claimCodeUsedAt [default: null]
        +String dissociationReason [default: null]
        +Date dissociatedAt [default: null]
        +Date createdAt
        +Date updatedAt
        +static normalizeMac(raw) String
        +updateStatus() void
        +pre('save') autoUpdateStatus()
    }

    class Measure {
        +ObjectId _id
        +ObjectId poulailler [FK → Poulailler, required]
        +Number temperature
        +Number humidity
        +Number co2
        +Number nh3
        +Number dust
        +Number waterLevel
        +Date timestamp [default: Date.now]
        +Date createdAt
        +Date updatedAt
        +Index { poulailler: 1, timestamp: -1 }
        +TTL Index { timestamp: 1, expireAfterSeconds: 2592000 }
    }

    %% ===================== RELATIONS =====================

    User "1" --> "0..*" Poulailler : owner
    User "1" --> "0..*" Dossier : eleveur
    User "1" --> "0..*" Module : owner
    Poulailler "1" --> "0..1" Module : moduleId
    Poulailler "1" --> "0..*" Measure : poulailler
    Poulailler "1" --> "0..1" Dossier : poulailler
    Module "1" --> "0..1" Poulailler : poulailler

    %% ===================== EMBEDDED =====================

    Poulailler *-- Thresholds : thresholds
    Poulailler *-- AutoThresholds : autoThresholds
    Poulailler *-- ActuatorStates : actuatorStates
    Poulailler *-- LastMonitoring : lastMonitoring
    ActuatorStates *-- Actuator : door
    ActuatorStates *-- Actuator : ventilation
    ActuatorStates *-- Actuator : lamp
    ActuatorStates *-- Actuator : pump
```

---

## Dictionnaire des relations

| Relation | Cardinalité | Description |
|----------|-------------|-------------|
| **User → Poulailler** | 1 → 0..* | Un éleveur possède plusieurs poulaillers (max 20) |
| **User → Dossier** | 1 → 0..* | Un éleveur a plusieurs dossiers (un par inscription) |
| **User → Module** | 1 → 0..* | Un éleveur peut avoir plusieurs modules IoT |
| **Poulailler → Module** | 1 → 0..1 | Un poulailler est lié à au plus un module ESP32 |
| **Poulailler → Measure** | 1 → 0..* | Un poulailler génère de nombreuses mesures (TTL 30j) |
| **Poulailler → Dossier** | 1 → 0..1 | Un poulailler principal est lié à un dossier commercial |
| **Module → Poulailler** | 1 → 0..1 | Un module est associé à au plus un poulailler |

---

## Dictionnaire des attributs

### User

| Attribut | Type | Contraintes | Description |
|----------|------|-------------|-------------|
| `email` | String | UK, required, regex | Identifiant unique de connexion |
| `password` | String | required, min:6, select:false | Mot de passe hashé (bcrypt) |
| `firstName` | String | required | Prénom |
| `lastName` | String | required | Nom |
| `phone` | String | - | Téléphone |
| `photoUrl` | String | - | Photo de profil (base64 ou URL) |
| `role` | String | enum: eleveur\|admin | Rôle sur la plateforme |
| `isActive` | Boolean | default: true | Accès autorisé ou non |
| `inviteToken` | String | - | Token d'invitation (32 bytes hex) |
| `inviteTokenExpires` | Date | - | Expiration du token (7 jours) |
| `lastLogin` | Date | - | Dernière connexion |

### Poulailler

| Attribut | Type | Contraintes | Description |
|----------|------|-------------|-------------|
| `owner` | ObjectId | FK → User, required | Propriétaire du poulailler |
| `name` | String | required, min:3, max:50 | Nom du bâtiment |
| `animalCount` | Number | required, min:1 | Nombre de volailles |
| `description` | String | max:200 | Description libre |
| `location` | String | - | Adresse du bâtiment |
| `status` | String | enum | Statut de connexion du poulailler |
| `uniqueCode` | String | UK, sparse | Code unique `POL-XXXXXX` |
| `moduleId` | ObjectId | FK → Module | Module IoT associé |
| `isArchived` | Boolean | default: false | Archivage (soft delete) |

### Dossier

| Attribut | Type | Contraintes | Description |
|----------|------|-------------|-------------|
| `eleveur` | ObjectId | FK → User, required | Éleveur concerné |
| `poulailler` | ObjectId | FK → Poulailler, required | Poulailler principal |
| `contractNumber` | String | UK, required | Numéro de contrat `SP-YYYY-XXXX` |
| `totalAmount` | Number | required, default:0 | Montant total (DT) |
| `advanceAmount` | Number | default:0 | Avance perçue (DT) |
| `remainedAmount` | Number | default:0 | Reste à payer (calculé auto) |
| `status` | String | enum | `EN_ATTENTE` \| `AVANCE_PAYEE` \| `TERMINE` \| `ANNULE` |
| `equipmentList` | String | default | Liste du matériel fourni |
| `motDePasseTemporaire` | String | - | MDP temporaire envoyé par email |

### Module

| Attribut | Type | Contraintes | Description |
|----------|------|-------------|-------------|
| `macAddress` | String | UK, required | Adresse MAC normalisée (12 car. hex) |
| `serialNumber` | String | - | Numéro de série `SN-XXXXXX` |
| `deviceName` | String | max:50 | Nom affiché `ESP32_XXX` |
| `firmwareVersion` | String | - | Version du firmware |
| `status` | String | enum | `pending` \| `associated` \| `offline` \| `dissociated` |
| `poulailler` | ObjectId | FK → Poulailler | Poulailler associé |
| `owner` | ObjectId | FK → User | Éleveur propriétaire |
| `lastPing` | Date | - | Dernier signe de vie MQTT |
| `claimCode` | String | - | Code d'association `CLAIM-XXXXXX` |
| `claimCodeExpiresAt` | Date | - | Expiration du claim (180 jours) |

### Measure

| Attribut | Type | Contraintes | Description |
|----------|------|-------------|-------------|
| `poulailler` | ObjectId | FK → Poulailler, required | Poulailler source |
| `temperature` | Number | - | Température en °C |
| `humidity` | Number | - | Humidité en % |
| `co2` | Number | - | CO2 en ppm |
| `nh3` | Number | - | Ammoniac en ppm |
| `dust` | Number | - | Poussière en µg/m³ |
| `waterLevel` | Number | - | Niveau d'eau en % |
| `timestamp` | Date | default: Date.now, TTL: 30j | Date de la mesure |

---

## Enums

### Poulailler.status
| Valeur | Description |
|--------|-------------|
| `en_attente_module` | En attente d'un module IoT |
| `connecte` | Module associé, communication active |
| `hors_ligne` | Module associé mais sans ping |
| `maintenance` | Maintenance en cours |
| `archive` | Poulailler archivé |

### Dossier.status
| Valeur | Couleur | Description |
|--------|---------|-------------|
| `EN_ATTENTE` | 🟠 | En attente de validation admin |
| `AVANCE_PAYEE` | 🟢 | Validé, avance perçue |
| `TERMINE` | ⚫ | Clôturé, installation terminée |
| `ANNULE` | 🔴 | Annulé |

### Module.status
| Valeur | Couleur | Description |
|--------|---------|-------------|
| `pending` | 🟠 | En attente d'association |
| `associated` | 🟢 | Associé à un poulailler |
| `offline` | 🔴 | Associé mais pas de ping > 24h |
| `dissociated` | ⚫ | Dissocié, réutilisable |

---

*Document généré automatiquement – SmartPoultry*

