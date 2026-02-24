import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { getPoultries } from '../services/poultry';
import PoultrierCard from '../components/PoultrierCard';

const DashboardScreen = () => {
  const [poulaillers, setPoulaillers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[Dashboard] Récupération des poulaillers...');
      const data = await getPoultries();
      
      console.log('[Dashboard] Donnees reçues:', data);
      setPoulaillers(data);
    } catch (err) {
      console.error('[Dashboard] Erreur:', err.message);
      setError('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    const interval = setInterval(fetchData, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading && poulaillers.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={{ marginTop: 10 }}>Chargement des données...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={poulaillers}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <PoultrierCard poulailler={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text>Aucun poulailler trouvé</Text>
          </View>
        }
        ListFooterComponent={error ? <Text style={{ color: 'red', padding: 10 }}>{error}</Text> : null}
      />
    </View>
  );
};

export default DashboardScreen;
