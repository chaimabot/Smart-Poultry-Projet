# Smart Poultry — Système de Gestion de Poulailler Intelligent

Smart Poultry est une plateforme IoT complète pour la gestion intelligente des poulaillers. Elle combine intelligence artificielle, électronique embarquée (ESP32), une application mobile React Native, un tableau de bord web (React/Vite) et deux API REST (Node.js/Express) pour offrir une solution complète de surveillance, d'analyse et de contrôle automatisé des élevages de volailles.

---

## Pourquoi deux API séparées (backend et backend-admin) ?

Le projet est volontairement découpé en deux API indépendantes plutôt qu'une seule API partagée :

- **backend** sert l'application mobile (les éleveurs / utilisateurs finaux) : lecture des capteurs, contrôle des actionneurs, analyses IA, alertes.
- **backend-admin** sert l'interface web d'administration (gestion des éleveurs, des poulaillers, des paramètres système, des logs).

Cette séparation correspond à une pratique courante en entreprise, pour plusieurs raisons :

- **Sécurité** : les droits d'administration (gestion des utilisateurs, configuration système, accès aux logs) sont isolés de l'API grand public. Une faille ou une erreur côté client n'expose pas les fonctions sensibles d'admin.
- **Scalabilité** : le trafic mobile (lecture temps réel, IoT) et le trafic admin (rapports, dashboards) n'ont pas les mêmes besoins de charge. Les séparer permet de les déployer et de les faire évoluer indépendamment.
- **Clarté du code** : chaque API a sa propre logique métier, ses propres modèles et ses propres routes, sans mélanger les responsabilités "utilisateur final" et "administration".
- **Déploiement indépendant** : l'API admin peut être mise à jour ou redémarrée sans interrompre le service pour les éleveurs qui utilisent l'application mobile.

Ce projet a été conçu et développé seule (backend, backend-admin, interface web, application mobile, firmware ESP32), dans une logique de portfolio technique reproduisant une architecture réaliste type entreprise.

---

## Architecture globale

```
Smart Poultry
├── Mobile App (React Native)
├── Web Admin (React + Vite)
├── Firmware (ESP32 / Arduino)
│
├── API Principale (backend) — Port 5000
│   - Authentification & utilisateurs
│   - Gestion des poulaillers & modules
│   - IoT (MQTT + Socket.IO)
│   - Analyse IA (Cloudflare Workers AI — Llama 3.2 Vision + Gemma 3)
│   - Contrôle des actionneurs
│   - Webhooks & tâches planifiées (cron)
│
├── API Admin (backend-admin) — Port 5001
│   - Gestion des éleveurs & utilisateurs
│   - Configuration système & paramètres
│   - Alertes, logs, rapports
│   - Dossiers & fichiers (uploads)
│   - Analyses IA & caméras
│
└── MongoDB
```

---

## Fonctionnalités

### Intelligence artificielle — Cloudflare Workers AI

- Analyse sanitaire des volailles par vision via Cloudflare Workers AI
- Modèle principal : `@cf/meta/llama-3.2-11b-vision-instruct` (Llama Vision 11B) — analyse visuelle, comptage, détection maladies
- Modèle secondaire / chat : `@cf/google/gemma-3-12b-it` (Gemma 3) — backup analyse image + chat vétérinaire "Dr. Gemma"
- Chat vétérinaire interactif avec contexte du poulailler (capteurs, historique santé, diagnostic)
- Compression et validation automatique de la qualité d'image avant analyse (via Sharp)
- Images stockées sur Cloudinary
- Analyses programmées via tâches cron
- Historique complet des analyses avec images

### IoT et automatisation (ESP32)

- Capteurs : température/humidité (DHT22), qualité de l'air (MQ135), niveau d'eau
- Actionneurs : lampe, ventilateur, pompe à eau, moteur de porte
- Communication MQTT sécurisée (TLS) via HiveMQ Cloud
- WiFi configurable dynamiquement (sauvegarde en NVS)
- Contrôle automatique basé sur des seuils configurables

### Application mobile (React Native / Expo)

- Tableau de bord en temps réel
- Paramétrage WiFi des modules ESP32
- Analyse IA avec chat intégré
- Notifications et alertes
- Historique des mesures et des analyses
- Gestion de profil

### Interface web admin (React + Vite)

- Dashboard avec graphiques et statistiques
- Gestion des poulaillers, modules, utilisateurs et éleveurs
- Configuration des paramètres système
- Alertes, logs et rapports détaillés
- Analyses IA avec visualisation
- Gestion des dossiers et documents
- Invitations par email

### Sécurité

- Authentification JWT
- Rate limiting et Helmet (sécurité HTTP)
- Session timeout
- CORS configurable
- Validation des entrées (Joi)
- Middleware de logging (Winston)

---

## Structure du projet

```
smart-poultry/
├── backend/                  API REST principale (Node.js/Express)
│   ├── controllers/          Logique métier (auth, poulaillers, AI, IoT...)
│   ├── models/                Modèles Mongoose (User, Poulailler, Module...)
│   ├── routes/                Routes Express
│   ├── services/              Services (MQTT, AI, Cloudinary, alertes...)
│   ├── middlewares/            Auth, rate limiter, logger
│   ├── config/                Configuration base de données
│   ├── utils/                 Utilitaires (logger Winston)
│   ├── scripts/               Scripts d'indexation
│   └── test/                  Tests d'intégration (Jest)
│
├── backend-admin/            API Admin (Node.js/Express)
│   ├── controllers/          Logique d'administration
│   ├── models/                Modèles Mongoose admin
│   ├── routes/                Routes admin
│   ├── middlewares/            Auth, session timeout, logger
│   ├── config/                Configuration base de données
│   ├── services/              Email, uploads
│   ├── scripts/               Scripts admin
│   └── uploads/               Fichiers uploadés
│
├── web/                      Interface web admin (React + Vite)
│   └── src/
│       ├── features/         Pages et fonctionnalités
│       │   ├── dashboard/
│       │   ├── Poulaillers/
│       │   ├── Modules/
│       │   ├── alertes/
│       │   ├── rapports/
│       │   ├── utilisateurs/
│       │   ├── parametres/
│       │   ├── profile/
│       │   ├── logs/
│       │   ├── dossiers/
│       │   └── auth/
│       ├── components/       Composants réutilisables
│       └── services/         Client API (Axios)
│
├── mobile/                   Application mobile (React Native / Expo)
│   └── src/
│       ├── features/
│       │   ├── auth/
│       │   ├── poultry/
│       │   ├── IA/
│       │   ├── profile/
│       │   └── parametres/
│       └── navigation/
│
└── Embarquee/                Firmware ESP32 (PlatformIO / Arduino)
    ├── src/
    │   ├── main.cpp           Point d'entrée
    │   ├── config.h            Configuration (WiFi, MQTT, pins)
    │   ├── sensors.h/cpp       Gestion des capteurs
    │   ├── actuators.h/cpp     Gestion des actionneurs
    │   └── mqtt_handler.h/cpp  Client MQTT
    ├── lib/                    Bibliothèques externes
    └── test/                   Tests unitaires
```

---

## Technologies utilisées

### Backend

- Node.js + Express 5
- MongoDB + Mongoose 9
- Socket.IO (temps réel)
- MQTT.js (communication IoT)
- Cloudflare Workers AI — Llama 3.2 Vision 11B + Gemma 3 (analyse d'images et chat vétérinaire)
- Cloudinary (stockage d'images)
- JWT (authentification)
- Winston (logging)
- Joi (validation)
- Node-cron (tâches planifiées)
- Jest (tests)

### Frontend web

- React 19 + Vite 7
- React Router 7
- Recharts (graphiques)
- Tailwind CSS
- Lucide Icons
- jsPDF (génération de rapports)
- React Hot Toast (notifications)

### Mobile

- React Native (Expo)
- React Navigation
- Expo Image Picker
- MQTT.js
- Chart Kit (graphiques)
- AsyncStorage

### Embarqué

- ESP32 (microcontrôleur)
- PlatformIO (build)
- DHT22 (température/humidité)
- MQ135 (qualité de l'air)
- PubSubClient (MQTT)
- ArduinoJson

---

## Installation et démarrage

### Prérequis

- Node.js >= 18
- MongoDB (local ou Atlas)
- Compte Cloudinary
- Compte Cloudflare avec accès à Workers AI (clé API + Account ID)
- Compte HiveMQ Cloud (MQTT)

### 1. Cloner le dépôt

```bash
git clone https://github.com/votre-utilisateur/smart-poultry.git
cd smart-poultry
```

### 2. Backend principal

```bash
cd backend
cp .env.example .env   # configurer les variables d'environnement
npm install
npm run dev            
```

### 3. Backend admin

```bash
cd backend-admin
cp .env.example .env   # configurer les variables d'environnement
npm install
npm run dev            
```

### 4. Interface web

```bash
cd web
npm install
npm run dev            
```

### 5. Application mobile

```bash
cd mobile
npm install
npx expo start
```

### 6. Firmware ESP32

```bash
cd Embarquee
# installer PlatformIO (extension VSCode)
# modifier config.h avec vos identifiants WiFi/MQTT
# compiler et flasher sur l'ESP32
```

---

## API Endpoints

### API principale 

| Endpoint         | Méthode  | Description               |
| ----------------- | -------- | -------------------------- |
| /api/auth        | POST     | Authentification          |
| /api/poulaillers | CRUD     | Gestion des poulaillers   |
| /api/modules     | CRUD     | Gestion des modules ESP32 |
| /api/alerts      | CRUD     | Gestion des alertes       |
| /api/ai          | POST/GET | Analyse IA et chat        |
| /api/lampe       | POST     | Contrôle de la lampe      |
| /api/pompe       | POST     | Contrôle de la pompe      |
| /api/ventilateur | POST     | Contrôle du ventilateur   |
| /api/porte       | POST     | Contrôle de la porte      |
| /api/wifi        | POST     | Configuration WiFi ESP32  |
| /api/health      | GET      | Statut du serveur         |

### API admin 

| Endpoint                | Méthode | Description                   |
| ------------------------- | ------- | -------------------------------- |
| /api/admin/dashboard    | GET     | Statistiques du dashboard     |
| /api/admin/poulaillers  | CRUD    | Gestion admin des poulaillers |
| /api/admin/utilisateurs | CRUD    | Gestion des utilisateurs      |
| /api/admin/eleveurs     | CRUD    | Gestion des éleveurs          |
| /api/admin/modules      | CRUD    | Gestion des modules           |
| /api/admin/parametres   | CRUD    | Configuration système         |
| /api/admin/alertes      | CRUD    | Gestion des alertes           |
| /api/admin/logs         | GET     | Consultation des logs         |
| /api/admin/rapports     | GET     | Génération de rapports        |
| /api/admin/analyses-ia  | GET     | Historique des analyses IA    |
| /api/admin/dossiers     | CRUD    | Gestion des dossiers          |

---



Développé par Chaima — Smart Poultry Solutions
