# Diagramme BCE – Cas d'utilisation "Valider un dossier"

## Cas d'utilisation concerné

| ID      | Cas d'utilisation      | Acteur | Description                                                                                                                                                                                       |
| ------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UC2** | **Valider un dossier** | Admin  | L'administrateur valide un dossier en attente, ce qui active le compte éleveur, passe le dossier en statut `AVANCE_PAYEE`, et déclenche l'envoi d'un email de confirmation avec les identifiants. |

---

## Diagramme de Classes Participantes – Validation (Mermaid)

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
        class DossierTableau {
            +dossiers: Dossier[]
            +onValidateClick(dossierId)
            +renderBadge(status)
            +renderActionButtons(dossier)
        }

        class DossiersPage {
            +activeFilter: FilterStatus
            +handleValidate(dossierId)
            +refreshDossiers()
            +showToast(message, type)
        }

        class ValidationToast {
            +message: string
            +type: "success" | "error"
            +duration: number
            +show()
            +hide()
        }
    }

    %% ============================================================
    %% CONTROL (CONTROLE)
    %% ============================================================
    package "<<control>> Contrôle" {
        class DossierController {
            +validateDossier(req, res)
            -checkStatus(dossier): boolean
            -updateDossierStatus(dossier, status)
            -activateEleveur(userId)
        }

        class DossierWorkflowManager {
            +canValidate(dossier): boolean
            +getValidationErrors(dossier): string[]
            +executeValidation(dossier): Result
        }

        class AuthMiddleware {
            +protect(req, res, next)
            +admin(req, res, next)
        }

        class EmailService {
            +sendValidationEmail(user, password, poulaillers)
            +getTransporter(): Transporter
        }
    }

    %% ============================================================
    %% ENTITY (ENTITE)
    %% ============================================================
    package "<<entity>> Entité" {
        class Dossier {
            +ObjectId _id
            +ObjectId eleveur
            +ObjectId poulailler
            +String contractNumber
            +Number totalAmount
            +Number advanceAmount
            +Number remainedAmount
            +String status
            +Date dateValidation
            +ObjectId validatedBy
            +String motDePasseTemporaire
            +Date createdAt
            +Date updatedAt
            +save()
        }

        class User {
            +ObjectId _id
            +String email
            +String password
            +String firstName
            +String lastName
            +String phone
            +String role
            +String status
            +Boolean isActive
            +Date createdAt
            +Date updatedAt
            +save()
            +matchPassword(pwd): Boolean
        }

        class Poulailler {
            +ObjectId _id
            +ObjectId owner
            +String name
            +Number animalCount
            +String description
            +String location
            +Date createdAt
            +Date updatedAt
        }
    }

    %% ============================================================
    %% RELATIONS ACTEUR → BOUNDARY
    %% ============================================================
    Admin --> DossierTableau : "clique 'Valider'"

    %% ============================================================
    %% RELATIONS BOUNDARY → BOUNDARY
    %% ============================================================
    DossierTableau --> DossiersPage : "signale clic validation"
    DossiersPage --> ValidationToast : "affiche confirmation"

    %% ============================================================
    %% RELATIONS BOUNDARY → CONTROL
    %% ============================================================
    DossiersPage --> DossierController : "PATCH /api/admin/dossiers/validate/:id"
    DossierController --> AuthMiddleware : "utilise (protect + admin)"

    %% ============================================================
    %% RELATIONS CONTROL → CONTROL
    %% ============================================================
    DossierController --> DossierWorkflowManager : "vérifie règles métier"
    DossierController --> EmailService : "déclenche envoi email"

    %% ============================================================
    %% RELATIONS CONTROL → ENTITY
    %% ============================================================
    DossierController --> Dossier : "findById + update status"
    DossierController --> User : "findByIdAndUpdate (activation)"
    DossierController --> Poulailler : "find({ owner: eleveurId })"
    DossierWorkflowManager ..> Dossier : "lit status"
    EmailService ..> Dossier : "lit motDePasseTemporaire"

    %% ============================================================
    %% RELATIONS ENTITY → ENTITY
    %% ============================================================
    Dossier "1" --> "1" User : "eleveur (FK)"
    Dossier "1" --> "1" Poulailler : "poulailler principal (FK)"
    Dossier "0..1" --> "1" User : "validatedBy (FK)"
    User "1" --> "0..*" Poulailler : "owner"

    %% ============================================================
    %% NOTES
    %% ============================================================
    note for DossierTableau "Affiche le bouton 'Valider'\nuniquement si status = EN_ATTENTE"
    note for DossierController "1. Vérifie auth admin\n2. Récupère dossier par ID\n3. Vérifie status = EN_ATTENTE\n4. Met à jour Dossier → AVANCE_PAYEE\n5. Active User → active / isActive=true\n6. Appelle EmailService"
    note for DossierWorkflowManager "Règle :\n• Dossier.status doit être 'EN_ATTENTE'\n• Sinon : erreur 'Ce dossier est déjà traité'"
    note for EmailService "Template HTML responsive :\n• Confirmation d'activation\n• Email + mot de passe temporaire\n• Liste des poulaillers de l'éleveur"
    note for User "Impact de la validation :\n• status = 'active'\n• isActive = true\n• role = 'eleveur'\n• L'éleveur peut désormais se connecter"
```

---

## Note sur le `DossierWorkflowManager`

> ⚠️ **Le `DossierWorkflowManager` est une classe conceptuelle** présente dans ce diagramme BCE pour illustrer une bonne pratique d'architecture, mais **elle n'existe pas encore dans le code source** du projet.
>
> Dans l'implémentation actuelle, la logique métier de validation des transitions est directement codée dans le `DossierController` (fichier `backend-admin/controllers/dossierController.js`) :
>
> ```javascript
> if (dossier.status !== "EN_ATTENTE") {
>   return res.status(400).json({
>     success: false,
>     message: "Ce dossier est déjà traité.",
>   });
> }
> ```
>
> **Rôle du WorkflowManager** : encapsuler toutes les règles de transition de statut (`canValidate`, `canClore`, `canAnnuler`, etc.) dans une classe dédiée. Cela permet de :
>
> - Séparer la logique métier pure de l'orchestration HTTP (contrôleur)
> - Réutiliser les règles dans d'autres contextes (tests, API mobile, scripts)
> - Faciliter la maintenance et la testabilité
>
> **Recommandation** : extraire cette logique du contrôleur vers un service `DossierWorkflowManager` ou `DossierValidationService`.

---

| Étape | Couche                 | Classe                               | Action                                                                                                  |
| ----- | ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1     | **Boundary**           | `DossierTableau`                     | L'Admin clique sur le bouton **"Valider"** sur la ligne du dossier en attente.                          |
| 2     | **Boundary**           | `DossiersPage`                       | La page appelle `handleValidate(dossierId)` et affiche un indicateur de chargement.                     |
| 3     | **Boundary → Control** | `DossiersPage` → `DossierController` | Requête HTTP `PATCH /api/admin/dossiers/validate/:id` avec le token JWT.                                |
| 4     | **Control**            | `AuthMiddleware`                     | Vérifie l'authentification (token valide) et l'autorisation (rôle = admin).                             |
| 5     | **Control**            | `DossierController`                  | Appelle `findById(req.params.id)` pour récupérer le dossier.                                            |
| 6     | **Control**            | `DossierWorkflowManager`             | Vérifie que `dossier.status === "EN_ATTENTE"`. Sinon, retourne erreur 400.                              |
| 7     | **Control → Entity**   | `DossierController` → `Dossier`      | Met à jour le dossier : `status = "AVANCE_PAYEE"`, `dateValidation = now`, `validatedBy = req.user.id`. |
| 8     | **Control → Entity**   | `DossierController` → `User`         | Active le compte éleveur : `status = "active"`, `isActive = true`, `role = "eleveur"`.                  |
| 9     | **Control → Entity**   | `DossierController` → `Poulailler`   | Récupère tous les poulaillers de l'éleveur pour l'email.                                                |
| 10    | **Control**            | `EmailService`                       | Envoie l'email HTML de confirmation avec identifiants et liste des poulaillers.                         |
| 11    | **Control → Boundary** | `DossierController` → `DossiersPage` | Réponse JSON : `{ success: true, message: "Dossier validé..." }`.                                       |
| 12    | **Boundary**           | `ValidationToast`                    | Affiche la notification de succès à l'admin.                                                            |
| 13    | **Boundary**           | `DossierTableau`                     | Met à jour la ligne du dossier : badge passe de 🟠 à 🟢, bouton "Valider" disparaît.                    |

---

## Dictionnaire des classes participantes (UC2)

### Boundary – Dialogue

| Classe            | Responsabilité dans UC2                                                                                                                       | Fichier source                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `DossierTableau`  | Affiche la liste des dossiers avec le bouton **Valider** (visible uniquement si `status === "EN_ATTENTE"`). Signale le clic à la page parent. | `web/src/features/dossiers/dossiers.tsx` |
| `DossiersPage`    | Page racine qui orchestre l'appel API `validate()`, gère le rechargement de la liste et affiche les notifications.                            | `web/src/features/dossiers/dossiers.tsx` |
| `ValidationToast` | Notification visuelle de confirmation ou d'erreur après l'action de validation.                                                               | Composant inline dans `dossiers.tsx`     |

### Control – Contrôle

| Classe                   | Responsabilité dans UC2                                                                                                                                                        | Fichier source                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `DossierController`      | Point d'entrée de l'API. Reçoit la requête PATCH, orchestre la validation : vérification du dossier, mise à jour du statut, activation de l'éleveur, déclenchement de l'email. | `backend-admin/controllers/dossierController.js` |
| `DossierWorkflowManager` | Encapsule la règle métier : un dossier ne peut être validé que s'il est en statut `EN_ATTENTE`. Retourne une erreur explicite sinon.                                           | _(logique dans le contrôleur, extractible)_      |
| `AuthMiddleware`         | Garantit que seul un administrateur authentifié peut valider un dossier. Vérifie le JWT et le rôle.                                                                            | `backend-admin/middlewares/auth.js`              |
| `EmailService`           | Construit et envoie l'email HTML de confirmation à l'éleveur. Inclut le mot de passe temporaire et la liste de ses poulaillers.                                                | `backend-admin/services/emailService.js`         |

### Entity – Entité

| Classe           | Responsabilité dans UC2                                                                                                                                                      | Fichier source                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `Dossier`        | Entité centrale modifiée lors de la validation. Attributs impactés : `status`, `dateValidation`, `validatedBy`. Le `motDePasseTemporaire` est lu pour l'email puis supprimé. | `backend-admin/models/Dossier.js`    |
| `User` (éleveur) | Compte éleveur activé lors de la validation. Attributs impactés : `status → "active"`, `isActive → true`, `role → "eleveur"`.                                                | `backend-admin/models/User.js`       |
| `Poulailler`     | Poulaillers de l'éleveur récupérés pour enrichir l'email de confirmation (nom, nombre de volailles, description).                                                            | `backend-admin/models/Poulailler.js` |

---

## Règles métier de validation (Control)

```
┌─────────────────────────────────────────────────────────────┐
│  RÈGLE : Valider un dossier (UC2)                           │
├─────────────────────────────────────────────────────────────┤
│  PRÉCONDITIONS :                                            │
│    • Utilisateur authentifié avec rôle = "admin"            │
│    • Dossier existe (findById retourne un document)         │
│    • Dossier.status === "EN_ATTENTE"                        │
├─────────────────────────────────────────────────────────────┤
│  POSTCONDITIONS :                                           │
│    • Dossier.status === "AVANCE_PAYEE"                      │
│    • Dossier.dateValidation = Date.now()                    │
│    • Dossier.validatedBy = admin._id                        │
│    • User.status === "active"                               │
│    • User.isActive === true                                 │
│    • Email envoyé à l'éleveur avec identifiants             │
├─────────────────────────────────────────────────────────────┤
│  ERREURS POSSIBLES :                                        │
│    • 401 : Non authentifié                                  │
│    • 403 : Non autorisé (rôle ≠ admin)                      │
│    • 404 : Dossier non trouvé                               │
│    • 400 : Dossier déjà traité (status ≠ EN_ATTENTE)        │
│    • 500 : Erreur serveur (DB, SMTP)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Traçabilité UC2 ↔ Classes participantes

| Étape du cas d'utilisation                | Boundary                            | Control                                             | Entity                          |
| ----------------------------------------- | ----------------------------------- | --------------------------------------------------- | ------------------------------- |
| L'admin consulte la liste des dossiers    | `DossierTableau`, `DossiersPage`    | `DossierController` (getDossiers), `AuthMiddleware` | `Dossier`, `User`, `Poulailler` |
| L'admin clique sur "Valider"              | `DossierTableau`                    | —                                                   | —                               |
| Le système vérifie les droits             | —                                   | `AuthMiddleware`                                    | —                               |
| Le système vérifie le statut du dossier   | —                                   | `DossierWorkflowManager`                            | `Dossier`                       |
| Le système met à jour le dossier          | —                                   | `DossierController`                                 | `Dossier`                       |
| Le système active le compte éleveur       | —                                   | `DossierController`                                 | `User`                          |
| Le système envoie l'email de confirmation | —                                   | `EmailService`                                      | `Dossier`, `User`, `Poulailler` |
| Le système affiche la confirmation        | `ValidationToast`, `DossierTableau` | —                                                   | —                               |

---

_Diagramme BCE – UC2 Valider un dossier – SmartPoultry_
