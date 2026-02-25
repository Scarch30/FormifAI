import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { ocrDocuments } from '../../api/client';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';
import StatusBadge from '../../components/StatusBadge';
import { extractItem, formatDate, toNumber } from '../../utils/apiData';
import { getDocumentName } from '../../utils/entityResolvers';

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

const extractImages = (item) => {
  const results = [];
  const seen = new Set();

  const pushUri = (uri) => {
    const normalized = normalizeUri(uri);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    results.push(normalized);
  };

  const scan = (entry) => {
    if (!entry) return;
    if (typeof entry === 'string') {
      pushUri(entry);
      return;
    }
    if (typeof entry !== 'object') return;
    pushUri(
      entry?.uri ||
        entry?.url ||
        entry?.image_url ||
        entry?.imageUrl ||
        entry?.page_image_url ||
        entry?.pageImageUrl ||
        entry?.file_url ||
        entry?.fileUrl ||
        entry?.path
    );
  };

  const buckets = [
    item?.images,
    item?.pages,
    item?.files,
    item?.image_urls,
    item?.imageUrls,
    item?.page_images,
    item?.pageImages,
    item?.original_images,
    item?.originalImages,
  ];

  buckets.forEach((bucket) => {
    if (!bucket) return;
    if (Array.isArray(bucket)) {
      bucket.forEach((entry) => scan(entry));
      return;
    }
    scan(bucket);
  });

  return results;
};

const getOcrText = (item) => {
  if (!item || typeof item !== 'object') return '';
  if (String(item?.full_text || '').trim()) return String(item.full_text);
  if (String(item?.fullText || '').trim()) return String(item.fullText);

  const pages =
    (Array.isArray(item?.pages) && item.pages) ||
    (Array.isArray(item?.ocr_pages) && item.ocr_pages) ||
    (Array.isArray(item?.ocrPages) && item.ocrPages) ||
    [];

  return pages
    .map((page) =>
      String(
        page?.text ??
          page?.page_text ??
          page?.pageText ??
          page?.extracted_text ??
          page?.extractedText ??
          ''
      )
    )
    .filter(Boolean)
    .join('\n\n');
};

const extractOcrPages = (item) => {
  if (!item || typeof item !== 'object') return [];
  const pages =
    (Array.isArray(item?.pages) && item.pages) ||
    (Array.isArray(item?.ocr_pages) && item.ocr_pages) ||
    (Array.isArray(item?.ocrPages) && item.ocrPages) ||
    [];

  return pages.map((page, index) => ({
    index,
    id: page?.id ?? page?.page_id ?? page?.pageId ?? null,
    text: String(
      page?.text ??
      page?.page_text ??
      page?.pageText ??
      page?.extracted_text ??
      page?.extractedText ??
      ''
    ),
  }));
};

const splitCombinedTextIntoPages = (value, pageCount) => {
  const safeCount = Math.max(1, Number(pageCount) || 1);
  if (safeCount === 1) return [String(value ?? '')];

  const chunks = String(value ?? '').split('\n\n');
  if (chunks.length === safeCount) return chunks;

  if (chunks.length < safeCount) {
    return [...chunks, ...Array(safeCount - chunks.length).fill('')];
  }

  const head = chunks.slice(0, safeCount - 1);
  const tail = chunks.slice(safeCount - 1).join('\n\n');
  return [...head, tail];
};

export default function OcrDetailScreen({ route, navigation }) {
  const ocrId = toNumber(route?.params?.ocrId, null) ?? toNumber(route?.params?.id, null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [editedText, setEditedText] = useState('');
  const [hasTextChanges, setHasTextChanges] = useState(false);
  const [savingText, setSavingText] = useState(false);

  const loadData = useCallback(async ({ withLoader = true } = {}) => {
    if (!ocrId) return;
    if (withLoader) setLoading(true);
    try {
      const response = await ocrDocuments.getOcrDocument(ocrId);
      const item = extractItem(response) || response?.data || null;
      setData(item);
    } catch (error) {
      console.error('Erreur chargement OCR:', error);
      Alert.alert('Erreur', 'Impossible de charger ce document OCR');
      navigation.goBack();
    } finally {
      if (withLoader) setLoading(false);
    }
  }, [navigation, ocrId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (!data?.id) return undefined;
    const status = String(data?.status || '').toLowerCase();
    if (status !== 'processing' && status !== 'pending') return undefined;

    const interval = setInterval(async () => {
      try {
        const response = await ocrDocuments.getOcrDocument(data.id);
        const item = extractItem(response) || response?.data || null;
        setData(item);
      } catch (error) {
        console.error('Erreur polling OCR:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [data?.id, data?.status]);

  const images = useMemo(() => extractImages(data), [data]);
  const fullText = useMemo(() => getOcrText(data), [data]);

  useEffect(() => {
    if (hasTextChanges) return;
    setEditedText(fullText);
  }, [fullText, hasTextChanges]);

  const handleCopy = async () => {
    const text = String(editedText || '');
    if (!text) return;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copie', 'Texte OCR copie dans le presse-papiers');
  };

  const handleSaveText = async () => {
    if (!data?.id) return;
    const nextText = String(editedText ?? '');
    if (nextText === String(fullText || '')) {
      setHasTextChanges(false);
      return;
    }
    setSavingText(true);
    try {
      const pages = extractOcrPages(data);
      const hasPersistedPages = pages.length > 0 && pages.every((page) => page.id !== null && page.id !== undefined);
      if (hasPersistedPages) {
        const nextPageTexts = splitCombinedTextIntoPages(nextText, pages.length);
        await Promise.all(
          pages.map((page, index) =>
            ocrDocuments.updateOcrPageText(data.id, page.id, nextPageTexts[index] ?? '')
          )
        );
      } else {
        await ocrDocuments.updateText(data.id, nextText);
      }
      await loadData({ withLoader: false });
      setHasTextChanges(false);
      Alert.alert('Enregistré', 'Texte OCR mis à jour');
    } catch (error) {
      console.error('Erreur sauvegarde texte OCR:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder le texte OCR');
    } finally {
      setSavingText(false);
    }
  };

  const handleRename = async () => {
    if (!data?.id) return;
    const nextTitle = `${getDocumentName(data)} (maj)`;
    try {
      await ocrDocuments.updateTitle(data.id, nextTitle);
      await loadData();
    } catch (error) {
      console.error('Erreur renommage OCR:', error);
      Alert.alert('Erreur', 'Impossible de renommer ce scan');
    }
  };

  const handleDelete = () => {
    if (!data?.id) return;
    Alert.alert('Supprimer', 'Supprimer ce scan OCR ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await ocrDocuments.deleteOcrDocument(data.id);
            navigation.goBack();
          } catch (error) {
            console.error('Erreur suppression OCR:', error);
            Alert.alert('Erreur', 'Impossible de supprimer ce scan');
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
        <Text style={styles.errorText}>Document OCR introuvable</Text>
      </View>
    );
  }

  const status = String(data?.status || '').toLowerCase();
  const canFill = status === 'done' || status === 'completed';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionCard>
        <Text style={styles.title}>{getDocumentName(data)}</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.meta}>{formatDate(data?.created_at || data?.createdAt)}</Text>
          <StatusBadge status={data?.status} />
        </View>
      </SectionCard>

      {images.length > 0 ? (
        <SectionCard title="Miniatures">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagesRow}>
            {images.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.thumbnail} />
            ))}
          </ScrollView>
        </SectionCard>
      ) : null}

      <SectionCard title="Texte extrait">
        {status === 'processing' || status === 'pending' ? (
          <View style={styles.processingWrap}>
            <ActivityIndicator color={Colors.warning} />
            <Text style={styles.meta}>Analyse OCR en cours...</Text>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.extractedTextInput}
              multiline
              value={editedText}
              onChangeText={(value) => {
                setEditedText(value);
                setHasTextChanges(value !== String(fullText || ''));
              }}
              editable={!savingText}
              textAlignVertical="top"
              placeholder="Aucun texte extrait."
            />
            <TouchableOpacity
              style={[
                styles.saveTextButton,
                (!hasTextChanges || savingText) && styles.saveTextButtonDisabled,
              ]}
              onPress={handleSaveText}
              disabled={!hasTextChanges || savingText}
            >
              {savingText ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveTextButtonText}>Enregistrer le texte</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </SectionCard>

      <TouchableOpacity
        style={[styles.primaryButton, !canFill && styles.primaryButtonDisabled]}
        onPress={() =>
          navigation.navigate('HomeStack', {
            screen: 'FillWizardScreen',
            params: {
              preselectedSourceType: 'ocr',
              preselectedSourceId: Number(data?.id),
            },
          })
        }
        disabled={!canFill}
      >
        <Text style={styles.primaryButtonText}>✨ Remplir un formulaire</Text>
      </TouchableOpacity>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleCopy}>
          <Text style={styles.secondaryButtonText}>Copier le texte</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleRename}>
          <Text style={styles.secondaryButtonText}>Renommer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, styles.deleteButton]} onPress={handleDelete}>
          <Text style={[styles.secondaryButtonText, styles.deleteText]}>Supprimer</Text>
        </TouchableOpacity>
      </View>
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
  rowBetween: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  imagesRow: {
    gap: 8,
  },
  thumbnail: {
    width: 120,
    height: 160,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  processingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  extractedTextInput: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  saveTextButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveTextButtonDisabled: {
    opacity: 0.6,
  },
  saveTextButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#A5B4FC',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  actionsRow: {
    gap: 8,
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
