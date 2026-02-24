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
  Modal,
  ScrollView,
  TextInput,
  Image,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ocrDocuments, templates, formFills } from '../api/client';
import SelectionModal from '../components/SelectionModal';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.scarch.cloud';

const extractList = (response) => {
  const payload = response?.data?.data || response?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const extractItem = (response) => {
  const payload = response?.data?.data || response?.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload.item || payload.result || payload.data || payload;
};

const getOcrStatusLabel = (status) => {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'processing':
      return 'Analyse';
    case 'done':
      return 'Terminé';
    case 'completed':
      return 'Terminé';
    case 'error':
      return 'Erreur';
    default:
      return status || 'Inconnu';
  }
};

const getOcrStatusColor = (status) => {
  switch (status) {
    case 'pending':
      return '#6B7280';
    case 'processing':
      return '#F59E0B';
    case 'done':
      return '#10B981';
    case 'completed':
      return '#10B981';
    case 'error':
      return '#EF4444';
    default:
      return '#6B7280';
  }
};

const getOcrTitle = (item) => item?.title || item?.name || `OCR #${item?.id ?? ''}`;

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

const buildOcrImageFromAsset = (asset, index = 0) => {
  if (!asset) return null;
  const uri = asset.uri || asset.fileCopyUri || asset.fileUri;
  if (!uri) return null;
  const fileName = asset.fileName || asset.name || `page-${index + 1}`;
  const rawType = String(asset.mimeType || asset.type || '');
  const lowerName = String(fileName).toLowerCase();
  const inferredMimeType = lowerName.endsWith('.pdf')
    ? 'application/pdf'
    : lowerName.endsWith('.png')
      ? 'image/png'
      : lowerName.endsWith('.webp')
        ? 'image/webp'
        : lowerName.endsWith('.heic')
          ? 'image/heic'
          : 'image/jpeg';
  const mimeType = rawType.includes('/') ? rawType : inferredMimeType;
  const normalizedName = String(fileName).includes('.')
    ? fileName
    : mimeType === 'application/pdf'
      ? `${fileName}.pdf`
      : `${fileName}.jpg`;
  return {
    uri,
    type: mimeType,
    fileName: normalizedName,
  };
};

const isImageMimeType = (value) => String(value || '').toLowerCase().startsWith('image/');

const normalizeUri = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('file://') ||
    raw.startsWith('content://') ||
    raw.startsWith('data:')
  ) {
    return raw;
  }
  if (raw.startsWith('/')) return `${API_URL}${raw}`;
  return `${API_URL}/${raw}`;
};

const inferMimeType = (uri = '', type = '', name = '') => {
  if (String(type).includes('/')) return type;
  const probe = `${uri} ${name}`.toLowerCase();
  if (probe.includes('.pdf')) return 'application/pdf';
  if (probe.includes('.png')) return 'image/png';
  if (probe.includes('.webp')) return 'image/webp';
  if (probe.includes('.heic')) return 'image/heic';
  if (probe.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
};

const normalizeOriginalFile = (rawEntry, index = 0) => {
  if (!rawEntry) return null;
  if (typeof rawEntry === 'string') {
    const uri = normalizeUri(rawEntry);
    if (!uri) return null;
    return {
      uri,
      type: inferMimeType(uri),
      name: `Document ${index + 1}`,
    };
  }
  if (typeof rawEntry !== 'object') return null;

  const nestedImage = rawEntry.image || rawEntry.file || rawEntry.document;
  if (nestedImage && typeof nestedImage !== 'string' && nestedImage !== rawEntry) {
    const nested = normalizeOriginalFile(nestedImage, index);
    if (nested) return nested;
  }

  const uriCandidate =
    rawEntry.uri ||
    rawEntry.url ||
    rawEntry.image_url ||
    rawEntry.imageUrl ||
    rawEntry.page_image_url ||
    rawEntry.pageImageUrl ||
    rawEntry.original_image_url ||
    rawEntry.originalImageUrl ||
    rawEntry.file_url ||
    rawEntry.fileUrl ||
    rawEntry.download_url ||
    rawEntry.downloadUrl ||
    rawEntry.public_url ||
    rawEntry.publicUrl ||
    rawEntry.path ||
    rawEntry.file_path ||
    rawEntry.filePath ||
    rawEntry.storage_path ||
    rawEntry.storagePath ||
    (typeof nestedImage === 'string' ? nestedImage : '');
  const uri = normalizeUri(uriCandidate);
  if (!uri) return null;

  const nameCandidate =
    rawEntry.fileName ||
    rawEntry.file_name ||
    rawEntry.filename ||
    rawEntry.name ||
    rawEntry.original_name ||
    rawEntry.originalName ||
    `Document ${index + 1}`;
  const typeCandidate = rawEntry.type || rawEntry.mimeType || rawEntry.mime_type || '';

  return {
    uri,
    type: inferMimeType(uri, typeCandidate, nameCandidate),
    name: String(nameCandidate),
  };
};

const extractOriginalFiles = (item) => {
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

  const normalized = [];
  const seenUris = new Set();
  candidates.forEach((entry, index) => {
    const file = normalizeOriginalFile(entry, index);
    if (!file?.uri || seenUris.has(file.uri)) return;
    seenUris.add(file.uri);
    normalized.push(file);
  });
  return normalized;
};

const normalizePageText = (pageEntry = {}) =>
  String(
    pageEntry?.text ??
      pageEntry?.page_text ??
      pageEntry?.pageText ??
      pageEntry?.extracted_text ??
      pageEntry?.extractedText ??
      pageEntry?.full_text ??
      pageEntry?.fullText ??
      pageEntry?.content ??
      ''
  );

const normalizePageNumber = (pageEntry, fallbackIndex) => {
  const rawNumber =
    pageEntry?.page_number ??
    pageEntry?.pageNumber ??
    pageEntry?.number ??
    pageEntry?.index ??
    fallbackIndex + 1;
  const pageNumber = Number(rawNumber);
  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : fallbackIndex + 1;
};

const normalizePageId = (pageEntry, fallbackIndex) =>
  pageEntry?.id ??
  pageEntry?.page_id ??
  pageEntry?.pageId ??
  pageEntry?.ocr_page_id ??
  pageEntry?.ocrPageId ??
  `page-${fallbackIndex + 1}`;

const extractOcrPages = (item) => {
  if (!item || typeof item !== 'object') return [];
  const rawPages =
    (Array.isArray(item?.pages) && item.pages) ||
    (Array.isArray(item?.ocr_pages) && item.ocr_pages) ||
    (Array.isArray(item?.ocrPages) && item.ocrPages) ||
    (Array.isArray(item?.page_texts) && item.page_texts) ||
    (Array.isArray(item?.pageTexts) && item.pageTexts) ||
    [];

  if (!rawPages.length) {
    const fallbackText = String(item?.full_text ?? item?.fullText ?? '');
    if (!fallbackText.trim()) return [];
    return [
      {
        id: null,
        pageNumber: 1,
        text: fallbackText,
        persisted: false,
      },
    ];
  }

  return rawPages.map((pageEntry, index) => {
    if (typeof pageEntry === 'string') {
      return {
        id: `page-${index + 1}`,
        pageNumber: index + 1,
        text: pageEntry,
        persisted: false,
      };
    }
    const persistedId =
      pageEntry?.id ??
      pageEntry?.page_id ??
      pageEntry?.pageId ??
      pageEntry?.ocr_page_id ??
      pageEntry?.ocrPageId ??
      null;
    return {
      id: normalizePageId(pageEntry, index),
      pageNumber: normalizePageNumber(pageEntry, index),
      text: normalizePageText(pageEntry),
      persisted: persistedId !== null && persistedId !== undefined && persistedId !== '',
    };
  });
};

export default function OcrDocumentsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [fillPickerVisible, setFillPickerVisible] = useState(false);
  const [fillPickerLoading, setFillPickerLoading] = useState(false);
  const [fillableDocuments, setFillableDocuments] = useState([]);
  const [fillSourceOcr, setFillSourceOcr] = useState(null);
  const [fillActionKey, setFillActionKey] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createImages, setCreateImages] = useState([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [originalViewerVisible, setOriginalViewerVisible] = useState(false);
  const [originalFiles, setOriginalFiles] = useState([]);
  const [originalIndex, setOriginalIndex] = useState(0);
  const [viewerToken, setViewerToken] = useState('');
  const [detailPageIndex, setDetailPageIndex] = useState(0);
  const [detailPageDraft, setDetailPageDraft] = useState('');
  const [detailSaving, setDetailSaving] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameItem, setRenameItem] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  const resetDetailEditor = () => {
    setDetailPageIndex(0);
    setDetailPageDraft('');
    setDetailSaving(false);
  };

  const closeDetailModal = () => {
    setDetailVisible(false);
    setDetailItem(null);
    resetDetailEditor();
  };

  const closeRenameModal = (force = false) => {
    if (renameLoading && !force) return;
    setRenameModalVisible(false);
    setRenameItem(null);
    setRenameDraft('');
  };

  const openRenameModal = (item) => {
    if (!item?.id) return;
    setRenameItem(item);
    setRenameDraft(getOcrTitle(item));
    setRenameModalVisible(true);
  };

  const hydrateDetailEditor = useCallback((nextDetailItem, preferredPageId = null) => {
    setDetailSaving(false);
    const pages = extractOcrPages(nextDetailItem);
    if (!pages.length) {
      setDetailPageIndex(0);
      setDetailPageDraft(String(nextDetailItem?.full_text ?? nextDetailItem?.fullText ?? ''));
      return;
    }

    let nextIndex = 0;
    if (preferredPageId !== null && preferredPageId !== undefined) {
      const foundIndex = pages.findIndex(
        (pageEntry) => String(pageEntry?.id ?? '') === String(preferredPageId)
      );
      if (foundIndex >= 0) nextIndex = foundIndex;
    }

    setDetailPageIndex(nextIndex);
    setDetailPageDraft(String(pages[nextIndex]?.text ?? ''));
  }, []);

  const loadItems = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await ocrDocuments.listOcrDocuments();
      setItems(extractList(response));
    } catch (error) {
      console.error('Erreur chargement OCR documents:', error);
      setItems([]);
      if (!silent) {
        Alert.alert('Erreur', 'Impossible de charger les documents OCR');
      }
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

  const openCreateModal = () => {
    setCreateTitle('');
    setCreateImages([]);
    setCreateModalVisible(true);
  };

  const closeCreateModal = (force = false) => {
    if (createLoading && !force) return;
    setCreateModalVisible(false);
    setCreateTitle('');
    setCreateImages([]);
  };

  const pushCreateAssets = useCallback((assets = []) => {
    if (!Array.isArray(assets) || !assets.length) return;
    setCreateImages((prev) => {
      const next = [...prev];
      assets.forEach((asset, index) => {
        const normalized = buildOcrImageFromAsset(asset, prev.length + index);
        if (normalized) next.push(normalized);
      });
      return next;
    });
  }, []);

  const handlePickFromCamera = async () => {
    if (createLoading) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission refusée', "Autorisez l'accès à la caméra");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images,
        quality: 0.8,
      });
      if (result?.canceled || result?.cancelled) return;
      pushCreateAssets(result?.assets || []);
    } catch (error) {
      console.error('Erreur capture OCR:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la caméra");
    }
  };

  const handlePickFromGallery = async () => {
    if (createLoading) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission refusée', "Autorisez l'accès à la galerie");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images,
        quality: 0.9,
      });
      if (result?.canceled || result?.cancelled) return;
      pushCreateAssets(result?.assets || []);
    } catch (error) {
      console.error('Erreur import OCR:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie");
    }
  };

  const handlePickFromFiles = async () => {
    if (createLoading) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result?.canceled || result?.cancelled || result?.type === 'cancel') return;
      const assets = result?.assets || (result ? [result] : []);
      pushCreateAssets(assets);
    } catch (error) {
      console.error('Erreur import fichier OCR:', error);
      Alert.alert('Erreur', "Impossible d'importer ce fichier");
    }
  };

  const handleRemoveCreateImageAt = (index) => {
    if (createLoading) return;
    setCreateImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index));
  };

  const handleCreateOcrDocument = async () => {
    if (createLoading) return;
    if (!createImages.length) {
      Alert.alert('OCR', 'Ajoutez au moins un document (photo ou PDF).');
      return;
    }

    setCreateLoading(true);
    try {
      await ocrDocuments.createOcrDocument(createTitle.trim() || `OCR ${Date.now()}`, createImages);
      closeCreateModal(true);
      await loadItems({ silent: true });
      Alert.alert('OCR lancé', "Le document a été ajouté. L'analyse continue en arrière-plan.");
    } catch (error) {
      console.error('Erreur création OCR:', error);
      Alert.alert('Erreur', 'Impossible de créer ce document scanné');
    } finally {
      setCreateLoading(false);
    }
  };

  const openOriginalViewer = async (item) => {
    const files = extractOriginalFiles(item);
    if (!files.length) {
      Alert.alert('Original indisponible', "Aucun fichier source n'a été retourné par l'OCR.");
      return;
    }
    setOriginalFiles(files);
    setOriginalIndex(0);
    setOriginalViewerVisible(true);
    try {
      const token = await AsyncStorage.getItem('token');
      setViewerToken(token || '');
    } catch (error) {
      console.warn('Token non disponible pour viewer OCR:', error);
      setViewerToken('');
    }
  };

  const closeOriginalViewer = () => {
    setOriginalViewerVisible(false);
    setOriginalFiles([]);
    setOriginalIndex(0);
    setViewerToken('');
  };

  const openCurrentOriginalExternally = async () => {
    const current = originalFiles[originalIndex];
    if (!current?.uri) return;
    try {
      const canOpen = await Linking.canOpenURL(current.uri);
      if (!canOpen) {
        Alert.alert('Ouverture impossible', "Ce fichier ne peut pas être ouvert sur cet appareil.");
        return;
      }
      await Linking.openURL(current.uri);
    } catch (error) {
      console.error('Erreur ouverture original OCR:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir ce document");
    }
  };

  const loadDetail = async (itemId, options = {}) => {
    if (!itemId) return;
    const { preferredPageId = null, withLoader = true } = options;
    if (withLoader) setDetailLoading(true);
    if (!detailVisible) setDetailVisible(true);
    try {
      const response = await ocrDocuments.getOcrDocument(itemId);
      const nextItem = extractItem(response);
      setDetailItem(nextItem);
      hydrateDetailEditor(nextItem, preferredPageId);
    } catch (error) {
      console.error('Erreur detail OCR document:', error);
      Alert.alert('Erreur', 'Impossible de charger ce document OCR');
      if (withLoader) {
        closeDetailModal();
      }
    } finally {
      if (withLoader) setDetailLoading(false);
    }
  };

  const copyTextToClipboard = async (value, label = 'Texte') => {
    const text = String(value ?? '');
    if (!text.trim()) {
      Alert.alert('Copie', 'Aucun texte à copier');
      return;
    }
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copié', `${label} copié dans le presse-papiers`);
    } catch (error) {
      console.error('Erreur copie OCR:', error);
      Alert.alert('Erreur', 'Impossible de copier ce texte');
    }
  };

  const detailPages = extractOcrPages(detailItem);
  const currentDetailPage = detailPages[detailPageIndex] || null;
  const currentDetailPageText = String(currentDetailPage?.text ?? '');
  const detailFullText =
    String(detailItem?.full_text ?? detailItem?.fullText ?? '') ||
    detailPages.map((pageEntry) => String(pageEntry?.text ?? '')).join('\n\n');
  const canEditCurrentPage =
    Boolean(detailItem?.id) && Boolean(currentDetailPage?.id) && Boolean(currentDetailPage?.persisted);
  const canSaveCurrentPage =
    canEditCurrentPage && !detailSaving && detailPageDraft !== currentDetailPageText;

  const handleSelectDetailPage = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= detailPages.length) return;
    setDetailPageIndex(nextIndex);
    setDetailPageDraft(String(detailPages[nextIndex]?.text ?? ''));
  };

  const handleSaveDetailPageText = async () => {
    if (!canEditCurrentPage || !canSaveCurrentPage) return;
    setDetailSaving(true);
    try {
      await ocrDocuments.updateOcrPageText(detailItem.id, currentDetailPage.id, detailPageDraft);
      await loadDetail(detailItem.id, { preferredPageId: currentDetailPage.id, withLoader: false });
      Alert.alert('Succès', 'Texte de page mis à jour');
    } catch (error) {
      console.error('Erreur mise à jour texte OCR:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder ce texte');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleClearDetailPageText = () => {
    if (!canEditCurrentPage || !currentDetailPage?.id) return;
    Alert.alert('Vider la page', 'Supprimer le texte extrait de cette page ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Vider',
        style: 'destructive',
        onPress: async () => {
          setDetailSaving(true);
          try {
            await ocrDocuments.clearOcrPageText(detailItem.id, currentDetailPage.id);
            await loadDetail(detailItem.id, { preferredPageId: currentDetailPage.id, withLoader: false });
            Alert.alert('Succès', 'Texte de page supprimé');
          } catch (error) {
            console.error('Erreur suppression texte OCR:', error);
            Alert.alert('Erreur', 'Impossible de supprimer ce texte');
          } finally {
            setDetailSaving(false);
          }
        },
      },
    ]);
  };

  const handleRenameOcrDocument = async () => {
    if (!renameItem?.id) return;
    const nextTitle = String(renameDraft || '').trim();
    if (!nextTitle) {
      Alert.alert('Titre requis', 'Veuillez saisir un titre.');
      return;
    }
    if (nextTitle === getOcrTitle(renameItem)) {
      closeRenameModal();
      return;
    }

    setRenameLoading(true);
    try {
      await ocrDocuments.updateTitle(renameItem.id, nextTitle);
      setItems((prev) =>
        prev.map((entry) =>
          entry?.id === renameItem.id
            ? {
                ...entry,
                title: nextTitle,
                name: nextTitle,
              }
            : entry
        )
      );
      setDetailItem((prev) =>
        prev?.id === renameItem.id
          ? {
              ...prev,
              title: nextTitle,
              name: nextTitle,
            }
          : prev
      );
      closeRenameModal(true);
    } catch (error) {
      console.error('Erreur renommage OCR:', error);
      Alert.alert('Erreur', 'Impossible de renommer ce document OCR');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleDelete = (item) => {
    if (!item?.id || deletingId) return;
    Alert.alert('Supprimer', 'Voulez-vous supprimer ce document OCR ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(item.id);
          try {
            await ocrDocuments.deleteOcrDocument(item.id);
            setItems((prev) => prev.filter((entry) => entry?.id !== item.id));
            if (detailItem?.id === item.id) {
              closeDetailModal();
            }
          } catch (error) {
            console.error('Erreur suppression OCR document:', error);
            Alert.alert('Erreur', 'Impossible de supprimer ce document OCR');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const loadFillableDocuments = async () => {
    setFillPickerLoading(true);
    try {
      const response = await templates.listDocuments();
      const docs = extractList(response);
      const candidates = docs.filter((doc) => doc?.applied_template_id || doc?.appliedTemplateId);
      setFillableDocuments(candidates);
    } catch (error) {
      console.error('Erreur chargement documents pour OCR fill:', error);
      Alert.alert('Erreur', 'Impossible de charger les documents');
      setFillableDocuments([]);
    } finally {
      setFillPickerLoading(false);
    }
  };

  const openFillPicker = async (ocrItem) => {
    if (!ocrItem?.id) return;
    const status = String(ocrItem?.status || '').toLowerCase();
    if (status !== 'done' && status !== 'completed') {
      Alert.alert('OCR non terminé', "L'analyse OCR doit être terminée avant remplissage");
      return;
    }
    setFillSourceOcr(ocrItem);
    setFillPickerVisible(true);
    await loadFillableDocuments();
  };

  const closeFillPicker = () => {
    setFillPickerVisible(false);
    setFillSourceOcr(null);
    setFillableDocuments([]);
    setFillPickerLoading(false);
  };

  const handleCreateFillFromOcr = async (selection) => {
    const documentItem = selection?.raw || selection;
    if (!fillSourceOcr?.id || !documentItem?.id) return;
    if (fillActionKey) return;
    const actionId = `ocr-fill-${fillSourceOcr.id}-${documentItem.id}`;
    setFillActionKey(actionId);
    try {
      const response = await formFills.createFormFill(documentItem.id, 'ocr', fillSourceOcr.id);
      const created = extractItem(response);
      if (!created?.id) {
        Alert.alert('Erreur', 'Le remplissage a été créé, mais ouverture impossible.');
        return;
      }
      closeFillPicker();
      navigation.navigate('FormFill', { formFillId: created.id });
    } catch (error) {
      console.error('Erreur creation fill depuis OCR:', error);
      Alert.alert('Erreur', 'Impossible de lancer le remplissage');
    } finally {
      setFillActionKey('');
    }
  };

  const renderItem = ({ item }) => {
    const isDeleting = deletingId === item.id;
    const pagesCount = Number(item?.pages_count ?? item?.pagesCount ?? item?.images_count ?? item?.imagesCount ?? 0);
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardMain}
          onPress={() => loadDetail(item.id)}
          disabled={isDeleting}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {getOcrTitle(item)}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: getOcrStatusColor(item?.status) }]}>
              <Text style={styles.statusBadgeText}>{getOcrStatusLabel(item?.status)}</Text>
            </View>
          </View>
          <Text style={styles.cardDate}>
            {formatDate(item?.created_at || item?.createdAt)}
          </Text>
          <Text style={styles.cardMeta}>
            {pagesCount > 0 ? `${pagesCount} page(s)` : 'Pages inconnues'}
          </Text>
        </TouchableOpacity>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary, styles.actionButtonGap]}
            onPress={() => openFillPicker(item)}
            disabled={isDeleting}
          >
            <Text style={styles.actionButtonText}>Remplir un formulaire</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary, styles.actionButtonGap]}
            onPress={() => openRenameModal(item)}
            disabled={isDeleting}
          >
            <Text style={styles.actionButtonText}>Renommer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.actionButtonDanger,
              isDeleting && styles.actionButtonDisabled,
            ]}
            onPress={() => handleDelete(item)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>Supprimer</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const detailOriginalFiles = extractOriginalFiles(detailItem);
  const currentOriginal = originalFiles[originalIndex] || null;
  const currentOriginalIsImage = isImageMimeType(currentOriginal?.type);
  const currentOriginalNeedsAuthHeader =
    Boolean(viewerToken) && String(currentOriginal?.uri || '').startsWith(API_URL);
  const currentOriginalSource = currentOriginal
    ? currentOriginalNeedsAuthHeader
      ? { uri: currentOriginal.uri, headers: { Authorization: `Bearer ${viewerToken}` } }
      : { uri: currentOriginal.uri }
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Documents scannés</Text>
        <TouchableOpacity style={styles.headerAction} onPress={openCreateModal}>
          <Text style={styles.headerActionText}>+ Ajouter</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item?.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Aucun document OCR</Text>
            </View>
          )
        }
      />

      <Modal
        visible={detailVisible}
        transparent
        animationType="slide"
        onRequestClose={closeDetailModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {detailItem ? getOcrTitle(detailItem) : 'Détail OCR'}
              </Text>
              <TouchableOpacity
                onPress={closeDetailModal}
              >
                <Text style={styles.modalCloseText}>Fermer</Text>
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={styles.modalLoader}>
                <ActivityIndicator size="small" color="#4F46E5" />
              </View>
            ) : (
              <>
                <Text style={styles.modalSubText}>
                  {detailItem?.status ? `Statut: ${getOcrStatusLabel(detailItem.status)}` : ''}
                </Text>
                <TouchableOpacity
                  style={styles.renameLinkButton}
                  onPress={() => openRenameModal(detailItem)}
                  disabled={detailSaving}
                >
                  <Text style={styles.renameLinkButtonText}>Renommer ce document</Text>
                </TouchableOpacity>
                {detailPages.length > 0 ? (
                  <View style={styles.pageToolbar}>
                    <TouchableOpacity
                      style={[
                        styles.pageToolbarButton,
                        detailPageIndex <= 0 && styles.pageToolbarButtonDisabled,
                      ]}
                      onPress={() => handleSelectDetailPage(detailPageIndex - 1)}
                      disabled={detailPageIndex <= 0}
                    >
                      <Text style={styles.pageToolbarButtonText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.pageToolbarLabel}>
                      Page {currentDetailPage?.pageNumber || 1}/{detailPages.length}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.pageToolbarButton,
                        detailPageIndex >= detailPages.length - 1 && styles.pageToolbarButtonDisabled,
                      ]}
                      onPress={() => handleSelectDetailPage(detailPageIndex + 1)}
                      disabled={detailPageIndex >= detailPages.length - 1}
                    >
                      <Text style={styles.pageToolbarButtonText}>→</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={styles.textWrap}>
                  <TextInput
                    value={detailPageDraft}
                    onChangeText={setDetailPageDraft}
                    editable={!detailSaving}
                    multiline
                    style={styles.pageTextInput}
                    placeholder="Texte OCR indisponible"
                    placeholderTextColor="#9CA3AF"
                    textAlignVertical="top"
                  />
                </View>
                <Text style={styles.copyHintText}>Appui long dans le texte pour copier une partie.</Text>

                <View style={styles.splitButtonsRow}>
                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      styles.splitButton,
                      styles.splitButtonGap,
                      detailSaving && styles.secondaryButtonDisabled,
                    ]}
                    onPress={() => copyTextToClipboard(detailPageDraft, 'Texte de page')}
                    disabled={detailSaving}
                  >
                    <Text style={styles.secondaryButtonText}>Copier la page</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryButton, styles.splitButton, detailSaving && styles.secondaryButtonDisabled]}
                    onPress={() => copyTextToClipboard(detailFullText, 'Texte complet')}
                    disabled={detailSaving}
                  >
                    <Text style={styles.secondaryButtonText}>Copier tout</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.splitButtonsRow}>
                  <TouchableOpacity
                    style={[
                      styles.fillButton,
                      styles.splitButton,
                      styles.splitButtonGap,
                      (!canSaveCurrentPage || detailSaving) && styles.secondaryButtonDisabled,
                    ]}
                    onPress={handleSaveDetailPageText}
                    disabled={!canSaveCurrentPage || detailSaving}
                  >
                    {detailSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.fillButtonText}>Enregistrer la page</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.clearButton,
                      styles.splitButton,
                      (!canEditCurrentPage || detailSaving) && styles.secondaryButtonDisabled,
                    ]}
                    onPress={handleClearDetailPageText}
                    disabled={!canEditCurrentPage || detailSaving}
                  >
                    <Text style={styles.clearButtonText}>Vider la page</Text>
                  </TouchableOpacity>
                </View>

                {!canEditCurrentPage ? (
                  <Text style={styles.editDisabledText}>
                    Édition indisponible: identifiant de page manquant dans la réponse OCR.
                  </Text>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    !detailOriginalFiles.length && styles.secondaryButtonDisabled,
                  ]}
                  onPress={() => openOriginalViewer(detailItem)}
                  disabled={!detailOriginalFiles.length}
                >
                  <Text style={styles.secondaryButtonText}>
                    {detailOriginalFiles.length
                      ? `Voir l'original (${detailOriginalFiles.length})`
                      : 'Original indisponible'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.fillButton}
                  onPress={() => {
                    closeDetailModal();
                    openFillPicker(detailItem);
                  }}
                  disabled={detailItem?.status !== 'done'}
                >
                  <Text style={styles.fillButtonText}>Remplir un formulaire avec ce texte</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={renameModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => closeRenameModal()}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Renommer le document OCR</Text>
              <TouchableOpacity onPress={() => closeRenameModal()} disabled={renameLoading}>
                <Text style={styles.modalCloseText}>Fermer</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.createInput}
              value={renameDraft}
              onChangeText={setRenameDraft}
              editable={!renameLoading}
              placeholder="Nouveau titre"
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.splitButtonsRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, styles.splitButton, styles.splitButtonGap]}
                onPress={() => closeRenameModal()}
                disabled={renameLoading}
              >
                <Text style={styles.secondaryButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.fillButton,
                  styles.splitButton,
                  (renameLoading || !renameDraft.trim()) && styles.secondaryButtonDisabled,
                ]}
                onPress={handleRenameOcrDocument}
                disabled={renameLoading || !renameDraft.trim()}
              >
                {renameLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.fillButtonText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={originalViewerVisible}
        animationType="slide"
        onRequestClose={closeOriginalViewer}
      >
        <View style={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle} numberOfLines={1}>
              Original OCR
            </Text>
            <TouchableOpacity onPress={closeOriginalViewer}>
              <Text style={styles.viewerCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.viewerBody}>
            {currentOriginal ? (
              currentOriginalIsImage ? (
                <ScrollView
                  contentContainerStyle={styles.viewerImageScrollContent}
                  maximumZoomScale={4}
                  minimumZoomScale={1}
                  centerContent
                >
                  <Image source={currentOriginalSource} style={styles.viewerImage} resizeMode="contain" />
                </ScrollView>
              ) : (
                <View style={styles.viewerFileFallback}>
                  <Text style={styles.viewerFileIcon}>📄</Text>
                  <Text style={styles.viewerFileText} numberOfLines={2}>
                    {currentOriginal?.name || 'Document'}
                  </Text>
                  <TouchableOpacity style={styles.viewerOpenButton} onPress={openCurrentOriginalExternally}>
                    <Text style={styles.viewerOpenButtonText}>Ouvrir le fichier</Text>
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <View style={styles.viewerFileFallback}>
                <Text style={styles.viewerFileText}>Aucun original disponible.</Text>
              </View>
            )}
          </View>

          {originalFiles.length > 1 ? (
            <View style={styles.viewerPager}>
              <TouchableOpacity
                style={[
                  styles.viewerPagerButton,
                  originalIndex <= 0 && styles.viewerPagerButtonDisabled,
                ]}
                onPress={() => setOriginalIndex((prev) => Math.max(0, prev - 1))}
                disabled={originalIndex <= 0}
              >
                <Text style={styles.viewerPagerButtonText}>Précédent</Text>
              </TouchableOpacity>
              <Text style={styles.viewerPagerText}>
                {originalIndex + 1}/{originalFiles.length}
              </Text>
              <TouchableOpacity
                style={[
                  styles.viewerPagerButton,
                  originalIndex >= originalFiles.length - 1 && styles.viewerPagerButtonDisabled,
                ]}
                onPress={() =>
                  setOriginalIndex((prev) => Math.min(originalFiles.length - 1, prev + 1))
                }
                disabled={originalIndex >= originalFiles.length - 1}
              >
                <Text style={styles.viewerPagerButtonText}>Suivant</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeCreateModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau document scanné</Text>
              <TouchableOpacity onPress={closeCreateModal} disabled={createLoading}>
                <Text style={styles.modalCloseText}>Fermer</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.createInput}
              value={createTitle}
              onChangeText={setCreateTitle}
              editable={!createLoading}
              placeholder="Titre du document (optionnel)"
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.pickerActionsRow}>
              <TouchableOpacity
                style={[styles.pickerActionButton, styles.pickerActionGap]}
                onPress={handlePickFromCamera}
                disabled={createLoading}
              >
                <Text style={styles.pickerActionText}>📸 Prendre une photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickerActionButton}
                onPress={handlePickFromGallery}
                disabled={createLoading}
              >
                <Text style={styles.pickerActionText}>🖼️ Importer</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerActionsRow}>
              <TouchableOpacity
                style={styles.pickerActionButton}
                onPress={handlePickFromFiles}
                disabled={createLoading}
              >
                <Text style={styles.pickerActionText}>📄 Importer PDF/Image</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbList}>
              {createImages.length ? (
                createImages.map((image, index) => (
                  <View key={`${image.uri}-${index}`} style={styles.thumbItem}>
                    {isImageMimeType(image?.type || image?.mimeType) ? (
                      <Image source={{ uri: image.uri }} style={styles.thumbImage} />
                    ) : (
                      <View style={styles.thumbFilePlaceholder}>
                        <Text style={styles.thumbFileIcon}>📄</Text>
                        <Text style={styles.thumbFileName} numberOfLines={2}>
                          {image?.fileName || `Fichier ${index + 1}`}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.thumbRemove}
                      onPress={() => handleRemoveCreateImageAt(index)}
                      disabled={createLoading}
                    >
                      <Text style={styles.thumbRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <View style={styles.thumbEmpty}>
                  <Text style={styles.thumbEmptyText}>Aucun document ajouté</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.fillButton, createLoading && styles.actionButtonDisabled]}
              onPress={handleCreateOcrDocument}
              disabled={createLoading}
            >
              {createLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.fillButtonText}>Analyser le document</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SelectionModal
        visible={fillPickerVisible}
        title="Choisir un formulaire"
        subtitle={fillSourceOcr ? getOcrTitle(fillSourceOcr) : ''}
        items={fillableDocuments.map((item) => ({
          id: item?.id,
          raw: item,
          title: getDocumentName(item),
          subtitle: formatDate(item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt),
          meta: item?.applied_template_name || item?.appliedTemplateName || 'Template appliqué',
        }))}
        loading={fillPickerLoading || Boolean(fillActionKey)}
        onSelect={handleCreateFillFromOcr}
        onClose={closeFillPicker}
        searchPlaceholder="Rechercher un document..."
        emptyText="Aucun document avec template appliqué"
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
    fontSize: 18,
    fontWeight: '700',
  },
  headerAction: {
    minWidth: 78,
    alignItems: 'flex-end',
  },
  headerActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    padding: 15,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardMain: {
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    flex: 1,
    marginRight: 8,
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  cardDate: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#4B5563',
  },
  cardActions: {
    marginTop: 12,
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionButtonGap: {
    marginRight: 8,
  },
  actionButtonPrimary: {
    backgroundColor: '#111827',
  },
  actionButtonSecondary: {
    backgroundColor: '#4F46E5',
  },
  actionButtonDanger: {
    backgroundColor: '#EF4444',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  empty: {
    marginTop: 110,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '82%',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    flex: 1,
    marginRight: 12,
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
  },
  modalCloseText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '600',
  },
  modalLoader: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  modalSubText: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 12,
    color: '#4B5563',
  },
  renameLinkButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  renameLinkButtonText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
  pageToolbar: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageToolbarButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  pageToolbarButtonDisabled: {
    opacity: 0.45,
  },
  pageToolbarButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  pageToolbarLabel: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  createInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  pickerActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
  },
  pickerActionButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  pickerActionGap: {
    marginRight: 8,
  },
  pickerActionText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  thumbList: {
    marginTop: 10,
  },
  thumbItem: {
    marginRight: 8,
    width: 92,
    height: 92,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFilePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
  },
  thumbFileIcon: {
    fontSize: 18,
  },
  thumbFileName: {
    marginTop: 4,
    fontSize: 10,
    color: '#1F2937',
    textAlign: 'center',
  },
  thumbRemove: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.78)',
  },
  thumbRemoveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  thumbEmpty: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  thumbEmptyText: {
    color: '#6B7280',
    fontSize: 12,
  },
  textWrap: {
    maxHeight: 280,
    minHeight: 180,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 8,
    backgroundColor: '#F9FAFB',
  },
  pageTextInput: {
    minHeight: 160,
    fontSize: 12,
    color: '#111827',
    lineHeight: 18,
  },
  fullText: {
    fontSize: 12,
    color: '#111827',
    lineHeight: 18,
  },
  copyHintText: {
    marginTop: 6,
    color: '#6B7280',
    fontSize: 11,
  },
  splitButtonsRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  splitButton: {
    flex: 1,
    marginTop: 0,
  },
  splitButtonGap: {
    marginRight: 8,
  },
  clearButton: {
    marginTop: 0,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    paddingVertical: 11,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  editDisabledText: {
    marginTop: 8,
    color: '#92400E',
    fontSize: 11,
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#111827',
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  fillButton: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    paddingVertical: 11,
    alignItems: 'center',
  },
  fillButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#111827',
  },
  viewerHeader: {
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  viewerTitle: {
    flex: 1,
    marginRight: 12,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  viewerCloseText: {
    color: '#C7D2FE',
    fontSize: 14,
    fontWeight: '700',
  },
  viewerBody: {
    flex: 1,
  },
  viewerImageScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerFileFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  viewerFileIcon: {
    fontSize: 40,
  },
  viewerFileText: {
    marginTop: 12,
    color: '#F3F4F6',
    fontSize: 14,
    textAlign: 'center',
  },
  viewerOpenButton: {
    marginTop: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  viewerOpenButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  viewerPager: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewerPagerButton: {
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 8,
    backgroundColor: '#374151',
  },
  viewerPagerButtonDisabled: {
    opacity: 0.4,
  },
  viewerPagerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  viewerPagerText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
});
