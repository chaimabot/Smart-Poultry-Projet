sequenceDiagram
autonumber
actor E as Éleveur
participant F as Front (Web)
participant B as Back (Node.js)
participant DB as MongoDB
actor A as Admin

    rect rgb(230, 245, 255)
        Note over E,DB: Phase 1 – Inscription publique
        E->>F: Remplit formulaire d'inscription
        F->>F: Validation Joi (champs, email)
        F->>B: POST /api/auth/register
        B->>DB: Vérifier unicité email
        DB-->>B: Email disponible ✓
        B->>B: Génère MDP temporaire<br/>Génère n° contrat (SP-YYYY-XXXX)
        B->>DB: INSERT User (status=pending)
        B->>DB: INSERT Poulailler(s)
        B->>DB: INSERT Dossier (status=EN_ATTENTE)
        DB-->>B: OK
        B-->>F: 201 + contractNumber
        F-->>E: "Demande en attente de validation"
    end

    rect rgb(255, 245, 230)
        Note over A,E: Phase 2 – Validation par l'admin
        A->>F: Consulte dashboard dossiers
        F->>B: GET /api/admin/dossiers
        B->>DB: SELECT dossiers EN_ATTENTE
        DB-->>B: Liste dossiers
        B-->>F: JSON dossiers
        F-->>A: Affiche tableau dossiers
        A->>F: Clic "Valider" sur dossier
        F->>B: PATCH /api/admin/dossiers/validate/:id
        B->>DB: UPDATE Dossier (status=AVANCE_PAYEE)
        B->>DB: UPDATE User (status=active, isActive=true)
        B->>B: Récupère MDP temporaire
        B-->>DB: Envoi email SMTP (HTML) [async]
        B-->>F: JSON "Dossier validé, compte activé"
        F-->>A: Confirmation visuelle
    end

    rect rgb(230, 255, 230)
        Note over E,DB: Phase 3 – Activation éleveur
        DB-->>E: Email reçu (identifiants + MDP)
        E->>F: Login avec email + MDP temporaire
        F->>B: POST /api/auth/login
        B->>DB: Vérifier credentials
        DB-->>B: User actif ✓
        B-->>F: JWT Token
        F-->>E: Connexion réussie, Dashboard
    end
