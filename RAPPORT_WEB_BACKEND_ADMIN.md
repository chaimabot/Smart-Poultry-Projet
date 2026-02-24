# Logique Complète de l'Application Web Admin pour Smart Poultry

Bonjour Chaima ! Voici une description complète et logique de l'application web d'administration pour le projet **Smart Poultry**, basée sur les spécifications du cahier des charges, du backlog produit, et intégrant les corrections discutées (notamment la nouvelle logique d'invitation pour l'ajout d'éleveurs). Cette logique est structurée de manière claire et exhaustive, couvrant l'architecture, les flux utilisateurs, les fonctionnalités par module, la sécurité, et les interactions avec le backend. Elle assume une implémentation en React (frontend) et Node.js/Express/MongoDB (backend), comme décrit dans le rapport initial.

Je me concentre sur une logique "best practice" 2026, avec une emphase sur la sécurité, l'UX intuitive, et la modularité. Si des aspects techniques spécifiques (comme du code) sont nécessaires, je peux approfondir.

## 1. Architecture Globale

L'application web admin est une **Single Page Application (SPA)** dédiée aux administrateurs, accessible via un navigateur (ex. : `https://admin.smartpoultry.com`). Elle est séparée de l'app mobile pour éleveurs (React Native), pour une meilleure sécurité et une gestion des rôles.

### Composants Clés

- **Frontend** : React 19 + Vite + Tailwind CSS + React Router pour le routage. Utilise Axios pour les appels API, Recharts pour les graphiques, et un auto-refresh (via setInterval) pour les données en temps réel.
- **Backend** : Node.js + Express + MongoDB (Mongoose pour les modèles). Communication via API RESTful (port 5001) + MQTT pour les mises à jour IoT en temps réel (push des mesures des modules ESP32).
- **Base de Données** : MongoDB avec schémas pour User, Poulailler, Module, Alert, Measure, Command, SystemConfig (voir détails dans le rapport).
- **Communication** :
  - Frontend → Backend : HTTP avec JWT pour l'authentification.
  - Backend → IoT : MQTT (Mosquitto) pour recevoir des mesures et envoyer des commandes (ex. : ouvrir porte).
  - Emails : Nodemailer pour les invitations et alertes.

### Flux Général d'Utilisation

1. **Accès** : L'admin se connecte via `/login` (email + mot de passe).
2. **Navigation** : Sidebar avec liens vers Dashboard, Poulaillers, Modules, Éleveurs, Utilisateurs, Alertes, Rapports, Logs, Paramètres.
3. **Données Temps Réel** : WebSockets ou polling (toutes les 60s) pour rafraîchir dashboard et listes.
4. **Déconnexion** : Bouton explicite pour sécuriser les sessions partagées.

## 2. Logique d'Authentification et Gestion des Sessions

- **Précondition** : Tous les endpoints (sauf login/invitation) nécessitent un JWT valide (rôle "admin").
- **Flux de Connexion** :
  1. Page `/` (Login) : Formulaire email + mot de passe.
  2. Soumission → POST `/api/auth/login` : Vérifie credentials (bcrypt pour hash), génère JWT (exp. 1h, avec rôle et ID user).
  3. Succès → Stocke JWT en localStorage (`adminToken`), redirige vers `/dashboard`.
  4. Erreur → Message "Identifiants incorrects".
- **Vérification Session** : Middleware `auth.js` sur toutes les routes protégées : Vérifie JWT, rôle "admin", et expire si invalide.
- **Déconnexion** : Supprime localStorage, redirige vers `/login`.
- **Auto-Logout** : Si inactif > 30min, expire session (via timer frontend).

## 3. Logique des Modules Fonctionnels

Chaque module suit une logique CRUD (Create, Read, Update, Delete) avec pagination, recherche, filtrage, et export CSV où pertinent. Les données sont fetchées via Axios avec JWT.

### A. Dashboard (`/dashboard`)

- **Objectif** : Vue globale pour supervision.
- **Logique** :
  1. Chargement → GET `/api/admin/dashboard/stats` : Récupère stats (nb éleveurs actifs, poulaillers connectés/en attente, alertes non résolues, taux connexion modules).
  2. Affichage : Cartes stats + graphiques (Recharts : tendances alertes sur 7j) + tableaux (alertes prioritaires, poulaillers critiques).
  3. Auto-refresh : Toutes les 60s, re-fetch stats.
  4. Interactions : Clic sur un élément → redirige vers détail (ex. : poulailler critique → `/poulaillers/:id`).

### B. Gestion des Poulaillers (`/poulaillers`)

- **Objectif** : Liste globale, association/dissociation modules.
- **Logique** :
  1. Chargement → GET `/api/poulaillers` : Liste paginée (nom, éleveur, code unique, statut, dernière mesure).
  2. Recherche/Filtrage : Par nom/éleveur/statut (connecté/hors-ligne/en attente/critique).
  3. Détails (`/poulaillers/:id`) : GET `/api/poulaillers/:id` → Affiche mesures récentes (température, humidité, NH3, CO2, poussière, eau), état porte/ventilateur, historique graphiques (4h/24h/7j/30j).
  4. Association Module : Sélectionne un module libre → PUT `/api/poulaillers/:id/associate-module` : Lie Module à Poulailler, met statut "connecté".
  5. Dissociation : PUT `/api/poulaillers/:id/dissociate-module` : Remet Poulailler en "en attente", Module libre pour réaffectation.
  6. Créer/Modifier/Supprimer : POST/PUT/DELETE sur `/api/poulaillers` (admin peut créer pour un éleveur existant).
  7. Export : Bouton pour CSV de la liste.

### C. Gestion des Modules IoT (`/modules`)

- **Objectif** : Supervision équipements ESP32.
- **Logique** :
  1. Liste → GET `/api/modules` : Statut (connecté/hors-ligne), dernière ping, version firmware, poulailler associé.
  2. Détails : Mesures récentes, logs de connexion.
  3. Actions : Associer/dissocier (lié à poulaillers), mise à jour firmware (si implémenté via OTA MQTT).

### D. Gestion des Éleveurs (`/eleveurs`) – Avec Logique Corrigée d'Invitation

- **Objectif** : Créer/supprimer comptes éleveurs (US-07 du backlog).
- **Logique Corrigée (Invitation par Email)** :
  1. **Ajout d'Éleveur** :
     - Formulaire minimal : Email (obligatoire), Prénom/Nom/Téléphone (optionnels).
     - Soumission → POST `/api/admin/eleveurs/invite` :
       - Crée User avec rôle "eleveur", status "pending", génère inviteToken (JWT ou UUID, exp. 7j), inviteTokenExpires.
       - Envoie email via Nodemailer : Sujet "Activez votre compte Smart Poultry", corps HTML avec lien `/setup-password?token=xxx` (bouton CTA : "Définir mon mot de passe").
     - Pas de mot de passe à ce stade.
  2. **Page d'Activation Publique (`/setup-password?token=xxx`)** :
     - Chargement → GET `/api/auth/verify-invite?token=xxx` : Vérifie token valide/non expiré, retourne { valid: true, email, firstName? }.
     - Si valide → Formulaire : Prénom/Nom/Téléphone (pré-remplis), Mot de passe + Confirmation.
     - Soumission → POST `/api/auth/complete-invite` : Hash mot de passe (bcrypt), met status "active", invalide token.
     - Succès → Message "Compte activé !", redirige vers `/login`.
     - Erreur (token invalide) → "Lien expiré, demandez un nouveau à votre admin."
  3. **Ré-envoi Invitation** : Si pending, bouton "Ré-envoyer email" → Re-génère token et email.
  4. **Liste Éleveurs** : GET `/api/admin/eleveurs` : Liste avec statut (active/pending/archived), détails.
  5. **Supprimer** : DELETE `/api/admin/eleveurs/:id` : Confirmation, supprime user + gère données associées (poulaillers → orphelins ou archivés).
  6. **Autres** : Filtrage par statut, export CSV.

### E. Gestion des Alertes (`/alertes`)

- **Objectif** : Supervision globale des alertes (pas seulement pour éleveurs).
- **Logique** :
  1. Liste → GET `/api/admin/alertes` : Paginée, filtrée par sévérité (critical/warning), poulailler, lu/non lu.
  2. Détails : Paramètre (ex. température > seuil), valeur, date.
  3. Actions : Marquer comme lue/résolue (PUT `/api/alertes/:id/resolve`).

### F. Rapports (`/rapports`)

- **Logique** : Génère rapports (quotidien/hebdo/mensuel) via GET `/api/admin/rapports?period=7d` : Uptime modules, historique alertes, stats globales. Affichage en tableaux/graphiques, export PDF/CSV.

### G. Logs Système (`/logs`)

- **Logique** : GET `/api/admin/logs` : Journal des événements (connexions, erreurs IoT, commandes). Filtrage par date/type.

### H. Paramètres (`/parametres`)

- **Logique** : GET/PUT `/api/admin/parametres` : Seuils par défaut (température min/max, etc.), configs globales (ex. : intervalle refresh).

## 4. Logique des Interactions IoT et Automatisation

- **Mesures** : Reçues via MQTT → Stockées en Measure, pushées aux admins connectés (via WebSockets si implémenté).
- **Commandes** : Ex. : Ouvrir porte → POST `/api/commands` : Crée Command (pending), envoie via MQTT à ESP32, met à jour status (executed/failed).
- **Alertes** : Si seuil dépassé (basé sur configs), crée Alert, envoie push (mais pour admin web : refresh dashboard).

## 5. Sécurité et Besoins Non Fonctionnels

- **Sécurité** : JWT (rôle-based), bcrypt pour passwords, Helmet/CORS/Rate-Limit (100 req/10min/IP), Joi pour validation inputs. Tous endpoints protégés sauf invitation/verify.
- **Temps Réel** : Polling ou Socket.io pour updates.
- **Simplicité/UX** : Responsive (Tailwind), navigation fluide, loaders pour chargements, messages d'erreur clairs.
- **Erreurs** : Gestion globale (try-catch en backend, toast notifications en frontend).
- **Scalabilité** : Pagination infinie pour listes longues, indexes MongoDB sur champs fréquents (ex. : status).

## 6. Installation et Déploiement Logique

- **Dev** : `npm run dev` pour frontend/backend.
- **Prod** : HTTPS obligatoire, env vars (JWT_SECRET, MONGODB_URI).
- **Tests** : Validation unitaire (Jest pour backend), e2e (Cypress pour frontend).

Cette logique est complète, autonome et alignée sur les specs. Elle intègre pleinement la correction pour les éleveurs, rendant le système plus sécurisé et user-friendly.
