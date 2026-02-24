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
import { formFills } from '../api/client';

const extractList = (response) => {
  const payload = response?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

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

const getStatusLabel = (status) => {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'processing':
      return 'En cours';
    case 'done':
      return 'Termine';
    case 'error':
      return 'Erreur';
    default:
      return status || 'Inconnu';
  }
};

const getStatusColor = (status) => {
  switch (status) {
    case 'pending':
      return '#6B7280';
    case 'processing':
      return '#F59E0B';
    case 'done':
      return '#10B981';
    case 'error':
      return '#EF4444';
    default:
      return '#6B7280';
  }
};

const resolveSourceType = (item) => {
  const explicitType = String(item?.source_type || item?.sourceType || '').toLowerCase();
  if (explicitType) return explicitType;
  if (item?.transcription_id || item?.transcriptionId) return 'transcription';
  if (item?.ocr_document_id || item?.ocrDocumentId) return 'ocr';
  if (item?.source_form_fill_id || item?.sourceFormFillId) return 'form_fill';
  return 'transcription';
};

const getSourceIcon = (sourceType) => {
  switch (sourceType) {
    case 'transcription':
      return '🎤';
    case 'ocr':
      return '📷';
    case 'form_fill':
      return '📋';
    default:
      return '•';
  }
};

const getSourceLabel = (sourceType) => {
  switch (sourceType) {
    case 'transcription':
      return 'Transcription';
    case 'ocr':
      return 'OCR';
    case 'form_fill':
      return 'Formulaire';
    default:
      return 'Source';
  }
};

const getSourceDisplayName = (item, sourceType) => {
  const sourceId =
    item?.source_id ??
    item?.sourceId ??
    item?.transcription_id ??
    item?.transcriptionId ??
    item?.ocr_document_id ??
    item?.ocrDocumentId ??
    item?.source_form_fill_id ??
    item?.sourceFormFillId ??
    '';

  if (sourceType === 'transcription') {
    return item?.transcription_title || item?.transcriptionTitle || `Transcription #${sourceId}`;
  }
  if (sourceType === 'ocr') {
    return (
      item?.ocr_document_title ||
      item?.ocrDocumentTitle ||
      item?.ocr_title ||
      item?.ocrTitle ||
      item?.source_title ||
      item?.sourceTitle ||
      `Document OCR #${sourceId}`
    );
  }
  if (sourceType === 'form_fill') {
    return (
      item?.source_form_fill_name ||
      item?.sourceFormFillName ||
      item?.source_form_fill_title ||
      item?.sourceFormFillTitle ||
      item?.source_form_fill_document_name ||
      item?.sourceFormFillDocumentName ||
      `Formulaire #${sourceId}`
    );
  }
  return item?.source_title || item?.sourceTitle || `Source #${sourceId}`;
};

export default function FormFillsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadItems = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await formFills.listFormFills();
      setItems(extractList(response));
    } catch (error) {
      console.error('Erreur chargement form fills:', error);
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

  const handleDelete = useCallback(
    (item) => {
      if (!item?.id || deletingId) return;
      const title = item?.document_name || `Remplissage #${item.id}`;
      Alert.alert(
        'Supprimer ce remplissage ?',
        `${title}\n\nCette action est irreversible.`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: async () => {
              setDeletingId(item.id);
              try {
                await formFills.deleteFormFill(item.id);
                setItems((prev) => prev.filter((entry) => entry?.id !== item.id));
              } catch (error) {
                console.error('Erreur suppression form fill:', error);
                Alert.alert('Erreur', 'Impossible de supprimer ce remplissage');
              } finally {
                setDeletingId(null);
              }
            },
          },
        ]
      );
    },
    [deletingId]
  );

  const renderItem = ({ item }) => {
    const sourceType = resolveSourceType(item);
    const sourceIcon = getSourceIcon(sourceType);
    const sourceLabel = getSourceLabel(sourceType);
    const sourceDisplayName = getSourceDisplayName(item, sourceType);

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardPressArea}
          onPress={() => navigation.navigate('FormFill', { formFillId: item.id })}
          disabled={deletingId === item.id}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item?.document_name || `Document #${item?.document_id ?? ''}`}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item?.status) }]}>
              <Text style={styles.statusBadgeText}>{getStatusLabel(item?.status)}</Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {`${sourceIcon} ${sourceLabel}: ${sourceDisplayName}`}
          </Text>
          <Text style={styles.cardMeta}>{formatDate(item?.created_at || item?.createdAt)}</Text>
          {(item?.status === 'processing' || item?.status === 'pending') && (
            <Text style={styles.processingText}>
              Progression: {item?.pages_processed || 0}/{item?.pages_total || 0} pages
            </Text>
          )}
          {item?.status === 'error' && !!item?.error_message && (
            <Text style={styles.errorText} numberOfLines={2}>
              {item.error_message}
            </Text>
          )}
        </TouchableOpacity>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.deleteButton, deletingId === item.id && styles.deleteButtonDisabled]}
            onPress={() => handleDelete(item)}
            disabled={deletingId === item.id}
          >
            {deletingId === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.deleteButtonText}>Supprimer</Text>
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
        <Text style={styles.headerTitle}>Mes remplissages</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => String(item?.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Aucun remplissage pour le moment</Text>
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
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardPressArea: {
    padding: 15,
    paddingBottom: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    marginRight: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#374151',
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  processingText: {
    marginTop: 6,
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: '#B91C1C',
  },
  cardActions: {
    marginTop: 10,
    alignItems: 'flex-end',
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  deleteButton: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 96,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    marginTop: 120,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
});
