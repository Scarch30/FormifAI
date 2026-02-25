import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { templates, workProfiles } from '../../api/client';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';
import { toNumber } from '../../utils/apiData';

export default function ProfileCreateScreen({ route, navigation }) {
  const linkToFormId = toNumber(route?.params?.linkToFormId, null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => name.trim().length > 0 && description.trim().length > 0, [name, description]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const response = await workProfiles.create({
        name: name.trim(),
        context: description.trim(),
      });
      const created = response?.data?.data || response?.data?.item || response?.data;
      const profileId = Number(created?.id);

      if (linkToFormId && Number.isFinite(profileId)) {
        await templates.update(linkToFormId, { work_profile_id: profileId });
        navigation.replace('FormDetailScreen', { formId: Number(linkToFormId) });
        return;
      }

      if (Number.isFinite(profileId)) {
        navigation.replace('ProfileDetailScreen', { profileId });
        return;
      }

      Alert.alert('Info', 'Profil cree, mais identifiant introuvable.');
      navigation.goBack();
    } catch (error) {
      console.error('Erreur creation profil:', error);
      Alert.alert('Erreur', 'Impossible de creer ce profil');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionCard title="Creer un profil metier">
        <Text style={styles.label}>Nom</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ex: CGP – Bilan patrimonial"
          placeholderTextColor={Colors.textTertiary}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Decrivez le metier, les termes, et ce qui compte dans ce type de formulaire."
          placeholderTextColor={Colors.textTertiary}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.hint}>Plus le contexte est detaille, plus l'IA sera precise.</Text>
      </SectionCard>

      <TouchableOpacity
        style={[styles.primaryButton, (!canSave || saving) && styles.primaryButtonDisabled]}
        onPress={handleSave}
        disabled={!canSave || saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Enregistrer</Text>
        )}
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
  hint: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: -2,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
