# Diagramme BCE – Cas d'utilisation "Envoi d'invitation par e-mail"

## Cas d'utilisation concerné

| ID         | Cas d'utilisation                     | Acteur | Description                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UC-INV** | **Envoyer une invitation par e-mail** | Admin  | L'administrateur invite un nouvel éleveur ou un nouvel administrateur en saisissant ses informations. Le système génère un token d'invitation unique, crée le compte avec statut `pending`, et envoie un e-mail contenant un lien sécurisé de définition de mot de passe. |

---

## Diagramme de Classes Participantes – Envoi d'invitation (Mermaid)

```mermaid
classDiagram
    direction TB

    %% ============================================================
    %% ACTEUR
    %% ============================================================
    actor "Admin" as Admin

    %% ============================================================
    %% BOUNDARY (DIALOGUE)
    %% ============================================================
    package "<<boundary>> Dialogue" {
        class UtilisateursPage {
            +users: User[]
            +showInviteModal: boolean
            +handleOpenInviteModal()
            +handleInviteSubmit(formData)
            +handleResendInvite(userId)
            +refreshUsers()
        }

        class InviteModal {
            +inviteForm: InviteForm
            +inviteErrors: Record
            +inviting: boolean
            +inviteSuccess: boolean
            +validateForm(): boolean
            +handleSubmit(e)
            +renderRoleSelector()
        }

        class UtilisateursTableau {
            +users: User[]
            +onResendInvite(userId)
            +renderActionButtons(user)
            +renderStatusBadge(status)
        }

        class CompleteInvitePage {
            +token: string
            +isValidating: boolean
            +isValid: boolean
            +passwordForm: PasswordForm
            +handleCompleteInvite()
            +verifyToken()
        }
    }

    %% ============================================================
    %% CONTROL (CONTROLE)
    %% ============================================================
    package "<<control>> Contrôle" {
        class EleveursController {
            +inviteEleveur(req, res)
            +resendInvite(req, res)
            +verifyInvite(req, res)
            +completeInvite(req, res)
            -generateInviteToken(): string
        }

        class UtilisateursController {
            +inviteAdmin(req, res)
            -hashTempPassword(): string
        }

        class EmailService {
            +transporter: NodemailerTransporter
            +sendInviteEmail(email, token, firstName, role)
            +getTransporter(): Transporter
        }

        class AuthMiddleware {
            +protect(req, res, next)
            +admin(req, res, next)
        }

        class LogService {
            +userCreated(adminId, userId, email, ip)
        }

        class InviteWorkflowManager {
            +checkEmailUniqueness(email): boolean
            +reactivateArchivedUser(user): User
            +generateTokenExpiry(): Date
            +validateInviteToken(token): boolean
        }
    }

    %% ============================================================
    %% ENTITY (ENTITE)
    %% ============================================================
    package "<<entity>> Entité" {
        class User {
            +ObjectId _id
            +String email [UK]
            +String password
            +String firstName
            +String lastName
            +String phone
            +String role [enum: eleveur|admin]
            +String status [enum: pending|active|inactive|archived]
            +Boolean isActive
            +String inviteToken
            +Date inviteTokenExpires
            +Date lastLogin
            +Date createdAt
            +Date updatedAt
            +save()
            +matchPassword(pwd): Boolean
            +pre('save') hashPassword()
        }
    }

    %% ============================================================
    %% RELATIONS ACTEUR → BOUNDARY
    %% ============================================================
    Admin --> UtilisateursPage : "navigue vers page utilisateurs"
    Admin --> InviteModal : "saisit email, nom, rôle, téléphone"
    Admin --> UtilisateursTableau : "clique 🔄 renvoyer invitation"

    %% ============================================================
    %% RELATIONS BOUNDARY → BOUNDARY
    %% ============================================================
    UtilisateursPage --> InviteModal : "affiche / masque"
    UtilisateursPage --> UtilisateursTableau : "contient"
    InviteModal --> UtilisateursPage : "notifie succès / erreur"
    UtilisateursTableau --> UtilisateursPage : "signale renvoi"

    %% ============================================================
    %% RELATIONS BOUNDARY → CONTROL
    %% ============================================================
    InviteModal --> EleveursController : "POST /api/admin/eleveurs/invite"
    InviteModal --> UtilisateursController : "POST /api/admin/utilisateurs/invite-admin"
    UtilisateursTableau --> EleveursController : "POST /api/admin/eleveurs/:id/resend-invite"
    CompleteInvitePage --> EleveursController : "GET /api/admin/eleveurs/verify-invite"
    CompleteInvitePage --> EleveursController : "POST /api/admin/eleveurs/complete-invite"

    EleveursController --> AuthMiddleware : "utilise (protect + admin)"
    UtilisateursController --> AuthMiddleware : "utilise (protect + admin)"

    %% ============================================================
    %% RELATIONS CONTROL → CONTROL
    %% ============================================================
    EleveursController --> EmailService : "déclenche envoi e-mail"
    EleveursController --> LogService : "log l'action d'invitation"
    EleveursController --> InviteWorkflowManager : "vérifie unicité / réactivation"

    UtilisateursController --> EmailService : "déclenche envoi e-mail"
    UtilisateursController --> LogService : "log l'action d'invitation"

    %% ============================================================
    %% RELATIONS CONTROL → ENTITY
    %% ============================================================
    EleveursController --> User : "findOne / create / save"
    UtilisateursController --> User : "findOne / create / save"
    InviteWorkflowManager ..> User : "vérifie status archived"
    EmailService ..> User : "lit email / firstName"
    LogService ..> User : "lit _id / email"

    %% ============================================================
    %% NOTES
    %% ============================================================
    note for InviteModal "Champs du formulaire :\n• firstName (obligatoire admin)\n• lastName (obligatoire admin)\n• email (obligatoire)\n• phone (optionnel)\n• role (éleveur | admin)"

    note for EleveursController "Flux invitation éleveur :\n1. Validation Joi du body\n2. Vérification unicité email\n3. Si archived → réactivation\n4. Sinon → création User(pending)\n5. Génération token (32 bytes hex)\n6. Expiration : +7 jours\n7. Envoi e-mail via EmailService\n8. Log de l'action"

    note for UtilisateursController "Flux invitation admin :\n1. Validation email / nom\n2. Vérification unicité email\n3. Création User(pending, role=admin)\n4. Hash mot de passe temporaire\n5. Envoi e-mail via EmailService"

    note for EmailService "Template e-mail d'invitation :\n• Lien : /definir-mot-de-passe/:token\n• Validité : 7 jours\n• Contenu : prénom, rôle, CTA button\n• SMTP configuré via env vars"

    note for User "Attributs liés à l'invitation :\n• inviteToken : token unique hex\n• inviteTokenExpires : Date +7j\n• status : pending (jusqu'à activation)\n• isActive : true (dès l'invitation)"

    note for CompleteInvitePage "Page publique accessible via\nle lien de l'e-mail. Permet\nà l'invité de définir son\nmot de passe et d'activer\nson compte."
```

---

## Note sur le `InviteWorkflowManager`

> ⚠️ **Le `InviteWorkflowManager` est une classe conceptuelle** présente dans ce diagramme BCE pour illustrer une bonne pratique d'architecture, mais **elle n'existe pas encore dans le code source** du projet.
>
> Dans l'implémentation actuelle, la logique métier de gestion des invitations est directement codée dans les contrôleurs (`eleveursController.js` et `utilisateursController.js`). Par exemple, la vérification d'unicité d'email et la réactivation d'un compte archivé sont gérées inline :
>
> ```javascript
> const existingUser = await User.findOne({ email });
> if (existingUser) {
>   if (existingUser.status === "archived") {
>     // Réactivation + nouveau token
>   } else {
>     return res.status(409).json({ error: "Cet email est déjà utilisé" });
>   }
> }
> ```
>
> **Rôle du WorkflowManager** : encapsuler les règles métier liées aux invitations (vérification d'unicité, réactivation, génération de tokens, validation des dates d'expiration) dans une classe dédiée. Cela permet de :
>
> - Séparer la logique métier pure de l'orchestration HTTP (contrôleur)
> - Réutiliser ces règles dans d'autres contextes (tests, scripts batch, API externe)
> - Faciliter la maintenance et la testabilité unitaire
>
> **Recommandation** : extraire cette logique vers un service `InviteWorkflowManager` ou `InvitationService`.

---

## Flux détaillé – Envoi d'invitation (scénario nominal)

| Étape | Couche                 | Classe                                                          | Action                                                                                                                    |
| ----- | ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Boundary**           | `UtilisateursPage`                                              | L'Admin clique sur le bouton **"Inviter un utilisateur"**.                                                                |
| 2     | **Boundary**           | `InviteModal`                                                   | La modale s'ouvre. L'Admin saisit email, prénom, nom, téléphone et sélectionne le rôle (éleveur/admin).                   |
| 3     | **Boundary**           | `InviteModal`                                                   | Validation côté client du formulaire (email valide, champs obligatoires).                                                 |
| 4     | **Boundary → Control** | `InviteModal` → `EleveursController` / `UtilisateursController` | Soumission du formulaire. Requête POST avec token JWT d'admin.                                                            |
| 5     | **Control**            | `AuthMiddleware`                                                | Vérifie l'authentification (JWT valide) et l'autorisation (rôle = admin).                                                 |
| 6     | **Control**            | `EleveursController` / `UtilisateursController`                 | Validation Joi du body de la requête.                                                                                     |
| 7     | **Control**            | `InviteWorkflowManager`                                         | Vérifie si l'email existe déjà. Si oui et statut = `archived` → réactivation. Si oui et statut ≠ `archived` → erreur 409. |
| 8     | **Control**            | `EleveursController` / `UtilisateursController`                 | Génère un token d'invitation unique (`crypto.randomBytes(32).toString('hex')`).                                           |
| 9     | **Control**            | `EleveursController` / `UtilisateursController`                 | Crée ou met à jour l'entité `User` avec : `status = "pending"`, `inviteToken`, `inviteTokenExpires = Date.now() + 7j`.    |
| 10    | **Control → Entity**   | `EleveursController` / `UtilisateursController` → `User`        | Sauvegarde du document `User` en base MongoDB.                                                                            |
| 11    | **Control**            | `EmailService`                                                  | Construit et envoie l'e-mail d'invitation avec le lien de définition de mot de passe.                                     |
| 12    | **Control**            | `LogService`                                                    | Enregistre l'action d'invitation (qui a invité qui, à quelle date, depuis quelle IP).                                     |
| 13    | **Control → Boundary** | `EleveursController` / `UtilisateursController` → `InviteModal` | Réponse JSON 201 : `{ success: true, message: "Invitation envoyée" }`.                                                    |
| 14    | **Boundary**           | `InviteModal`                                                   | Affiche le message de succès, ferme la modale après 2 secondes.                                                           |
| 15    | **Boundary**           | `UtilisateursPage`                                              | Rafraîchit la liste des utilisateurs pour afficher le nouvel invité.                                                      |

---

## Flux secondaire – Renvoi d'invitation

| Étape | Couche                 | Classe                                       | Action                                                                     |
| ----- | ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| 1     | **Boundary**           | `UtilisateursTableau`                        | L'Admin clique sur l'icône 🔄 en face d'un éleveur en attente.             |
| 2     | **Boundary → Control** | `UtilisateursTableau` → `EleveursController` | Requête POST `/api/admin/eleveurs/:id/resend-invite`.                      |
| 3     | **Control**            | `EleveursController`                         | Vérifie que l'utilisateur existe, est un éleveur, et n'est pas déjà actif. |
| 4     | **Control**            | `EleveursController`                         | Génère un nouveau token d'invitation et met à jour `inviteTokenExpires`.   |
| 5     | **Control → Entity**   | `EleveursController` → `User`                | Sauvegarde le nouveau token.                                               |
| 6     | **Control**            | `EmailService`                               | Renvoie l'e-mail d'invitation avec le nouveau token.                       |
| 7     | **Control → Boundary** | `EleveursController` → `UtilisateursPage`    | Réponse JSON : `{ success: true, message: "Invitation rechargée" }`.       |
| 8     | **Boundary**           | `UtilisateursPage`                           | Affiche une alerte de confirmation à l'admin.                              |

---

## Flux secondaire – Complétion de l'invitation (page publique)

| Étape | Couche                 | Classe                                      | Action                                                                                           |
| ----- | ---------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1     | **Boundary**           | `CompleteInvitePage`                        | L'invité clique sur le lien de l'e-mail : `/definir-mot-de-passe/:token`.                        |
| 2     | **Boundary → Control** | `CompleteInvitePage` → `EleveursController` | Requête GET `/api/admin/eleveurs/verify-invite?token=xxx`.                                       |
| 3     | **Control → Entity**   | `EleveursController` → `User`               | Recherche un utilisateur avec ce token non expiré.                                               |
| 4     | **Control → Boundary** | `EleveursController` → `CompleteInvitePage` | Retourne les infos de l'utilisateur (email, prénom, nom, rôle).                                  |
| 5     | **Boundary**           | `CompleteInvitePage`                        | Affiche le formulaire de définition de mot de passe.                                             |
| 6     | **Boundary → Control** | `CompleteInvitePage` → `EleveursController` | Soumission POST `/api/admin/eleveurs/complete-invite` avec token + password.                     |
| 7     | **Control**            | `EleveursController`                        | Validation Joi (password min 6 caractères).                                                      |
| 8     | **Control → Entity**   | `EleveursController` → `User`               | Met à jour : `password`, `status = "active"`, `inviteToken = null`, `inviteTokenExpires = null`. |
| 9     | **Control → Boundary** | `EleveursController` → `CompleteInvitePage` | Réponse JSON : `{ success: true, message: "Compte activé" }`.                                    |
| 10    | **Boundary**           | `CompleteInvitePage`                        | Redirige vers la page de connexion.                                                              |

---

## Dictionnaire des classes participantes (UC-INV)

### Boundary – Dialogue

| Classe                | Responsabilité dans UC-INV                                                                                                                     | Fichier source                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `UtilisateursPage`    | Page racine de gestion des utilisateurs. Contient le bouton "Inviter un utilisateur" et le tableau. Gère le rafraîchissement après invitation. | `web/src/features/utilisateurs/utilisateurs.tsx` |
| `InviteModal`         | Modale de saisie des informations de l'invité. Formulaire avec validation, sélecteur de rôle, gestion des erreurs et message de succès.        | `web/src/features/utilisateurs/utilisateurs.tsx` |
| `UtilisateursTableau` | Tableau affichant les utilisateurs avec le bouton 🔄 pour renvoyer une invitation aux éleveurs en attente.                                     | `web/src/features/utilisateurs/utilisateurs.tsx` |
| `CompleteInvitePage`  | Page publique accessible via le lien de l'e-mail. Permet à l'invité de vérifier son token et de définir son mot de passe.                      | `web/src/features/auth/CompleteInvite.tsx`       |

### Control – Contrôle

| Classe                   | Responsabilité dans UC-INV                                                                                                             | Fichier source                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `EleveursController`     | Gère l'invitation des éleveurs (création, renvoi, vérification token, complétion). Inclut la réactivation des comptes archivés.        | `backend-admin/controllers/eleveursController.js`     |
| `UtilisateursController` | Gère l'invitation des administrateurs (création avec hash de mot de passe temporaire).                                                 | `backend-admin/controllers/utilisateursController.js` |
| `EmailService`           | Service d'envoi d'e-mails via Nodemailer/SMTP. Construit le lien d'invitation et le template HTML.                                     | `backend-admin/services/emailService.js`              |
| `AuthMiddleware`         | Vérifie que l'admin est authentifié pour les routes d'invitation protégées.                                                            | `backend-admin/middlewares/auth.js`                   |
| `LogService`             | Enregistre les actions d'invitation dans les logs d'audit (qui invite qui).                                                            | `backend-admin/services/logService.js`                |
| `InviteWorkflowManager`  | Encapsule les règles : vérification d'unicité d'email, réactivation des comptes archivés, génération des tokens et dates d'expiration. | _(logique dans les contrôleurs, extractible)_         |

### Entity – Entité

| Classe | Responsabilité dans UC-INV                                                                                                                                                                                   | Fichier source                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `User` | Entité centrale. Stocke les données d'invitation (`inviteToken`, `inviteTokenExpires`), le statut (`pending` jusqu'à activation), le rôle (`eleveur` ou `admin`). Hook pre-save pour hasher le mot de passe. | `backend-admin/models/User.js` |

---

## Règles métier d'invitation (Control)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RÈGLE : Envoyer une invitation par e-mail (UC-INV)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  PRÉCONDITIONS :                                                            │
│    • Utilisateur authentifié avec rôle = "admin"                            │
│    • Email valide et unique (sauf si compte archivé)                        │
│    • Pour admin : firstName et lastName obligatoires                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  POSTCONDITIONS (invitation éleveur) :                                      │
│    • User créé ou réactivé avec status = "pending"                          │
│    • inviteToken généré (32 bytes hex)                                      │
│    • inviteTokenExpires = Date.now() + 7 jours                              │
│    • role = "eleveur", isActive = true                                      │
│    • E-mail envoyé avec lien /definir-mot-de-passe/:token                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  POSTCONDITIONS (invitation admin) :                                        │
│    • User créé avec status = "pending", role = "admin"                      │
│    • Mot de passe temporaire hashé en base                                  │
│    • inviteToken généré avec expiration +7j                                 │
│    • E-mail envoyé avec lien de définition de mot de passe                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ERREURS POSSIBLES :                                                        │
│    • 400 : Données invalides (validation Joi)                               │
│    • 401 : Non authentifié                                                  │
│    • 403 : Non autorisé (rôle ≠ admin)                                      │
│    • 409 : Email déjà utilisé (si compte non archivé)                       │
│    • 500 : Erreur serveur (DB, SMTP, crypto)                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Endpoints API impliqués (couche Contrôle)

| Méthode | Endpoint                                | Classe de Contrôle       | Description                                           |
| ------- | --------------------------------------- | ------------------------ | ----------------------------------------------------- |
| `POST`  | `/api/admin/eleveurs/invite`            | `EleveursController`     | Inviter un nouvel éleveur                             |
| `POST`  | `/api/admin/utilisateurs/invite-admin`  | `UtilisateursController` | Inviter un nouvel administrateur                      |
| `POST`  | `/api/admin/eleveurs/:id/resend-invite` | `EleveursController`     | Renvoyer une invitation à un éleveur                  |
| `GET`   | `/api/admin/eleveurs/verify-invite`     | `EleveursController`     | Vérifier la validité d'un token d'invitation (public) |
| `POST`  | `/api/admin/eleveurs/complete-invite`   | `EleveursController`     | Compléter l'inscription avec mot de passe (public)    |

---

## Traçabilité UC-INV ↔ Classes participantes

| Étape du cas d'utilisation               | Boundary                          | Control                                         | Entity |
| ---------------------------------------- | --------------------------------- | ----------------------------------------------- | ------ |
| L'admin ouvre le formulaire d'invitation | `UtilisateursPage`, `InviteModal` | —                                               | —      |
| L'admin saisit les informations          | `InviteModal`                     | —                                               | —      |
| Le système valide les données            | `InviteModal`                     | `InviteWorkflowManager`                         | `User` |
| Le système génère un token d'invitation  | —                                 | `EleveursController` / `UtilisateursController` | —      |
| Le système crée le compte en attente     | —                                 | `EleveursController` / `UtilisateursController` | `User` |
| Le système envoie l'e-mail d'invitation  | —                                 | `EmailService`                                  | `User` |
| Le système logue l'action                | —                                 | `LogService`                                    | `User` |
| L'admin renvoie une invitation           | `UtilisateursTableau`             | `EleveursController` (resendInvite)             | `User` |
| L'invité clique sur le lien de l'e-mail  | `CompleteInvitePage`              | `EleveursController` (verifyInvite)             | `User` |
| L'invité définit son mot de passe        | `CompleteInvitePage`              | `EleveursController` (completeInvite)           | `User` |

---

_Diagramme BCE – UC-INV Envoi d'invitation par e-mail – SmartPoultry_
