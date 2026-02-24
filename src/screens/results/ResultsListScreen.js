import React, { useCallback, useEffect, useState } from 'react';
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
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { formFills } from '../../api/client';
import { documentConfigsApi } from '../../api/documentConfigsService';
import Colors from '../../constants/Colors';
import EmptyState from '../../components/EmptyState';
import SourceIcon from '../../components/SourceIcon';
import StatusBadge from '../../components/StatusBadge';
import useExport from '../../hooks/useExport';
import { extractItem, extractList, formatRelativeDate, sortByCreatedAtDesc, toNumber } from '../../utils/apiData';
import {
  arrayBufferToBase64,
  extractFileNameFromContentDisposition,
  sanitizeFileName,
} from '../../utils/binaryFiles';
import {
  getDocumentName,
  resolveSourceType,
} from '../../utils/entityResolvers';

const extractApiErrorMessage = (error, fallbackMessage) => {
  const payload = error?.response?.data || {};
  return (
    payload?.error ||
    payload?.message ||
    payload?.data?.error ||
    error?.message ||
    fallbackMessage
  );
};

const getMode2FillData = (formFill) => {
  const candidate = formFill?.fill_data ?? formFill?.fillData ?? {};
  if (typeof candidate === 'string') {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_error) {
      return {};
    }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return candidate;
};

export default function ResultsListScreen({ navigation, route }) {
  const documentIdFilter = route?.params?.documentId ?? null;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [mode2Exporting, setMode2Exporting] = useState(false);
  const [mode2ExportProgress, setMode2ExportProgress] = useState('');
  const { isExporting, exportProgress, exportWithChoice } = useExport();
  const exportBusy = isExporting || mode2Exporting;
  const exportBusyText = mode2Exporting ? mode2ExportProgress : exportProgress;

  const loadItems = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params =
        documentIdFilter !== null && documentIdFilter !== undefined
          ? { document_id: documentIdFilter }
          : {};
      const response = await formFills.listFormFills(params);
      setItems(sortByCreatedAtDesc(extractList(response)));
    } catch (error) {
      if (Number(error?.response?.status) !== 404) {
        console.error('Erreur chargement resultats:', error);
      }
      if (!silent) {
        setItems([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [documentIdFilter]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  useEffect(() => {
    const hasProcessingItem = items.some(
      (entry) => String(entry?.status || '').toLowerCase() === 'processing'
    );
    if (!hasProcessingItem) return undefined;

    const interval = setInterval(() => {
      loadItems({ silent: true });
    }, 5000);

    return () => clearInterval(interval);
  }, [items, loadItems]);

  const handleDelete = useCallback(
    (item) => {
      const itemId = Number(item?.id);
      if (!Number.isFinite(itemId) || deletingId) return;

      Alert.alert(
        'Supprimer ce remplissage ?',
        `${getDocumentName(item)}\n\nCette action est irreversible.`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: async () => {
              setDeletingId(itemId);
              try {
                await formFills.deleteFormFill(itemId);
                setItems((prev) => prev.filter((entry) => Number(entry?.id) !== itemId));
              } catch (error) {
                console.error('Erreur suppression resultat:', error);
                Alert.alert('Erreur', 'Impossible de supprimer ce resultat pour le moment.');
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

  const handleDocumentConfigExport = useCallback(
    async (listItem) => {
      if (exportBusy) return;

      const formFillId = toNumber(listItem?.id, null);
      if (!formFillId) {
        Alert.alert('Erreur', 'Resultat introuvable.');
        return;
      }

      let formFill = listItem;
      const hasLocalFillData =
        Object.prototype.hasOwnProperty.call(listItem || {}, 'fill_data') ||
        Object.prototype.hasOwnProperty.call(listItem || {}, 'fillData');

      if (!hasLocalFillData) {
        setMode2Exporting(true);
        setMode2ExportProgress('Chargement des donnees...');
        try {
          const detailResponse = await formFills.getFormFill(formFillId);
          formFill = extractItem(detailResponse) || listItem;
        } catch (error) {
          console.error('Erreur chargement resultat pour export document_config:', error);
          Alert.alert('Erreur', extractApiErrorMessage(error, "Impossible de charger ce resultat."));
          setMode2ExportProgress('');
          setMode2Exporting(false);
          return;
        }
      }

      const documentConfigId = toNumber(
        formFill?.document_config_id ?? formFill?.documentConfigId,
        null
      );
      if (!documentConfigId) {
        Alert.alert('Erreur', 'document_config_id introuvable pour ce resultat.');
        setMode2ExportProgress('');
        setMode2Exporting(false);
        return;
      }

      const fillData = getMode2FillData(formFill);

      setMode2Exporting(true);
      setMode2ExportProgress('Generation du PDF...');
      try {
        const response = await documentConfigsApi.fillWithFillData(documentConfigId, fillData);
        const cacheDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!cacheDirectory) {
          throw new Error('Stockage local indisponible.');
        }

        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          throw new Error('Le partage est indisponible sur cet appareil.');
        }

        const fileNameFromHeader = extractFileNameFromContentDisposition(response?.contentDisposition);
        const fallbackBaseName = getDocumentName(formFill);
        const fallbackFileName = `${sanitizeFileName(
          fallbackBaseName || `document_config_${documentConfigId}`,
          `document_config_${documentConfigId}`
        )}_mode2_${Date.now()}.pdf`;
        const fileName = String(fileNameFromHeader || fallbackFileName)
          .replace(/[\\/:*?"<>|]+/g, '_')
          .trim();
        const safeFileName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
        const fileUri = `${cacheDirectory}${safeFileName}`;

        setMode2ExportProgress('Preparation du partage...');
        await FileSystem.writeAsStringAsync(fileUri, arrayBufferToBase64(response?.arrayBuffer), {
          encoding: FileSystem.EncodingType.Base64,
        });

        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exporter PDF',
        });
      } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('cancel') || message.includes('dismiss')) {
          return;
        }
        console.error('Erreur export PDF document_config (liste):', error);
        Alert.alert('Erreur', extractApiErrorMessage(error, "Impossible d'exporter ce PDF."));
      } finally {
        setMode2ExportProgress('');
        setMode2Exporting(false);
      }
    },
    [exportBusy]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Resultats</Text>
        <Text style={styles.subtitle}>
          {documentIdFilter
            ? `Documents remplis du formulaire #${documentIdFilter}.`
            : 'Documents remplis prets a etre exportes.'}
        </Text>
        {exportBusy ? (
          <View style={styles.exportBanner}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.exportBannerText}>{exportBusyText || 'Export en cours...'}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `result-${String(item?.id ?? index)}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const sourceType = resolveSourceType(item);
            const filledCount = Number(item?.filled_count ?? item?.filledCount ?? 0);
            const totalCount = Number(item?.total_count ?? item?.totalCount ?? 0);
            const safeFilledCount = Number.isFinite(filledCount) ? filledCount : 0;
            const safeTotalCount = Number.isFinite(totalCount) ? totalCount : 0;
            const isComplete = safeTotalCount > 0 && safeFilledCount === safeTotalCount;
            const countStyle = isComplete
              ? styles.metaSuccess
              : safeFilledCount === 0
                ? styles.metaMuted
                : styles.metaWarning;
            const itemId = Number(item?.id);
            const isDeleting = deletingId === itemId;
            const normalizedStatus = String(item?.status || '').toLowerCase();
            const canExport = normalizedStatus === 'done' || normalizedStatus === 'completed';
            const isDocumentConfigResult = sourceType === 'document_config';

            return (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.cardMain}
                  onPress={() =>
                    navigation.navigate('ResultDetailScreen', {
                      resultId: itemId,
                      formFillId: itemId,
                    })
                  }
                  disabled={isDeleting}
                >
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{getDocumentName(item)}</Text>
                    <StatusBadge status={item?.status} />
                  </View>

                  <View style={styles.sourceRow}>
                    <SourceIcon sourceType={sourceType} />
                    <Text style={styles.sourceText}>{sourceType}</Text>
                  </View>

                  <Text style={styles.meta}>{formatRelativeDate(item?.created_at || item?.createdAt)}</Text>
                  <Text style={[styles.meta, countStyle]}>
                    {`${safeFilledCount}/${safeTotalCount} champs remplis`}
                  </Text>
                </TouchableOpacity>

                <View style={styles.cardActions}>
                  {canExport ? (
                    <TouchableOpacity
                      style={[styles.exportButton, exportBusy && styles.exportButtonDisabled]}
                      onPress={() =>
                        isDocumentConfigResult
                          ? handleDocumentConfigExport(item)
                          : exportWithChoice(itemId, item?.document_name)
                      }
                      disabled={isDeleting || exportBusy}
                    >
                      <Text style={styles.exportButtonText}>📄 Exporter</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
                    onPress={() => handleDelete(item)}
                    disabled={isDeleting || exportBusy}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.deleteButtonText}>Supprimer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="✅"
              title="Aucun document rempli"
              subtitle="Lancez un nouveau remplissage pour voir un resultat ici."
              actions={[{ label: 'Nouveau remplissage', onPress: () => navigation.navigate('HomeStack', { screen: 'FillWizardScreen' }) }]}
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
  exportBanner: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exportBannerText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
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
  },
  cardMain: {
    padding: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  sourceRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  meta: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  metaSuccess: {
    color: '#065F46',
  },
  metaMuted: {
    color: '#9CA3AF',
  },
  metaWarning: {
    color: '#C2410C',
  },
  cardActions: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  exportButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    minWidth: 104,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
  },
  exportButtonDisabled: {
    opacity: 0.7,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
