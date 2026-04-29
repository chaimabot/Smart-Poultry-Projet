useCaseDiagram
actor "Éleveur" as E

    rectangle "Gestion du Profil" {
        usecase "Voir le profil" as UC1
        usecase "Modifier le profil" as UC2
        usecase "Changer la photo" as UC3
        usecase "Changer le mot de passe" as UC4
        usecase "Activer le mode sombre" as UC5
        usecase "Désactiver le mode sombre" as UC6
        usecase "Se déconnecter" as UC7
    }

    E --> UC1
    E --> UC2
    E --> UC3
    E --> UC4
    E --> UC5
    E --> UC6
    E --> UC7

    UC2 ..> UC3 : <<extend>>
    UC2 ..> UC4 : <<extend>>
