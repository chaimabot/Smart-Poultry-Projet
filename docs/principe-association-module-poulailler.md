# Principe d'Association Module ESP32 - Poulailler

## Vue d'Ensemble

Le système Smart Poultry utilise un mécanisme de **claim par code** pour associer de manière sécurisée un module ESP32 physique à un poulailler virtuel dans la base de données. Ce mécanisme garantit que seul un module autorisé peut être lié à un poulailler spécifique, évitant les associations involontaires ou malveillantes.

L'ensemble des communications utilise uniquement **HTTPS** pour les requêtes API et **WebSocket** pour la transmission temps réel des données (heartbeat, mesures, commandes). Ce système exploite les WebSockets pour une communication bidirectionnelle, persistante et instantanée entre le module et le backend, sans aucun polling.

## Le Principe de l'Association

### 1. Génération du Code Claim

L'administrateur initiate le processus en générant un **code claim** (code de réclamation) depuis l'interface web. Ce code cryptographique est au format `XXXX-XXXX-XXXX` (12 caractères alphanumériques aléatoires) et est valide pour une durée de 180 jours. Le code est stocké dans la base de données MongoDB lié au module ESP32 correspondant (identifié par son numéro de série et adresse MAC).

### 2. Transfert du Code vers l'ESP32

Le code claim peut être transféré au module ESP32 de deux manières :

- **Via QR Code** : Affiché à l'écran et scanné par une caméra connectée à l'ESP32
- **Via API** : Le code est entré manuellement ou envoyé programmatiquement à l'ESP32

### 3. Claim et Association

Lorsque l'ESP32 envoie une requête d'association (claim) au backend avec :

- Le code claim valide
- L'ID du poulailler cible

Le système vérifie que :

- Le code claim existe et n'a pas déjà été utilisé
- Le code n'a pas expiré
- Le poulailler spécifié existe

Si toutes les vérifications passent, le module est **associé** au poulailler :

- Le champ `poulailler` du module référence l'ID du poulailler
- Le champ `owner` du module est synchronisé avec celui du poulailler
- Le statut du module passe à `associated`
- Le champ `moduleId` du poulailler est mis à jour
- Le statut du poulailler passe à `connecté`

### 4. Fonctionnement Normal

Une fois associé, le module ESP32 :

- Établit une connexion **WebSocket** persistante avec le backend
- Envoie un heartbeat (ping) en temps réel via la connexion WebSocket
- Publie les mesures des capteurs (température, humidité, CO2, ammoniac, poussière, niveau d'eau) instantanément
- Reçoit les commandes (ouverture/fermeture porte, ventilation) de manière push via WebSocket

Si la connexion WebSocket est perdue, le module tente automatiquement de se reconnecter. Si le module ne donne pas de nouvelles pendant 24h, son statut passe automatiquement à `offline`.

### 5. Dissociation

Un module peut être dissocié d'un poulailler sur décision de l'administrateur. Lors de la dissociation :

- Le lien avec le poulailler est rompu
- Un nouveau code claim est généré automatiquement
- Le module peut être réassocié à un autre poulailler

## Schéma du Flux d'Association

```
1. ADMIN                    2. SYSTEM                    3. ESP32                    4. POULAILLER
    |                           |                           |                           |
    |--- Génère code claim --->|                           |                           |
    |   (serial, MAC, name)    |                           |                           |
    |<-- Code: XXXX-XXXX-XXXX-|                           |                           |
    |                           |                           |                           |
    |                           |--- Affiche QR Code ------>|                           |
    |                           |                           |                           |
    |                           |                           |--- Envoie claim ----------|
    |                           |                           |   (code + poulaillerId)   |
    |                           |<-- Confirmation -----------|                           |
    |                           |                           |                           |
    |                           |--- Met à jour DB --------->|<-- ModuleId mis à jour --|
    |                           |   (status: associated)    |   (status: connecté)    |
    |                           |                           |                           |
    |                           |                           |--- Heartbeat (30s) ------>|
    |                           |<-- Mesures ----------------|                           |
```

## Modèle de Données

### Module (après association)

```javascript
{
  serialNumber: "ESP32-001",
  macAddress: "AA:BB:CC:DD:EE:FF",
  deviceName: "Module Principal",
  status: "associated",           // pending | associated | offline | dissociated
  claimCode: "A1B2-C3D4-E5F6",
  claimCodeUsedAt: "2024-01-15T10:30:00Z",
  poulailler: ObjectId,           // Référence vers le poulailler
  owner: ObjectId,                // Synchronisé avec le propriétaire du poulailler
  installationDate: "2024-01-15T10:30:00Z",
  lastPing: "2024-01-15T11:00:00Z"
}
```

### Poulailler (après association)

```javascript
{
  name: "Poulailler A",
  type: "poule pondeuse",
  animalCount: 500,
  moduleId: ObjectId,             // Référence vers le module
  status: "connecté",             // en_attente_module | connecté | hors_ligne
  owner: ObjectId
}
```

## Avantages de ce Système

1. **Communication en temps réel** : WebSocket offre une connexion persistante et bidirectionnelle, sans aucun polling dans toute l'application
2. **Sécurité** : Chaque module physique ne peut être associé qu'à un seul poulailler à la fois
3. **Traçabilité** : L'historique des associations est conservé avec horodatage
4. **Flexibilité** : Un module peut être dissocié et réassocié à un autre poulailler
5. **Automatisation** : Le statut offline est géré automatiquement
6. **Contrôle centralisé** : L'administrateur garde le contrôle sur toutes les associations
7. **Architecture moderne** : Utilisation de HTTPS et WebSocket uniquement, pas de broker MQTT, pas de polling
