# Diagramme de Classe Global + Diagrammes de Séquence - Sprint 2 : Smart Poultry

## Fonctionnalités Sprint 2

- **Monitoring environnemental** : Mesures capteurs (temp, hum, CO2, NH3, dust, eau)
- **Gestion des seuils & Alertes** : Seuils configurables, alertes automatiques
- **Gestion des utilisateurs (Admin)** : Users eleveur/admin, contrôle accès
- **Commandes & Automatisation** : Commandes actionneurs (porte, ventilation), règles auto

## 1. Diagramme de Classe (Structure statique)

```mermaid
classDiagram
    class User {
        <<entity>>
        +String email
        +String role~'eleveur'/'admin'~
        +Boolean isActive
    }

    class Poulailler {
        <<entity>>
        +String name
        +thresholds : Object
        +actuatorStates : Object
        +String status
    }

    class Module {
        <<entity>>
        +String serialNumber
        +String status
        +Date lastPing
    }

    class Measure {
        <<entity>>
        +Number temperature
        +Number humidity
        +Number co2
        +Date timestamp
    }

    class Alert {
        <<entity>>
        +String parameter
        +Number value
        +String severity
    }

    class Command {
        <<entity>>
        +String typeActionneur
        +String action
        +String status
    }

    class SystemConfig {
        <<singleton>>
        +defaultThresholds : Object
    }

    User ||--o{ Poulailler : "owner"
    Poulailler ||--|| Module : "associated"
    Poulailler ||--o{ Measure : "1"
    Poulailler ||--o{ Alert : "generates"
    Poulailler ||--o{ Command : "1"
    Poulailler ..> SystemConfig : "uses defaults"

    note for Poulailler "Sprint 2: seuils, autoThresholds,\nactuatorStates"
    note for Alert "Auto-générée sur dépassement seuil"
    note for Command "Manuelle ou auto via WebSocket"
```

## 2. Diagramme de Séquence : Mesure et Alerte (Temps réel)

```mermaid
sequenceDiagram
    participant M as Module ESP32
    participant WS as WebSocket Backend
    participant DB as MongoDB
    participant U as User/App

    M->>WS: Publie mesure (temp=32°C, co2=1800)
    WS->>DB: Sauvegarde Measure (Poulailler X)
    WS->>DB: Récup thresholds (tempMax=28, co2Max=1500)
    alt Dépassement seuil
        WS->>DB: Crée Alert (critical, poulailler=X)
        WS->>U: Push notification (WebSocket/Push)
    end
    U->>WS: Marque Alert lue
    WS->>DB: Update Alert (read=true)
```

## 3. Diagramme de Séquence : Commande Manuelle

```mermaid
sequenceDiagram
    participant U as User Mobile/Web
    participant Backend
    participant WS as WebSocket
    participant M as Module ESP32
    participant A as Actionneur

    U->>Backend: POST /commandes (porte=ouvrir, poulailler=X)
    Backend->>DB: Crée Command (status=pending)
    Backend->>WS: Push commande (target moduleId)
    WS->>M: Reçoit commande via WebSocket
    M->>A: Exécute (servo porte -> ouvert)
    M->>WS: Confirme exécution
    WS->>Backend: Update Command (status=executed)
    Backend->>U: Réponse succès (temps réel)
```

## Instructions d'utilisation

- **VSCode** : Ouvrir MD → Preview (Mermaid auto-rendu).
- **Online** : Copier codes sur [mermaid.live](https://mermaid.live) → Export PNG/SVG.
- **GitHub** : Push → Rendu natif Mermaid.

## Légende

- **ClassDiagram** : Structure BD/relations.
- **Sequence** : Flux dynamiques temps réel (WebSocket).
- **100% Sprint 2** : Monitoring, Alertes, Commandes couvertes.

**Fichiers :** docs/sprint2-diagramme-classe-global.md | TODO.md
