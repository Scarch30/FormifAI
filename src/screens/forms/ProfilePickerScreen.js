import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { templates, workProfiles } from '../../api/client';
import Colors from '../../constants/Colors';
import EmptyState from '../../components/EmptyState';
import { extractList, toNumber } from '../../utils/apiData';

export default function ProfilePickerScreen({ route, navigation }) {
  const formId = toNumber(route?.params?.formId, null);
  const currentProfileId = route?.params?.currentProfileId ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(currentProfileId);

  const selectedNumeric = useMemo(() => (selectedId === null ? null : Number(selectedId)), [selectedId]);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await workProfiles.list();
      setItems(extractList(response));
    } catch (error) {
      console.error('Erreur chargement profils picker:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles])
  );

  const applySelection = async () => {
    if (!formId) return;
    setSaving(true);
    try {
      await templates.update(formId, {
        work_profile_id: selectedNumeric,
      });

      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('FormDetailScreen', { formId: Number(formId) });
      }
    } catch (error) {
      console.error('Erreur association profil:', error);
      Alert.alert('Erreur', 'Impossible d\'associer ce profil');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Associer un profil</Text>
        <Text style={styles.subtitle}>Choisissez le profil metier du formulaire.</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={[{ id: null, name: 'Aucun profil', context: '' }, ...items]}
          keyExtractor={(item, index) => `${String(item?.id)}-${index}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const itemId = item?.id === null ? null : Number(item?.id);
            const selected = selectedNumeric === itemId;
            return (
              <TouchableOpacity style={styles.card} onPress={() => setSelectedId(itemId)}>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{item?.name || 'Sans nom'}</Text>
                  {item?.context ? (
                    <Text style={styles.cardContext} numberOfLines={2}>{item.context}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="👤"
              title="Aucun profil"
              subtitle="Créez un profil metier pour l'associer au formulaire."
              actions={[{ label: 'Créer un profil', onPress: () => navigation.navigate('ProfileCreateScreen', { linkToFormId: formId }) }]}
            />
          }
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('ProfileCreateScreen', { linkToFormId: formId })}
        >
          <Text style={styles.secondaryButtonText}>Créer un nouveau profil</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.primaryButton, saving && styles.primaryButtonDisabled]} onPress={applySelection} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Appliquer</Text>
          )}
        </TouchableOpacity>
      </View>
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cardContext: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#fff',
    padding: 12,
    gap: 8,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
