import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { workProfiles } from '../../api/client';
import Colors from '../../constants/Colors';
import EmptyState from '../../components/EmptyState';
import { extractList } from '../../utils/apiData';

export default function ProfilesListScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await workProfiles.list();
      setItems(extractList(response));
    } catch (error) {
      console.error('Erreur chargement profils:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Profils metier</Text>
          <Text style={styles.subtitle}>Contexte et vocabulaire pour aider l'IA a remplir correctement.</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('ProfileCreateScreen')}>
        <Text style={styles.createButtonText}>Créer un profil</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => String(item?.id || index)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('ProfileDetailScreen', { profileId: Number(item?.id) })}
            >
              <Text style={styles.cardTitle} numberOfLines={1}>{item?.name || `Profil #${item?.id}`}</Text>
              <Text style={styles.cardContext} numberOfLines={2}>{item?.context || 'Aucune description'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="👤"
              title="Aucun profil metier"
              subtitle="Un profil aide l'IA a comprendre le contexte du formulaire."
              actions={[{ label: 'Créer un profil', onPress: () => navigation.navigate('ProfileCreateScreen') }]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 15,
  },
  createButton: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    paddingVertical: 12,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cardContext: {
    marginTop: 5,
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
