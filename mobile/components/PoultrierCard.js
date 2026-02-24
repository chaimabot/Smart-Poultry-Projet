import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const PoultrierCard = ({ poulailler }) => {
  const navigation = useNavigation();

  const hasData = poulailler.lastMonitoring && poulailler.lastMonitoring.timestamp;
  const temperature = poulailler.lastMonitoring?.temperature;
  const humidity = poulailler.lastMonitoring?.humidity;
  const lastUpdated = poulailler.lastMonitoring?.timestamp 
    ? new Date(poulailler.lastMonitoring.timestamp).toLocaleTimeString('fr-FR')
    : 'Données en attente...';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('PoultryDetail', { id: poulailler._id })}
    >
      <View style={styles.header}>
        <Text style={styles.name}>{poulailler.name}</Text>
        <Text style={styles.location}>{poulailler.location}</Text>
      </View>

      {hasData ? (
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.label}>Température</Text>
            <Text style={styles.value}>{temperature}°C</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.label}>Humidité</Text>
            <Text style={styles.value}>{humidity}%</Text>
          </View>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Données en attente...</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.timestamp}>Mis à jour: {lastUpdated}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    elevation: 3,
  },
  header: {
    marginBottom: 15,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  location: {
    fontSize: 12,
    color: '#666',
    marginTop: 3,
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  metric: {
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: '#999',
    marginBottom: 3,
  },
  value: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  placeholder: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  placeholderText: {
    color: '#ccc',
    fontSize: 12,
  },
  footer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
  },
});

export default PoultrierCard;
