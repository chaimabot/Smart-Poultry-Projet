import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SensorCard = ({ label, value, unit, icon }) => {
  const isAvailable = value !== null && value !== undefined;

  return (
    <View style={styles.card}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label}>{label}</Text>
      {isAvailable ? (
        <Text style={styles.value}>
          {typeof value === 'number' ? value.toFixed(1) : 'N/A'}{unit}
        </Text>
      ) : (
        <Text style={styles.noData}>--</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 15,
    marginHorizontal: '1%',
    marginVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    elevation: 2,
  },
  icon: {
    fontSize: 32,
    marginBottom: 5,
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
    textAlign: 'center',
  },
  value: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  noData: {
    fontSize: 16,
    color: '#ccc',
  },
});

export default SensorCard;
