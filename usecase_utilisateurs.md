useCaseDiagram
actor "Admin" as A
actor "Éleveur invité" as EI
actor "Système" as S

    rectangle "Gestion des Utilisateurs" {
        usecase "Inviter un éleveur" as UC1
        usecase "Inviter un admin" as UC2
        usecase "Compléter l'inscription" as UC3
        usecase "Réenvoyer une invitation" as UC4
        usecase "Activer un compte" as UC5
        usecase "Désactiver un compte" as UC6
        usecase "Modifier un éleveur" as UC7
        usecase "Supprimer un éleveur" as UC8
        usecase "Supprimer un admin" as UC9
        usecase "Voir la liste des utilisateurs" as UC10
        usecase "Voir les détails d'un utilisateur" as UC11
        usecase "Logger les actions" as UC12
    }

    A --> UC1
    A --> UC2
    A --> UC4
    A --> UC5
    A --> UC6
    A --> UC7
    A --> UC8
    A --> UC9
    A --> UC10
    A --> UC11

    EI --> UC3

    S --> UC12

    UC3 ..> UC1 : <<include>>
    UC5 ..> UC12 : <<include>>
    UC6 ..> UC12 : <<include>>
    UC8 ..> UC12 : <<include>>
    UC9 ..> UC12 : <<include>>
