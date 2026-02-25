import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { workProfiles } from '../api/client';

const extractList = (response) => {
  const payload = response?.data?.data || response?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const getItemName = (item) => item?.name || `Profil #${item?.id ?? ''}`;

export default function WorkProfilesScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadItems = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await workProfiles.list();
      setItems(extractList(response));
    } catch (error) {
      console.error('Erreur chargement profils:', error);
      if (!silent) {
        Alert.alert('Erreur', 'Impossible de charger les profils');
      }
      setItems([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems({ silent: true });
    setRefreshing(false);
  };

  const renderItem = ({ item }) => {
    const sector = item?.sector ? String(item.sector) : '';
    const context = item?.context ? String(item.context) : '';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('WorkProfileDetailScreen', { profileId: item?.id })}
      >
        <Text style={styles.cardTitle} numberOfLines={1}>
          {getItemName(item)}
        </Text>
        <Text style={styles.cardSector} numberOfLines={1}>
          {sector || 'Secteur non défini'}
        </Text>
        <Text style={styles.cardContext} numberOfLines={2}>
          {context || 'Aucun contexte'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profils métier</Text>
        <TouchableOpacity onPress={() => navigation.navigate('WorkProfileDetailScreen')}>
          <Text style={styles.addButton}>＋</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item, index) => String(item?.id ?? index)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Aucun profil pour le moment</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#4F46E5',
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  addButton: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  list: {
    padding: 15,
    paddingBottom: 26,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  cardSector: {
    marginTop: 5,
    fontSize: 12,
    color: '#4B5563',
  },
  cardContext: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  emptyWrap: {
    marginTop: 120,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
});
