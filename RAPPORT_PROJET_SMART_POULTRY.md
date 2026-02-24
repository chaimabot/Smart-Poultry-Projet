et# Rapport Complet du Projet Smart Poultry IoT

## 1. Présentation Générale du Projet

### 1.1 Description

**Smart Poultry** est un système intelligent et low-cost conçu pour surveiller et automatiser un poulailler. Il permet de contrôler à distance diversos paramètres critiques pour le bien-être des volailles et la gestion efficace de l'élevage.

### 1.2 Fonctionnalités Principales

- ** Surveillance en temps réel** : Température, humidité, qualité de l'air (NH₃/CO₂), poussière, niveau d'eau
- **Automatisation** : Porte automatique, ventilation
- **Alertes intelligentes** : Notifications en cas de seuils critiques dépassés
- **Gestion multi-utilisateurs** : Authentification séparée pour breeders (éleveurs) et administrateurs

### 1.3 Architecture Technique

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                  │
├──────────────────┬──────────────────┬──────────────────────────┤
│      WEB         │      MOBILE      │       EMBARQUÉ           │
│   (React+Vite)   │  (React Native)  │       (ESP32)            │
└────────┬─────────┴────────┬─────────┴───────────┬────────────┘
         │                   │                       │
         │                   │                       │
         ▼                   ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND APIs                               │
├─────────────────────┬─────────────────────────────────────────┤
│   backend/          │        backend-admin/                    │
│   (Principal)       │        (Administration)                  │
└─────────┬───────────┴──────────────┬──────────────────────────┘
          │                            │
          ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MONGODB                                    │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MQTT BROKER (Mosquitto)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Structure du Projet

### 2.1 Organisation des Répertoires

```
Smart-Poultry-Projet/
├── web/                    # Interface web admin (React + Vite + Tailwind)
│   ├── src/
│   │   ├── features/       # Modules fonctionnels
│   │   │   ├── dashboard/       # Tableau de bord
│   │   │   ├── Poulaillers/     # Gestion poulaillers
│   │   │   ├── alertes/         # Gestion alertes
│   │   │   ├── rapports/        # Rapports & statistiques
│   │   │   ├──Eleveur/          # Gestion breeders
│   │   │   ├── Modules/         # Gestion modules IoT
│   │   │   ├── logs/             # Journalisation
│   │   │   ├── parametres/      # Paramètres système
│   │   │   └── utilisateurs/    # Gestion utilisateurs
│   │   ├── components/      # Composants réutilisables
│   │   │   └── layout/          # Header, Sidebar
│   │   └── lib/             # Utilitaires
│   └── package.json
│
├── backend/                # API principale (Node.js + Express)
│   ├── controllers/       # Logique métier
│   ├── models/            # Modèles MongoDB
│   ├── routes/            # Définition des routes
│   ├── middlewares/       # Middlewares (auth)
│   ├── services/          # Services (MQTT)
│   └── config/            # Configuration DB
│
├── backend-admin/         # API administration (Node.js + Express)
│   ├── controllers/       # Logique métier admin
│   ├── models/           # Modèles MongoDB
│   ├── routes/           # Routes admin
│   ├── middlewares/      # Auth admin
│   ├── services/         # Services (Email)
│   └── config/           # Configuration DB
│
├── mobile/                # Application mobile (React Native + Expo)
│   ├── src/
│   │   ├── features/     # Écrans fonctionnalités
│   │   │   ├── auth/          # Login, Register
│   │   │   ├── poultry/       # Poulaillers, Alertes
│   │   │   └── profile/       # Profil utilisateur
│   │   ├── services/    # API, Auth, Poultry services
│   │   ├── components/  # Composants réutilisables
│   │   └── navigation/  # Navigation
│   └── package.json
│
├── embedded/              # Firmware ESP32 (PlatformIO)
│
└── docs/                  # Documentation
```

---

## 3. Composants Web (Interface d'Administration)

### 3.1 Stack Technique

- **Framework** : React 19
- **Build Tool** : Vite 7.3
- **Styling** : Tailwind CSS
- **Routing** : React Router DOM 7
- **Charts** : Recharts 3.7
- **HTTP Client** : Axios
- **Icons** : Material Symbols + Lucide React

### 3.2 Pages Implémentées

#### A. Dashboard (`/admin`)

- **Statistiques globales** :
  - Nombre de breeders actifs
  - Poulaillers actifs / en attente
  - Alertes non résolues
  - Taux de connexion des modules
- **Composants** :
  - Cartes KPI avec indicateurs visuels
  - Graphique de tendance des alertes (7 derniers jours)
  - Liste des alertes prioritaires
  - Tableau des poulaillers critiques
  - Rafraîchissement automatique (60 secondes)

#### B. Gestion des Poulaillers (`/admin/poulaillers`)

- **Fonctionnalités** :
  - Liste paginée de tous les poulaillers
  - Recherche multicritère (nom, code unique, breeder)
  - Filtrage par statut de connexion
  - Export CSV
- **Informations affichées** :
  - Code unique / Nom
  - Breeder responsable
  - Statut de connexion (Connecté, Alerte, Hors ligne, En attente)
  - Température / Humidité
  - État Porte/Ventilateur (Mode Auto/Manuel)
  - Nombre d'alertes actives
  - Dernier ping

#### C. Rapports & Statistiques (`/admin/rapports`)

- **Types de rapports disponibles** :
  - Rapport quotidien
  - Rapport hebdomadaire
  - Rapport mensuel
  - Uptime modules (30 jours)
  - Historique des alertes

- **Indicateurs** :
  - Taux de connectivité : 96.8%
  - Poulaillers actifs : 1 248
  - Alertes actives : 47

#### D. Alertes (`/admin/alertes`)

- Gestion des alertes par niveau de sévérité
- Filtrage et tri
- Marquage comme lu/non résolu

#### E. Gestion des Breeders (`/admin/eleveurs`)

- Liste des breeders avec leurs informations
- Statut des poulaillers associés
- Actions d'administration

#### F. Modules IoT (`/admin/modules`)

- Surveillance de l'état des modules ESP32
- Statut de connexion
- Dernière communication

#### G. Paramètres (`/admin/parametres`)

- Configuration des seuils d'alerte par défaut
- Paramètres système globaux
- Gestion des notifications

#### H. Logs (`/admin/logs`)

- Journalisation des événements système
- Historique des actions utilisateurs
- Traçabilité

---

## 4. Backend d'Administration (backend-admin)

### 4.1 Stack Technique

- **Runtime** : Node.js
- **Framework** : Express.js
- **Base de données** : MongoDB (Mongoose)
- **Authentification** : JWT (JSON Web Tokens)
- **Sécurité** : Helmet, CORS, Rate Limiting
- **Email** : Nodemailer

### 4.2 Modèles de Données

#### User (Utilisateur)

```
javascript
{
  _id: ObjectId,
  email: String,
  password: String (hashed),
  firstName: String,
  lastName: String,
  role: "eleveur" | "admin",
  createdAt: Date,
  updatedAt: Date
}
```

#### Poulailler (Chicken Coop)

```
javascript
{
  _id: ObjectId,
  codeUnique: String,
  name: String,
  owner: ObjectId (ref: User),
  status: "connecte" | "en_attente_module" | "Critique" | "Avertissement",
  isArchived: Boolean,
  isCritical: Boolean,
  lastMonitoring: {
    temperature: Number,
    humidity: Number,
    nh3: Number,
    co2: Number
  },
  lastMeasureAt: Date,
  alertesRecentes: Number
}
```

#### Alert (Alerte)

```
javascript
{
  _id: ObjectId,
  poulailler: ObjectId (ref: Poulailler),
  parameter: String,
  value: Number,
  severity: "critical" | "warning",
  read: Boolean,
  resolvedAt: Date,
  createdAt: Date
}
```

#### Module (IoT Device)

```
javascript
{
  _id: ObjectId,
  poulailler: ObjectId (ref: Poulailler),
  type: String,
  firmwareVersion: String,
  lastPing: Date,
  status: String
}
```

#### Measure (Mesure)

```
javascript
{
  _id: ObjectId,
  poulailler: ObjectId (ref: Poulailler),
  module: ObjectId (ref: Module),
  temperature: Number,
  humidity: Number,
  nh3: Number,
  co2: Number,
  dust: Number,
  waterLevel: Number,
  timestamp: Date
}
```

#### Command (Commande)

```
javascript
{
  _id: ObjectId,
  poulailler: ObjectId (ref: Poulailler),
  type: "porte" | "ventilateur" | "lumière",
  action: "OPEN" | "CLOSE" | "ON" | "OFF" | "AUTO" | "MANUAL",
  status: "pending" | "sent" | "executed" | "failed",
  executedAt: Date,
  createdAt: Date
}
```

#### SystemConfig (Configuration Système)

```
javascript
{
  _id: ObjectId,
  key: String,
  value: Mixed,
  description: String,
  updatedAt: Date
}
```

### 4.3 Points d'API (Endpoints)

#### Authentification

| Méthode | Route                | Description        |
| ------- | -------------------- | ------------------ |
| POST    | `/api/auth/register` | Inscription        |
| POST    | `/api/auth/login`    | Connexion          |
| GET     | `/api/auth/me`       | Profil utilisateur |

#### Dashboard Admin

| Méthode | Route                                        | Description           |
| ------- | -------------------------------------------- | --------------------- |
| GET     | `/api/admin/dashboard/stats`                 | Statistiques globales |
| GET     | `/api/admin/dashboard/alertes-recentes`      | Alertes récentes      |
| GET     | `/api/admin/dashboard/poulaillers-critiques` | Poulaillers critiques |

#### Poulaillers

| Méthode | Route                  | Description           |
| ------- | ---------------------- | --------------------- |
| GET     | `/api/poulaillers`     | Liste des poulaillers |
| POST    | `/api/poulaillers`     | Créer un poulailler   |
| GET     | `/api/poulaillers/:id` | Détails poulailler    |
| PUT     | `/api/poulaillers/:id` | Modifier poulailler   |
| DELETE  | `/api/poulaillers/:id` | Supprimer poulailler  |

#### Alertes

| Méthode | Route                            | Description     |
| ------- | -------------------------------- | --------------- |
| GET     | `/api/admin/alertes`             | Liste alertes   |
| PUT     | `/api/admin/alertes/:id/resolve` | Résoudre alerte |

#### Paramètres

| Méthode | Route                        | Description        |
| ------- | ---------------------------- | ------------------ |
| GET     | `/api/admin/parametres`      | Liste paramètres   |
| PUT     | `/api/admin/parametres/:key` | Modifier paramètre |

---

## 5. Interface Mobile (React Native)

### 5.1 Stack Technique

- **Framework** : React Native avec Expo
- **Navigation** : React Navigation
- - **State Management** : Context API (ThemeContext)
- **HTTP Client** : Axios
- **UI** : Composants personnalisés

### 5.2 Écrans Implémentés

#### Authentication

- **LoginScreen** : Connexion utilisateur
- **RegisterScreen** : Inscription breeder

#### Poultry (Poulaillers)

- **DashboardScreen** : Vue d'ensemble
- **PoultryDetailScreen** : Détails d'un poulailler
- **AddPoultryScreen** : Ajouter un poulailler
- **HistoryScreen** : Historique des mesures
- **AlertSettingsScreen** : Configuration des alertes
- **ArchivedPoultryScreen** : Poulaillers archivés

#### Profile

- **ProfileScreen** : Gestion du profil utilisateur

---

## 6. Sécurité Implémentée

### 6.1 Backend

- **Helmet** : En-têtes HTTP sécurisés
- **CORS** : Contrôle des origines autorisées
- **Rate Limiting** : Limitation des requêtes (100 req/10 min)
- **JWT** : Authentification par tokens
- **Password Hashing** :bcrypt

### 6.2 Frontend Web

- **ProtectedRoute** : Routes authentifiées
- **Token Storage** : Stockage sécurisé du token JWT
- **Auto Logout** : Déconnexion automatique sur expiration

---

## 7. Services

### 7.1 MQTT Service (backend)

- Communication temps réel avec les modules ESP32
- Souscription aux topics de mesures
- Publication des commandes

### 7.2 Email Service (backend-admin)

- Notifications d'alertes
- Rapports périodiques
- Résumé quotidien

---

## 8. Fonctionnalités en Cours de Développement

1. **Graphiques temps réel** - Intégration Recharts/ApexCharts dans les rapports
2. **Génération PDF** - Export des rapports en PDF
3. **Notifications push** - Mobile et Web
4. **API REST complète** - Endpoints pour toutes les entités
5. **Tests unitaires** - Couverture de code

---

## 9. Installation et Lancement

### 9.1 Prérequis

- Node.js 18+
- MongoDB
- MQTT Broker (Mosquitto)
- npm ou yarn

### 9.2 Backend Admin

```
bash
cd backend-admin
npm install
npm run dev  # Port 5001
```

### 9.3 Frontend Web

```
bash
cd web
npm install
npm run dev  # Port 5173 (Vite)
```

### 9.4 Mobile

```
bash
cd mobile
npm install
npx expo start
```

---

## 10. Conclusion

Le projet **Smart Poultry** est une solution IoT complète pour la gestion intelligente des poulaillers. L'architecture est bien structurée avec une séparation claire entre le frontend web (administration), le backend API, et les parties embarquées.

**Points forts** :

- Architecture modulaire et évolutive
- Sécurité renforcée (JWT, Helmet, Rate Limiting)
- Interface moderne avec Tailwind CSS
- Support multi-devices (Web, Mobile)
- Communication temps réel via MQTT

**Axes d'amélioration** :

- Finalisation de l'intégration des graphiques
- Tests automatisés
- Documentation API (Swagger)
- Optimisation des performances
- Mode hors-ligne pour mobile

---

_Rapport généré le 20 février 2026_
_Projet Smart Poultry IoT - Gestion intelligente de poulaillers_
