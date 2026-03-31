# 📋 AUDIT COMPLET RÉVISÉ - Smart Poultry (Deux Systèmes)

**Date:** Mars 2026 | **Version:** 2.0 (Séparation Éleveur/Admin)

---

## 🎯 ARCHITECTURE GLOBALE

```
┌─────────────────────────────────┬──────────────────────────────┐
│    SYSTÈME ÉLEVEUR              │    SYSTÈME ADMIN             │
├─────────────────────────────────┼──────────────────────────────┤
│ Backend: 5000 (/api/...)        │ Backend: 5001 (/api/admin/)  │
│ Mobile: React Native            │ Web: React + Vite            │
│ ESP32: Embarquee                │                              │
│                                 │                              │
│ Auth: JWT (eleveur)             │ Auth: JWT (admin + role)     │
└─────────────────────────────────┴──────────────────────────────┘
              ↓                              ↓
        ┌─────────────────────────────────────────┐
        │  MongoDB PARTAGÉE                       │
        │  (Collections: User, Poulailler, etc)  │
        │                                         │
        │  MQTT (HiveMQ Cloud - Partagé)         │
        └─────────────────────────────────────────┘
```

---

## 1️⃣ SYSTÈME ÉLEVEUR - Backend (Port 5000)

### ✅ **CE QUI FONCTIONNE BIEN**

| Aspect                        | Détail                                     | Score |
| ----------------------------- | ------------------------------------------ | ----- |
| **Authentification JWT**      | Génération 30j, bcrypt hashing ✓           | 90%   |
| **Protection routes**         | `router.use(protect)` appliqué globalement | 95%   |
| **Validation données**        | Joi schemas pour Create/Update ✓           | 85%   |
| **Autorisation propriétaire** | Vérification `owner === req.user.id` ✓     | 90%   |
| **MQTT timely-réel**          | WebSocket HiveMQ connecté & abonné ✓       | 85%   |
| **API REST structure**        | Routes bien organisées, CRUD complet       | 90%   |
| **Gestion erreurs**           | Try/catch + handler global                 | 80%   |

### ❌ **PROBLÈMES IDENTIFIÉS**

#### 🔴 **CRITIQUES** (2)

| #   | Problème                          | Sévérité    | Fichier                        | Impact                                              |
| --- | --------------------------------- | ----------- | ------------------------------ | --------------------------------------------------- |
| 1   | **getCurrentMeasures() SIMULÉES** | 🔴 CRITIQUE | `poulaillersController.js:427` | App affiche faux aux éleveurs! Data de test en prod |
| 2   | **JWT_SECRET peut être vide**     | 🔴 HAUTE    | `app.js`                       | Si `.env` mal configuré, tokens invalides           |

#### 🟠 **IMPORTANTS** (5)

| #   | Problème                               | Sévérité | Fichier             | Solution                                  |
| --- | -------------------------------------- | -------- | ------------------- | ----------------------------------------- |
| 3   | `CORS ouvert` - pas d'origin whitelist | 🟠 HAUTE | `app.js:33`         | Whitelist `http://localhost:19000` (expo) |
| 4   | `rejectUnauthorized: false` MQTT       | 🟠 HAUTE | `mqttService.js:50` | Utiliser `true` + certificats             |
| 5   | **Rate limit seulement par IP**        | 🟠 MOYEN | `app.js:36`         | Ajouter per-user rate limiting            |
| 6   | Pas d'input sanitization               | 🟠 MOYEN | Routes              | Risque NoSQL injection sur recherches     |
| 7   | **Mesures historique unbounded**       | 🟠 MOYEN | `Measure` model     | DB peut devenir énorme                    |

#### 🟡 **AMÉLIORATIONS** (8)

| #   | Problème             | Impact                       | Fix                                            |
| --- | -------------------- | ---------------------------- | ---------------------------------------------- |
| 8   | Aucune soft delete   | Données perdues              | Ajouter `isDeleted` + TTL                      |
| 9   | Logs console partout | Impossibile monitorer        | Winston/Pino logging                           |
| 10  | `N+1 queries`        | Performance dégradée         | `.populate()` dans queries                     |
| 11  | No indexes MongoDB   | Requêtes lentes              | Créer indexes sur `owner`, `status`            |
| 12  | Pas de cache Redis   | Requêtes répétées            | Redis pour données chaudes                     |
| 13  | Token JWT 30 jours   | Session trop longue          | Réduire à 7 jours max                          |
| 14  | Pas de audit trail   | Impossible auditer actions   | Log user_id + action + timestamp               |
| 15  | Status actuator lag  | Ventilo/porte lag observable | Augmenter freq publish status (5s au lieu 30s) |

### 🔐 **SÉCURITÉ APPROFONDIE**

#### Authentification/Autorisation

✅ **Correct:**

- JWT Bearer token bien implanté
- Check propriétaire sur GET/PUT/DELETE (`owner.toString() !== req.user.id`)
- Password bcrypt hashing

⚠️ **Risques:**

- JWT valide 30 jours → session longue (standard: 7-14j)
- No token refresh mechanism
- No device fingerprinting
- No rate-limit per user

#### Données Sensibles

❌ **RISQUES:**

- Credentials MQTT en `.env` clair
- Logs console affichent data (email, changes)
- Token stocké localStorage mobile (cleartext)
- Pas d'encryption au repos MongoDB

#### API Security

❌ **Manquements:**

- CORS ouvert `cors()` sans whitelist
- Pas de HTTPS forcé
- Pas de CSP headers
- Pas de X-Frame-Options
- Pas de HSTS

---

## 2️⃣ SYSTÈME ADMIN - Backend (Port 5001)

### ✅ **CE QUI FONCTIONNE BIEN**

| Aspect                   | Score                                       |
| ------------------------ | ------------------------------------------- |
| **Admin authentication** | ✅ `loginAdmin()` + vérification rôle       |
| **Route protection**     | ✅ `router.use(protect, admin)`             |
| **Audit logging**        | ✅ `logService.create()` enregistre actions |
| **Email service**        | ✅ Nodemailer configured                    |
| **CORS whitelisted**     | ✅ Localhost:5173 + 3000                    |
| **Module claim system**  | ✅ Claim codes + QR + expiration TTL        |

### ❌ **PROBLÈMES**

#### 🔴 **CRITIQUES** (1)

| Problème                                | Fichier           | Détail                                         |
| --------------------------------------- | ----------------- | ---------------------------------------------- |
| **AUCUNE création admin "first-admin"** | `create-admin.js` | Comment le 1er admin se crée? Accès direct DB? |

#### 🟠 **IMPORTANTS** (6)

| #   | Problème                    | Sévérité | Détail                                              |
| --- | --------------------------- | -------- | --------------------------------------------------- |
| 1   | Test/seed files en dossier  | 🟠 HAUT  | `test_code.js`, `seed_data.js` à nettoyer/sécuriser |
| 2   | Email service non testé     | 🟠 HAUT  | Nodemailer peut échouer silencieusement             |
| 3   | Logs jamais purgés          | 🟠 MOYEN | Base de données croît indéfiniment                  |
| 4   | No session timeout          | 🟠 MOYEN | Admin peut rester loggé infiniment                  |
| 5   | Pas de "manager" role       | 🟠 MOYEN | Seulement admin/éleveur, no middle tier             |
| 6   | Admin voir TOUS poulaillers | 🟠 MOYEN | Pas de restriction par région/groupe                |

#### 🟡 **AMÉLIORATIONS** (5)

| Problème                               | Impact                             |
| -------------------------------------- | ---------------------------------- |
| Invite link no expiration check strict | Tokens can be used unlimited times |
| No 2FA for admin                       | Account takeover risk              |
| Rapports PDF non testés                | Format peut être cassé en prod     |
| No backup mechanism                    | Data loss disaster                 |
| QR Code format undocumented            | Claims non standardisés            |

---

## 3️⃣ APPLICATION MOBILE - React Native

### ✅ **CE QUI FONCTIONNE**

| Aspect                    | Score                       |
| ------------------------- | --------------------------- |
| **MQTT subscribe**        | ✅ Temps-réel connecté      |
| **Navigation structure**  | ✅ Tabs + stack navigators  |
| **Dark mode context**     | ✅ ThemeProvider            |
| **JWT interceptor Axios** | ✅ Bearer token auto-ajouté |

### ❌ **PROBLÈMES**

#### 🔴 **CRITIQUES** (2)

| Problème                          | Fichier                    | Impact                        |
| --------------------------------- | -------------------------- | ----------------------------- |
| **Données simulées en dashboard** | `DashboardScreen.js:92-98` | Affiche faux aux utilisateurs |
| **Token plaintext localStorage**  | `auth.js`                  | Device volé = account breach  |

#### 🟠 **IMPORTANTS** (4)

| #   | Problème                   | Sévérité | Fix                                 |
| --- | -------------------------- | -------- | ----------------------------------- |
| 1   | MQTT credentials en `.env` | 🟠 HAUT  | Sécuriser ou utiliser backend relay |
| 2   | Pas d'offline mode         | 🟠 MOYEN | SQLite + sync au retour             |
| 3   | Images non cachées         | 🟠 MOYEN | Image cache unbounded → OOM         |
| 4   | Pas de retry logic réseau  | 🟠 MOYEN | Exponential backoff sur fail        |

#### 🟡 **AMÉLIORATIONS** (5)

- [ ] Biometric auth
- [ ] Secure token storage (Keychain)
- [ ] Push notifications
- [ ] Crash reporting (Sentry)
- [ ] App update mechanism (OTA)

---

## 4️⃣ APPLICATION WEB ADMIN - React + Vite

### ✅ **CE QUI FONCTIONNE**

| Aspect                | Score                             |
| --------------------- | --------------------------------- |
| **Login form**        | ✅ Calls `/api/auth/admin/login`  |
| **Protected routes**  | ✅ Redirects to login if no token |
| **Feature structure** | ✅ 11 pages bien organisées       |
| **TailwindCSS**       | ✅ Responsive design              |

### ❌ **PROBLÈMES**

#### 🟠 **IMPORTANTS** (3)

| Problème                         | Sévérité | Détail                              |
| -------------------------------- | -------- | ----------------------------------- |
| **Token localStorage plaintext** | 🟠 HAUT  | CSRF possible + XSS can steal token |
| **No API error caching**         | 🟠 MOYEN | Chaque page rechargement = requête  |
| **No input validation forms**    | 🟠 MOYEN | Risque injection                    |

#### 🟡 **AMÉLIORATIONS** (6)

- [ ] Role-based UI rendering (hide features for viewer role)
- [ ] Advanced filters (date range, bulk select)
- [ ] Real-time updates WebSocket
- [ ] Error boundaries
- [ ] Skeleton loading states
- [ ] Dark mode toggle

---

## 5️⃣ SYSTÈME EMBARQUÉ - ESP32

### ✅ **CE QUI FONCTIONNE**

| Aspect                  | Score                      |
| ----------------------- | -------------------------- |
| **Capteurs**            | ✅ DHT22, MQ-135, HC-SR04  |
| **MQTT publish**        | ✅ Mesures + status        |
| **Actionneurs control** | ✅ Lampe, ventilo, porte   |
| **TLS MQTT**            | ✅ Port 8883 + certificats |

### ❌ **PROBLÈMES**

#### 🔴 **CRITIQUES** (2)

| Problème                            | Sévérité    | Impact                              |
| ----------------------------------- | ----------- | ----------------------------------- |
| **WiFi/MQTT credentials plaintext** | 🔴 CRITIQUE | Firmware dump → accès tous systèmes |
| **Aucun watchdog**                  | 🔴 HAUTE    | Freeze → système unresponsive       |

#### 🟠 **IMPORTANTS** (4)

| Problème                         | Sévérité | Fix                    |
| -------------------------------- | -------- | ---------------------- |
| Mesures async `millis() % 30000` | 🟠 HAUTE | Scheduler déterministe |
| Pas de fallback si broker down   | 🟠 MOYEN | Cache local EEPROM     |
| Capteurs pas calibrés            | 🟠 MOYEN | Config par MQTT        |
| No OTA firmware updates          | 🟠 MOYEN | Enable OTA             |

#### 🟡 **AMÉLIORATIONS**

- [ ] Encrypt credentials (ChipID-based)
- [ ] Local logging (LittleFS)
- [ ] Self-test on boot
- [ ] Power management (deep sleep)
- [ ] Telemetry uptime/memory/signal

---

## 🔗 **RISQUES D'INTERACTION ÉLEVEUR↔ADMIN**

### MongoDB Partagée

#### ✅ Bon:

- Collections bien schématisées
- Admin et Éleveur en collection `User` unique
- Rôle enum: `["eleveur", "admin"]` clear

#### ⚠️ Risques:

| Problème                            | Sévérité | Détail                                |
| ----------------------------------- | -------- | ------------------------------------- |
| Admin peut voir ALL poulaillers     | 🟠 MOYEN | Pas de restriction par région         |
| No cascading delete                 | 🟠 MOYEN | Supprimer éleveur → orphan modules    |
| Partition logique en code seulement | 🟠 MOYEN | MongoDB queries pas limitées par rôle |
| Module.owner peut être null         | 🟡 BAS   | Ambigu ownership                      |

### MQTT Partagée

#### Credentials Partagés

- Backend (port 5000) + Backend-admin (port 5001) utilisent même MQTT_USER
- **Risque:** Les deux systèmes peuvent publier sur topics de chacun

#### ✅ Topics bien séparés:

```
poulailler/{id}/measures    ← Backend Éleveur (publish)
poulailler/{id}/status      ← ESP32 (publish)
poulailler/{id}/commands    ← Backend Éleveur (subscribe)
poulailler/{id}/config      ← Backend Admin (publish via syncConfig)
```

#### ⚠️ Risques:

- Si credentials compromis → accès MQTT complet
- Pas de topic ACL (HiveMQ feature non activée?)

---

## 📊 **RÉSUMÉ PAR SÉVÉRITÉ**

### 🔴 **CRITIQUES** (Bloquer avant prod) - 5

```
1. getCurrentMeasures() données SIMULÉES
2. JWT_SECRET potentiellement vide
3. Mobile token plaintext localStorage
4. ESP32 credentials plaintext firmware
5. Pas de watchdog ESP32
```

### 🟠 **IMPORTANTS** (Sprint 1) - 12

```
6. CORS ouvert sans whitelist backend
7. rejectUnauthorized false MQTT
8. Pas de 1er admin creation process
9. Email service non produit-ready
10. Test/seed files en production
11. No rate limit per-user
12-17. [Autres voir tableaux]
```

### 🟡 **AMÉLIORATIONS** (Sprint 2+) - 20+

```
- Indexes MongoDB
- Redis caching
- Audit trail complet
- Logging structured (Winston)
- OTA ESP32
- 2FA admin
- Soft delete
- Real-time WebSocket
- etc.
```

---

## ✅ **PLAN D'ACTION IMMÉDIAT**

### Phase 1: SÉCURITÉ CRITIQUE (3-5 jours)

| Tâche                                       | Fichiers                         | Effort |
| ------------------------------------------- | -------------------------------- | ------ |
| ❌ Remplacer données SIMULÉES par vraies    | `poulaillersController.js`       | 2h     |
| ❌ Utiliser `rejectUnauthorized: true` MQTT | `mqttService.js`                 | 1h     |
| ❌ Whitelist CORS origins                   | `app.js`, `backend-admin/app.js` | 30m    |
| ❌ Document "create first admin" process    | Script ou API                    | 1h     |
| ❌ Move token à Keychain mobile             | `auth.js` (SecureStore)          | 3h     |
| ❌ Add ESP32 watchdog                       | `main.cpp`                       | 2h     |

### Phase 2: HARDENING (1 semaine)

| Tâche                            | Effort |
| -------------------------------- | ------ |
| Add structured logging (Winston) | 4h     |
| Per-user rate limiting           | 2h     |
| Email service tests + retry      | 3h     |
| Session timeout admin            | 1h     |
| Input validation + sanitization  | 3h     |
| MongoDB indexes                  | 2h     |

### Phase 3: FEATURES MANQUANTES (2 semaines)

| Tâche                              | Effort |
| ---------------------------------- | ------ |
| Remove simulated data, use real DB | 2h     |
| Redis caching                      | 4h     |
| Real-time WebSocket updates        | 6h     |
| Audit trail complete               | 3h     |
| OTA updates ESP32                  | 5h     |
| 2FA admin                          | 4h     |

---

## 📈 **SCORES FINAUX**

| Système         | Sécurité   | Fonctionnalité | Performance | Global     |
| --------------- | ---------- | -------------- | ----------- | ---------- |
| Backend Éleveur | 7/10       | 8/10           | 6/10        | **7/10**   |
| Backend Admin   | 7/10       | 7/10           | 6/10        | **6.7/10** |
| Mobile          | 5/10       | 7/10           | 6/10        | **6/10**   |
| Web             | 6/10       | 7/10           | 7/10        | **6.7/10** |
| ESP32           | 5/10       | 8/10           | 7/10        | **6.7/10** |
| **GLOBAL**      | **6.2/10** | **7.4/10**     | **6.4/10**  | **6.7/10** |

### Status Production

🟠 **PROD-READY AVEC RÉSERVES**

- ✅ Structure globale bonne
- ✅ Authentification en place
- ❌ **Données simulées = bug critique**
- ❌ **Credentials plaintexte risqué**
- ⚠️ Performance non optimisée
- ⚠️ Monitoring/logging absent

**Recommandation:**

- ✅ Oui pour pilot fermé avec données de test
- ❌ NON pour production éleveurs réels tant que simulated data existe

---

## 📝 **NOTES FINALES**

1. **Deux systèmes bien séparés** - Architecture correcte
2. **Authentification en place** - JWT + rôles
3. **Sécurité de base OK** - Mais risques identifiés
4. **Performance non optimisée** - Pas d'indexes, pas de cache
5. **Logging/Monitoring manquant** - Impossible de déboguer issues prod
6. **Documentation insuffisante** - No API docs, unclear processes

**Code quality:** 7/10 - Bien structuré mais manque professionalisme prod

**Équipe experience needed:** Senior full-stack pour passer à production
