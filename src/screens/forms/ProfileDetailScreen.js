import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { workProfiles } from '../../api/client';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';
import { extractItem, toNumber } from '../../utils/apiData';

export default function ProfileDetailScreen({ route, navigation }) {
  const profileId = toNumber(route?.params?.profileId, null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState('');
  const [context, setContext] = useState('');

  const loadProfile = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const response = await workProfiles.getOne(profileId);
      const item = extractItem(response) || response?.data || null;
      if (!item) {
        Alert.alert('Erreur', 'Profil introuvable');
        navigation.goBack();
        return;
      }
      setName(String(item?.name || ''));
      setContext(String(item?.context || ''));
    } catch (error) {
      console.error('Erreur detail profil:', error);
      Alert.alert('Erreur', 'Impossible de charger ce profil');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, profileId]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSave = async () => {
    if (!profileId) return;
    if (!name.trim()) {
      Alert.alert('Validation', 'Le nom est obligatoire');
      return;
    }

    setSaving(true);
    try {
      await workProfiles.update(profileId, {
        name: name.trim(),
        context: context.trim(),
      });
      setEditing(false);
      Alert.alert('Succes', 'Profil mis a jour');
    } catch (error) {
      console.error('Erreur update profil:', error);
      Alert.alert('Erreur', 'Impossible de mettre a jour ce profil');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!profileId) return;
    Alert.alert('Supprimer', 'Supprimer ce profil ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await workProfiles.remove(profileId);
            navigation.goBack();
          } catch (error) {
            console.error('Erreur suppression profil:', error);
            Alert.alert('Erreur', 'Impossible de supprimer ce profil');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionCard title="Profil metier">
        {editing ? (
          <>
            <Text style={styles.label}>Nom</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nom du profil"
              placeholderTextColor={Colors.textTertiary}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={context}
              onChangeText={setContext}
              multiline
              textAlignVertical="top"
              placeholder="Contexte metier"
              placeholderTextColor={Colors.textTertiary}
            />
          </>
        ) : (
          <>
            <Text style={styles.name}>{name || 'Sans nom'}</Text>
            <Text style={styles.context}>{context || 'Aucune description'}</Text>
          </>
        )}
      </SectionCard>

      {editing ? (
        <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Enregistrer</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.primaryButton} onPress={() => setEditing(true)}>
          <Text style={styles.primaryButtonText}>Modifier</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.secondaryButton, styles.deleteButton]} onPress={handleDelete}>
        <Text style={[styles.secondaryButtonText, styles.deleteText]}>Supprimer</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  name: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  context: {
    marginTop: 8,
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    marginBottom: 6,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    marginBottom: 12,
  },
  textArea: {
    minHeight: 140,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
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
  deleteButton: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  deleteText: {
    color: Colors.error,
  },
});
