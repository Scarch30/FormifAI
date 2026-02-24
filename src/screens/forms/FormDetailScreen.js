import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { templates } from '../../api/client';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';
import { extractItem, toNumber } from '../../utils/apiData';
import { getDocumentName, getFieldsCount, getPagesCount } from '../../utils/entityResolvers';

export default function FormDetailScreen({ route, navigation }) {
  const formId = toNumber(route?.params?.formId, null) ?? toNumber(route?.params?.id, null);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [previewUri, setPreviewUri] = useState('');

  const loadData = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const response = await templates.get(formId);
      const item = extractItem(response) || response?.data || null;
      setData(item);

      try {
        const uri = await templates.getPageImageUrl(formId, 1);
        setPreviewUri(uri || '');
      } catch (_error) {
        setPreviewUri('');
      }
    } catch (error) {
      console.error('Erreur detail formulaire:', error);
      Alert.alert('Erreur', 'Impossible de charger ce formulaire');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [formId, navigation]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleDelete = () => {
    if (!formId) return;
    Alert.alert('Supprimer', 'Supprimer ce formulaire ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await templates.delete(formId);
            navigation.goBack();
          } catch (error) {
            console.error('Erreur suppression formulaire:', error);
            Alert.alert('Erreur', 'Impossible de supprimer ce formulaire');
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

  if (!data) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>Formulaire introuvable</Text>
      </View>
    );
  }

  const profileName = data?.work_profile?.name || data?.workProfile?.name || 'Aucun';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionCard>
        <Text style={styles.title}>{getDocumentName(data)}</Text>
        <Text style={styles.meta}>
          {getPagesCount(data)} pages • {getFieldsCount(data)} champs
        </Text>
      </SectionCard>

      <SectionCard title="Apercu">
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.preview} />
        ) : (
          <View style={styles.previewFallback}>
            <Text style={styles.meta}>Apercu indisponible</Text>
          </View>
        )}
      </SectionCard>

      <SectionCard title="Profil metier">
        <Text style={styles.meta}>Profil metier: {profileName}</Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() =>
            navigation.navigate('ProfilePickerScreen', {
              formId: Number(data?.id),
              currentProfileId: data?.work_profile_id ?? data?.workProfileId ?? null,
            })
          }
        >
          <Text style={styles.secondaryButtonText}>{profileName === 'Aucun' ? 'Associer un profil' : 'Changer'}</Text>
        </TouchableOpacity>
      </SectionCard>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() =>
          navigation.navigate('HomeStack', {
            screen: 'FillWizardScreen',
            params: { preselectedFormId: Number(data?.id) },
          })
        }
      >
        <Text style={styles.primaryButtonText}>✨ Creer un document rempli</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() =>
          navigation.navigate('ResultsStack', {
            screen: 'ResultsListScreen',
            params: { documentId: Number(data?.id) },
          })
        }
      >
        <Text style={styles.secondaryButtonText}>✅ Voir les formulaires deja remplis</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('TemplateEditorScreen', { templateId: Number(data?.id) })}
      >
        <Text style={styles.secondaryButtonText}>Modifier les champs</Text>
      </TouchableOpacity>

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
    paddingBottom: 120,
    gap: 12,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  preview: {
    width: '100%',
    height: 340,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  previewFallback: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
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
