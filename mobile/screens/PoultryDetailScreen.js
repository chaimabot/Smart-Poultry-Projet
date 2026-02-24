import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { getPoultryDetails } from '../services/poultry';
import SensorCard from '../components/SensorCard';
import TrendChart from '../components/TrendChart';

const PoultryDetailScreen = ({ route }) => {
  const { id } = route.params;
  const [poultry, setPoultry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`[PoultryDetail] Récupération données poulailler ${id}...`);
      const data = await getPoultryDetails(id);
      
      console.log(`[PoultryDetail] Données:`, data);
      setPoultry(data);
    } catch (err) {
      console.error(`[PoultryDetail] Erreur:`, err.message);
      setError('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    const interval = setInterval(fetchData, 30000);
    
    return () => clearInterval(interval);
  }, [id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading && !poultry) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={{ marginTop: 10 }}>Chargement...</Text>
      </View>
    );
  }

  if (!poultry) {
    return (
      <View style={styles.center}>
        <Text style={{ color: 'red' }}>{error || 'Poulailler non trouvé'}</Text>
      </View>
    );
  }

  const monitoring = poultry.lastMonitoring;
  const hasData = monitoring && monitoring.timestamp;

  const sensors = [
    { label: 'Température', value: monitoring?.temperature, unit: '°C', icon: '🌡️' },
    { label: 'Humidité', value: monitoring?.humidity, unit: '%', icon: '💧' },
    { label: 'CO2', value: monitoring?.co2, unit: 'ppm', icon: '💨' },
    { label: 'NH3', value: monitoring?.nh3, unit: 'ppm', icon: '🔬' },
    { label: 'Poussière', value: monitoring?.dust, unit: 'mg/m³', icon: '✨' },
    { label: 'Eau', value: monitoring?.waterLevel, unit: '%', icon: '🚰' },
  ];

  const lastUpdated = monitoring?.timestamp
    ? new Date(monitoring.timestamp).toLocaleString('fr-FR')
    : 'Données en attente...';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{poultry.name}</Text>
        <Text style={styles.subtitle}>{poultry.location}</Text>
      </View>

      <View style={styles.statusBar}>
        <Text style={styles.lastUpdate}>
          Dernière mise à jour: {lastUpdated}
        </Text>
      </View>

      {hasData ? (
        <>
          <View style={styles.sensorsGrid}>
            {sensors.map((sensor, index) => (
              <SensorCard
                key={index}
                label={sensor.label}
                value={sensor.value}
                unit={sensor.unit}
                icon={sensor.icon}
              />
            ))}
          </View>

          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>Tendance Température (24h)</Text>
            <TrendChart poultryId={id} metric="temperature" />
          </View>
        </>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            ⏳ En attente des données du capteur...
          </Text>
          <Text style={styles.placeholderSubtext}>
            Assurez-vous que l'ESP32 est alimenté et connecté au réseau MQTT
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#0066cc',
    padding: 20,
    paddingTop: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#ddd',
    marginTop: 5,
  },
  statusBar: {
    backgroundColor: '#fff',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  sensorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  chartSection: {
    padding: 15,
    backgroundColor: '#fff',
    margin: 10,
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  placeholder: {
    padding: 40,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  placeholderSubtext: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 10,
    textAlign: 'center',
  },
});

export default PoultryDetailScreen;
