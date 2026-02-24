import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { templates } from '../api/client';

export default function TemplateSetupScreen({ route, navigation }) {
  const routeParams = route?.params || {};
  const { templateId, ...forwardParams } = routeParams;
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const normalizeTemplate = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    return payload.template || payload.item || payload.result || payload.data || payload;
  };

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const response = await templates.get(templateId);
      const raw = response?.data?.data || response?.data;
      const data = normalizeTemplate(raw);
      setDescription(data?.description || '');
    } catch (error) {
      console.error('Erreur chargement template:', error);
      Alert.alert('Erreur', 'Impossible de charger le formulaire');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, templateId]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  const handleContinue = async () => {
    setSaving(true);
    try {
      await templates.update(templateId, { description });
      navigation.replace('TemplateEditorScreen', { templateId, ...forwardParams });
    } catch (error) {
      console.error('Erreur sauvegarde description:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder la description');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuration du template</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#4F46E5" />
        ) : (
          <>
            <Text style={styles.label}>Décrivez ce formulaire en quelques phrases</Text>
            <TextInput
              style={styles.input}
              multiline
              placeholder="Ex: Formulaire de recueil patrimonial pour CGP. Contient les infos du client, conjoint, enfants, patrimoine immobilier et financier, revenus et charges."
              value={description}
              onChangeText={setDescription}
            />
            <Text style={styles.helper}>Cette description aide l'IA à mieux comprendre vos champs</Text>
          </>
        )}
      </View>

      <TouchableOpacity
        style={[styles.button, (saving || loading) && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={saving || loading}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continuer</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  backButton: {
    fontSize: 16,
    color: '#4F46E5',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    width: 60,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    minHeight: 140,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    fontSize: 14,
    color: '#111827',
  },
  helper: {
    marginTop: 10,
    fontSize: 12,
    color: '#6b7280',
  },
  button: {
    margin: 20,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
