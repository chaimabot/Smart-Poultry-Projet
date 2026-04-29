# 📋 Product Backlog – SmartPoultry

## 🎯 Vision Produit

**SmartPoultry** est une plateforme IoT complète qui transforme le poulailler en « Laboratoire Vivant Connecté ». Elle offre aux petits éleveurs avicoles tunisiens un monitoring environnemental en temps réel, des alertes intelligentes et une automatisation des équipements, le tout accessible via application mobile et interface web admin.

---

## 👤 Acteurs (Personas)

| Rôle | Description |
|------|-------------|
| **Éleveur** | Petits exploitants avicoles, utilisateurs finaux de l'application mobile |
| **Admin/Technicien** | Responsables de la validation des dossiers, installation du matériel et support |
| **Système IoT** | ESP32 embarqué capteurs + actionneurs communiquant via MQTT |

---

## 📊 User Stories – Product Backlog

| ID | En tant que… | Je veux… | Afin de… | Priorité | Story Points | Statut |
|----|-------------|----------|----------|----------|-------------|--------|
| US-001 | Éleveur | Créer un compte avec mes informations personnelles et celles de mon poulailler | Démarrer mon suivi et soumettre mon dossier technique | 🔴 Critique | 5 | ✅ |
| US-002 | Éleveur | Me connecter de manière sécurisée avec JWT | Accéder à mon dashboard personnel | 🔴 Critique | 3 | ✅ |
| US-003 | Éleveur | Visualiser un dashboard temps réel avec température, humidité, CO2 et niveau d'eau | Surveiller l'état de mon poulailler en un coup d'œil | 🔴 Critique | 8 | ✅ |
| US-004 | Éleveur | Recevoir des alertes push quand la température dépasse 35°C ou un seuil critique | Réagir immédiatement pour protéger mes volailles | 🔴 Critique | 5 | ✅ |
| US-005 | Éleveur | Consulter l'historique des mesures sur 24h, 7 jours ou 30 jours | Analyser les tendances et anticiper les problèmes | 🟠 Haute | 5 | ✅ |
| US-006 | Éleveur | Configurer les seuils d'alerte personnalisés par poulailler | Adapter les notifications à mes besoins spécifiques | 🟠 Haute | 3 | ✅ |
| US-007 | Éleveur | Contrôler manuellement les actionneurs (porte, lampe, pompe, ventilateur) | Gérer mon équipement à distance | 🟠 Haute | 8 | ✅ |
| US-008 | Éleveur | Programmer l'ouverture/fermeture automatique de la porte par horaire | Automatiser la gestion du quotidien | 🟠 Haute | 5 | ✅ |
| US-009 | Éleveur | Ajouter plusieurs poulaillers à mon compte | Centraliser la gestion de mon exploitation | 🟡 Moyenne | 3 | ✅ |
| US-010 | Éleveur | Archiver un poulailler inactif | Garder un historique sans encombrer mon dashboard | 🟡 Moyenne | 2 | ✅ |
| US-011 | Éleveur | Gérer mon profil (modifier infos, mot de passe, préférences) | Maintenir mes données à jour | 🟡 Moyenne | 3 | ✅ |
| US-012 | Éleveur | Basculer entre mode clair et mode sombre dans l'application | Améliorer le confort visuel | 🟢 Basse | 2 | ✅ |
| US-013 | Éleveur | Recevoir une notification lorsque mon module IoT se déconnecte | Être informé des problèmes de connectivité | 🟠 Haute | 3 | ⏳ |
| US-014 | Éleveur | Voir un indicateur de densité des volailles calculé automatiquement | Respecter les normes d'élevage et optimiser l'espace | 🟠 Haute | 5 | ⏳ |
| US-015 | Éleveur | Recevoir des suggestions d'actions automatiques (ex: allumer ventilateur si T°>32°C) | Réduire ma charge mentale et mes interventions | 🟡 Moyenne | 5 | ⏳ |
| US-016 | Éleveur | Exporter mes données de monitoring en PDF | Partager des rapports avec mon vétérinaire ou technicien | 🟡 Moyenne | 3 | ⏳ |
| US-017 | Éleveur | Scanner un QR code pour associer rapidement un module IoT | Simplifier l'installation du matériel | 🟠 Haute | 3 | ✅ |
| US-018 | Admin | Visualiser un tableau de bord global avec statistiques clés (éleveurs, poulaillers actifs, alertes) | Avoir une vue d'ensemble de la plateforme | 🔴 Critique | 8 | ✅ |
| US-019 | Admin | Valider ou rejeter un dossier d'inscription éleveur | Contrôler l'accès à la plateforme | 🔴 Critique | 5 | ✅ |
| US-020 | Admin | Gérer les utilisateurs (liste, recherche, filtres, rôles) | Administrer la communauté des éleveurs | 🟠 Haute | 5 | ✅ |
| US-021 | Admin | Gérer les modules IoT (création, assignation, statut) | Suivre le parc matériel et les installations | 🟠 Haute | 5 | ✅ |
| US-022 | Admin | Générer et envoyer des invitations par email aux éleveurs | Faciliter l'onboarding | 🟠 Haute | 3 | ✅ |
| US-023 | Admin | Consulter les logs système et d'activité | Auditer et déboguer la plateforme | 🟡 Moyenne | 3 | ✅ |
| US-024 | Admin | Générer des rapports PDF (alertes, modules, performance globale) | Communiquer avec les parties prenantes | 🟡 Moyenne | 5 | ✅ |
| US-025 | Admin | Configurer les seuils par défaut globaux de la plateforme | Standardiser les paramètres pour les nouveaux poulaillers | 🟡 Moyenne | 2 | ✅ |
| US-026 | Admin | Recevoir des alertes sur les poulaillers critiques | Prioriser les interventions de support | 🟠 Haute | 3 | ✅ |
| US-027 | Système | Publier les mesures capteurs via MQTT toutes les 5 secondes | Assurer le flux temps réel vers le cloud | 🔴 Critique | 5 | ✅ |
| US-028 | Système | Gérer automatiquement les actionneurs selon les règles programmées (lampe, ventilo, pompe) | Maintenir les conditions optimales sans intervention humaine | 🟠 Haute | 8 | ✅ |
| US-029 | Système | Sécuriser la connexion WiFi et MQTT avec TLS/SSL | Protéger l'intégrité des données | 🟠 Haute | 5 | ✅ |
| US-030 | Système | Stocker les mesures en base avec rétention 30 jours | Disposer d'un historique consultable | 🟠 Haute | 3 | ✅ |
| US-031 | Éleveur | Recevoir des alertes par SMS en plus des push | Être notifié même sans connexion internet | 🟡 Moyenne | 5 | ⏳ |
| US-032 | Éleveur | Consulter des prédictions de température sur 24h basées sur l'historique | Anticiper les actions préventives | 🟡 Moyenne | 8 | ⏳ |
| US-033 | Admin | Voir une carte géographique des poulaillers installés | Optimiser les tournées d'installation et maintenance | 🟢 Basse | 5 | ⏳ |
| US-034 | Éleveur | Partager l'accès à mon poulailler avec un collaborateur/vétérinaire | Permettre un suivi collectif | 🟡 Moyenne | 5 | ⏳ |
| US-035 | Système | Détecter automatiquement les anomalies (capteur défaillant, données incohérentes) | Prévenir les pannes matérielles | 🟡 Moyenne | 8 | ⏳ |

---

## 🏃‍♂️ Planning par Sprints

### 🥇 Sprint 1 – Fondations & Connexion (2 semaines)
**Objectif :** Mettre en place l'infrastructure core, l'authentification et le monitoring temps réel de base.
**Capacité :** 41 story points

| ID | User Story | Story Points | Critères d'acceptation |
|----|-----------|-------------|------------------------|
| US-001 | Créer un compte avec dossier technique | 5 | • Formulaire multi-étapes validé (Joi)  <br>• Création atomique User + Poulailler + Dossier  <br>• Réponse 201 avec token JWT  <br>• Email de confirmation envoyé |
| US-002 | Connexion sécurisée JWT | 3 | • Authentification email/password  <br>• Token JWT valide 24h  <br>• Refresh token implémenté  <br>• Redirection post-login selon rôle |
| US-003 | Dashboard sensors live | 8 | • Appel API `/api/poulaillers/:id/current-measures`  <br>• Affichage temps réel via MQTT (fallback polling 5s)  <br>• 4 cartes visuelles (T°, Hum, CO2, Eau)  <br>• Indicateur de connexion vert/orange/rouge |
| US-027 | Publication MQTT toutes les 5s | 5 | • ESP32 connecté au broker HiveMQ  <br>• Payload JSON avec DEVICE_ID  <br>• Topics structurés (`poulailler/{id}/measures`)  <br>• Reconnexion automatique |
| US-029 | Connexion WiFi + MQTT sécurisée TLS | 5 | • WiFiClientSecure avec certificat  <br>• Connexion au port 8883  <br>• MAC address utilisée comme DEVICE_ID  <br>• Retry exponentiel sur échec |
| US-030 | Stockage MongoDB avec rétention 30j | 3 | • Schéma Measure avec index TTL  <br>• Aggregation pour moyennes horaires/journalières  <br>• Backup automatique configuré  <br>• Limite 5GB respectée |
| US-018 | Dashboard admin global | 8 | • KPI en temps réel (éleveurs, poulaillers, alertes)  <br>• Graphiques Chart.js/React  <br>• Filtres par période  <br>• Accès réservé admin |
| US-019 | Validation dossier éleveur | 5 | • Liste des dossiers en attente  <br>• Actions Valider/Rejeter avec motif  <br>• Email automatique au statut changé  <br>• Historique des validations |

**Livrables Sprint 1 :**
- ✅ API Auth fonctionnelle (register/login)
- ✅ Dashboard éleveur avec données live
- ✅ ESP32 connecté et publiant via MQTT
- ✅ Dashboard admin avec validation des dossiers
- ✅ Base de données opérationnelle avec rétention

---

### 🥈 Sprint 2 – Automatisation & Contrôle (3 semaines)
**Objectif :** Permettre le contrôle des actionneurs, les alertes intelligentes et l'historique.
**Capacité :** 52 story points

| ID | User Story | Story Points | Critères d'acceptation |
|----|-----------|-------------|------------------------|
| US-004 | Alertes push seuils critiques | 5 | • Push notification via Expo/FCM  <br>• Seuils configurables par capteur  <br>• 3 niveaux (info/warning/critical)  <br>• Badge non-lu sur app mobile |
| US-006 | Configuration seuils personnalisés | 3 | • Formulaire par capteur (min/max)  <br>• Bouton "Réinitialiser aux valeurs par défaut"  <br>• Validation côté client et serveur  <br>• Persistance immédiate en DB |
| US-007 | Contrôle manuel actionneurs | 8 | • Boutons ON/OFF pour 4 actionneurs  <br>• Feedback visuel immédiat (état confirmé)  <br>• API PATCH `/api/poulaillers/:id/actuators`  <br>• Journal des commandes dans MongoDB |
| US-008 | Programmation horaire porte | 5 | • Interface calendrier/heure  <br>• 2 plages journalières (ouverture/fermeture)  <br>• Persistance NVS sur ESP32  <br>• Affichage du prochain événement |
| US-028 | Automatisation actionneurs par règles | 8 | • Règles IF/THEN (ex: T°>32°C → Ventilo ON)  <br>• Exécution côté ESP32 sans latence cloud  <br>• Priorité : manuel > automatique > planifié  <br>• Log des déclenchements |
| US-005 | Historique 24h/7j/30j | 5 | • Sélecteur de période  <br>• Graphique linéaire par capteur  <br>• Données agrégées (min/moy/max)  <br>• Export CSV |
| US-009 | Multi-poulaillers | 3 | • Liste scrollable sur dashboard  <br>• Switch rapide entre poulaillers  <br>• Données isolées par userId  <br>• Limite 5 poulaillers/compte |
| US-010 | Archivage poulailler | 2 | • Bouton "Archiver" avec confirmation  <br>• Données conservées en base  <br>• Vue séparée "Poulaillers archivés"  <br>• Possibilité de restauration |
| US-017 | Association module par QR code | 3 | • Scanner intégré (camera mobile)  <br>• API `/api/modules/decode-qr`  <br>• Vérification unicité du module  <br>• Confirmation visuelle d'appairage |
| US-025 | Seuils par défaut globaux admin | 2 | • Page Paramètres dans l'admin  <br>• Formulaire éditable par admin  <br>• Application aux nouveaux poulaillers  <br>• Valeurs par défaut : T° 18-30°C, Hum 50-70% |
| US-026 | Alertes poulaillers critiques admin | 3 | • Badge rouge sur le menu  <br>• Liste filtrée par gravité  <br>• Actions rapides (contacter éleveur)  <br>• Mise à jour temps réel |
| US-022 | Invitations email éleveurs | 3 | • Génération token unique signé  <br>• Template email HTML responsive  <br>• Lien d'expiration 48h  <br>• Suivi des invitations envoyées |

**Livrables Sprint 2 :**
- ✅ Système d'alertes push complet
- ✅ Contrôle des 4 actionneurs (porte, lampe, pompe, ventilateur)
- ✅ Automatisation embarquée sur ESP32
- ✅ Historique graphique multi-périodes
- ✅ Gestion multi-poulaillers et archivage
- ✅ Association simplifiée par QR code
- ✅ Paramétrage global admin

---

### 🥉 Sprint 3 – Intelligence & Reporting (2 semaines)
**Objectif :** Ajouter l'analyse prédictive, le reporting avancé et les fonctionnalités collaboratives.
**Capacité :** 46 story points

| ID | User Story | Story Points | Critères d'acceptation |
|----|-----------|-------------|------------------------|
| US-013 | Notification déconnexion module | 3 | • Heartbeat toutes les 30s  <br>• Alerting si silence > 2 min  <br>• Notification push + email  <br>• Statut "Déconnecté" sur dashboard |
| US-014 | Calculateur densité automatique | 5 | • Formule : nb_volailles / surface  <br>• Indicateur visuel (vert/orange/rouge)  <br>• Recommandation par type de volaille  <br>• Historique de la densité |
| US-015 | Suggestions d'actions intelligentes | 5 | • Algorithme basé sur les tendances  <br>• Card "Conseil" sur le dashboard  <br>• Bouton "Appliquer" en 1 clic  <br>• Feedback après action |
| US-016 | Export PDF données monitoring | 3 | • Template PDF professionnel (jsPDF)  <br>• 3 types de rapports (alertes, modules, global)  <br>• Logo et branding SmartPoultry  <br>• Téléchargement direct |
| US-020 | Gestion utilisateurs admin | 5 | • Datatable avec pagination/serveur  <br>• Filtres (rôle, statut, date)  <br>• Actions CRUD + suspension  <br>• Recherche full-text |
| US-021 | Gestion modules IoT admin | 5 | • Liste des modules avec statut  <br>• CRUD module (MAC, firmware, assignation)  <br>• Historique des pings  <br>• Génération QR code |
| US-023 | Logs système et activité | 3 | • Table avec filtres (date, niveau, source)  <br>• Niveaux : debug/info/warning/error  <br>• Export possible  <br>• Rétention 90 jours |
| US-024 | Rapports PDF admin | 5 | • Sélection de la période et du type  <br>• Graphiques intégrés au PDF  <br>• Envoi par email optionnel  <br>• Programmation hebdomadaire |
| US-011 | Gestion profil éleveur | 3 | • Formulaire édition infos  <br>• Changement mot de passe  <br>• Préférences notifications  <br>• Upload photo de profil |
| US-012 | Mode sombre / clair | 2 | • Toggle global dans le profil  <br>• Persistance dans AsyncStorage  <br>• Thèmes cohérents sur tous les écrans  <br>• Respect préférence système |
| US-031 | Alertes SMS complémentaires | 5 | • Intégration API SMS (Twilio/local)  <br>• Configuration par éleveur  <br>• Limitation 10 SMS/mois  <br>• Fallback email si SMS échoue |
| US-032 | Prédictions température 24h | 8 | • Algorithme de régression simple  <br>• Courbe de prédiction sur le graphique  <br>• Confiance de prédiction affichée  <br>• Basé sur les 7 derniers jours |

**Livrables Sprint 3 :**
- ✅ Monitoring de connexion et alertes de déconnexion
- ✅ Indicateur de densité intelligent
- ✅ Suggestions d'actions basées sur l'IA
- ✅ Système de rapports PDF complet (éleveur + admin)
- ✅ Gestion utilisateurs et modules admin
- ✅ Logs système centralisés
- ✅ Notifications SMS
- ✅ Prédictions météo/intérieure

---

## 📈 Résumé des Sprints

| Sprint | Thème | Durée | Story Points | US Livrées |
|--------|-------|-------|-------------|-----------|
| **Sprint 1** | Fondations & Connexion | 2 sem. | 41 | 8 |
| **Sprint 2** | Automatisation & Contrôle | 3 sem. | 52 | 12 |
| **Sprint 3** | Intelligence & Reporting | 2 sem. | 46 | 12 |
| **TOTAL** | | **7 sem.** | **139** | **32** |

---

## 📅 Planning de Livraison

```
Semaine 1-2  ├─▶ SPRINT 1 : Fondations & Connexion
Semaine 3-5  ├─▶ SPRINT 2 : Automatisation & Contrôle
Semaine 6-7  ├─▶ SPRINT 3 : Intelligence & Reporting
Semaine 8    ├─▶ Recette globale, tests utilisateurs, déploiement production
```

**Date de livraison finale prévue :** Semaine 8 (mi-Mai 2025)

---

## 🏷️ Définition de Priorité

| Badge | Niveau | Description |
|-------|--------|-------------|
| 🔴 Critique | P0 | Bloquant pour le MVP. Le produit ne fonctionne pas sans. |
| 🟠 Haute | P1 | Fonctionnalité clé attendue. Forte valeur utilisateur. |
| 🟡 Moyenne | P2 | Améliore l'expérience. Peut être décalée si nécessaire. |
| 🟢 Basse | P3 | Nice-to-have. Ajoute du polish. |

---

## 📝 Définition du "Done"

Une User Story est considérée comme **terminée** quand :

1. ✅ Le code est développé, reviewé et mergé sur `main`
2. ✅ Les tests unitaires couvrent au moins 70% du code nouveau
3. ✅ Les tests d'intégration passent (API + DB)
4. ✅ La documentation technique est à jour (README, API docs)
5. ✅ Le code est déployé sur l'environnement de staging
6. ✅ La fonctionnalité est testée sur le device cible (mobile + web)
7. ✅ Le PO a validé le respect des critères d'acceptation
8. ✅ Aucun bug critique (P0/P1) n'est ouvert sur la story

---

## 🔄 Backlog Grooming – Prochaines US candidates

| ID | User Story | Priorité | Pourquoi pas maintenant ? |
|----|-----------|----------|---------------------------|
| US-033 | Carte géographique des poulaillers | 🟢 Basse | Dépend de la collecte des coordonnées GPS – non prioritaire pour le MVP |
| US-034 | Partage d'accès collaborateur | 🟡 Moyenne | Complexité permissions + rôles – peut attendre la phase scaling |
| US-035 | Détection anomalies capteurs | 🟡 Moyenne | Nécessite un dataset conséquent pour calibration – Sprint 4 |

---

*Document généré le : `date`*  
*Projet : SmartPoultry – PFE Master IoT*  
*Contact : Chaima Bounawara – contact@smartpoultry.tn*

