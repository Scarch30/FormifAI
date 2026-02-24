import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { workProfiles } from '../api/client';

const extractItem = (response) => {
  const payload = response?.data?.data || response?.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload.item || payload.result || payload.data || payload;
};

export default function WorkProfileDetailScreen({ route, navigation }) {
  const profileId = route?.params?.profileId || null;
  const isCreateMode = !profileId;
  const [loading, setLoading] = useState(!isCreateMode);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [context, setContext] = useState('');

  const title = useMemo(
    () => (isCreateMode ? 'Nouveau profil' : 'Profil métier'),
    [isCreateMode]
  );

  const loadProfile = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const response = await workProfiles.getOne(profileId);
      const item = extractItem(response);
      if (!item) {
        Alert.alert('Erreur', 'Profil introuvable');
        navigation.goBack();
        return;
      }
      setName(item?.name ? String(item.name) : '');
      setSector(item?.sector ? String(item.sector) : '');
      setContext(item?.context ? String(item.context) : '');
    } catch (error) {
      console.error('Erreur chargement profil:', error);
      Alert.alert('Erreur', 'Impossible de charger le profil');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, profileId]);

  useEffect(() => {
    if (isCreateMode) return;
    loadProfile();
  }, [isCreateMode, loadProfile]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Validation', 'Le nom est obligatoire');
      return;
    }

    const payload = {
      name: trimmedName,
      sector: sector.trim() || null,
      context: context.trim() || null,
    };

    setSaving(true);
    try {
      if (isCreateMode) {
        await workProfiles.create(payload);
        Alert.alert('Succès', 'Profil créé', [{ text: 'OK', onPress: () => navigation.goBack() }]);
        return;
      }

      await workProfiles.update(profileId, payload);
      Alert.alert('Succès', 'Profil mis à jour');
    } catch (error) {
      console.error('Erreur sauvegarde profil:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder ce profil');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (isCreateMode || !profileId) return;
    Alert.alert('Supprimer', 'Voulez-vous supprimer ce profil ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await workProfiles.remove(profileId);
            navigation.goBack();
          } catch (error) {
            console.error('Erreur suppression profil:', error);
            Alert.alert('Erreur', 'Impossible de supprimer ce profil');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Nom</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Nom du profil"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Secteur</Text>
        <TextInput
          style={styles.input}
          value={sector}
          onChangeText={setSector}
          placeholder="Ex: assurance, notariat..."
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Contexte</Text>
        <TextInput
          style={[styles.input, styles.contextInput]}
          value={context}
          onChangeText={setContext}
          placeholder="Contexte métier, règles, vocabulaire..."
          placeholderTextColor="#9CA3AF"
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || deleting}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Enregistrer</Text>
          )}
        </TouchableOpacity>

        {!isCreateMode && (
          <TouchableOpacity
            style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
            onPress={handleDelete}
            disabled={deleting || saving}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.deleteButtonText}>Supprimer</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 60,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  label: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 12,
  },
  contextInput: {
    minHeight: 120,
  },
  saveButton: {
    marginTop: 6,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    marginTop: 10,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
