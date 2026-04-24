# Cahier des Charges - Projet SmartPoultry

## 1. Présentation du Projet

### 1.1 Contexte

SmartPoultry est une plateforme IoT innovante conçue pour les éleveurs avicoles, particulièrement les petits exploitants en Tunisie. Dans un secteur où les pertes dues à des conditions environnementales inadéquates (température, humidité, qualité de l'air) représentent jusqu'à 30% de la production, ce projet transforme le poulailler en un **\"Laboratoire Vivant Connecté\"**.

Développé dans le cadre d'un **Projet de Fin d'Études Master IoT**, SmartPoultry combine :

- **Hardware IoT** : Capteurs embarqués sur ESP32
- **Backend Cloud** : API REST + MQTT pour données temps réel
- **Frontend Web/Mobile** : Interface moderne pour monitoring et alertes
- **Automatisation** : Actionneurs pour ventilation, alimentation

**Contact** : Chaima Bounawara, Responsable Projet  
**📍** Ben Arous, Tunisie | **📞** +216 58 644 199 | **✉️** contact@smartpoultry.tn

### 1.2 Objectifs Généraux

| Objectif                       | Description                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------- |
| **Monitoring Environnemental** | Surveillance continue T° (0-50°C), Humidité (0-100%), Qualité Air (CO2, NH3) |
| **Alertes Intelligentes**      | Notifications push critiques (densité, stress thermique)                     |
| **Automatisation**             | Activation automatique ventilateurs/alimenteurs                              |
| **Accessibilité**              | Application mobile + Web responsive                                          |
| **Évolutivité**                | Multi-poulaillers par éleveur                                                |

### 1.3 Public Cible

- Petits éleveurs avicoles
- Exploitations familiales en zones périurbaines
- Techniciens avicoles cherchant modernisation low-cost

## 2. Besoins Fonctionnels

### 2.1 Collecte de Données (Hardware)

| Capteur            | Gamme                 | Fréquence | Précision   |
| ------------------ | --------------------- | --------- | ----------- |
| DHT22 Temp/Hum     | T:0-50°C, H:0-100%    | 30s       | ±0.5°C, ±2% |
| MQ135 Air Quality  | 10-1000ppm            | 60s       | ±5%         |
| HC-SR04 Ultrasonic | Distance alimentation | 10s       | ±3mm        |
| INA219 Courant     | Consommation énergie  | 30s       | ±1%         |

**Actionneurs** :

- Relais 5V (Ventilation, Éclairage)
- Servo (Distributeur nourriture)

### 2.2 Flux Applicatif

```
Éleveur → Inscription → Validation Dossier → Installation Matériel → Activation App
   ↓
Dashboard Temps Réel → Alertes → Historique → Rapports
```

### 2.3 User Stories Principales

| ID   | Utilisateur | Fonctionnalité                   | Priorité     |
| ---- | ----------- | -------------------------------- | ------------ |
| US01 | Éleveur     | Créer compte + Dossier technique | **CRITIQUE** |
| US02 | Éleveur     | Dashboard sensors live           | **CRITIQUE** |
| US03 | Éleveur     | Recevoir alerte push T°>35°C     | **CRITIQUE** |
| US04 | Éleveur     | Historique 7j/sem/mois           | **HAUTE**    |
| US05 | Éleveur     | Calculatrice densité auto        | **HAUTE**    |
| US06 | Admin       | Multi-poulaillers                | **MOYENNE**  |

## 3. Architecture Technique

### 3.1 Stack Technologique

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────┐
│   MOBILE APP    │◄──►│  API REST/Node   │◄──►│  MongoDB     │
│  React Native   │    │  Express/JWT     │    │  MQTT Broker │
└──────────┬──────┘    └──────────┬──────┘    └──────────────┘
           │                      │
           └────────── MQTT ──────┼─── ESP32 ───┐
                                  │             │
                                  └─────────────┼── Capteurs
                                                │
                                                └── Actionneurs
```

### 3.2 API Endpoints Clés

```
POST /api/auth/register    → Création compte + poulailler
GET  /api/sensors/:id      → Données live
POST /api/actuators/:id    → Commande relais
GET  /api/alerts           → Liste alertes
POST /api/reports          → Générer PDF
```

## 4. Contraintes & Non-Fonctionnels

### 4.1 Performance

- **Latence** : <2s pour données live
- **Disponibilité** : 99.5% (Render free tier)
- **Stockage** : 5GB (30j retention)

### 4.2 Sécurité

```
✅ JWT Authentification
✅ HTTPS/TLS everywhere
✅ Input sanitization
✅ Rate limiting (100req/min)
✅ Données chiffrées au repos
```

### 4.3 Budget Matériel (Par Poulailler)

| Composant | Qté | Prix Unitaire | Total     |
| --------- | --- | ------------- | --------- |
| ESP32     | 1   | 25 DT         | 25 DT     |
| DHT22     | 2   | 8 DT          | 16 DT     |
| MQ135     | 1   | 12 DT         | 12 DT     |
| Relais 5V | 4   | 3 DT          | 12 DT     |
| **TOTAL** |     |               | **65 DT** |

**Installation gratuite** | **Garantie 12 mois**

## 5. Processus Commercial

### 5.1 Parcours Client (4 Étapes)

```
1️⃣ INSCRIPTION (5min) → Formulaire web
2️⃣ VALIDATION (2-5j) → RDV Ben Arous + Acompte 1000 DT
3️⃣ INSTALLATION (2h) → Sur site gratuit
4️⃣ ACTIVATION → App + Formation
```

### 5.2 Tarification

| Offre       | Capteurs        | Prix     |
| ----------- | --------------- | -------- |
| **Starter** | T°, Humidité    | 5000 DT  |
| **Pro**     | + Air, Ultrason | 7500 DT  |
| **Premium** | + IA Santé      | 10000 DT |

## 6. Planning de Développement

```
Sprint 1 (2 sem) : Auth + Frontend Landing
Sprint 2 (3 sem) : Backend API + MQTT
Sprint 3 (2 sem) : ESP32 Firmware
Sprint 4 (2 sem) : Tests + Déploiement
```

**Livraison Finale** : 30 Avril 2025

---

**SmartPoultry** transforme vos volailles en données précieuses.  
**Précision IoT pour le Laboratoire Vivant.**  
*contact@smartpoultry.tn | +216 58 644 199*
