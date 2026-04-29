useCaseDiagram
actor "Admin" as A
actor "Éleveur" as E
actor "ESP32" as ESP

    rectangle "Gestion des Modules" {
        usecase "Créer un module" as UC1
        usecase "Associer un module (claim)" as UC2
        usecase "Dissocier un module" as UC3
        usecase "Supprimer un module" as UC4
        usecase "Voir la liste des modules" as UC5
        usecase "Scanner le QR code" as UC6
        usecase "Décoder le QR code" as UC7
        usecase "Détecter la connexion MQTT" as UC8
        usecase "Publier les mesures" as UC9
        usecase "Mettre à jour le ping" as UC10
        usecase "Générer le claimCode" as UC11
    }

    A --> UC1
    A --> UC2
    A --> UC3
    A --> UC4
    A --> UC5

    E --> UC2
    E --> UC5
    E --> UC6

    ESP --> UC8
    ESP --> UC9
    ESP --> UC10

    UC1 ..> UC11 : <<include>>
    UC2 ..> UC7 : <<include>>
    UC6 ..> UC7 : <<include>>
    UC9 ..> UC10 : <<include>>
