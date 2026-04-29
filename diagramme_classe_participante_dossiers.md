# Diagramme de Classe Participante – Gestion des Dossiers

## Objectif

Ce document présente le **Diagramme de Classe Participante (DCP)** pour le domaine **Gestion des Dossiers** du projet SmartPoultry. Il établit le lien entre les cas d'utilisation, les interfaces utilisateur (IHM) et le modèle de conception logicielle.

---

## Vue d'ensemble du domaine

La gestion des dossiers est le cœur du processus commercial de SmartPoultry. Elle couvre :

- L'inscription publique d'un éleveur (création atomique `User` + `Poulailler(s)` + `Dossier`)
- La validation administrative des dossiers
- Le suivi financier (montant total, avance, reste)
- Les transitions de statut : `EN_ATTENTE` → `AVANCE_PAYEE` → `TERMINE` | `ANNULE`
- L'impression des contrats officiels

---

## Diagramme de Classe Participante (Mermaid)

```mermaid
classDiagram
    direction TB

    %% ============================================================
    %% PACKAGES PAR TYPE D'ANALYSE (DCP)
    %% ============================================================

    package "<<boundary>> Interfaces Utilisateur (Dialogue)" {
        class DossiersPage {
            +render()
            +handleFilterChange(filter: FilterStatus)
            +refreshDossiers()
        }

        class DossierTableau {
            +dossiers: Dossier[]
            +activeFilter: FilterStatus
            +counts: CountMap
            +renderRows()
            +onSort(column: string)
        }

        class FiltreStatutBar {
            +filters: FilterConfig[]
            +activeFilter: FilterStatus
            +onFilterSelect(filter: FilterStatus)
            +renderBadgeCounts()
        }

        class ClotureModal {
            +dossier: Dossier
            +motif: string
            +loading: boolean
            +handleSubmit()
            +validateMotif()
        }

        class AnnulationModal {
            +dossier: Dossier
            +motif: string
            +avancePercue: boolean
            +handleSubmit()
            +showWarning()
        }

        class SuppressionModal {
            +dossier: Dossier
            +loading: boolean
            +handleConfirm()
        }

        class ContratPrint {
            +dossier: Dossier
            +poulaillers: Poulailler[]
            +printRef: HTMLDivElement
            +generatePDF()
            +renderContractHTML()
        }

        class DetailPanneau {
            +detailDossier: Dossier
            +poulaillers: Poulailler[]
            +renderInfoCell()
            +renderDetailRow()
        }

        class FormulaireInscription {
            +firstName: string
            +lastName: string
            +email: string
            +phone: string
            +adresse: string
            +poulaillers: PoulaillerInput[]
            +validateJoi()
            +submitForm()
        }
    }

    package "<<control>> Logique Métier (Contrôle)" {
        class DossierController {
            +getDossiers(req, res)
            +validateDossier(req, res)
            +cloreDossier(req, res)
            +annulerDossier(req, res)
            +updateFinance(req, res)
            +deleteDossier(req, res)
            -checkTransitionsRules(dossier, newStatus)
            -calculateRemainedAmount(total, advance)
        }

        class AuthController {
            +register(req, res)
            +login(req, res)
            +validerDossier(req, res)
            -generateTempPassword()
            -generateContractNumber()
            -createAtomicTransaction(user, poulaillers, dossier)
        }

        class EmailService {
            +transporter: NodemailerTransporter
            +sendInviteEmail(email, token, firstName, role)
            +sendInvitationEmail(email, firstName, role, resetLink)
            +sendValidationEmail(user, motDePasse, poulaillers)
            +getTransporter()
        }

        class DossierWorkflowManager {
            +canValidate(dossier): boolean
            +canClore(dossier): boolean
            +canAnnuler(dossier): boolean
            +canUpdateFinance(dossier): boolean
            +canDelete(dossier): boolean
            +getAllowedActions(dossier): Action[]
            +executeTransition(dossier, newStatus, motif)
        }

        class AuthMiddleware {
            +protect(req, res, next)
            +admin(req, res, next)
            +checkSessionTimeout(req, res, next)
        }
    }

    package "<<entity>> Données Persistance (Entité)" {
        class Dossier {
            +ObjectId _id
            +ObjectId eleveur [FK → User]
            +ObjectId poulailler [FK → Poulailler]
            +String contractNumber [UK]
            +Number totalAmount
            +Number advanceAmount
            +Number remainedAmount
            +String status [enum]
            +String equipmentList
            +Date dateValidation
            +Date dateCloture
            +String motifCloture
            +Date dateAnnulation
            +String motifAnnulation
            +ObjectId validatedBy [FK → User]
            +ObjectId cloreBy [FK → User]
            +ObjectId annulePar [FK → User]
            +Boolean avanceDejaPercueALAnnulation
            +String motDePasseTemporaire
            +Date createdAt
            +Date updatedAt
            +pre('save') generateContractNumber()
        }

        class User {
            +ObjectId _id
            +String email [UK]
            +String password
            +String firstName
            +String lastName
            +String phone
            +String photoUrl
            +String role [enum: eleveur|admin]
            +String status [enum: pending|active|inactive|archived]
            +Boolean isActive
            +String inviteToken
            +Date inviteTokenExpires
            +Date lastLogin
            +Date createdAt
            +Date updatedAt
            +matchPassword(enteredPassword): Boolean
            +pre('save') hashPassword()
        }

        class Poulailler {
            +ObjectId _id
            +ObjectId owner [FK → User]
            +String name
            +Number animalCount
            +String description
            +String location
            +String photoUrl
            +String status
            +Date installationDate
            +Boolean isOnline
            +String uniqueCode [UK]
            +ObjectId moduleId [FK → Module]
            +Date createdAt
            +Date updatedAt
        }

        class Module {
            +ObjectId _id
            +String serialNumber
            +String macAddress [UK]
            +String deviceName
            +String status [enum]
            +ObjectId poulailler [FK → Poulailler]
            +ObjectId owner [FK → User]
            +Date lastPing
            +String claimCode
            +Date claimCodeExpiresAt
            +Date createdAt
            +Date updatedAt
        }
    }

    %% ============================================================
    %% RELATIONS BOUNDARY → CONTROL
    %% ============================================================

    DossiersPage --> DossierController : utilise (API REST)
    DossiersPage --> FiltreStatutBar : contient
    DossiersPage --> DossierTableau : contient
    DossiersPage --> ClotureModal : affiche conditionnellement
    DossiersPage --> AnnulationModal : affiche conditionnellement
    DossiersPage --> SuppressionModal : affiche conditionnellement
    DossiersPage --> ContratPrint : affiche conditionnellement
    DossiersPage --> DetailPanneau : affiche conditionnellement
    DossierTableau --> DossiersPage : signale sélection
    ClotureModal --> DossierController : PATCH /clore/:id
    AnnulationModal --> DossierController : PATCH /annuler/:id
    SuppressionModal --> DossierController : DELETE /:id
    ContratPrint ..> DossierTableau : déclenché par action
    DetailPanneau ..> DossierTableau : déclenché par clic détail
    FormulaireInscription --> AuthController : POST /register

    %% ============================================================
    %% RELATIONS CONTROL → ENTITY
    %% ============================================================

    DossierController --> Dossier : CRUD + transitions
    DossierController --> User : update status / isActive
    DossierController --> Poulailler : populate / récupération

    AuthController --> User : création / activation
    AuthController --> Poulailler : création
    AuthController --> Dossier : création initiale
    AuthController --> EmailService : envoi email validation

    DossierWorkflowManager ..> Dossier : consulte statut
    DossierWorkflowManager ..> User : détermine impact éleveur

    AuthMiddleware ..> User : vérifie token / rôle

    EmailService ..> Dossier : lit motDePasseTemporaire

    %% ============================================================
    %% RELATIONS ENTITY → ENTITY
    %% ============================================================

    Dossier "1" --> "1" User : eleveur
    Dossier "1" --> "1" Poulailler : poulailler principal
    Dossier "0..1" --> "1" User : validatedBy / cloreBy / annulePar
    User "1" --> "0..*" Dossier : dossiers de l'éleveur
    User "1" --> "0..*" Poulailler : owner
    Poulailler "1" --> "0..1" Module : moduleId
    Poulailler "1" --> "0..1" Dossier : poulailler principal

    %% ============================================================
    %% NOTES
    %% ============================================================

    note for Dossier "Machine à états :\nEN_ATTENTE → AVANCE_PAYEE → TERMINE\n↓→ ANNULE (depuis EN_ATTENTE ou AVANCE_PAYEE)"
    note for DossierController "Règles métier :\n• Clôture = motif obligatoire\n• Annulation = motif obligatoire\n• Modif finances = statut ≠ TERMINE/ANNULE\n• Suppression = TERMINE ou ANNULE uniquement"
    note for FormulaireInscription "Création atomique :\nUser(pending) + Poulailler(s) + Dossier(EN_ATTENTE)\nmotDePasseTemporaire stocké dans Dossier"
    note for EmailService "Emails envoyés :\n• Confirmation validation (HTML responsive)\n• Invitation éleveur/admin\n• Identifiants + liste poulaillers"
```

---

## Tableau de traçabilité Use Cases ↔ Classes Participantes

| Cas d'utilisation                           | Acteur principal | Classes de Dialogue (Boundary)                      | Classes de Contrôle                                             | Classes d'Entité                |
| ------------------------------------------- | ---------------- | --------------------------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| **UC1 – Voir la liste des dossiers**        | Admin            | `DossiersPage`, `DossierTableau`, `FiltreStatutBar` | `DossierController` (getDossiers), `AuthMiddleware`             | `Dossier`, `User`, `Poulailler` |
| **UC2 – Valider un dossier**                | Admin            | `DossiersPage`, `DossierTableau`                    | `DossierController` (validateDossier), `DossierWorkflowManager` | `Dossier`, `User`               |
| **UC3 – Annuler un dossier**                | Admin            | `DossiersPage`, `AnnulationModal`                   | `DossierController` (annulerDossier), `DossierWorkflowManager`  | `Dossier`, `User`               |
| **UC4 – Clôturer un dossier**               | Admin            | `DossiersPage`, `ClotureModal`                      | `DossierController` (cloreDossier), `DossierWorkflowManager`    | `Dossier`, `User`               |
| **UC5 – Modifier les montants**             | Admin            | `DossierTableau` (inputs inline)                    | `DossierController` (updateFinance), `DossierWorkflowManager`   | `Dossier`                       |
| **UC6 – Imprimer le contrat**               | Admin            | `DossierTableau`, `ContratPrint`                    | `DossierController` (getDossiers)                               | `Dossier`, `User`, `Poulailler` |
| **UC7 – Filtrer par statut**                | Admin            | `FiltreStatutBar`, `DossierTableau`                 | `DossierController` (getDossiers avec params)                   | `Dossier`                       |
| **UC8 – Envoyer email de confirmation**     | Système          | —                                                   | `EmailService`, `AuthController` (validerDossier)               | `Dossier`, `User`               |
| **UC9 – Générer n° de contrat**             | Système          | —                                                   | `AuthController` (register), `Dossier` (pre-save hook)          | `Dossier`                       |
| **Inscription publique (création dossier)** | Éleveur          | `FormulaireInscription`                             | `AuthController` (register), `DossierWorkflowManager`           | `Dossier`, `User`, `Poulailler` |

---

## Dictionnaire des Classes Participantes

### Classes de Dialogue (Boundary)

| Classe                  | Responsabilité                                                                                                     | Technologies              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `DossiersPage`          | Page racine de la gestion des dossiers. Gère l'état global (filtres, modales, panneau détail).                     | React (TSX), Tailwind CSS |
| `DossierTableau`        | Tableau paginé affichant les dossiers. Contient les inputs inline des montants (total, avance, reste).             | React, Tailwind           |
| `FiltreStatutBar`       | Barre de filtres par statut avec compteurs en temps réel. 5 filtres : Tous, En attente, Actifs, Clôturés, Annulés. | React                     |
| `ClotureModal`          | Modale de saisie du motif de clôture. Affiche le récapitulatif financier et un avertissement irréversible.         | React, Tailwind           |
| `AnnulationModal`       | Modale de saisie du motif d'annulation. Message différencié selon avance perçue ou non.                            | React, Tailwind           |
| `SuppressionModal`      | Modale de confirmation de suppression définitive (dossiers TERMINE ou ANNULE uniquement).                          | React, Tailwind           |
| `ContratPrint`          | Composant d'impression du contrat officiel A4. Styles CSS print-friendly, logo, signatures.                        | React, CSS Print          |
| `DetailPanneau`         | Panneau déroulant affichant tous les poulaillers d'un éleveur avec densité et badges.                              | React, Tailwind           |
| `FormulaireInscription` | Formulaire public multi-étapes. Collecte les infos éleveur + poulaillers, validation Joi.                          | React, Joi                |

### Classes de Contrôle (Control)

| Classe                   | Responsabilité                                                                                                                               | Fichier source                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `DossierController`      | Implémente les opérations CRUD et les transitions de statut. Valide les règles métier avant chaque action.                                   | `backend-admin/controllers/dossierController.js`         |
| `AuthController`         | Gère l'inscription publique (création atomique User + Poulailler + Dossier), la connexion JWT, la validation du dossier avec envoi d'email.  | `backend/controllers/authController.js`                  |
| `EmailService`           | Service d'envoi d'emails via Nodemailer (SMTP). Templates HTML pour validation et invitations.                                               | `backend-admin/services/emailService.js`                 |
| `DossierWorkflowManager` | **(Logique métier centralisée)** Encapsule toutes les règles de transition de statut : conditions, impacts sur l'éleveur, messages d'erreur. | _(actuellement dans les contrôleurs, extractible)_       |
| `AuthMiddleware`         | Middleware d'authentification JWT et d'autorisation rôle admin. Vérifie le timeout de session.                                               | `backend-admin/middlewares/auth.js`, `sessionTimeout.js` |

### Classes d'Entité (Entity)

| Classe       | Responsabilité                                                                                                                                                                   | Fichier source                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `Dossier`    | Entité centrale. Stocke les données financières, le workflow (statuts, dates, motifs), les références éleveur/poulailler/admin. Hook pre-save pour générer le numéro de contrat. | `backend-admin/models/Dossier.js`    |
| `User`       | Compte utilisateur (éleveur ou admin). Contient le statut d'activation (`pending`/`active`/`inactive`), le hash du mot de passe, les tokens d'invitation.                        | `backend-admin/models/User.js`       |
| `Poulailler` | Données du bâtiment avicole. Lié à un éleveur (owner) et optionnellement à un module IoT. Description enrichie (surface, densité).                                               | `backend-admin/models/Poulailler.js` |
| `Module`     | Module ESP32 identifié par MAC. Cycle de vie : `pending` → `associated` → `offline` → `dissociated`.                                                                             | `backend-admin/models/Module.js`     |

---

## Machine à états du Dossier (intégrée au DCP)

```
                    ┌─────────────┐
                    │  EN_ATTENTE │◄────────────────────────┐
                    └──────┬──────┘                         │
                           │ Valider (UC2)                   │
                           ▼                                 │
                    ┌─────────────┐     Annuler (UC3)       │
           ┌───────►│AVANCE_PAYEE │────────────────────────►│
           │        └──────┬──────┘                         │
           │               │ Clôturer (UC4)                  │
           │               ▼                                 │
           │        ┌─────────────┐                         │
           │        │   TERMINE   │                         │
           │        └─────────────┘                         │
           │                                                │
           │        ┌─────────────┐                         │
           └────────┤   ANNULE    │◄────────────────────────┘
                    └─────────────┘
```

### Règles de transition (DossierWorkflowManager)

| Transition                    | Condition                        | Impact sur l'éleveur                                          | Motif requis             |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------- | ------------------------ |
| `EN_ATTENTE` → `AVANCE_PAYEE` | Statut actuel = `EN_ATTENTE`     | `status → active`, `isActive → true`, email envoyé            | ❌ Non                   |
| `EN_ATTENTE` → `ANNULE`       | Statut actuel = `EN_ATTENTE`     | Aucun (déjà inactif)                                          | ✅ Oui                   |
| `AVANCE_PAYEE` → `TERMINE`    | Statut actuel = `AVANCE_PAYEE`   | `status → inactive`, `isActive → false`                       | ✅ Oui                   |
| `AVANCE_PAYEE` → `ANNULE`     | Statut actuel = `AVANCE_PAYEE`   | `status → inactive`, `isActive → false`, avance à régulariser | ✅ Oui                   |
| Modification finances         | Statut ≠ `TERMINE` et ≠ `ANNULE` | Aucun                                                         | ❌ Non                   |
| Suppression                   | Statut = `TERMINE` ou `ANNULE`   | Aucun                                                         | ❌ Non (confirmation UI) |

---

## Endpoints API impliqués (couche Contrôle)

| Méthode  | Endpoint                           | Classe de Contrôle  | Description                                              |
| -------- | ---------------------------------- | ------------------- | -------------------------------------------------------- |
| `GET`    | `/api/admin/dossiers`              | `DossierController` | Liste tous les dossiers avec populate éleveur/poulailler |
| `PATCH`  | `/api/admin/dossiers/validate/:id` | `DossierController` | Valide le dossier et active l'éleveur                    |
| `PATCH`  | `/api/admin/dossiers/clore/:id`    | `DossierController` | Clôture le dossier (TERMINE)                             |
| `PATCH`  | `/api/admin/dossiers/annuler/:id`  | `DossierController` | Annule le dossier (ANNULE)                               |
| `PUT`    | `/api/admin/dossiers/:id/finance`  | `DossierController` | Met à jour les montants financiers                       |
| `DELETE` | `/api/admin/dossiers/:id`          | `DossierController` | Supprime définitivement le dossier                       |
| `POST`   | `/api/auth/register`               | `AuthController`    | Inscription publique (crée User + Poulailler + Dossier)  |
| `PATCH`  | `/api/dossiers/:id/valider`        | `AuthController`    | Validation avec envoi d'email (legacy)                   |

---

## Relations clés du DCP

### 1. Dialogue ↔ Contrôle

- `DossiersPage` communique avec `DossierController` via les appels API REST (`dossiersAPI` dans le service layer React).
- Les modales (`ClotureModal`, `AnnulationModal`, `SuppressionModal`) déclenchent des actions PATCH/DELETE sur le `DossierController`.
- `FormulaireInscription` appelle `AuthController.register` pour la création initiale.

### 2. Contrôle ↔ Entité

- `DossierController` manipule directement les documents `Dossier` (Mongoose) avec `findById`, `save`, `deleteOne`.
- `AuthController` crée atomiquement `User`, `Poulailler` et `Dossier` lors de l'inscription.
- `DossierController` met à jour l'entité `User` (activation/désactivation) lors des transitions de statut du dossier.

### 3. Entité ↔ Entité

- `Dossier` → `User` (éléveur propriétaire, référencé par `eleveur: ObjectId`).
- `Dossier` → `Poulailler` (poulailler principal, référencé par `poulailler: ObjectId`).
- `Dossier` → `User` (admin qui a validé/clôturé/annulé, référencé par `validatedBy`, `cloreBy`, `annulePar`).
- `User` → `Poulailler` (1 éleveur possède 0..\* poulaillers).
- `Poulailler` → `Module` (0..1 module IoT associé).

---

## Conventions de codage

- **Boundary** : Préfixe implicite par le répertoire `web/src/features/dossiers/` et `web/src/components/`
- **Control** : Suffixe `Controller` ou `Service`, situés dans `backend-admin/controllers/` et `backend-admin/services/`
- **Entity** : Modèles Mongoose avec suffixe implicite, situés dans `backend-admin/models/`

---

_Document généré automatiquement – SmartPoultry_  
_Basé sur : usecase_dossiers.md, sprint1.md, backend-admin/controllers/dossierController.js, backend/controllers/authController.js, web/src/features/dossiers/dossiers.tsx_
