import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { transcriptions, templates, formFills } from '../api/client';
import SelectionModal from '../components/SelectionModal';

const extractList = (response) => {
  const payload = response?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const extractItem = (response) => {
  const payload = response?.data?.data || response?.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload.item || payload.result || payload.data || payload;
};

const getTranscriptionTitle = (item) =>
  item?.title ||
  item?.document_name ||
  item?.documentName ||
  item?.session_name ||
  item?.sessionName ||
  `Transcription #${item?.id ?? ''}`;

const getDocumentName = (item) =>
  item?.name ||
  item?.title ||
  item?.document_name ||
  item?.documentName ||
  item?.original_name ||
  item?.originalName ||
  item?.filename ||
  item?.file_name ||
  item?.fileName ||
  `Document #${item?.id ?? ''}`;

const formatDate = (value) => {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const remain = Math.round(value % 60);
  return `${minutes}m ${remain}s`;
};

const extractTemplateFieldsCount = (payload) => {
  if (!payload || typeof payload !== 'object') return 0;
  const resolved = payload.item || payload.result || payload.data || payload.template || payload;
  if (Array.isArray(resolved?.fields)) return resolved.fields.length;
  if (Array.isArray(resolved?.template_fields)) return resolved.template_fields.length;
  if (Array.isArray(resolved?.template?.fields)) return resolved.template.fields.length;
  return 0;
};

export default function TranscriptionsScreen({ navigation }) {
  const [data, setData] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [fillPickerVisible, setFillPickerVisible] = useState(false);
  const [fillPickerTranscription, setFillPickerTranscription] = useState(null);
  const [fillableDocuments, setFillableDocuments] = useState([]);
  const [loadingFillableDocuments, setLoadingFillableDocuments] = useState(false);
  const [fillActionKey, setFillActionKey] = useState('');

  const loadTranscriptions = async () => {
    try {
      const response = await transcriptions.list();
      setData(extractList(response));
    } catch (error) {
      if (Number(error?.response?.status) !== 404) {
        console.error('Erreur chargement transcriptions:', error);
      }
      setData([]);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTranscriptions();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTranscriptions();
    setRefreshing(false);
  };

  const loadFillableDocuments = async () => {
    setLoadingFillableDocuments(true);
    try {
      const documentsResponse = await templates.listDocuments();
      const documents = extractList(documentsResponse);
      const candidates = documents.filter(
        (item) => item?.applied_template_id || item?.appliedTemplateId
      );

      const uniqueTemplateIds = [
        ...new Set(
          candidates
            .map((item) => item?.applied_template_id || item?.appliedTemplateId)
            .filter(Boolean)
        ),
      ];
      const fieldsCountByTemplate = {};

      await Promise.all(
        uniqueTemplateIds.map(async (templateId) => {
          try {
            const response = await templates.get(templateId);
            const payload = response?.data?.data || response?.data;
            fieldsCountByTemplate[templateId] = extractTemplateFieldsCount(payload);
          } catch (error) {
            fieldsCountByTemplate[templateId] = 0;
          }
        })
      );

      const selectionItems = candidates.map((item) => {
        const templateId = item?.applied_template_id || item?.appliedTemplateId;
        const templateName =
          item?.applied_template_name ||
          item?.appliedTemplateName ||
          `Template #${templateId}`;
        const fieldsCount = fieldsCountByTemplate[templateId] || 0;

        return {
          id: item.id,
          raw: item,
          title: getDocumentName(item),
          subtitle: `Template applique: ${templateName}`,
          meta: `${fieldsCount} champs`,
        };
      });

      setFillableDocuments(selectionItems);
    } catch (error) {
      console.error('Erreur chargement documents pour remplissage:', error);
      Alert.alert('Erreur', 'Impossible de charger les formulaires');
      setFillableDocuments([]);
    } finally {
      setLoadingFillableDocuments(false);
    }
  };

  const openFillPicker = async (transcriptionItem) => {
    setFillPickerTranscription(transcriptionItem);
    setFillPickerVisible(true);
    await loadFillableDocuments();
  };

  const closeFillPicker = () => {
    setFillPickerVisible(false);
    setFillPickerTranscription(null);
    setFillableDocuments([]);
  };

  const handleCreateFillFromTranscription = async (selectedDocument) => {
    const transcriptionItem = fillPickerTranscription;
    const documentItem = selectedDocument?.raw || selectedDocument;
    if (!transcriptionItem?.id || !documentItem?.id) return;
    if (fillActionKey) return;

    const actionId = `trans-fill-${transcriptionItem.id}-${documentItem.id}`;
    setFillActionKey(actionId);

    try {
      const response = await formFills.createFormFill(
        documentItem.id,
        'transcription',
        transcriptionItem.id
      );
      const created = extractItem(response);
      if (!created?.id) {
        Alert.alert('Erreur', 'Le remplissage a ete cree, mais ouverture impossible.');
        return;
      }
      closeFillPicker();
      navigation.navigate('FormFill', { formFillId: created.id });
    } catch (error) {
      console.error('Erreur creation form fill (depuis transcription):', error);
      Alert.alert('Erreur', 'Impossible de lancer le remplissage');
    } finally {
      setFillActionKey('');
    }
  };

  const handleDeleteTranscription = (item) => {
    if (!item?.id) return;
    if (deletingId) return;
    const itemLabel = getTranscriptionTitle(item);

    Alert.alert(
      'Supprimer la transcription',
      `Voulez-vous supprimer "${itemLabel}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              await transcriptions.delete(item.id);
              setData((prev) => prev.filter((entry) => entry.id !== item.id));
              await loadTranscriptions();
            } catch (error) {
              console.error('Erreur suppression transcription:', error);
              Alert.alert('Erreur', 'Impossible de supprimer la transcription');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready':
        return '#10B981';
      case 'transcribing':
        return '#F59E0B';
      case 'completed':
        return '#3B82F6';
      case 'error':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending':
        return 'En attente';
      case 'transcribing':
        return 'Transcription...';
      case 'ready':
        return 'Pret';
      case 'validated':
        return 'Valide';
      case 'completed':
        return 'Termine';
      case 'error':
        return 'Erreur';
      default:
        return status || 'Inconnu';
    }
  };

  const renderItem = ({ item }) => {
    const isDeleting = deletingId === item.id;
    const isCreatingFill = fillActionKey.startsWith(`trans-fill-${item.id}-`);

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardMain}
          onPress={() => navigation.navigate('Transcription', { id: item.id })}
          disabled={isDeleting || isCreatingFill}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{getTranscriptionTitle(item)}</Text>
            <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.badgeText}>{getStatusLabel(item.status)}</Text>
            </View>
          </View>
          <Text style={styles.cardDate}>{formatDate(item?.created_at || item?.createdAt)}</Text>
          {item.transcription_text && (
            <Text style={styles.cardPreview} numberOfLines={2}>
              {item.transcription_text}
            </Text>
          )}
          {formatDuration(item?.audio_duration_seconds || item?.audioDurationSeconds) && (
            <Text style={styles.cardMeta}>
              Duree: {formatDuration(item?.audio_duration_seconds || item?.audioDurationSeconds)}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary, styles.actionButtonGap]}
            onPress={() => navigation.navigate('Transcription', { id: item.id })}
            disabled={isDeleting || isCreatingFill}
          >
            <Text style={styles.actionButtonText}>Ouvrir</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.actionButtonDanger,
              (isDeleting || isCreatingFill) && styles.actionButtonDisabled,
            ]}
            onPress={() => handleDeleteTranscription(item)}
            disabled={isDeleting || isCreatingFill}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>Supprimer</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonFill]}
            onPress={() => openFillPicker(item)}
            disabled={isDeleting || isCreatingFill}
          >
            {isCreatingFill ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>Remplir un formulaire</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes transcriptions</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item?.id?.toString() || `${getTranscriptionTitle(item)}-${item?.created_at || ''}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune transcription</Text>
            <Text style={styles.emptySubtext}>Appuyez sur + pour enregistrer</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Record')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <SelectionModal
        visible={fillPickerVisible}
        title="Choisir un formulaire"
        subtitle={fillPickerTranscription ? getTranscriptionTitle(fillPickerTranscription) : ''}
        items={fillableDocuments}
        loading={loadingFillableDocuments || Boolean(fillActionKey)}
        onSelect={handleCreateFillFromTranscription}
        onClose={closeFillPicker}
        searchPlaceholder="Rechercher un formulaire..."
        emptyText="Aucun document avec template applique"
      />
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
    padding: 20,
    paddingTop: 60,
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
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 60,
  },
  list: {
    padding: 15,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardMain: {
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  cardDate: {
    color: '#666',
    fontSize: 13,
    marginBottom: 8,
  },
  cardPreview: {
    color: '#444',
    fontSize: 14,
    lineHeight: 20,
  },
  cardMeta: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  cardActions: {
    marginTop: 12,
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonGap: {
    marginRight: 8,
  },
  actionButtonPrimary: {
    backgroundColor: '#4F46E5',
  },
  actionButtonDanger: {
    backgroundColor: '#EF4444',
  },
  actionButtonFill: {
    backgroundColor: '#111827',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#999',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
    marginTop: -2,
  },
});
