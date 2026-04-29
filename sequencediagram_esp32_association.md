# Diagramme de Séquence – Association ESP32 (Module IoT)

## Vue d'ensemble

Ce diagramme illustre le processus complet d'association d'un module ESP32 à un poulailler : depuis la création du module par l'admin jusqu'à la publication des données MQTT en temps réel.

---

## Acteurs

| Acteur          | Rôle                                                    |
| --------------- | ------------------------------------------------------- |
| **Admin**       | Crée le module en base et génère le claim code          |
| **Éleveur**     | Scanne le QR code sur le boîtier ESP32 via l'app mobile |
| **ESP32**       | Boîtier IoT qui génère un QR code et publie des mesures |
| **App Mobile**  | Application éleveur pour scanner et associer le module  |
| **Backend**     | API Node.js qui gère les modules et l'association       |
| **MongoDB**     | Base de données des modules, poulaillers et users       |
| **MQTT Broker** | Broker HiveMQ pour la communication temps réel          |

---

## Diagramme Mermaid

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant B as Backend (Node.js)
    participant DB as MongoDB
    actor E as Éleveur
    participant AM as App Mobile
    participant ESP as ESP32
    participant MQTT as MQTT Broker

    rect rgb(230, 245, 255)
        Note over A,DB: Phase 1 – Création du module en base
        A->>B: POST /api/modules<br/>{ macAddress: "246F28AF4B10" }
        B->>B: Normalise MAC (uppercase, no separators)
        B->>B: Vérifie regex ^[0-9A-F]{12}$<br/>Vérifie unicité MAC
        B->>B: Génère claimCode (CLAIM-XXXXXX)<br/>serialNumber (SN-XXXXXX)<br/>deviceName (ESP32_XXX)
        B->>DB: INSERT Module<br/>status: "pending"<br/>claimCodeExpiresAt: now + 180j
        DB-->>B: Module créé
        B-->>A: 201 + claimCode + serialNumber
        Note right of A: L'admin écrit le claim code<br/>sur l'étiquette du boîtier ESP32
    end

    rect rgb(255, 245, 230)
        Note over ESP,A: Phase 2 – Préparation du boîtier ESP32
        ESP->>ESP: Génère DEVICE_ID depuis MAC WiFi
        ESP->>ESP: Affiche QR code sur écran OLED<br/>smartpoultry://claim?c=CLAIM-XXXXXX
        Note right of ESP: Le QR code contient le claimCode<br/>généré côté admin
    end

    rect rgb(230, 255, 230)
        Note over E,MQTT: Phase 3 – Association via QR Code
        E->>AM: Ouvre "Ajouter un module"
        AM->>AM: Active caméra pour scan QR
        E->>AM: Scanne le QR code sur le boîtier
        AM->>AM: Décode QR : extrait claimCode
        AM->>B: POST /api/modules/decode-qr<br/>{ qrData: "smartpoultry://claim?c=..." }
        B->>DB: SELECT Module WHERE<br/>claimCode = token<br/>AND status = "pending"
        alt Code valide
            DB-->>B: Module trouvé
            B-->>AM: 200 + module infos
            AM-->>E: Affiche module (série, nom)
            E->>AM: Sélectionne le poulailler cible
            AM->>B: POST /api/modules/claim<br/>{ claimCode, poulaillerId }
            B->>DB: Vérifie poulailler appartient à éleveur
            B->>DB: UPDATE Module<br/>status: "associated"<br/>poulailler: id<br/>owner: éleveurId<br/>claimCodeUsedAt: now
            B->>DB: UPDATE Poulailler<br/>moduleId: id<br/>status: "connecte"
            DB-->>B: OK
            B-->>AM: 200 "Module associé avec succès"
            AM-->>E: Confirmation visuelle
        else Code invalide ou déjà utilisé
            DB-->>B: Introuvable
            B-->>AM: 400 "Code claim invalide ou expiré"
            AM-->>E: Message d'erreur
        end
    end

    rect rgb(245, 230, 255)
        Note over ESP,MQTT: Phase 4 – Connexion MQTT et publication
        ESP->>ESP: Se connecte au WiFi
        ESP->>MQTT: Connexion TLS (port 8883)<br/>avec DEVICE_ID (MAC)
        MQTT-->>ESP: Connexion acceptée
        loop Toutes les 5 secondes
            ESP->>ESP: Lit capteurs (DHT22, MQ135, HC-SR04, INA219)
            ESP->>MQTT: PUBLISH<br/>topic: poulailler/{id}/measures<br/>payload JSON { temp, hum, co2, waterLevel }
            MQTT->>B: Forward message
            B->>DB: INSERT Measure<br/>(TTL 30 jours)
            B->>B: Vérifie seuils alertes
            alt Seuil dépassé
                B->>AM: PUSH notification (FCM)
                AM-->>E: 🔔 Alerte reçue
            end
        end
    end
```

---

## Tableau des endpoints

| Méthode | Endpoint                      | Rôle    | Description                             |
| ------- | ----------------------------- | ------- | --------------------------------------- |
| `POST`  | `/api/modules`                | Admin   | Créer un module (MAC uniquement)        |
| `POST`  | `/api/modules/decode-qr`      | Éleveur | Valider un QR code scanné               |
| `POST`  | `/api/modules/claim`          | Éleveur | Associer le module à un poulailler      |
| `POST`  | `/api/modules/ping`           | Système | Mettre à jour le dernier ping           |
| `POST`  | `/api/modules/:id/dissociate` | Admin   | Dissocier un module (motif obligatoire) |

---

## Modèle de données – Module (MongoDB)

| Champ                | Type            | Description                                          |
| -------------------- | --------------- | ---------------------------------------------------- |
| `macAddress`         | String (unique) | Adresse MAC normalisée (12 car. hex)                 |
| `serialNumber`       | String          | Numéro de série auto-généré                          |
| `deviceName`         | String          | Nom affiché (ESP32_XXX)                              |
| `status`             | Enum            | `pending` / `associated` / `offline` / `dissociated` |
| `poulailler`         | ObjectId        | Référence vers le Poulailler                         |
| `owner`              | ObjectId        | Référence vers l'Éleveur                             |
| `claimCode`          | String          | Code d'association unique (CLAIM-XXXXXX)             |
| `claimCodeExpiresAt` | Date            | Expiration du claim (180 jours)                      |
| `claimCodeUsedAt`    | Date            | Date d'utilisation du claim                          |
| `lastPing`           | Date            | Dernier signe de vie reçu                            |

---

## Légende des messages

| Étape | Description                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | L'admin crée un module en saisissant l'adresse MAC du boîtier ESP32                                                                                                                    |
| 3–4   | Le backend normalise et valide la MAC, puis génère un claimCode, un serialNumber et un deviceName                                                                                      |
| 5–6   | Le module est stocké en base avec `status="pending"` et le claimCode valable 180 jours                                                                                                 |
| 7     | L'admin reçoit les informations du module et écrit le claimCode sur l'étiquette du boîtier                                                                                             |
| 8–9   | L'ESP32 génère son `DEVICE_ID` à partir de son adresse MAC WiFi et affiche un QR code contenant le claimCode                                                                           |
| 10–12 | L'éleveur ouvre l'app mobile, scanne le QR code avec la caméra, et l'app décode le claimCode                                                                                           |
| 13–14 | L'app mobile envoie le claimCode au backend pour validation                                                                                                                            |
| 15–17 | Si le code est valide, l'app affiche les informations du module (série, nom)                                                                                                           |
| 18–19 | L'éleveur sélectionne le poulailler cible dans sa liste et confirme l'association                                                                                                      |
| 20–22 | Le backend vérifie que le poulailler appartient bien à l'éleveur, puis met à jour le module (`status="associated"`) et le poulailler (`status="connecte"`) en une transaction atomique |
| 23–24 | L'éleveur reçoit la confirmation que le module est associé avec succès                                                                                                                 |
| 25–26 | L'ESP32 se connecte au WiFi puis au broker MQTT via TLS sur le port 8883                                                                                                               |
| 27–31 | Toutes les 5 secondes, l'ESP32 lit les capteurs, publie les mesures en JSON sur le topic `poulailler/{id}/measures`, le backend stocke en base et vérifie les seuils d'alerte          |
| 32–33 | Si un seuil critique est dépassé, une notification push est envoyée à l'app mobile de l'éleveur                                                                                        |

---

## Cycle de vie du module ESP32

```
┌─────────────┐     Génération claim      ┌─────────────┐
│   Création  │──────────────────────────▶│   En attente │
│   (admin)   │                           │   (pending)  │
└─────────────┘                           └──────┬──────┘
                                                  │
                       ┌──────────────────────────┘
                       │ Scan QR / Claim
                       ▼
                ┌─────────────┐
                │   Associé   │◄────────────────────────┐
                │ (associated)│                         │
                └──────┬──────┘                         │
                       │                                │
         ┌─────────────┼─────────────┐                  │
         │ Pas de ping │             │ Dissociation     │
         │ > 24h       │             │ (motif obligatoire)
         ▼             │             │                  │
  ┌─────────────┐      │             ▼                  │
  │  Hors ligne │      │      ┌─────────────┐           │
  │  (offline)  │──────┘      │  Dissocié   │───────────┘
  └─────────────┘   Retour    │(dissociated)│  Nouveau claim
                    ping OK   └─────────────┘
```

---

_Document généré automatiquement – SmartPoultry_
