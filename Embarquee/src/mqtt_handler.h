#pragma once
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "sensors.h"
#include "actuators.h"

/**
 * @brief Initialise les paramètres MQTT (Broker, Port, Topics)
 * @param client Référence vers le client PubSubClient
 * @param sClient Référence vers le client WiFi sécurisé (SSL)
 */
void mqtt_init(PubSubClient& client, WiFiClientSecure& sClient);

/**
 * @brief Gère la boucle de maintenance (reconnexion et callback)
 * @param client Référence vers le client PubSubClient
 */
void mqtt_loop(PubSubClient& client);

/**
 * @brief Publie les données des capteurs sur le cloud
 * @param client Référence vers le client PubSubClient
 * @param data Structure contenant les mesures (temp, eau, co2, etc.)
 */
void mqtt_publishMeasures(PubSubClient& client, const SensorData& data);

/**
 * @brief Publie l'état actuel des actionneurs (relais, porte)
 * @param client Référence vers le client PubSubClient
 * @param state Structure de l'état actuel
 */
void mqtt_publishStatus(PubSubClient& client, const ActuatorState& state);

/**
 * @brief Fonction de retour pour les messages entrants (commandes)
 * @param topic Le topic sur lequel le message est arrivé
 * @param payload Le contenu du message
 * @param length La longueur du message
 */
void onMessage(char* topic, byte* payload, unsigned int length);

// --- Déclaration des Topics en mode externe pour accès global ---
extern String TOPIC_MEASURES;
extern String TOPIC_STATUS;
extern String TOPIC_CMD_LAMP;
extern String TOPIC_CMD_PUMP;
extern String TOPIC_CMD_FAN;
extern String TOPIC_CMD_DOOR;
extern String TOPIC_CONFIG;