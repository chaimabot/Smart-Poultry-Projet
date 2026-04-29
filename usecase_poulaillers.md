useCaseDiagram
actor "Admin" as A
actor "Éleveur" as E

    rectangle "Gestion des Poulaillers" {
        usecase "Voir la liste des poulaillers" as UC1
        usecase "Ajouter un poulailler" as UC2
        usecase "Modifier un poulailler" as UC3
        usecase "Supprimer un poulailler (soft)" as UC4
        usecase "Voir les détails d'un poulailler" as UC5
        usecase "Rechercher un poulailler" as UC6
        usecase "Filtrer par statut" as UC7
        usecase "Générer le code unique POL-XXXXXX" as UC8
    }

    A --> UC1
    A --> UC2
    A --> UC3
    A --> UC4
    A --> UC5
    A --> UC6
    A --> UC7

    E --> UC5
    E --> UC1

    UC2 ..> UC8 : <<include>>
