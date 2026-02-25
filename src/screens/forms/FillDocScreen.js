import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { formFills, ocrDocuments, transcriptions } from '../../api/client';
import { documentConfigsApi } from '../../api/documentConfigsService';
import ZoomableImageViewer from '../../components/ZoomableImageViewer';
import SelectionModal from '../../components/SelectionModal';
import SourcePickerModal from '../../components/forms/SourcePickerModal';
import { arrayBufferToBase64, sanitizeFileName } from '../../utils/binaryFiles';
import { flattenFields } from '../../utils/documentConfigFields';

const PRIMARY = '#3B3BD4';
const PREVIEW_FILE_NAME = 'preview.pdf';
const PREFILL_TIMEOUT_MS = 60000;
const PREFILL_POLL_INTERVAL_MS = 2000;
const API_BASE_URL = String(process.env.EXPO_PUBLIC_API_URL || 'https://api.scarch.cloud').replace(/\/+$/, '');

const KNOWN_KEY_PREFIXES = ['d.', 'data.', 'form.', 'fields.'];

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
const normalizeFieldType = (value) => String(value || 'text').toLowerCase();
const toNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const sanitizeApiKey = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let normalized = raw;
  const lower = normalized.toLowerCase();
  const matchedPrefix = KNOWN_KEY_PREFIXES.find((prefix) => lower.startsWith(prefix));
  if (matchedPrefix) {
    normalized = normalized.slice(matchedPrefix.length);
  }

  return normalized
    .replace(/\[(.+?)\]/g, '_$1')
    .replace(/\./g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const resolveApiKey = (candidates = [], fallback = '') => {
  for (const candidate of candidates) {
    const nextKey = sanitizeApiKey(candidate);
    if (nextKey) return nextKey;
  }
  return sanitizeApiKey(fallback);
};

const decodeMaybeUriComponent = (value) => {
  const raw = String(value ?? '');
  if (!raw) return '';

  try {
    return decodeURIComponent(raw);
  } catch (_error) {
    // ignore
  }

  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch (_error) {
    return raw;
  }
};

const extractList = (response) => {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const isDoneStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'done' || normalized === 'completed';
};

const formatDate = (value) => {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getTranscriptionName = (item) =>
  decodeMaybeUriComponent(
    item?.title ||
      item?.document_name ||
      item?.documentName ||
      item?.session_name ||
      item?.sessionName ||
      `Transcription #${item?.id ?? ''}`
  );

const getOcrName = (item) =>
  decodeMaybeUriComponent(
    item?.title ||
      item?.name ||
      item?.document_name ||
      item?.documentName ||
      `Document OCR #${item?.id ?? ''}`
  );

const resolveFormFillSourceType = (item) => {
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

const getFormFillSourceDisplayName = (item, sourceType) => {
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
    return decodeMaybeUriComponent(
      item?.transcription_title || item?.transcriptionTitle || `Transcription #${sourceId}`
    );
  }
  if (sourceType === 'ocr') {
    return decodeMaybeUriComponent(
      item?.ocr_document_title ||
        item?.ocrDocumentTitle ||
        item?.source_title ||
        item?.sourceTitle ||
        `Document OCR #${sourceId}`
    );
  }
  if (sourceType === 'form_fill') {
    return decodeMaybeUriComponent(
      item?.source_form_fill_name ||
        item?.sourceFormFillName ||
        item?.source_form_fill_title ||
        item?.sourceFormFillTitle ||
        item?.source_form_fill_document_name ||
        item?.sourceFormFillDocumentName ||
        `Formulaire #${sourceId}`
    );
  }
  return decodeMaybeUriComponent(item?.source_title || item?.sourceTitle || `Source #${sourceId}`);
};

const normalizeFields = (payload) => {
  const rawFields = Array.isArray(payload?.fields) ? payload.fields : Array.isArray(payload) ? payload : [];
  const flattened = flattenFields(rawFields, { allowTaglessTable: true });
  return flattened.map((field, index) => {
    const normalizedType = normalizeFieldType(field?.type);
    const internalId = String(field?.id || field?.tag || field?.iterable || `field_${index + 1}`);
    const apiKey = normalizedType === 'table'
      ? resolveApiKey(
          [field?.api_key, field?.apiKey, field?.iterable, field?.tag, field?.id, field?.name],
          internalId
        )
      : resolveApiKey(
          [field?.api_key, field?.apiKey, field?.tag, field?.id, field?.name, field?.field_name],
          internalId
        );

    return {
      ...field,
      id: internalId,
      apiKey,
      type: normalizedType,
      label: String(field?.label || field?.id || `Champ ${index + 1}`),
      section: String(field?.section || 'Informations'),
      columns: Array.isArray(field?.columns)
        ? field.columns.map((column, columnIndex) => {
            const internalColumnId = String(column?.id || column?.tag || `column_${columnIndex + 1}`);
            return {
              ...column,
              id: internalColumnId,
              apiKey: resolveApiKey(
                [column?.api_key, column?.apiKey, column?.id, column?.tag, column?.name, column?.field_name],
                internalColumnId
              ),
              label: String(column?.label || column?.header || column?.id || `Colonne ${columnIndex + 1}`),
              type: normalizeFieldType(column?.type),
              options: Array.isArray(column?.options) ? column.options : [],
            };
          })
        : [],
      options: Array.isArray(field?.options) ? field.options : [],
    };
  });
};

const createEmptyTableRow = (columns) => {
  const result = {};
  (columns || []).forEach((column) => {
    const key = String(column?.apiKey || column?.id || '');
    if (!key) return;
    result[key] = normalizeFieldType(column?.type) === 'checkbox' ? false : '';
  });
  return result;
};

const createPlaceholderValueForType = (type) => {
  const normalized = normalizeFieldType(type);
  if (normalized === 'number') return 0;
  if (normalized === 'date') return 'JJ/MM/AAAA';
  if (normalized === 'text' || normalized === 'email' || normalized === 'tel' || normalized === 'textarea') {
    return '___';
  }
  return '___';
};

const createPlaceholderTableRow = (columns) => {
  const row = {};
  (columns || []).forEach((column) => {
    const key = String(column?.apiKey || column?.id || '');
    if (!key) return;
    row[key] = '___';
  });
  return row;
};

const buildPlaceholderData = (fields) => {
  const data = {};
  flattenFields(fields, { allowTaglessTable: true }).forEach((field) => {
    const payloadKey = String(field?.apiKey || field?.id || '');
    if (!payloadKey) return;

    if (field.type === 'table') {
      data[payloadKey] = [createPlaceholderTableRow(field.columns)];
      return;
    }
    data[payloadKey] = createPlaceholderValueForType(field.type);
  });
  return data;
};

const hasMeaningfulValue = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value ?? '').trim().length > 0;
};

const normalizeTableRowsForPayload = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const normalizedRow = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        const normalizedKey = sanitizeApiKey(key);
        if (!normalizedKey) return;
        normalizedRow[normalizedKey] = value;
      });
      return normalizedRow;
    })
    .filter((row) => Object.values(row).some(hasMeaningfulValue));

const buildManualData = (fields, simpleValues, tableValues) => {
  const data = {};
  flattenFields(fields, { allowTaglessTable: true }).forEach((field) => {
    const payloadKey = String(field?.apiKey || field?.id || '');
    if (!payloadKey) return;

    if (field.type === 'table') {
      data[payloadKey] = normalizeTableRowsForPayload(tableValues[field.id] || []);
      return;
    }

    const value = simpleValues[field.id];
    data[payloadKey] = value ?? (field.type === 'checkbox' ? false : '');
  });
  return data;
};

const parsePrefillCandidate = (candidate) => {
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
      return null;
    }
  }
  if (typeof candidate === 'object') return candidate;
  return null;
};

const extractPrefillData = (payload) => {
  const candidates = [
    payload?.prefill_data,
    payload?.prefillData,
    payload?.config?.prefill_data,
    payload?.config?.prefillData,
    payload?.document_config?.prefill_data,
    payload?.document_config?.prefillData,
    payload?.documentConfig?.prefill_data,
    payload?.documentConfig?.prefillData,
    payload?.item?.prefill_data,
    payload?.item?.prefillData,
    payload?.data?.prefill_data,
    payload?.data?.prefillData,
    payload?.result?.prefill_data,
    payload?.result?.prefillData,
  ];

  for (const candidate of candidates) {
    const parsed = parsePrefillCandidate(candidate);
    if (parsed) return parsed;
  }
  return null;
};

const getFormFillDocumentConfigId = (item) =>
  toNumber(item?.document_config_id ?? item?.documentConfigId, null);

const getFormFillCreatedAtMs = (item) => {
  const raw =
    item?.created_at ??
    item?.createdAt ??
    item?.updated_at ??
    item?.updatedAt ??
    null;
  const timestamp = raw ? new Date(raw).getTime() : NaN;
  if (Number.isFinite(timestamp)) return timestamp;
  return toNumber(item?.id, 0) || 0;
};

const formatOptionLabel = (option) => {
  if (option && typeof option === 'object') return String(option.label || option.value || '');
  return String(option || '');
};

const formatOptionValue = (option) => {
  if (option && typeof option === 'object') {
    const value = option.value ?? option.id ?? option.label;
    return String(value ?? '');
  }
  return String(option ?? '');
};

export default function FillDocScreen({ navigation, route }) {
  const documentConfigId = Number(route?.params?.documentConfigId);
  const initialTitle = String(route?.params?.documentTitle || '').trim();
  const previewOnly = Boolean(route?.params?.previewOnly);

  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillStatusText, setPrefillStatusText] = useState('');

  const [documentTitle, setDocumentTitle] = useState(initialTitle);
  const [previewImage, setPreviewImage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [openingPreviewPdf, setOpeningPreviewPdf] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const [fields, setFields] = useState([]);
  const [simpleValues, setSimpleValues] = useState({});
  const [tableValues, setTableValues] = useState({});

  const [selectModal, setSelectModal] = useState({
    visible: false,
    options: [],
    target: null,
    fieldId: '',
    tableFieldId: '',
    rowIndex: -1,
    columnId: '',
  });

  const [sourcePickerVisible, setSourcePickerVisible] = useState(false);

  const [transcriptionPickerVisible, setTranscriptionPickerVisible] = useState(false);
  const [transcriptionPickerItems, setTranscriptionPickerItems] = useState([]);
  const [transcriptionPickerLoading, setTranscriptionPickerLoading] = useState(false);

  const [ocrPickerVisible, setOcrPickerVisible] = useState(false);
  const [ocrPickerItems, setOcrPickerItems] = useState([]);
  const [ocrPickerLoading, setOcrPickerLoading] = useState(false);

  const [formFillPickerVisible, setFormFillPickerVisible] = useState(false);
  const [formFillPickerItems, setFormFillPickerItems] = useState([]);
  const [formFillPickerLoading, setFormFillPickerLoading] = useState(false);

  const openPdf = async (fileUri, dialogTitle = 'Partager le PDF') => {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Info', 'Le partage est indisponible sur cet appareil.');
      return;
    }
    try {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle,
      });
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('cancel') || message.includes('dismiss')) return;
      throw error;
    }
  };

  const fillAndStorePdf = async ({ data, targetFileName, share = true, dialogTitle = 'Partager le PDF' }) => {
    const response = await documentConfigsApi.fill(documentConfigId, data);
    const cacheDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!cacheDirectory) {
      throw new Error('Stockage local indisponible.');
    }

    const fileName = String(targetFileName || PREVIEW_FILE_NAME).trim() || PREVIEW_FILE_NAME;
    const fileUri = `${cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, arrayBufferToBase64(response?.arrayBuffer), {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (share) {
      await openPdf(fileUri, dialogTitle);
    }

    return fileUri;
  };

  const loadPreviewImage = async (page = 1) => {
    console.log('[Preview] loadPreviewImage start, page:', page);
    const safeRequestedPage = Number.isFinite(Number(page)) ? Math.max(1, Math.floor(Number(page))) : 1;
    setPreviewImage('');
    console.log('[Preview] image cleared');
    setPreviewing(true);
    try {
      const cacheDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!cacheDirectory) {
        throw new Error('Stockage local indisponible.');
      }

      const token = await AsyncStorage.getItem('token');
      if (!token) {
        throw new Error("Token d'authentification manquant.");
      }

      const localUri = `${cacheDirectory}preview_${documentConfigId}_p${safeRequestedPage}.png`;
      const previewUrl = `${API_BASE_URL}/api/document-configs/${documentConfigId}/preview-image?page=${safeRequestedPage}`;
      const downloadResult = await FileSystem.downloadAsync(previewUrl, localUri, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const statusCode = Number(downloadResult?.status ?? 0);
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`Erreur HTTP ${statusCode}`);
      }

      const responseHeaders = downloadResult?.headers || {};
      const responseTotalPages = Number(
        responseHeaders['x-total-pages'] ??
          responseHeaders['X-Total-Pages'] ??
          responseHeaders['x_total_pages'] ??
          1
      );
      const safeTotalPages = Number.isFinite(responseTotalPages)
        ? Math.max(1, Math.floor(responseTotalPages))
        : 1;

      const responsePage = Number(
        responseHeaders['x-current-page'] ??
          responseHeaders['X-Current-Page'] ??
          responseHeaders['x_current_page'] ??
          safeRequestedPage
      );
      const safePage = Number.isFinite(responsePage)
        ? Math.min(safeTotalPages, Math.max(1, Math.floor(responsePage)))
        : Math.min(safeTotalPages, safeRequestedPage);

      const contentLengthHeader =
        responseHeaders['content-length'] || responseHeaders['Content-Length'] || '0';
      const safeLength = Number.isFinite(Number(contentLengthHeader))
        ? Number(contentLengthHeader)
        : 0;
      console.log('[Preview] image received, length:', safeLength, 'totalPages:', safeTotalPages);

      setPreviewImage(downloadResult?.uri || localUri);
      setTotalPages(safeTotalPages);
      setCurrentPage(safePage);
    } catch (previewError) {
      console.log('[Preview] ERROR:', previewError?.message, previewError?.response?.status);
      setPreviewImage('');
      setTotalPages(1);
      setCurrentPage(1);
    } finally {
      setPreviewing(false);
    }
  };

  const loadData = async () => {
    if (!Number.isFinite(documentConfigId)) {
      Alert.alert('Erreur', 'Identifiant de configuration invalide.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [configResponse, fieldsResponse] = await Promise.all([
        documentConfigsApi.get(documentConfigId).catch(() => null),
        documentConfigsApi.fields(documentConfigId),
      ]);

      const normalizedFields = normalizeFields(fieldsResponse);
      setFields(normalizedFields);

      const titleFromConfig = String(configResponse?.config?.meta?.title || configResponse?.meta?.title || '').trim();
      if (titleFromConfig) {
        setDocumentTitle(titleFromConfig);
      }

      const initialSimpleValues = {};
      const initialTableValues = {};
      normalizedFields.forEach((field) => {
        if (field.type === 'table') {
          initialTableValues[field.id] = [createEmptyTableRow(field.columns)];
          return;
        }
        initialSimpleValues[field.id] = field.type === 'checkbox' ? false : '';
      });
      setSimpleValues(initialSimpleValues);
      setTableValues(initialTableValues);
      await loadPreviewImage(1);
    } catch (error) {
      console.error('Erreur chargement champs:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de charger les champs du formulaire.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [documentConfigId]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        console.log('[Preview] screen blur cleanup');
        setPreviewImage('');
        setCurrentPage(1);
      };
    }, [])
  );

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('blur', () => {
      console.log('[Preview] navigation blur');
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const suffix = previewOnly ? 'Aperçu' : 'Remplissage';
    const fullTitle = documentTitle ? `${documentTitle} — ${suffix}` : suffix;
    navigation.setOptions({
      title: fullTitle,
    });
  }, [documentTitle, navigation, previewOnly]);

  const handleOpenPreviewPdf = async () => {
    if (openingPreviewPdf) return;
    if (!Number.isFinite(documentConfigId)) {
      Alert.alert('Erreur', 'Identifiant de configuration invalide.');
      return;
    }

    setOpeningPreviewPdf(true);
    try {
      const previewData = buildPlaceholderData(fields);
      const previewFileName = `${sanitizeFileName(
        documentTitle || `formulaire_${documentConfigId}`,
        `formulaire_${documentConfigId}`
      )}_preview_${Date.now()}.pdf`;

      await fillAndStorePdf({
        data: previewData,
        targetFileName: previewFileName,
        share: true,
        dialogTitle: 'Aperçu PDF',
      });
    } catch (error) {
      console.error('Erreur ouverture PDF aperçu:', error);
      Alert.alert('Erreur', error?.message || "Impossible d'ouvrir le PDF.");
    } finally {
      setOpeningPreviewPdf(false);
    }
  };

  const groupedFields = useMemo(() => {
    const sectionOrder = [];
    const sectionMap = new Map();

    fields.forEach((field) => {
      const sectionName = String(field?.section || 'Informations');
      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, []);
        sectionOrder.push(sectionName);
      }
      sectionMap.get(sectionName).push(field);
    });

    return sectionOrder.map((sectionName) => ({
      title: sectionName,
      items: sectionMap.get(sectionName) || [],
    }));
  }, [fields]);

  const closeSourcePickers = () => {
    setSourcePickerVisible(false);
    setTranscriptionPickerVisible(false);
    setOcrPickerVisible(false);
    setFormFillPickerVisible(false);
  };

  const openSimpleSelect = (field) => {
    setSelectModal({
      visible: true,
      options: field?.options || [],
      target: 'simple',
      fieldId: field?.id || '',
      tableFieldId: '',
      rowIndex: -1,
      columnId: '',
    });
  };

  const openTableSelect = (tableFieldId, rowIndex, column) => {
    setSelectModal({
      visible: true,
      options: column?.options || [],
      target: 'table',
      fieldId: '',
      tableFieldId,
      rowIndex,
      columnId: column?.apiKey || column?.id || '',
    });
  };

  const applySelectOption = (value) => {
    if (selectModal.target === 'simple') {
      setSimpleValues((previous) => ({
        ...previous,
        [selectModal.fieldId]: value,
      }));
      setSelectModal((previous) => ({ ...previous, visible: false }));
      return;
    }

    if (selectModal.target === 'table') {
      setTableValues((previous) => {
        const nextRows = [...(previous[selectModal.tableFieldId] || [])];
        if (!nextRows[selectModal.rowIndex]) return previous;
        nextRows[selectModal.rowIndex] = {
          ...nextRows[selectModal.rowIndex],
          [selectModal.columnId]: value,
        };
        return {
          ...previous,
          [selectModal.tableFieldId]: nextRows,
        };
      });
      setSelectModal((previous) => ({ ...previous, visible: false }));
    }
  };

  const runPrefillAndShare = async (payload, statusText = "L'IA analyse votre transcription...") => {
    if (prefillLoading) return;
    if (!Number.isFinite(documentConfigId)) {
      Alert.alert('Erreur', 'Identifiant de configuration invalide.');
      return;
    }

    closeSourcePickers();
    setPrefillLoading(true);
    setPrefillStatusText(statusText);

    try {
      const prefillResponse = await documentConfigsApi.prefill(documentConfigId, payload);
      let prefillData = extractPrefillData(prefillResponse);
      let associatedFormFillId = null;

      const startAt = Date.now();
      while ((!prefillData || !associatedFormFillId) && Date.now() - startAt < PREFILL_TIMEOUT_MS) {
        await wait(PREFILL_POLL_INTERVAL_MS);
        const [configResponse, formFillsResponse] = await Promise.all([
          documentConfigsApi.get(documentConfigId),
          formFills.listFormFills({ document_config_id: documentConfigId }).catch(() => null),
        ]);

        prefillData = extractPrefillData(configResponse);

        const candidateItems = extractList(formFillsResponse)
          .filter((item) => getFormFillDocumentConfigId(item) === documentConfigId)
          .sort((a, b) => getFormFillCreatedAtMs(b) - getFormFillCreatedAtMs(a));
        associatedFormFillId = toNumber(candidateItems[0]?.id, null);

        if (prefillData && !associatedFormFillId) {
          setPrefillStatusText('Pré-remplissage prêt, récupération du résultat...');
        }
      }

      if (!prefillData) {
        throw new Error("Le pré-remplissage IA n'a pas répondu dans le délai de 60 secondes.");
      }
      if (!associatedFormFillId) {
        throw new Error('Le pré-remplissage est prêt, mais le résultat associé est introuvable pour ce formulaire.');
      }

      setPrefillStatusText('Ouverture du résultat pré-rempli...');
      const parentNavigation = navigation?.getParent?.();
      const resultParams = {
        screen: 'ResultDetailScreen',
        params: {
          formFillId: Number(associatedFormFillId),
          resultId: Number(associatedFormFillId),
        },
      };
      if (parentNavigation?.navigate) {
        parentNavigation.navigate('ResultsStack', resultParams);
      } else {
        navigation.navigate('ResultsStack', resultParams);
      }
    } catch (error) {
      console.error('Erreur prefill IA:', error);
      Alert.alert('Erreur', error?.message || "Impossible d'exécuter le pré-remplissage IA.");
    } finally {
      setPrefillLoading(false);
      setPrefillStatusText('');
    }
  };

  const loadTranscriptionPickerItems = async () => {
    setTranscriptionPickerLoading(true);
    try {
      const response = await transcriptions.list();
      setTranscriptionPickerItems(extractList(response));
    } catch (error) {
      console.error('Erreur chargement transcriptions:', error);
      Alert.alert('Erreur', 'Impossible de charger les transcriptions.');
      setTranscriptionPickerItems([]);
    } finally {
      setTranscriptionPickerLoading(false);
    }
  };

  const loadOcrPickerItems = async () => {
    setOcrPickerLoading(true);
    try {
      const response = await ocrDocuments.listOcrDocuments();
      const items = extractList(response).filter((item) => isDoneStatus(item?.status));
      setOcrPickerItems(items);
    } catch (error) {
      console.error('Erreur chargement OCR:', error);
      Alert.alert('Erreur', 'Impossible de charger les documents OCR.');
      setOcrPickerItems([]);
    } finally {
      setOcrPickerLoading(false);
    }
  };

  const loadFormFillPickerItems = async () => {
    setFormFillPickerLoading(true);
    try {
      const response = await formFills.listFormFills();
      const items = extractList(response).filter((item) => isDoneStatus(item?.status));
      setFormFillPickerItems(items);
    } catch (error) {
      console.error('Erreur chargement formulaires remplis:', error);
      Alert.alert('Erreur', 'Impossible de charger les formulaires remplis.');
      setFormFillPickerItems([]);
    } finally {
      setFormFillPickerLoading(false);
    }
  };

  const handleSelectAiSource = async (sourceType) => {
    setSourcePickerVisible(false);

    if (sourceType === 'transcription') {
      setTranscriptionPickerVisible(true);
      await loadTranscriptionPickerItems();
      return;
    }

    if (sourceType === 'ocr') {
      setOcrPickerVisible(true);
      await loadOcrPickerItems();
      return;
    }

    if (sourceType === 'form_fill') {
      setFormFillPickerVisible(true);
      await loadFormFillPickerItems();
    }
  };

  const handleSelectTranscription = async (selectionItem) => {
    const selected = selectionItem?.raw || selectionItem;
    if (!selected?.id) return;
    await runPrefillAndShare(
      { transcription_id: selected.id },
      "L'IA analyse votre transcription..."
    );
  };

  const handleCreateNewTranscription = () => {
    setTranscriptionPickerVisible(false);
    const parentNavigation = navigation?.getParent?.();
    if (parentNavigation?.navigate) {
      parentNavigation.navigate('DataStack', { screen: 'CreateTranscriptionScreen' });
      return;
    }
    navigation.navigate('DataStack', { screen: 'CreateTranscriptionScreen' });
  };

  const handleSelectOcr = async (selectionItem) => {
    const selected = selectionItem?.raw || selectionItem;
    if (!selected?.id) return;
    await runPrefillAndShare(
      { source_type: 'ocr', source_id: selected.id },
      "L'IA analyse votre document OCR..."
    );
  };

  const handleSelectFormFillSource = async (selectionItem) => {
    const selected = selectionItem?.raw || selectionItem;
    if (!selected?.id) return;
    await runPrefillAndShare(
      { source_type: 'form_fill', source_id: selected.id },
      "L'IA analyse le formulaire source..."
    );
  };

  const submitManualFill = async () => {
    if (submitting) return;
    if (!Number.isFinite(documentConfigId)) {
      Alert.alert('Erreur', 'Identifiant de configuration invalide.');
      return;
    }
    setSubmitting(true);

    try {
      const data = buildManualData(fields, simpleValues, tableValues);
      const manualFileName = `${sanitizeFileName(
        documentTitle || `formulaire_${documentConfigId}`,
        `formulaire_${documentConfigId}`
      )}_${Date.now()}.pdf`;
      await fillAndStorePdf({
        data,
        targetFileName: manualFileName,
        share: true,
      });
      Alert.alert('PDF généré', 'Le PDF manuel a été généré.');
    } catch (error) {
      console.error('Erreur génération PDF manuel:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de générer le PDF.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderSimpleField = (field) => {
    const value = simpleValues[field.id];

    if (field.type === 'checkbox') {
      return (
        <View style={styles.checkboxRow}>
          <Text style={styles.checkboxLabel}>{field.label}</Text>
          <Switch
            value={Boolean(value)}
            onValueChange={(nextValue) =>
              setSimpleValues((previous) => ({
                ...previous,
                [field.id]: nextValue,
              }))
            }
            trackColor={{ true: '#C7D2FE', false: '#E5E7EB' }}
            thumbColor={Boolean(value) ? PRIMARY : '#fff'}
          />
        </View>
      );
    }

    if (field.type === 'select') {
      const hasOptions = Array.isArray(field.options) && field.options.length > 0;
      if (hasOptions) {
        return (
          <TouchableOpacity style={styles.selectButton} onPress={() => openSimpleSelect(field)}>
            <Text style={[styles.selectButtonText, value ? styles.selectButtonValue : styles.selectButtonPlaceholder]}>
              {value || 'Sélectionner'}
            </Text>
          </TouchableOpacity>
        );
      }

      return (
        <TextInput
          style={styles.input}
          value={String(value || '')}
          onChangeText={(nextValue) =>
            setSimpleValues((previous) => ({
              ...previous,
              [field.id]: nextValue,
            }))
          }
          placeholder={field.label}
          placeholderTextColor="#9CA3AF"
        />
      );
    }

    return (
      <TextInput
        style={[styles.input, field.type === 'textarea' && styles.textarea]}
        value={String(value || '')}
        onChangeText={(nextValue) =>
          setSimpleValues((previous) => ({
            ...previous,
            [field.id]: nextValue,
          }))
        }
        placeholder={field.type === 'date' ? 'JJ/MM/AAAA' : field.label}
        placeholderTextColor="#9CA3AF"
        keyboardType={field.type === 'number' ? 'numeric' : 'default'}
        multiline={field.type === 'textarea'}
        textAlignVertical={field.type === 'textarea' ? 'top' : 'center'}
      />
    );
  };

  const renderTableField = (field) => {
    const rows = tableValues[field.id] || [];
    return (
      <View style={styles.tableCard}>
        <View style={styles.tableHeaderRow}>
          <Text style={styles.tableLabel}>{field.label}</Text>
          <TouchableOpacity
            style={styles.addRowButton}
            onPress={() =>
              setTableValues((previous) => ({
                ...previous,
                [field.id]: [...(previous[field.id] || []), createEmptyTableRow(field.columns)],
              }))
            }
          >
            <Text style={styles.addRowButtonText}>+ Ajouter une ligne</Text>
          </TouchableOpacity>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.tableEmptyText}>Aucune ligne</Text>
        ) : (
          rows.map((row, rowIndex) => (
            <View key={`${field.id}-row-${rowIndex}`} style={styles.tableRowCard}>
              <TouchableOpacity
                style={styles.removeRowButton}
                onPress={() =>
                  setTableValues((previous) => ({
                    ...previous,
                    [field.id]: (previous[field.id] || []).filter((_, index) => index !== rowIndex),
                  }))
                }
              >
                <Text style={styles.removeRowButtonText}>🗑️</Text>
              </TouchableOpacity>

              {(field.columns || []).map((column) => {
                const columnStateKey = String(column?.apiKey || column?.id || '');
                const columnValue = row[columnStateKey];
                const columnType = normalizeFieldType(column.type);
                const hasOptions = Array.isArray(column.options) && column.options.length > 0;

                if (columnType === 'checkbox') {
                  return (
                    <View key={`${field.id}-${rowIndex}-${column.id || columnStateKey}`} style={styles.checkboxRow}>
                      <Text style={styles.checkboxLabel}>{column.label}</Text>
                      <Switch
                        value={Boolean(columnValue)}
                        onValueChange={(nextValue) =>
                          setTableValues((previous) => {
                            const nextRows = [...(previous[field.id] || [])];
                            nextRows[rowIndex] = {
                              ...nextRows[rowIndex],
                              [columnStateKey]: nextValue,
                            };
                            return {
                              ...previous,
                              [field.id]: nextRows,
                            };
                          })
                        }
                        trackColor={{ true: '#C7D2FE', false: '#E5E7EB' }}
                        thumbColor={Boolean(columnValue) ? PRIMARY : '#fff'}
                      />
                    </View>
                  );
                }

                if (columnType === 'select' && hasOptions) {
                  return (
                    <TouchableOpacity
                      key={`${field.id}-${rowIndex}-${column.id || columnStateKey}`}
                      style={styles.selectButton}
                      onPress={() => openTableSelect(field.id, rowIndex, column)}
                    >
                      <Text
                        style={[
                          styles.selectButtonText,
                          columnValue ? styles.selectButtonValue : styles.selectButtonPlaceholder,
                        ]}
                      >
                        {columnValue || `Sélectionner ${column.label}`}
                      </Text>
                    </TouchableOpacity>
                  );
                }

                return (
                  <TextInput
                    key={`${field.id}-${rowIndex}-${column.id || columnStateKey}`}
                    style={[styles.input, columnType === 'textarea' && styles.textarea]}
                    value={String(columnValue || '')}
                    onChangeText={(nextValue) =>
                      setTableValues((previous) => {
                        const nextRows = [...(previous[field.id] || [])];
                        nextRows[rowIndex] = {
                          ...nextRows[rowIndex],
                          [columnStateKey]: nextValue,
                        };
                        return {
                          ...previous,
                          [field.id]: nextRows,
                        };
                      })
                    }
                    placeholder={columnType === 'date' ? 'JJ/MM/AAAA' : column.label}
                    placeholderTextColor="#9CA3AF"
                    keyboardType={columnType === 'number' ? 'numeric' : 'default'}
                    multiline={columnType === 'textarea'}
                  />
                );
              })}
            </View>
          ))
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.loadingText}>Chargement des champs et génération de l&apos;aperçu...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>
            {previewOnly ? 'Voir le formulaire' : 'Aperçu du formulaire'}
          </Text>
          <Text style={styles.previewSubtitle}>
            {previewOnly
              ? 'Aperçu en lecture seule. Zoomez pour inspecter le formulaire.'
              : 'Le formulaire est visible directement dans l app avec zoom.'}
          </Text>

          {previewing ? (
            <View style={styles.previewProgress}>
              <ActivityIndicator size="small" color={PRIMARY} />
              <Text style={styles.previewProgressText}>Chargement de l&apos;aperçu...</Text>
            </View>
          ) : null}

          {previewImage ? (
            <ZoomableImageViewer
              uri={previewImage}
              frameStyle={styles.previewImage}
              onImageError={() => setPreviewImage('')}
            />
          ) : (
            <View style={styles.previewEmpty}>
              <Text style={styles.previewEmptyText}>Aucun aperçu disponible.</Text>
            </View>
          )}

          {totalPages > 1 ? (
            <View style={styles.previewPager}>
              <TouchableOpacity
                style={[
                  styles.previewPagerButton,
                  (currentPage === 1 || previewing) && styles.previewPagerButtonDisabled,
                ]}
                onPress={() => {
                  if (currentPage <= 1 || previewing) return;
                  loadPreviewImage(currentPage - 1);
                }}
                disabled={currentPage === 1 || previewing}
              >
                <Text style={styles.previewPagerButtonText}>◀</Text>
              </TouchableOpacity>

              <Text style={styles.previewPagerText}>
                Page {currentPage} / {totalPages}
              </Text>

              <TouchableOpacity
                style={[
                  styles.previewPagerButton,
                  (currentPage === totalPages || previewing) && styles.previewPagerButtonDisabled,
                ]}
                onPress={() => {
                  if (currentPage >= totalPages || previewing) return;
                  loadPreviewImage(currentPage + 1);
                }}
                disabled={currentPage === totalPages || previewing}
              >
                <Text style={styles.previewPagerButtonText}>▶</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.previewButton, openingPreviewPdf && styles.previewButtonDisabled]}
            onPress={handleOpenPreviewPdf}
            disabled={openingPreviewPdf}
          >
            {openingPreviewPdf ? (
              <ActivityIndicator size="small" color="#111827" />
            ) : (
              <Text style={styles.previewButtonText}>Ouvrir le PDF</Text>
            )}
          </TouchableOpacity>

          {!previewOnly ? (
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeButton, styles.aiModeButton, prefillLoading && styles.modeButtonDisabled]}
                onPress={() => setSourcePickerVisible(true)}
                disabled={prefillLoading}
              >
                <Text style={[styles.modeButtonText, styles.aiModeButtonText]}>Remplir avec l&apos;IA</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeButton, manualMode && styles.manualModeButtonActive]}
                onPress={() => setManualMode(true)}
              >
                <Text style={[styles.modeButtonText, manualMode && styles.manualModeButtonTextActive]}>
                  Remplir manuellement
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {previewOnly ? (
          <View style={styles.modeInfoCard}>
            <Text style={styles.modeInfoText}>
              Cet écran affiche uniquement l&apos;aperçu du formulaire.
            </Text>
          </View>
        ) : manualMode ? (
          groupedFields.map((group) => (
            <View key={group.title} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{group.title}</Text>
              {group.items.map((field) => (
                <View key={field.id} style={styles.fieldBlock}>
                  {field.type !== 'checkbox' && field.type !== 'table' ? (
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                  ) : null}
                  {field.type === 'table' ? renderTableField(field) : renderSimpleField(field)}
                </View>
              ))}
            </View>
          ))
        ) : (
          <View style={styles.modeInfoCard}>
            <Text style={styles.modeInfoText}>
              Activez &quot;Remplir manuellement&quot; pour afficher le formulaire champ par champ.
            </Text>
          </View>
        )}
      </ScrollView>

      {!previewOnly && manualMode ? (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.submitButton} onPress={submitManualFill} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Générer le PDF</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <SourcePickerModal
        visible={sourcePickerVisible}
        subtitle={documentTitle}
        onClose={() => setSourcePickerVisible(false)}
        onSelect={handleSelectAiSource}
        disabled={prefillLoading}
      />

      <SelectionModal
        visible={transcriptionPickerVisible}
        title="Choisir une transcription"
        subtitle={documentTitle}
        topActionLabel="Créer une nouvelle transcription"
        onTopActionPress={handleCreateNewTranscription}
        loading={transcriptionPickerLoading}
        items={transcriptionPickerItems.map((item) => ({
          id: item?.id,
          raw: item,
          title: getTranscriptionName(item),
          subtitle: formatDate(item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt),
          meta: '',
        }))}
        onSelect={handleSelectTranscription}
        onClose={() => setTranscriptionPickerVisible(false)}
        searchPlaceholder="Rechercher une transcription..."
        emptyText="Aucune transcription disponible"
      />

      <SelectionModal
        visible={ocrPickerVisible}
        title="Choisir un document OCR"
        subtitle={documentTitle}
        loading={ocrPickerLoading}
        items={ocrPickerItems.map((item) => ({
          id: item?.id,
          raw: item,
          title: getOcrName(item),
          subtitle: formatDate(item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt),
          meta: String(item?.status || '').toLowerCase() || '',
        }))}
        onSelect={handleSelectOcr}
        onClose={() => setOcrPickerVisible(false)}
        searchPlaceholder="Rechercher un OCR..."
        emptyText="Aucun OCR disponible"
      />

      <SelectionModal
        visible={formFillPickerVisible}
        title="Choisir un formulaire rempli"
        subtitle={documentTitle}
        loading={formFillPickerLoading}
        items={formFillPickerItems.map((item) => {
          const sourceType = resolveFormFillSourceType(item);
          return {
            id: item?.id,
            raw: item,
            title: `${getSourceIcon(sourceType)} ${decodeMaybeUriComponent(item?.document_name || `Document #${item?.document_id ?? ''}`)}`,
            subtitle: formatDate(item?.created_at || item?.createdAt),
            meta: `${getSourceLabel(sourceType)} • ${getFormFillSourceDisplayName(item, sourceType)}`,
          };
        })}
        onSelect={handleSelectFormFillSource}
        onClose={() => setFormFillPickerVisible(false)}
        searchPlaceholder="Rechercher un formulaire rempli..."
        emptyText="Aucun formulaire rempli disponible"
      />

      <Modal
        visible={selectModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectModal((previous) => ({ ...previous, visible: false }))}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sélectionner une valeur</Text>
            <ScrollView style={styles.modalList}>
              {(selectModal.options || []).map((option, index) => {
                const optionLabel = formatOptionLabel(option);
                const optionValue = formatOptionValue(option);
                return (
                  <TouchableOpacity
                    key={`${optionValue}-${index}`}
                    style={styles.modalOptionButton}
                    onPress={() => applySelectOption(optionValue)}
                  >
                    <Text style={styles.modalOptionText}>{optionLabel || optionValue}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setSelectModal((previous) => ({ ...previous, visible: false }))}
            >
              <Text style={styles.modalCloseButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={prefillLoading} transparent animationType="fade">
        <View style={styles.overlayBackdrop}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.overlayTitle}>Pré-remplissage IA en cours</Text>
            <Text style={styles.overlaySubtitle}>{prefillStatusText || "L'IA analyse votre transcription..."}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    color: '#4B5563',
    fontSize: 13,
    textAlign: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 126,
  },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  previewSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#4B5563',
  },
  previewProgress: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewProgressText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  previewImage: {
    marginTop: 12,
    width: '100%',
    height: 500,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  previewEmpty: {
    marginTop: 12,
    height: 500,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  previewEmptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  previewPager: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  previewPagerButton: {
    minWidth: 36,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPagerButtonDisabled: {
    opacity: 0.5,
  },
  previewPagerButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  previewPagerText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  previewButton: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButtonDisabled: {
    opacity: 0.55,
  },
  previewButtonText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  modeRow: {
    marginTop: 12,
    flexDirection: 'row',
  },
  modeButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiModeButton: {
    marginRight: 8,
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  manualModeButtonActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  aiModeButtonText: {
    color: '#fff',
  },
  manualModeButtonTextActive: {
    color: '#1D4ED8',
  },
  modeButtonDisabled: {
    opacity: 0.65,
  },
  modeInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modeInfoText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  fieldBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },
  textarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  selectButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#fff',
  },
  selectButtonText: {
    fontSize: 14,
  },
  selectButtonPlaceholder: {
    color: '#9CA3AF',
  },
  selectButtonValue: {
    color: '#111827',
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  checkboxLabel: {
    flex: 1,
    marginRight: 8,
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  tableCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FAFAFA',
    padding: 10,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tableLabel: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    paddingRight: 8,
  },
  addRowButton: {
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addRowButtonText: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: '700',
  },
  tableEmptyText: {
    color: '#6B7280',
    fontSize: 12,
  },
  tableRowCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  removeRowButton: {
    alignSelf: 'flex-end',
    marginBottom: 6,
  },
  removeRowButtonText: {
    fontSize: 16,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  submitButton: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  modalList: {
    maxHeight: 280,
  },
  modalOptionButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  modalOptionText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  modalCloseButton: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  modalCloseButtonText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  overlayTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  overlaySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'center',
  },
});
