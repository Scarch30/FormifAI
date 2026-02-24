import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { documentConfigsApi, generationRequestsApi } from '../../api/documentConfigsService';
import { transcriptions } from '../../api/client';

const MAX_ATTACHMENTS = 5;
const MAX_TABLE_COLUMNS = 12;
const PRIMARY = '#3B3BD4';
const TRANSCRIPTION_POLL_INTERVAL_MS = 2500;

const TRANSCRIPTION_IN_PROGRESS_STATUSES = new Set([
  'pending',
  'processing',
  'transcribing',
  'in_progress',
  'queued',
]);

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'table', label: 'Tableau' },
  { value: 'signature', label: 'Signature' },
];

const TABLE_COLUMN_TYPE_OPTIONS = FIELD_TYPE_OPTIONS.filter((option) => option.value !== 'table');

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const normalizeStatus = (status) => String(status || '').trim().toLowerCase();

const getFieldTypeLabel = (value) =>
  FIELD_TYPE_OPTIONS.find((option) => option.value === value)?.label || 'Texte';

const extractRequestId = (payload) => {
  const candidates = [
    payload?.id,
    payload?.request_id,
    payload?.generation_request_id,
    payload?.generationRequestId,
    payload?.data?.id,
    payload?.data?.request_id,
  ];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const extractGenerationStatus = (payload) =>
  String(payload?.status || payload?.generation_status || payload?.generationStatus || '').toLowerCase();

const extractResultDocumentConfigId = (payload) => {
  const candidates = [
    payload?.result_document_config_id,
    payload?.resultDocumentConfigId,
    payload?.document_config_id,
    payload?.documentConfigId,
    payload?.result?.document_config_id,
    payload?.result?.documentConfigId,
  ];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const extractDocumentConfigId = (payload) => {
  const candidates = [
    payload?.id,
    payload?.document_config_id,
    payload?.documentConfigId,
    payload?.document_config?.id,
    payload?.documentConfig?.id,
    payload?.item?.id,
    payload?.result?.id,
    payload?.data?.id,
    payload?.data?.document_config_id,
    payload?.data?.documentConfigId,
  ];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeDraftFieldType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'number') return 'number';
  if (normalized === 'date') return 'date';
  if (normalized === 'signature') return 'signature';
  return 'text';
};

const buildDraftTitle = ({ description, fields }) => {
  const firstDescriptionLine = String(description || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (firstDescriptionLine) return firstDescriptionLine.slice(0, 100);

  const firstFieldLabel = (Array.isArray(fields) ? fields : [])
    .map((field) => String(field?.label || '').trim())
    .find(Boolean);
  if (firstFieldLabel) return `Brouillon - ${firstFieldLabel.slice(0, 80)}`;

  return `Brouillon du ${new Date().toLocaleDateString('fr-FR')}`;
};

const extractTranscriptionItem = (response) => {
  const payload = response?.data?.data || response?.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload.item || payload.result || payload.data || payload;
};

const normalizeFileName = (name, fallback) => {
  const raw = String(name || '').trim();
  if (raw) return raw;
  return fallback;
};

const mapImageAsset = (asset, index, prefix) => {
  const uri = asset?.uri || '';
  if (!uri) return null;
  const mimeType = String(asset?.mimeType || '').startsWith('image/')
    ? String(asset.mimeType)
    : 'image/jpeg';
  const inferredName =
    mimeType === 'image/png' ? `${prefix}-${Date.now()}-${index}.png` : `${prefix}-${Date.now()}-${index}.jpg`;
  return {
    uri,
    type: mimeType,
    name: normalizeFileName(asset?.fileName, inferredName),
  };
};

const mapDocumentAsset = (asset, index) => {
  const uri = asset?.uri || asset?.fileCopyUri || '';
  if (!uri) return null;
  const fileName = normalizeFileName(asset?.name || asset?.fileName, `fichier-${Date.now()}-${index}`);
  const lowerFileName = fileName.toLowerCase();
  const mimeType = String(asset?.mimeType || '').includes('/')
    ? String(asset.mimeType)
    : lowerFileName.endsWith('.pdf')
      ? 'application/pdf'
      : lowerFileName.endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';

  return {
    uri,
    type: mimeType,
    name: fileName,
  };
};

const sanitizeTableColumnCount = (value) => {
  const numeric = Number(String(value || '').replace(/\D/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.min(Math.max(Math.round(numeric), 1), MAX_TABLE_COLUMNS);
};

const createTableColumnDraft = (id, name = '', type = 'text') => ({
  id,
  name,
  type,
});

const normalizeTableColumns = (columns = [], count = 1) => {
  const targetCount = sanitizeTableColumnCount(count);
  const normalized = Array.isArray(columns)
    ? columns
        .map((column, index) => ({
          id: column?.id ?? `${index + 1}`,
          name: String(column?.name || ''),
          type: TABLE_COLUMN_TYPE_OPTIONS.some((option) => option.value === column?.type)
            ? column.type
            : 'text',
        }))
        .slice(0, targetCount)
    : [];

  while (normalized.length < targetCount) {
    normalized.push(createTableColumnDraft(`${normalized.length + 1}`));
  }

  return normalized;
};

const createFieldDraft = (id, label = '', type = 'text') => {
  const tableColumnCount = 2;
  return {
    id,
    label,
    type,
    tableColumnCount,
    tableColumns: normalizeTableColumns([], tableColumnCount),
    tableHasFixedRowLabels: false,
    tableRowLabels: '',
  };
};

const parseFixedRowLabels = (value) =>
  String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const buildDraftConfigPayload = ({ description, fields }) => {
  const normalizedDescription = String(description || '').trim();
  const safeFields = Array.isArray(fields) ? fields : [];
  const sections = [];

  safeFields.forEach((field, fieldIndex) => {
    const label = String(field?.label || '').trim();
    if (!label) return;

    const normalizedType = String(field?.type || 'text').toLowerCase();
    if (normalizedType !== 'table') {
      sections.push({
        id: `s_field_${fieldIndex + 1}`,
        title: label,
        type: 'fields',
        fields: [
          {
            label,
            tag: '',
            type: normalizeDraftFieldType(normalizedType),
            row: 1,
            width: 100,
          },
        ],
      });
      return;
    }

    const tableColumnCount = sanitizeTableColumnCount(
      field?.tableColumnCount || field?.tableColumns?.length || 1
    );
    const tableColumns = normalizeTableColumns(field?.tableColumns, tableColumnCount);
    const columnWidth = Math.max(8, Math.round(100 / Math.max(tableColumns.length, 1)));
    const fixedRowLabels = field?.tableHasFixedRowLabels ? parseFixedRowLabels(field?.tableRowLabels) : [];

    sections.push({
      id: `s_table_${fieldIndex + 1}`,
      title: label,
      type: 'table',
      iterable: `lignes_${fieldIndex + 1}`,
      columns: tableColumns.map((column, index) => ({
        id: String(column?.name || '').trim() || `colonne_${index + 1}`,
        header: String(column?.name || '').trim() || `Colonne ${index + 1}`,
        tag: '',
        type: normalizeDraftFieldType(column?.type),
        width: columnWidth,
      })),
      fixed_row_labels: fixedRowLabels,
    });
  });

  return {
    meta: {
      title: buildDraftTitle({ description: normalizedDescription, fields: safeFields }),
      page_format: 'A4',
      orientation: 'portrait',
    },
    style: {
      colors: {
        primary: '#3B3BD4',
        secondary: '#2E7D9A',
      },
      margins: {},
    },
    header: {
      enabled: true,
      title: '',
      subtitle: normalizedDescription,
    },
    footer: {
      enabled: true,
      text: '',
      show_page_numbers: true,
    },
    sections,
    page_breaks: [],
  };
};

export default function GenerationRequestScreen({ navigation, route }) {
  const [textPrompt, setTextPrompt] = useState('');
  const [fieldDrafts, setFieldDrafts] = useState([createFieldDraft(1)]);
  const [attachments, setAttachments] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranscriptionPolling, setIsTranscriptionPolling] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [typePicker, setTypePicker] = useState({
    visible: false,
    title: '',
    options: [],
    selectedValue: '',
    target: null,
  });

  const nextFieldIdRef = useRef(2);
  const transcriptionPollingRunRef = useRef(0);
  const lastHandledUploadMarkerRef = useRef(null);

  useEffect(
    () => () => {
      transcriptionPollingRunRef.current += 1;
    },
    []
  );

  const remainingAttachments = useMemo(() => Math.max(0, MAX_ATTACHMENTS - attachments.length), [attachments.length]);
  const hasDraftContent = useMemo(() => {
    if (String(textPrompt || '').trim()) return true;
    if (attachments.length > 0) return true;
    return fieldDrafts.some((field) => {
      if (String(field?.label || '').trim()) return true;
      if (String(field?.type || '').toLowerCase() !== 'table') return false;
      const columns = normalizeTableColumns(field?.tableColumns, field?.tableColumnCount || 1);
      if (columns.some((column) => String(column?.name || '').trim())) return true;
      if (field?.tableHasFixedRowLabels && parseFixedRowLabels(field?.tableRowLabels).length > 0) return true;
      return false;
    });
  }, [attachments.length, fieldDrafts, textPrompt]);

  const closeToMyCreations = useCallback(() => {
    transcriptionPollingRunRef.current += 1;
    setIsTranscriptionPolling(false);
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'FormsListScreen',
          params: { tab: 'my_creations' },
        },
      ],
    });
  }, [navigation]);

  const saveDraftAndQuit = useCallback(async () => {
    if (isSavingDraft || isGenerating) return;

    if (!hasDraftContent) {
      closeToMyCreations();
      return;
    }

    setIsSavingDraft(true);
    try {
      const draftConfig = buildDraftConfigPayload({
        description: textPrompt,
        fields: fieldDrafts,
      });

      const response = await documentConfigsApi.create({
        title: draftConfig?.meta?.title,
        config: draftConfig,
        generation_status: 'draft',
      });
      const createdId = extractDocumentConfigId(response);
      if (!createdId) {
        console.warn('Aucun identifiant retourné pour le brouillon créé.');
      }

      closeToMyCreations();
    } catch (error) {
      console.error('Erreur sauvegarde brouillon formulaire:', error);
      Alert.alert('Erreur', "Impossible d'enregistrer le brouillon.");
    } finally {
      setIsSavingDraft(false);
    }
  }, [closeToMyCreations, fieldDrafts, hasDraftContent, isGenerating, isSavingDraft, textPrompt]);

  const handleQuitRequest = useCallback(() => {
    if (isGenerating || isSavingDraft) return;

    Alert.alert(
      'Quitter la création',
      'Voulez-vous enregistrer un brouillon avant de quitter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Quitter sans enregistrer',
          style: 'destructive',
          onPress: closeToMyCreations,
        },
        {
          text: 'Enregistrer le brouillon',
          onPress: () => {
            saveDraftAndQuit();
          },
        },
      ],
      { cancelable: true }
    );
  }, [closeToMyCreations, isGenerating, isSavingDraft, saveDraftAndQuit]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Créer mon formulaire',
      headerLeft: () => (
        <TouchableOpacity
          style={styles.headerCloseButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }
            navigation.navigate('FormsListScreen', { tab: 'documents' });
          }}
        >
          <Text style={styles.headerCloseText}>{navigation.canGoBack() ? 'Retour' : 'Fermer'}</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          style={[styles.headerQuitButton, (isGenerating || isSavingDraft) && styles.headerButtonDisabled]}
          onPress={handleQuitRequest}
          disabled={isGenerating || isSavingDraft}
        >
          {isSavingDraft ? (
            <ActivityIndicator size="small" color={PRIMARY} />
          ) : (
            <Text style={styles.headerQuitText}>Quitter</Text>
          )}
        </TouchableOpacity>
      ),
    });
  }, [handleQuitRequest, isGenerating, isSavingDraft, navigation]);

  const appendAttachments = (newFiles = []) => {
    const validFiles = newFiles.filter((file) => file?.uri);
    if (validFiles.length === 0) return;

    setAttachments((previous) => {
      const merged = [...previous, ...validFiles];
      if (merged.length > MAX_ATTACHMENTS) {
        Alert.alert('Limite atteinte', `Maximum ${MAX_ATTACHMENTS} fichiers.`);
      }
      return merged.slice(0, MAX_ATTACHMENTS);
    });
  };

  const updateFieldDraft = useCallback((fieldId, updater) => {
    setFieldDrafts((previous) =>
      previous.map((field) => {
        if (field.id !== fieldId) return field;
        return updater(field);
      })
    );
  }, []);

  const closeTypePicker = useCallback(() => {
    setTypePicker((previous) => ({ ...previous, visible: false }));
  }, []);

  const handleTypeSelection = useCallback(
    (selectedValue) => {
      const target = typePicker.target;
      if (!target) {
        closeTypePicker();
        return;
      }

      if (target.kind === 'field') {
        updateFieldDraft(target.fieldId, (field) => {
          const nextType = selectedValue;
          if (nextType !== 'table') {
            return { ...field, type: nextType };
          }

          const tableColumnCount = sanitizeTableColumnCount(field?.tableColumnCount || field?.tableColumns?.length || 2);
          return {
            ...field,
            type: nextType,
            tableColumnCount,
            tableColumns: normalizeTableColumns(field?.tableColumns, tableColumnCount),
            tableHasFixedRowLabels: Boolean(field?.tableHasFixedRowLabels),
            tableRowLabels: String(field?.tableRowLabels || ''),
          };
        });
      }

      if (target.kind === 'tableColumn') {
        updateFieldDraft(target.fieldId, (field) => ({
          ...field,
          tableColumns: normalizeTableColumns(field?.tableColumns, field?.tableColumnCount).map((column) =>
            column.id === target.columnId ? { ...column, type: selectedValue } : column
          ),
        }));
      }

      closeTypePicker();
    },
    [closeTypePicker, typePicker.target, updateFieldDraft]
  );

  const askFieldType = useCallback(
    (fieldId) => {
      const field = fieldDrafts.find((item) => item.id === fieldId);
      setTypePicker({
        visible: true,
        title: 'Type du champ',
        options: FIELD_TYPE_OPTIONS,
        selectedValue: String(field?.type || 'text'),
        target: { kind: 'field', fieldId },
      });
    },
    [fieldDrafts]
  );

  const askTableColumnType = useCallback(
    (fieldId, columnId) => {
      const field = fieldDrafts.find((item) => item.id === fieldId);
      const tableColumns = normalizeTableColumns(field?.tableColumns, field?.tableColumnCount || 1);
      const column = tableColumns.find((entry) => entry.id === columnId);
      setTypePicker({
        visible: true,
        title: 'Type de la colonne',
        options: TABLE_COLUMN_TYPE_OPTIONS,
        selectedValue: String(column?.type || 'text'),
        target: { kind: 'tableColumn', fieldId, columnId },
      });
    },
    [fieldDrafts]
  );

  const addFieldDraft = () => {
    setFieldDrafts((previous) => [...previous, createFieldDraft(nextFieldIdRef.current++)]);
  };

  const removeFieldDraft = (fieldId) => {
    setFieldDrafts((previous) => {
      if (previous.length <= 1) return previous;
      return previous.filter((field) => field.id !== fieldId);
    });
  };

  const updateTableColumnCount = (fieldId, rawValue) => {
    const tableColumnCount = sanitizeTableColumnCount(rawValue);
    updateFieldDraft(fieldId, (field) => ({
      ...field,
      tableColumnCount,
      tableColumns: normalizeTableColumns(field?.tableColumns, tableColumnCount),
    }));
  };

  const pickFromCamera = async () => {
    if (remainingAttachments <= 0) {
      Alert.alert('Limite atteinte', `Maximum ${MAX_ATTACHMENTS} fichiers.`);
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission refusée', "L'accès à la caméra est requis.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });

      if (result?.canceled) return;
      const files = (result?.assets || [])
        .map((asset, index) => mapImageAsset(asset, index, 'camera'))
        .filter(Boolean);
      appendAttachments(files);
    } catch (error) {
      console.error('Erreur caméra:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la caméra.");
    }
  };

  const pickFromGallery = async () => {
    if (remainingAttachments <= 0) {
      Alert.alert('Limite atteinte', `Maximum ${MAX_ATTACHMENTS} fichiers.`);
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission refusée', "L'accès à la galerie est requis.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remainingAttachments,
        quality: 0.9,
      });

      if (result?.canceled) return;
      const files = (result?.assets || [])
        .map((asset, index) => mapImageAsset(asset, index, 'gallery'))
        .filter(Boolean);
      appendAttachments(files);
    } catch (error) {
      console.error('Erreur galerie:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie.");
    }
  };

  const pickPdfOrFiles = async () => {
    if (remainingAttachments <= 0) {
      Alert.alert('Limite atteinte', `Maximum ${MAX_ATTACHMENTS} fichiers.`);
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result?.canceled) return;

      const files = (result?.assets || [])
        .map((asset, index) => mapDocumentAsset(asset, index))
        .filter(Boolean);

      appendAttachments(files);
    } catch (error) {
      console.error('Erreur sélection fichiers:', error);
      Alert.alert('Erreur', "Impossible d'ajouter un fichier.");
    }
  };

  const openAttachmentPicker = () => {
    Alert.alert(
      'Ajouter un exemple visuel',
      '',
      [
        { text: 'Caméra', onPress: pickFromCamera },
        { text: 'Galerie', onPress: pickFromGallery },
        { text: 'PDF', onPress: pickPdfOrFiles },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const appendTranscriptionText = useCallback((incomingText) => {
    const trimmedIncoming = String(incomingText || '').trim();
    if (!trimmedIncoming) return;

    setTextPrompt((previous) => {
      const current = String(previous || '').trim();
      if (!current) return trimmedIncoming;
      return `${current}\n\n${trimmedIncoming}`;
    });
  }, []);

  const pollTranscriptionUntilReady = useCallback(
    async (transcriptionId) => {
      const numericTranscriptionId = Number(transcriptionId);
      if (!Number.isFinite(numericTranscriptionId)) return;

      const runId = transcriptionPollingRunRef.current + 1;
      transcriptionPollingRunRef.current = runId;
      setIsTranscriptionPolling(true);

      while (transcriptionPollingRunRef.current === runId) {
        try {
          const response = await transcriptions.get(numericTranscriptionId);
          const item = extractTranscriptionItem(response);
          const status = normalizeStatus(item?.status);

          if (status === 'ready') {
            appendTranscriptionText(item?.transcription_text ?? item?.text ?? '');
            setIsTranscriptionPolling(false);
            return;
          }

          if (status === 'error' || status === 'failed') {
            setIsTranscriptionPolling(false);
            Alert.alert('Erreur', "La transcription vocale a échoué.");
            return;
          }

          if (!TRANSCRIPTION_IN_PROGRESS_STATUSES.has(status)) {
            const fallbackText = String(item?.transcription_text ?? item?.text ?? '').trim();
            if (fallbackText && (status === 'done' || status === 'completed')) {
              appendTranscriptionText(fallbackText);
              setIsTranscriptionPolling(false);
              return;
            }
          }
        } catch (error) {
          console.error('Erreur polling transcription depuis génération:', error);
          setIsTranscriptionPolling(false);
          Alert.alert('Erreur', 'Impossible de récupérer la transcription vocale.');
          return;
        }

        await wait(TRANSCRIPTION_POLL_INTERVAL_MS);
      }

      setIsTranscriptionPolling(false);
    },
    [appendTranscriptionText]
  );

  useEffect(() => {
    const uploadMarker = Number(route?.params?.recordUploadAt);
    const returnedTranscriptionId = Number(route?.params?.transcriptionId ?? route?.params?.id);

    if (!Number.isFinite(uploadMarker) || !Number.isFinite(returnedTranscriptionId)) return;
    if (lastHandledUploadMarkerRef.current === uploadMarker) return;

    lastHandledUploadMarkerRef.current = uploadMarker;
    pollTranscriptionUntilReady(returnedTranscriptionId);
  }, [pollTranscriptionUntilReady, route?.params?.id, route?.params?.recordUploadAt, route?.params?.transcriptionId]);

  const openRecorder = () => {
    if (isGenerating || isSavingDraft) return;
    navigation.navigate('GenerationRecordScreen');
  };

  const buildInputText = () => {
    const description = textPrompt.trim();
    const fields = fieldDrafts
      .map((field) => {
        const name = String(field?.label || '').trim();
        if (!name) return null;

        const normalizedType = String(field?.type || 'text');
        if (normalizedType !== 'table') {
          return {
            name,
            type: normalizedType,
          };
        }

        const tableColumnCount = sanitizeTableColumnCount(
          field?.tableColumnCount || field?.tableColumns?.length || 1
        );
        const tableColumns = normalizeTableColumns(field?.tableColumns, tableColumnCount)
          .map((column, index) => ({
            name: String(column?.name || '').trim() || `colonne_${index + 1}`,
            type: TABLE_COLUMN_TYPE_OPTIONS.some((option) => option.value === column?.type)
              ? column.type
              : 'text',
          }))
          .slice(0, tableColumnCount);

        const fixedRowLabels = field?.tableHasFixedRowLabels
          ? parseFixedRowLabels(field?.tableRowLabels)
          : [];

        return {
          name,
          type: 'table',
          columns_count: tableColumnCount,
          columns: tableColumns,
          fixed_row_labels: fixedRowLabels,
        };
      })
      .filter(Boolean);

    if (description && fields.length) {
      return JSON.stringify(
        {
          description,
          fields,
        },
        null,
        2
      );
    }

    if (fields.length) {
      return JSON.stringify({ fields }, null, 2);
    }

    return description;
  };

  const startGeneration = async () => {
    if (isGenerating || isSavingDraft) return;

    const inputText = buildInputText();
    if (!inputText && attachments.length === 0) {
      Alert.alert('Données manquantes', 'Ajoutez une description, des champs ou un exemple visuel.');
      return;
    }

    setIsGenerating(true);
    try {
      const formData = new FormData();
      formData.append('input_text', inputText || '');

      attachments.slice(0, MAX_ATTACHMENTS).forEach((file, index) => {
        if (!file?.uri) return;
        formData.append('files', {
          uri: file.uri,
          type: file.type || 'application/octet-stream',
          name: file.name || `piece-${index + 1}`,
        });
      });

      const createResponse = await generationRequestsApi.create(formData);
      const requestId = extractRequestId(createResponse);
      if (!requestId) {
        throw new Error("Impossible d'obtenir l'identifiant de génération.");
      }

      const startAt = Date.now();
      while (Date.now() - startAt < 600000) {
        const pollResponse = await generationRequestsApi.get(requestId);
        const status = extractGenerationStatus(pollResponse);
        if (status === 'done') {
          const documentConfigId = extractResultDocumentConfigId(pollResponse);
          if (!documentConfigId) {
            throw new Error('Le formulaire a été généré mais aucun identifiant de configuration n’a été retourné.');
          }
          navigation.navigate('ConfigEditorScreen', { documentConfigId });
          return;
        }
        if (status === 'error' || status === 'failed') {
          throw new Error(
            pollResponse?.error ||
              pollResponse?.message ||
              'La génération du formulaire a échoué.'
          );
        }
        await wait(2000);
      }

      Alert.alert('Erreur', 'La génération a dépassé 10 minutes. Veuillez réessayer.');
    } catch (error) {
      console.error('Erreur génération formulaire IA:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de générer le formulaire.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Description</Text>
            {isTranscriptionPolling ? (
              <Text style={styles.pollingText}>Transcription en cours...</Text>
            ) : null}
          </View>
          <Text style={styles.sectionSubtitle}>
            Décrivez votre formulaire. Vous pouvez aussi dicter puis récupérer automatiquement le texte.
          </Text>

          <View style={styles.descriptionInputWrap}>
            <TextInput
              style={styles.textArea}
              value={textPrompt}
              onChangeText={setTextPrompt}
              multiline
              placeholder="Décrivez votre formulaire... Ex: Contrat de prestation avec infos client, description de la mission, montant et signatures"
              placeholderTextColor="#9CA3AF"
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={styles.inlineMicButton}
              onPress={openRecorder}
              disabled={isGenerating || isSavingDraft}
            >
              <Text style={styles.inlineMicText}>🎤</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Champs manuels</Text>
          <Text style={styles.sectionSubtitle}>
            Ajoutez des champs structurés. Le type Tableau propose une configuration détaillée.
          </Text>

          {fieldDrafts.map((field) => {
            const tableColumnCount = sanitizeTableColumnCount(
              field?.tableColumnCount || field?.tableColumns?.length || 1
            );
            const tableColumns = normalizeTableColumns(field?.tableColumns, tableColumnCount);

            return (
              <View key={field.id} style={styles.fieldCard}>
                <View style={styles.fieldRow}>
                  <TextInput
                    style={styles.fieldInput}
                    value={field.label}
                    onChangeText={(value) =>
                      updateFieldDraft(field.id, (currentField) => ({ ...currentField, label: value }))
                    }
                    placeholder="Nom du champ"
                    placeholderTextColor="#9CA3AF"
                  />

                  <TouchableOpacity style={styles.fieldTypeButton} onPress={() => askFieldType(field.id)}>
                    <Text style={styles.fieldTypeText}>{getFieldTypeLabel(field.type)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.deleteFieldButton} onPress={() => removeFieldDraft(field.id)}>
                    <Text style={styles.deleteFieldText}>🗑️</Text>
                  </TouchableOpacity>
                </View>

                {field.type === 'table' ? (
                  <View style={styles.tableEditor}>
                    <View style={styles.tableConfigRow}>
                      <Text style={styles.tableConfigLabel}>Nombre de colonnes</Text>
                      <TextInput
                        style={styles.tableCountInput}
                        keyboardType="number-pad"
                        value={String(tableColumnCount)}
                        onChangeText={(value) => updateTableColumnCount(field.id, value)}
                        maxLength={2}
                      />
                    </View>

                    {tableColumns.map((column, index) => (
                      <View key={`${field.id}-${column.id}-${index}`} style={styles.tableColumnRow}>
                        <Text style={styles.tableColumnIndex}>C{index + 1}</Text>
                        <TextInput
                          style={styles.tableColumnInput}
                          value={String(column?.name || '')}
                          onChangeText={(value) =>
                            updateFieldDraft(field.id, (currentField) => ({
                              ...currentField,
                              tableColumns: normalizeTableColumns(
                                currentField?.tableColumns,
                                currentField?.tableColumnCount
                              ).map((entry) =>
                                entry.id === column.id ? { ...entry, name: value } : entry
                              ),
                            }))
                          }
                          placeholder="Nom colonne"
                          placeholderTextColor="#9CA3AF"
                        />
                        <TouchableOpacity
                          style={styles.tableColumnTypeButton}
                          onPress={() => askTableColumnType(field.id, column.id)}
                        >
                          <Text style={styles.tableColumnTypeText}>{getFieldTypeLabel(column.type)}</Text>
                        </TouchableOpacity>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={[
                        styles.fixedRowsToggle,
                        Boolean(field?.tableHasFixedRowLabels) && styles.fixedRowsToggleActive,
                      ]}
                      onPress={() =>
                        updateFieldDraft(field.id, (currentField) => ({
                          ...currentField,
                          tableHasFixedRowLabels: !currentField?.tableHasFixedRowLabels,
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.fixedRowsToggleText,
                          Boolean(field?.tableHasFixedRowLabels) && styles.fixedRowsToggleTextActive,
                        ]}
                      >
                        Libellés de lignes fixes
                      </Text>
                    </TouchableOpacity>

                    {field?.tableHasFixedRowLabels ? (
                      <TextInput
                        style={styles.fixedRowsInput}
                        value={String(field?.tableRowLabels || '')}
                        onChangeText={(value) =>
                          updateFieldDraft(field.id, (currentField) => ({
                            ...currentField,
                            tableRowLabels: value,
                          }))
                        }
                        placeholder="Ex: Ligne 1, Ligne 2, Ligne 3"
                        placeholderTextColor="#9CA3AF"
                        multiline
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          <TouchableOpacity style={styles.addFieldButton} onPress={addFieldDraft}>
            <Text style={styles.addFieldButtonText}>+ Ajouter un champ</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Exemples visuels (optionnel)</Text>
          <Text style={styles.sectionSubtitle}>
            Ajoutez une photo ou PDF d&apos;un formulaire existant pour guider l&apos;IA
          </Text>

          <TouchableOpacity style={styles.addVisualButton} onPress={openAttachmentPicker}>
            <Text style={styles.addVisualButtonText}>Ajouter</Text>
          </TouchableOpacity>

          <View style={styles.attachmentGrid}>
            {attachments.map((file, index) => (
              <View key={`${file.uri}-${index}`} style={styles.attachmentItem}>
                {String(file?.type || '').startsWith('image/') ? (
                  <Image source={{ uri: file.uri }} style={styles.attachmentImage} />
                ) : (
                  <View style={styles.attachmentFileBox}>
                    <Text style={styles.attachmentFileIcon}>📄</Text>
                    <Text numberOfLines={2} style={styles.attachmentFileName}>
                      {file.name}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.attachmentRemoveButton}
                  onPress={() => setAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Text style={styles.attachmentRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.generateButton, isSavingDraft && styles.generateButtonDisabled]}
          onPress={startGeneration}
          disabled={isGenerating || isSavingDraft}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.generateButtonText}>Générer avec l&apos;IA</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={isGenerating} transparent animationType="fade">
        <View style={styles.overlayBackdrop}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.overlayTitle}>L&apos;IA génère votre formulaire...</Text>
            <Text style={styles.overlaySubtitle}>Cela prend environ 15-30 secondes</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={typePicker.visible} transparent animationType="fade" onRequestClose={closeTypePicker}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{typePicker.title}</Text>
            <Text style={styles.pickerSubtitle}>Sélectionnez un type</Text>

            <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
              {(typePicker.options || []).map((option) => {
                const isSelected = String(option?.value || '') === String(typePicker.selectedValue || '');
                return (
                  <TouchableOpacity
                    key={String(option?.value)}
                    style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
                    onPress={() => handleTypeSelection(option.value)}
                  >
                    <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}>
                      {option.label}
                    </Text>
                    {isSelected ? <Text style={styles.pickerCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.pickerCancelButton} onPress={closeTypePicker}>
              <Text style={styles.pickerCancelText}>Annuler</Text>
            </TouchableOpacity>
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
  content: {
    padding: 16,
    paddingBottom: 140,
    gap: 12,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sectionSubtitle: {
    marginTop: 6,
    color: '#4B5563',
    fontSize: 13,
    lineHeight: 18,
  },
  pollingText: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: '600',
  },
  descriptionInputWrap: {
    marginTop: 10,
    position: 'relative',
  },
  textArea: {
    minHeight: 190,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingRight: 56,
    color: '#111827',
    fontSize: 14,
  },
  inlineMicButton: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  inlineMicText: {
    fontSize: 18,
  },
  fieldCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 14,
  },
  fieldTypeButton: {
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minWidth: 86,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  fieldTypeText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  deleteFieldButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  deleteFieldText: {
    fontSize: 17,
  },
  tableEditor: {
    marginTop: 10,
    gap: 8,
  },
  tableConfigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tableConfigLabel: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
  },
  tableCountInput: {
    width: 56,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'center',
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
  },
  tableColumnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tableColumnIndex: {
    width: 24,
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  tableColumnInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#111827',
    fontSize: 13,
  },
  tableColumnTypeButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 82,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  tableColumnTypeText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  fixedRowsToggle: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
  },
  fixedRowsToggleActive: {
    borderColor: '#A5B4FC',
    backgroundColor: '#EEF2FF',
  },
  fixedRowsToggleText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },
  fixedRowsToggleTextActive: {
    color: PRIMARY,
  },
  fixedRowsInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#111827',
    fontSize: 13,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  addFieldButton: {
    marginTop: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: PRIMARY,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addFieldButtonText: {
    color: PRIMARY,
    fontWeight: '700',
    fontSize: 14,
  },
  addVisualButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addVisualButtonText: {
    color: PRIMARY,
    fontWeight: '700',
    fontSize: 13,
  },
  attachmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  attachmentItem: {
    width: 92,
    height: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    marginBottom: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  attachmentImage: {
    width: '100%',
    height: '100%',
  },
  attachmentFileBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  attachmentFileIcon: {
    fontSize: 24,
  },
  attachmentFileName: {
    marginTop: 4,
    fontSize: 10,
    textAlign: 'center',
    color: '#374151',
  },
  attachmentRemoveButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentRemoveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
  generateButton: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.65,
  },
  generateButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 14,
    backgroundColor: '#fff',
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  overlayTitle: {
    marginTop: 12,
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
  headerCloseButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  headerCloseText: {
    color: PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  headerQuitButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 64,
    alignItems: 'flex-end',
  },
  headerQuitText: {
    color: PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  headerButtonDisabled: {
    opacity: 0.55,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pickerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxHeight: '78%',
  },
  pickerTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  pickerSubtitle: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 12,
  },
  pickerList: {
    marginTop: 12,
  },
  pickerListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  pickerOption: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  pickerOptionSelected: {
    borderColor: '#A5B4FC',
    backgroundColor: '#EEF2FF',
  },
  pickerOptionText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  pickerOptionTextSelected: {
    color: PRIMARY,
  },
  pickerCheck: {
    color: PRIMARY,
    fontWeight: '700',
  },
  pickerCancelButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pickerCancelText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
});
