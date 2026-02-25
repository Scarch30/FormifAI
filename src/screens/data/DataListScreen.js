import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { audio, ocrDocuments, transcriptions } from '../../api/client';
import Colors from '../../constants/Colors';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { extractItem, extractList, formatRelativeDate, sortByCreatedAtDesc } from '../../utils/apiData';
import { getDocumentName, getTranscriptionTitle } from '../../utils/entityResolvers';

const FILTERS = [
  { key: 'all', label: 'Tout' },
  { key: 'transcription', label: 'Transcriptions' },
  { key: 'ocr', label: 'OCR' },
];

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.scarch.cloud';

const normalizeUri = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('file://') ||
    raw.startsWith('content://')
  ) {
    return raw;
  }
  if (raw.startsWith('/')) return `${API_URL}${raw}`;
  return `${API_URL}/${raw}`;
};

const getAudioFilename = (entry) =>
  entry?.filename || entry?.file_name || entry?.fileName || entry?.name || null;

const getAudioDirectUri = (entry) =>
  normalizeUri(
    entry?.url ||
      entry?.uri ||
      entry?.file_url ||
      entry?.fileUrl ||
      entry?.download_url ||
      entry?.downloadUrl ||
      entry?.public_url ||
      entry?.publicUrl ||
      entry?.path
  );

const extractOcrOriginalUris = (item) => {
  if (!item || typeof item !== 'object') return [];

  const candidates = [];
  const pushAny = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      candidates.push(...value);
      return;
    }
    candidates.push(value);
  };

  pushAny(item.images);
  pushAny(item.pages);
  pushAny(item.files);
  pushAny(item.image_urls);
  pushAny(item.imageUrls);
  pushAny(item.page_images);
  pushAny(item.pageImages);
  pushAny(item.original_images);
  pushAny(item.originalImages);
  pushAny(item.source_images);
  pushAny(item.sourceImages);
  pushAny(item.attachments);
  pushAny(item.documents);
  pushAny(item.image_url);
  pushAny(item.imageUrl);
  pushAny(item.original_image_url);
  pushAny(item.originalImageUrl);
  pushAny(item.file_url);
  pushAny(item.fileUrl);
  pushAny(item.download_url);
  pushAny(item.downloadUrl);

  const uris = [];
  const seen = new Set();

  candidates.forEach((entry) => {
    let uri = '';
    if (typeof entry === 'string') {
      uri = normalizeUri(entry);
    } else if (entry && typeof entry === 'object') {
      const nestedFile = entry?.file || entry?.image || entry?.document || null;
      uri = normalizeUri(
        entry?.uri ||
          entry?.url ||
          entry?.image_url ||
          entry?.imageUrl ||
          entry?.original_image_url ||
          entry?.originalImageUrl ||
          entry?.file_url ||
          entry?.fileUrl ||
          entry?.download_url ||
          entry?.downloadUrl ||
          entry?.public_url ||
          entry?.publicUrl ||
          entry?.path ||
          entry?.file_path ||
          entry?.filePath ||
          entry?.storage_path ||
          entry?.storagePath ||
          nestedFile?.uri ||
          nestedFile?.url
      );
    }

    if (!uri || seen.has(uri)) return;
    seen.add(uri);
    uris.push(uri);
  });

  return uris;
};

const getDataItemName = (item) =>
  item?._type === 'transcription' ? getTranscriptionTitle(item) : getDocumentName(item);

export default function DataListScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [actionKey, setActionKey] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);
  const actionLockRef = useRef(false);

  const loadData = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [transRes, ocrRes] = await Promise.allSettled([
        transcriptions.list(),
        ocrDocuments.listOcrDocuments(),
      ]);

      if (transRes?.status === 'rejected' && Number(transRes?.reason?.response?.status) !== 404) {
        console.error('Erreur chargement transcriptions (data list):', transRes.reason);
      }
      if (ocrRes?.status === 'rejected' && Number(ocrRes?.reason?.response?.status) !== 404) {
        console.error('Erreur chargement OCR (data list):', ocrRes.reason);
      }

      const transcriptionItems = extractList(transRes?.status === 'fulfilled' ? transRes.value : null).map((item) => ({
        ...item,
        _type: 'transcription',
      }));
      const ocrItems = extractList(ocrRes?.status === 'fulfilled' ? ocrRes.value : null).map((item) => ({
        ...item,
        _type: 'ocr',
      }));

      setItems(sortByCreatedAtDesc([...transcriptionItems, ...ocrItems]));
    } catch (error) {
      console.error('Erreur chargement donnees:', error);
      setItems([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData({ silent: false });
    }, [loadData])
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item?._type === filter);
  }, [filter, items]);

  const withAction = useCallback(async (nextKey, fn) => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    setActionKey(nextKey);
    try {
      await fn();
      return true;
    } finally {
      setActionKey('');
      actionLockRef.current = false;
    }
  }, []);

  const closeRenameModal = () => {
    if (renameSaving) return;
    setRenameModalVisible(false);
    setRenameTarget(null);
    setRenameDraft('');
  };

  const openRenameModal = (item) => {
    const itemId = Number(item?.id);
    const itemType = item?._type;
    if (!Number.isFinite(itemId) || (itemType !== 'transcription' && itemType !== 'ocr')) return;

    const currentName = getDataItemName(item);
    setRenameTarget({
      id: itemId,
      _type: itemType,
      currentName,
    });
    setRenameDraft(currentName);
    setRenameModalVisible(true);
  };

  const handleSubmitRename = async () => {
    if (!renameTarget?.id || !renameTarget?._type || renameSaving) return;
    const nextName = String(renameDraft || '').trim();
    if (!nextName) {
      Alert.alert('Nom requis', 'Saisissez un nom valide.');
      return;
    }

    if (nextName === String(renameTarget.currentName || '').trim()) {
      closeRenameModal();
      return;
    }

    setRenameSaving(true);
    try {
      const renamed = await withAction(
        `data-rename-${renameTarget._type}-${renameTarget.id}`,
        async () => {
          if (renameTarget._type === 'transcription') {
            await transcriptions.rename(renameTarget.id, nextName);
          } else {
            await ocrDocuments.updateTitle(renameTarget.id, nextName);
          }
          await loadData({ silent: true });
        }
      );
      if (renamed) closeRenameModal();
    } catch (error) {
      console.error('Erreur renommage donnee:', error);
      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Impossible de renommer ce fichier';
      Alert.alert('Erreur', apiMessage);
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDeleteItem = (item) => {
    const itemId = Number(item?.id);
    const itemType = item?._type;
    if (!Number.isFinite(itemId) || (itemType !== 'transcription' && itemType !== 'ocr')) return;

    const title = getDataItemName(item);
    const label = itemType === 'transcription' ? 'cette transcription' : 'ce document OCR';
    Alert.alert('Supprimer', `Supprimer ${label} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            const deleted = await withAction(`data-delete-${itemType}-${itemId}`, async () => {
              if (itemType === 'transcription') {
                await transcriptions.delete(itemId);
              } else {
                await ocrDocuments.deleteOcrDocument(itemId);
              }
              setItems((prev) =>
                prev.filter((entry) => !(entry?._type === itemType && Number(entry?.id) === itemId))
              );
            });
            if (!deleted) return;
          } catch (error) {
            console.error('Erreur suppression donnee:', error);
            Alert.alert('Erreur', `Impossible de supprimer ${title}`);
          }
        },
      },
    ]);
  };

  const openExternalUrl = useCallback(async (url, label) => {
    const target = String(url || '').trim();
    if (!target) {
      Alert.alert('Fichier introuvable', `Aucun ${label} disponible.`);
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(target);
      if (!canOpen) {
        Alert.alert('Ouverture impossible', `Impossible d'ouvrir ce ${label}.`);
        return;
      }
      await Linking.openURL(target);
    } catch (error) {
      console.error(`Erreur ouverture ${label}:`, error);
      Alert.alert('Erreur', `Impossible d'ouvrir ce ${label}.`);
    }
  }, []);

  const handleOpenSourceFile = useCallback(
    async (item) => {
      const itemId = Number(item?.id);
      const itemType = item?._type;
      if (!Number.isFinite(itemId) || (itemType !== 'transcription' && itemType !== 'ocr')) return;

      try {
        await withAction(`data-source-${itemType}-${itemId}`, async () => {
          if (itemType === 'transcription') {
            const response = await audio.listByTranscription(itemId);
            const files = sortByCreatedAtDesc(extractList(response));
            if (!files.length) {
              Alert.alert('Audio introuvable', "Aucun fichier audio n'est disponible pour cette transcription.");
              return;
            }

            let sourceUrl = '';
            for (let index = 0; index < files.length; index += 1) {
              const entry = files[index];
              const filename = getAudioFilename(entry);
              if (filename) {
                sourceUrl = await audio.getFileUrl(filename);
                if (sourceUrl) break;
              }
              const directUri = getAudioDirectUri(entry);
              if (directUri) {
                sourceUrl = directUri;
                break;
              }
            }

            await openExternalUrl(sourceUrl, 'audio');
            return;
          }

          const detailResponse = await ocrDocuments.getOcrDocument(itemId);
          const detailItem = extractItem(detailResponse) || detailResponse?.data || null;
          const sourceUrl = extractOcrOriginalUris(detailItem)[0] || '';
          await openExternalUrl(sourceUrl, 'document original');
        });
      } catch (error) {
        console.error('Erreur ouverture source:', error);
        Alert.alert('Erreur', 'Impossible d ouvrir le fichier source');
      }
    },
    [openExternalUrl, withAction]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Donnees</Text>
        <Text style={styles.subtitle}>Tout ce qui servira a remplir vos formulaires.</Text>
      </View>

      <View style={styles.filtersRow}>
        {FILTERS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[styles.filterChip, filter === option.key && styles.filterChipActive]}
            onPress={() => setFilter(option.key)}
          >
            <Text style={[styles.filterChipText, filter === option.key && styles.filterChipTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, index) =>
            `${String(item?._type || 'item')}-${String(item?.id ?? index)}`
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isTranscription = item?._type === 'transcription';
            const itemId = Number(item?.id);
            const sourceBusy = actionKey === `data-source-${item?._type}-${itemId}`;
            const renameBusy = actionKey === `data-rename-${item?._type}-${itemId}`;
            const deleteBusy = actionKey === `data-delete-${item?._type}-${itemId}`;
            const hasBusyAction = Boolean(actionKey);
            return (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.cardPressArea}
                  onPress={() =>
                    navigation.navigate(
                      isTranscription ? 'TranscriptionDetailScreen' : 'OcrDetailScreen',
                      isTranscription
                        ? { transcriptionId: Number(item?.id) }
                        : { ocrId: Number(item?.id) }
                    )
                  }
                  disabled={hasBusyAction}
                >
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {isTranscription ? '🎤 ' : '📷 '}
                      {isTranscription ? getTranscriptionTitle(item) : getDocumentName(item)}
                    </Text>
                    <StatusBadge status={item?.status} />
                  </View>
                  <Text style={styles.cardMeta}>
                    {formatRelativeDate(item?.created_at || item?.createdAt)}
                  </Text>
                </TouchableOpacity>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, hasBusyAction && styles.actionButtonDisabled]}
                    onPress={() => handleOpenSourceFile(item)}
                    disabled={hasBusyAction}
                  >
                    {sourceBusy ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Text style={styles.actionButtonText}>
                        {isTranscription ? 'Audio' : 'Document original'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, hasBusyAction && styles.actionButtonDisabled]}
                    onPress={() => openRenameModal(item)}
                    disabled={hasBusyAction}
                  >
                    {renameBusy ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Text style={styles.actionButtonText}>Renommer</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.actionButtonDanger,
                      hasBusyAction && styles.actionButtonDisabled,
                    ]}
                    onPress={() => handleDeleteItem(item)}
                    disabled={hasBusyAction}
                  >
                    {deleteBusy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.actionButtonDangerText}>Supprimer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="📭"
              title="Aucune donnee pour le moment"
              subtitle="Ajoutez une transcription ou un scan OCR."
              actions={[
                {
                  label: 'Nouvelle transcription',
                  onPress: () => navigation.navigate('CreateTranscriptionScreen'),
                },
                {
                  label: 'Nouveau scan OCR',
                  onPress: () => navigation.navigate('CreateOcrScreen'),
                },
              ]}
            />
          }
        />
      )}

      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRenameModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {renameTarget?._type === 'transcription'
                ? 'Renommer la transcription'
                : 'Renommer le document OCR'}
            </Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {renameTarget?.currentName || ''}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="Nouveau nom"
              placeholderTextColor={Colors.textTertiary}
              editable={!renameSaving}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSubmitRename}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={closeRenameModal}
                disabled={renameSaving}
              >
                <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  (!renameDraft.trim() || renameSaving) && styles.actionButtonDisabled,
                ]}
                onPress={handleSubmitRename}
                disabled={!renameDraft.trim() || renameSaving}
              >
                {renameSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  filterChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: Colors.primaryDark,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 120,
    gap: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardPressArea: {
    padding: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  cardMeta: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    backgroundColor: '#fff',
    minHeight: 38,
  },
  actionButtonText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  actionButtonDanger: {
    borderColor: '#DC2626',
    backgroundColor: '#DC2626',
  },
  actionButtonDangerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  modalSubtitle: {
    marginTop: 6,
    marginBottom: 10,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  modalButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    minHeight: 40,
    borderWidth: 1,
  },
  modalButtonSecondary: {
    borderColor: Colors.border,
    backgroundColor: '#fff',
  },
  modalButtonSecondaryText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  modalButtonPrimary: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  modalButtonPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
