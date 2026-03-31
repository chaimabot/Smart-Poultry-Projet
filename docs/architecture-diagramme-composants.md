# Architecture Logique - Smart Poultry

## 1. Architecture Materielle - Module ESP32

```
+-------------------------------------------------------------+
|                        MODULE ESP32                         |
|  +-------------+    +-------------+    +-------------+     |
|  |   ESP32     |--> |    WiFi     |--> |  WebSocket  |     |
|  +-------------+    +-------------+    +-------------+     |
+-------------------------------------------------------------+
              |              |              |
              v              v              v
    +-----------------+ +----------+ +--------------+
    CAPTEURS          ACTIONNEURS   PROTOCOLES
- DHT22: Temp/Hum   - Porte(SRV)  -> WebSocket: heartbeat temps reel
- MG811/MH-Z19: CO2 - Ventilo(RLY)-> WebSocket: mesures en temps reel
- MQ-137: NH3                  -> HTTPS: claim / association
- DSM501A: dust                <- WebSocket: commandes push
- HC-SR04: Eau
```

## 2. Architecture Systeme - Protocoles HTTPS et WebSocket

```
+---------------+          WebSocket (:8080)          REST (:5000)        MongoDB
+---------------+               ^                       ^                ^
       ESP32 <-----------------> Backend (Express) <-----> API REST ---- Database
       Module        (Real-time IoT Data)              (HTTPS)
                                                        ^
                                                        v
                                              Frontend Web/Mobile/Admin


Backend Express.js:
+------------------+------------------+--------------------+
 Routes API REST   Controllers         Models
+------------------+------------------+--------------------+
 /api/auth         authController      User, Module,
 /api/poulaillers  poulaillersCtrl     Poulailler, Measure
 /api/modules      modulesCtrl         Command, Alert...
 /api/alerts       alertsCtrl
 /api/system-config...
+------------------+------------------+--------------------+

WebSocket Service:
 - Connexion persistante pour chaque module
 - Reception temps reel: heartbeat, mesures
 - Emission temps reel: commandes

ESP32 Firmware Protocol (via WebSocket):
 CONNECTION etablit connexion WebSocket vers le backend
 HEARTBEAT envoye en temps reel {status, RSSI}
 MEASURES envoye en temps reel (temp, hum, CO2, NH3, dust, waterLevel)
 COMMANDS recues en push depuis le backend
```

## Flux de Communication - Cycle de Vie Module

```
1.DISCOVER          2.CLAIM             3.FONCTIONNEMENT
+----+             ----+----             --------+---------+
ESP32                QR Code                  WebSocket Connect
publish discovery                            Heartbeat temps reel
{serial,MAC}                                Measures temp/hum/co2/nh3/dust/waterLevel
v                     v                       v
Module pending ---> Module associated ---> online (connexion active)

Actions recues en temps reel via WebSocket:
 porte/open-close ventilation/on-off etc.
```

## Modele de Donnees - Relations ER

```
USER (owner) ----> POULAILLER <---- MODULE (associated_to)
                           ^
                           :
                      MEASURE records
                      COMMAND executes
                      ALERT generates
```

## Recapitulatif des Composants Sprint1

### Hardware ESP32:

DHT22 temperature/humidite , MG811 CO2 , MQ137 ammoniac , DSM501A poussieres ,
HC-SR04 niveau eau , Servomoteur porte , Ventilateur relay

### Backend Software:

**Routes:**
POST /api/auth/register login GET/me PUT/updateDetails updatePassword  
 GET POST /api/poulaillers PUT DELETE
GET POST PUT api/modules generateClaim associate claim revoke dissociate  
 GET POST/PUT api/alerts markRead toggleCritical

**Controllers:**authController,poulaillersController,
modulesController,alertsController

**Models:**User.Module,Poulailler.Measure.Command.Alert.SystemConfig

**Services:**websocketService.js communication IoT en temps reel

### Base de donnees MongoDB Collections:

users, modules, poulaillers, measures, commands,
alerts systemConfigs
