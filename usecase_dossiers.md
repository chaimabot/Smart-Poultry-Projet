useCaseDiagram
actor "Admin" as A
actor "Éleveur" as E

    rectangle "Gestion des Dossiers" {
        usecase "Voir la liste des dossiers" as UC1
        usecase "Valider un dossier" as UC2
        usecase "Annuler un dossier" as UC3
        usecase "Clôturer un dossier" as UC4
        usecase "Modifier les montants" as UC5
        usecase "Imprimer le contrat" as UC6
        usecase "Filtrer par statut" as UC7
        usecase "Envoyer un email de confirmation" as UC8
        usecase "Générer le n° de contrat" as UC9
    }

    A --> UC1
    A --> UC2
    A --> UC3
    A --> UC4
    A --> UC5
    A --> UC6
    A --> UC7

    E --> UC1

    UC2 ..> UC8 : <<include>>
    UC2 ..> UC9 : <<include>>
