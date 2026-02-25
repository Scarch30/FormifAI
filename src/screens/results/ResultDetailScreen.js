import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { formFills } from '../../api/client';
import { documentConfigsApi } from '../../api/documentConfigsService';
import SelectionModal from '../../components/SelectionModal';
import StatusBadge from '../../components/StatusBadge';
import Colors from '../../constants/Colors';
import useExport from '../../hooks/useExport';
import { extractItem, toNumber } from '../../utils/apiData';
import {
  arrayBufferToBase64,
  extractFileNameFromContentDisposition,
  sanitizeFileName,
} from '../../utils/binaryFiles';
import { flattenFields } from '../../utils/documentConfigFields';
import FormFillScreen from '../FormFillScreen';

const normalizeStatus = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'pending') return 'pending';
  if (normalized === 'processing' || normalized === 'transcribing') return 'processing';
  if (normalized === 'done' || normalized === 'completed' || normalized === 'ready') return 'done';
  if (normalized === 'error' || normalized === 'failed') return 'error';
  return normalized;
};

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

const resolveFillSourceType = (fill) => {
  const explicitType = String(fill?.source_type || fill?.sourceType || '').toLowerCase();
  if (explicitType) return explicitType;
  if (fill?.transcription_id || fill?.transcriptionId) return 'transcription';
  if (fill?.ocr_document_id || fill?.ocrDocumentId) return 'ocr';
  if (fill?.source_form_fill_id || fill?.sourceFormFillId) return 'form_fill';
  return null;
};

const resolveFillSourceId = (fill, sourceType) => {
  const explicitSourceId = fill?.source_id ?? fill?.sourceId;
  if (explicitSourceId !== null && explicitSourceId !== undefined) return explicitSourceId;
  if (sourceType === 'transcription') return fill?.transcription_id ?? fill?.transcriptionId ?? null;
  if (sourceType === 'ocr') return fill?.ocr_document_id ?? fill?.ocrDocumentId ?? null;
  if (sourceType === 'form_fill') return fill?.source_form_fill_id ?? fill?.sourceFormFillId ?? null;
  return null;
};

const extractDocumentConfigFieldsList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fields)) return payload.fields;
  if (Array.isArray(payload?.config?.fields)) return payload.config.fields;
  if (Array.isArray(payload?.document_config?.fields)) return payload.document_config.fields;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const normalizeMode2FieldDefinitions = (payload) => {
  const rawFields = flattenFields(extractDocumentConfigFieldsList(payload), {
    includeTaglessFields: true,
  });
  const seenKeys = new Set();

  return rawFields
    .map((field, index) => {
      const key = String(
        field?.api_key ??
          field?.apiKey ??
          field?.tag ??
          field?.id ??
          field?.name ??
          field?.field_name ??
          `field_${index + 1}`
      ).trim();
      if (!key || seenKeys.has(key)) return null;
      seenKeys.add(key);
      return {
        key,
        label: String(field?.label || field?.name || field?.field_name || field?.id || key),
        section: String(field?.section || 'Informations'),
      };
    })
    .filter(Boolean);
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

const stringifyMode2Value = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
};

const parseMode2DraftValue = (textValue, previousValue) => {
  const text = String(textValue ?? '');

  if (typeof previousValue === 'boolean') {
    const normalized = text.trim().toLowerCase();
    if (['true', '1', 'yes', 'oui'].includes(normalized)) return true;
    if (['false', '0', 'no', 'non', ''].includes(normalized)) return false;
    return text;
  }

  if (typeof previousValue === 'number') {
    const normalized = text.trim().replace(',', '.');
    if (!normalized) return '';
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : text;
  }

  if (previousValue && typeof previousValue === 'object') {
    const trimmed = text.trim();
    if (!trimmed) return '';
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return text;
    }
  }

  return text;
};

function Mode2EditScreen({
  formFill,
  onFormFillUpdated,
  saveRequestId = 0,
  onSavingChange,
  resyncRequestId = 0,
  onResyncingChange,
}) {
  const formFillId = toNumber(formFill?.id, null);
  const documentConfigId = toNumber(formFill?.document_config_id ?? formFill?.documentConfigId, null);

  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [fieldsError, setFieldsError] = useState('');
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [draftValues, setDraftValues] = useState({});
  const [savedValueSnapshot, setSavedValueSnapshot] = useState({});
  const [saving, setSaving] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const lastHandledSaveRequestIdRef = useRef(0);
  const lastHandledResyncRequestIdRef = useRef(0);
  const scrollRef = useRef(null);
  const sectionPositionsRef = useRef(new Map());
  const fieldRowPositionsRef = useRef(new Map());

  useEffect(() => {
    const currentFillData = getMode2FillData(formFill);
    const nextDraftValues = {};
    Object.entries(currentFillData).forEach(([key, value]) => {
      nextDraftValues[String(key)] = stringifyMode2Value(value);
    });
    setDraftValues(nextDraftValues);
    setSavedValueSnapshot(currentFillData);
  }, [formFill]);

  const loadFields = useCallback(async () => {
    if (!documentConfigId) {
      setFieldDefinitions([]);
      setFieldsError('Configuration de document introuvable');
      setFieldsLoading(false);
      return;
    }

    setFieldsLoading(true);
    setFieldsError('');
    try {
      const payload = await documentConfigsApi.fields(documentConfigId);
      setFieldDefinitions(normalizeMode2FieldDefinitions(payload));
    } catch (error) {
      console.error('Erreur chargement champs Mode 2:', error);
      setFieldsError(extractApiErrorMessage(error, 'Impossible de charger les champs du formulaire.'));
      setFieldDefinitions([]);
    } finally {
      setFieldsLoading(false);
    }
  }, [documentConfigId]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [onSavingChange, saving]);

  useEffect(() => {
    onResyncingChange?.(resyncing);
  }, [onResyncingChange, resyncing]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const nextHeight = Number(event?.endCoordinates?.height) || 0;
      setKeyboardHeight(nextHeight);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const groupedSections = useMemo(() => {
    const sectionOrder = [];
    const sectionMap = new Map();
    const knownKeys = new Set();

    const ensureSection = (title) => {
      const safeTitle = String(title || 'Informations');
      if (sectionMap.has(safeTitle)) return sectionMap.get(safeTitle);
      const rows = [];
      sectionMap.set(safeTitle, rows);
      sectionOrder.push(safeTitle);
      return rows;
    };

    fieldDefinitions.forEach((fieldDef) => {
      knownKeys.add(fieldDef.key);
      ensureSection(fieldDef.section).push({
        key: fieldDef.key,
        label: fieldDef.label || fieldDef.key,
      });
    });

    Object.keys(draftValues).forEach((key) => {
      if (knownKeys.has(key)) return;
      ensureSection('Autres').push({
        key,
        label: key,
      });
    });

    return sectionOrder.map((title) => ({
      title,
      rows: sectionMap.get(title) || [],
    }));
  }, [draftValues, fieldDefinitions]);

  const handleChangeValue = useCallback((key, nextValue) => {
    setDraftValues((previous) => ({
      ...previous,
      [key]: nextValue,
    }));
  }, []);

  const scrollToField = useCallback((fieldKey) => {
    const scrollNode = scrollRef.current;
    const fieldMeta = fieldRowPositionsRef.current.get(fieldKey);
    if (!scrollNode) return;

    setTimeout(() => {
      const sectionY =
        typeof fieldMeta?.sectionKey === 'string'
          ? Number(sectionPositionsRef.current.get(fieldMeta.sectionKey))
          : NaN;
      const rowY = Number(fieldMeta?.rowY);
      const absoluteY =
        Number.isFinite(sectionY) && Number.isFinite(rowY)
          ? sectionY + rowY
          : Number.isFinite(rowY)
            ? rowY
            : NaN;

      if (Number.isFinite(absoluteY)) {
        const topOffset = 110;
        const targetY = Math.max(0, absoluteY - topOffset);
        if (typeof scrollNode.scrollTo === 'function') {
          scrollNode.scrollTo({ y: targetY, animated: true });
        }
        return;
      }
      try {
        if (typeof scrollNode.scrollToEnd === 'function') {
          scrollNode.scrollToEnd({ animated: true });
        }
      } catch (_error) {
        // ignore
      }
    }, 120);
  }, []);

  const handleFieldFocus = useCallback(
    (fieldKey, _event) => {
      scrollToField(fieldKey);
    },
    [scrollToField]
  );

  const handleSave = useCallback(async () => {
    if (saving || resyncing) return;
    if (!formFillId || !documentConfigId) {
      Alert.alert('Erreur', 'Informations du formulaire manquantes.');
      return;
    }

    setSaving(true);
    try {
      const allKeys = new Set([
        ...Object.keys(savedValueSnapshot || {}),
        ...Object.keys(draftValues || {}),
      ]);

      const nextFillData = {};
      allKeys.forEach((key) => {
        const previousValue = savedValueSnapshot?.[key];
        const nextDraft = draftValues?.[key] ?? '';
        nextFillData[key] = parseMode2DraftValue(nextDraft, previousValue);
      });

      const patchResponse = await formFills.updateFormFill(formFillId, { fill_data: nextFillData });
      const updatedFormFill = extractItem(patchResponse) || null;

      await documentConfigsApi.fillWithFillData(documentConfigId, nextFillData);

      setSavedValueSnapshot(nextFillData);
      onFormFillUpdated?.((previous) => ({
        ...(previous || {}),
        ...(updatedFormFill || {}),
        fill_data: nextFillData,
        fillData: nextFillData,
      }));

      Alert.alert('Enregistré', 'Le contenu a été sauvegardé et le PDF a été régénéré.');
    } catch (error) {
      console.error('Erreur sauvegarde Mode 2:', error);
      Alert.alert('Erreur', extractApiErrorMessage(error, 'Impossible de sauvegarder ce formulaire.'));
    } finally {
      setSaving(false);
    }
  }, [documentConfigId, draftValues, formFillId, onFormFillUpdated, resyncing, savedValueSnapshot, saving]);

  const handleResyncFields = useCallback(async () => {
    if (resyncing || saving) return;
    if (!documentConfigId) {
      Alert.alert('Erreur', 'Configuration de document introuvable.');
      return;
    }

    setResyncing(true);
    try {
      const configResponse = await documentConfigsApi.get(documentConfigId);
      const configCandidates = [
        configResponse?.config,
        configResponse?.document_config?.config,
        configResponse?.documentConfig?.config,
        configResponse,
      ];
      const currentConfig = configCandidates.find(
        (candidate) =>
          candidate &&
          typeof candidate === 'object' &&
          !Array.isArray(candidate) &&
          (Array.isArray(candidate?.sections) || candidate?.meta || candidate?.header || candidate?.footer)
      );

      if (!currentConfig) {
        throw new Error('Configuration actuelle introuvable.');
      }

      await documentConfigsApi.update(documentConfigId, currentConfig);
      await loadFields();
      Alert.alert('Succès', 'Champs synchronisés');
    } catch (error) {
      console.error('Erreur synchronisation des champs Mode 2:', error);
      Alert.alert('Erreur', extractApiErrorMessage(error, 'Impossible de synchroniser les champs.'));
    } finally {
      setResyncing(false);
    }
  }, [documentConfigId, loadFields, resyncing, saving]);

  useEffect(() => {
    if (!saveRequestId) return;
    if (saveRequestId <= lastHandledSaveRequestIdRef.current) return;
    lastHandledSaveRequestIdRef.current = saveRequestId;
    handleSave();
  }, [handleSave, saveRequestId]);

  useEffect(() => {
    if (!resyncRequestId) return;
    if (resyncRequestId <= lastHandledResyncRequestIdRef.current) return;
    lastHandledResyncRequestIdRef.current = resyncRequestId;
    handleResyncFields();
  }, [handleResyncFields, resyncRequestId]);

  if (fieldsLoading) {
    return (
      <View style={styles.mode2Centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.mode2InfoText}>Chargement des champs du formulaire…</Text>
      </View>
    );
  }

  if (fieldsError) {
    return (
      <View style={styles.mode2Centered}>
        <Text style={styles.mode2ErrorText}>{fieldsError}</Text>
        <TouchableOpacity style={styles.mode2ActionButton} onPress={loadFields}>
          <Text style={styles.mode2ActionButtonText}>Recharger</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.mode2Container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={styles.mode2Header}>
        <Text style={styles.mode2Title}>Edition du formulaire</Text>
        <Text style={styles.mode2Subtitle}>
          Modifiez les valeurs des champs puis sauvegardez vos modifications.
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.mode2Scroll}
        contentContainerStyle={[
          styles.mode2ScrollContent,
          { paddingBottom: Math.max(140, (keyboardHeight || 0) + 24) },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        {groupedSections.length === 0 ? (
          <View style={styles.mode2SectionCard}>
            <Text style={styles.mode2EmptyText}>Aucun champ détecté.</Text>
          </View>
        ) : (
          groupedSections.map((section) => (
            <View
              key={section.title}
              style={styles.mode2SectionCard}
              onLayout={(event) => {
                const y = Number(event?.nativeEvent?.layout?.y);
                if (Number.isFinite(y)) {
                  sectionPositionsRef.current.set(section.title, y);
                }
              }}
            >
              <Text style={styles.mode2SectionTitle}>{section.title}</Text>
              {section.rows.map((row) => (
                <View
                  key={row.key}
                  style={styles.mode2FieldRow}
                  onLayout={(event) => {
                    const y = Number(event?.nativeEvent?.layout?.y);
                    if (Number.isFinite(y)) {
                      fieldRowPositionsRef.current.set(row.key, {
                        sectionKey: section.title,
                        rowY: y,
                      });
                    }
                  }}
                >
                  <Text style={styles.mode2FieldLabel}>{row.label}</Text>
                  <Text style={styles.mode2FieldKey}>{row.key}</Text>
                  <TextInput
                    style={styles.mode2FieldInput}
                    value={String(draftValues?.[row.key] ?? '')}
                    onChangeText={(value) => handleChangeValue(row.key, value)}
                    onFocus={(event) => handleFieldFocus(row.key, event)}
                    placeholder="Valeur"
                    placeholderTextColor="#9CA3AF"
                    multiline
                  />
                </View>
              ))}
            </View>
          ))
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function ResultDetailScreen({ route, navigation }) {
  const routeFormFillId =
    route?.params?.formFillId ??
    route?.params?.resultId ??
    route?.params?.id ??
    null;
  const formFillId = toNumber(routeFormFillId, null);

  const [loading, setLoading] = useState(true);
  const [formFill, setFormFill] = useState(null);
  const [screenError, setScreenError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [jpgPageModalVisible, setJpgPageModalVisible] = useState(false);
  const [mode2SaveRequestId, setMode2SaveRequestId] = useState(0);
  const [mode2ResyncRequestId, setMode2ResyncRequestId] = useState(0);
  const [mode2Saving, setMode2Saving] = useState(false);
  const [mode2Resyncing, setMode2Resyncing] = useState(false);
  const [mode2Exporting, setMode2Exporting] = useState(false);
  const [mode2ExportProgress, setMode2ExportProgress] = useState('');
  const { isExporting, exportProgress, exportPDF, exportJPG, printDocument } = useExport();

  const loadFormFill = useCallback(
    async ({ silent = false } = {}) => {
      if (!formFillId) {
        setScreenError('Remplissage introuvable');
        setLoading(false);
        return null;
      }
      if (!silent) {
        setLoading(true);
        setScreenError('');
      }

      try {
        const response = await formFills.getFormFill(formFillId);
        const payload = extractItem(response) || null;
        if (!payload) {
          setScreenError('Remplissage introuvable');
          return null;
        }
        setFormFill(payload);
        setScreenError('');
        return payload;
      } catch (error) {
        console.error('Erreur chargement resultat detail:', error);
        setScreenError('Impossible de charger ce remplissage');
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [formFillId]
  );

  useEffect(() => {
    loadFormFill();
  }, [loadFormFill]);

  useEffect(() => {
    const normalizedStatus = normalizeStatus(formFill?.status);
    if (!formFill?.id) return undefined;
    if (normalizedStatus !== 'pending' && normalizedStatus !== 'processing') return undefined;

    const interval = setInterval(async () => {
      try {
        const response = await formFills.getFormFill(formFill.id);
        const payload = extractItem(response) || null;
        if (!payload) return;
        setFormFill(payload);
      } catch (error) {
        console.error('Erreur polling resultat detail:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [formFill?.id, formFill?.status]);

  const handleBack = useCallback(() => {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('ResultsListScreen');
  }, [navigation]);

  const handleRetry = useCallback(async () => {
    if (retrying) return;

    const sourceType = resolveFillSourceType(formFill) || 'transcription';
    const sourceId = resolveFillSourceId(formFill, sourceType);
    const documentId = toNumber(formFill?.document_id ?? formFill?.documentId, null);
    const activeFormFillId = toNumber(formFill?.id, null);

    if (!activeFormFillId || !documentId || sourceId === null || sourceId === undefined) {
      Alert.alert('Erreur', 'Impossible de reessayer ce remplissage.');
      return;
    }

    setRetrying(true);
    try {
      await formFills.deleteFormFill(activeFormFillId);
      const response = await formFills.createFormFill(documentId, sourceType, sourceId);
      const created = extractItem(response) || null;
      const createdId = toNumber(created?.id, null);
      if (!createdId) {
        throw new Error('Le nouveau remplissage est cree mais son identifiant est manquant.');
      }

      navigation.replace('ResultDetailScreen', {
        formFillId: createdId,
        resultId: createdId,
      });
    } catch (error) {
      console.error('Erreur retry resultat detail:', error);
      Alert.alert('Erreur', extractApiErrorMessage(error, 'Impossible de relancer le remplissage.'));
    } finally {
      setRetrying(false);
    }
  }, [formFill, navigation, retrying]);

  const normalizedStatus = normalizeStatus(formFill?.status) || 'pending';
  const pagesProcessed = Math.max(
    0,
    toNumber(formFill?.pages_processed ?? formFill?.pagesProcessed, 0) || 0
  );
  const pagesTotal = toNumber(formFill?.pages_total ?? formFill?.pagesTotal, null);
  const safePagesTotal = pagesTotal && pagesTotal > 0 ? pagesTotal : null;
  const clampedProcessed = safePagesTotal
    ? Math.min(pagesProcessed, safePagesTotal)
    : pagesProcessed;
  const progressPercent = safePagesTotal
    ? Math.max(0, Math.min(100, (clampedProcessed / safePagesTotal) * 100))
    : 0;

  const errorMessage = useMemo(() => {
    const message =
      formFill?.error_message ||
      formFill?.errorMessage ||
      'Une erreur est survenue pendant la génération.';
    return String(message || '').trim() || 'Une erreur est survenue pendant la génération.';
  }, [formFill?.error_message, formFill?.errorMessage]);

  const totalPageCount = useMemo(() => {
    const values = Array.isArray(formFill?.values) ? formFill.values : [];
    const maxPageFromValues = values.reduce((acc, valueItem) => {
      const pageNumber = toNumber(valueItem?.page_number ?? valueItem?.pageNumber, 1) || 1;
      return Math.max(acc, Math.floor(pageNumber));
    }, 1);

    const candidates = [
      formFill?.page_count,
      formFill?.pageCount,
      formFill?.pages_count,
      formFill?.pagesCount,
      formFill?.pages_total,
      formFill?.pagesTotal,
      formFill?.total_pages,
      formFill?.totalPages,
      formFill?.document_page_count,
      formFill?.documentPageCount,
      maxPageFromValues,
    ];
    const maxPageCount = candidates.reduce((acc, rawValue) => {
      const candidate = toNumber(rawValue, 0);
      if (!Number.isFinite(candidate) || candidate <= 0) return acc;
      return Math.max(acc, Math.floor(candidate));
    }, 1);
    return Math.max(1, maxPageCount);
  }, [
    formFill?.document_page_count,
    formFill?.documentPageCount,
    formFill?.page_count,
    formFill?.pageCount,
    formFill?.pages_count,
    formFill?.pagesCount,
    formFill?.pages_total,
    formFill?.pagesTotal,
    formFill?.total_pages,
    formFill?.totalPages,
    formFill?.values,
  ]);

  const jpgPageOptions = useMemo(() => {
    const pageItems = Array.from({ length: totalPageCount }, (_, index) => ({
      id: `page-${index + 1}`,
      title: `Page ${index + 1}`,
      page: index + 1,
    }));
    return [
      ...pageItems,
      {
        id: 'page-all',
        title: 'Toutes les pages (image longue)',
        page: 'all',
      },
    ];
  }, [totalPageCount]);

  const handleExportJPGPress = useCallback(() => {
    if (isExporting) return;
    const doneId = toNumber(formFill?.id, formFillId);
    if (!doneId) return;

    if (totalPageCount <= 1) {
      exportJPG(doneId, formFill?.document_name, 1);
      return;
    }

    setJpgPageModalVisible(true);
  }, [exportJPG, formFill?.document_name, formFill?.id, formFillId, isExporting, totalPageCount]);

  const handleExportPress = useCallback(() => {
    if (isExporting) return;
    const doneId = toNumber(formFill?.id, formFillId);
    if (!doneId) return;

    Alert.alert(
      'Format export',
      'Choisissez le format du fichier.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'PDF', onPress: () => exportPDF(doneId, formFill?.document_name) },
        { text: 'JPG', onPress: handleExportJPGPress },
      ]
    );
  }, [exportPDF, formFill?.document_name, formFill?.id, formFillId, handleExportJPGPress, isExporting]);

  const handleSelectJpgPage = useCallback(
    (item) => {
      setJpgPageModalVisible(false);
      const doneId = toNumber(formFill?.id, formFillId);
      if (!doneId) return;
      exportJPG(doneId, formFill?.document_name, item?.page);
    },
    [exportJPG, formFill?.document_name, formFill?.id, formFillId]
  );

  const handleMode2ExportPdf = useCallback(async () => {
    if (mode2Exporting) return;
    const documentConfigId = toNumber(formFill?.document_config_id ?? formFill?.documentConfigId, null);
    if (!documentConfigId) {
      Alert.alert('Erreur', 'document_config_id introuvable pour ce résultat.');
      return;
    }

    const fillData = getMode2FillData(formFill);

    setMode2Exporting(true);
    setMode2ExportProgress('Génération du PDF…');
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
      const fallbackFileName = `${sanitizeFileName(
        formFill?.document_name || `document_config_${documentConfigId}`,
        `document_config_${documentConfigId}`
      )}_mode2_${Date.now()}.pdf`;
      const fileName = String(fileNameFromHeader || fallbackFileName)
        .replace(/[\\/:*?"<>|]+/g, '_')
        .trim();
      const safeFileName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
      const fileUri = `${cacheDirectory}${safeFileName}`;

      setMode2ExportProgress('Préparation du partage…');
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
      console.error('Erreur export PDF Mode 2:', error);
      Alert.alert('Erreur', extractApiErrorMessage(error, "Impossible d'exporter ce PDF."));
    } finally {
      setMode2ExportProgress('');
      setMode2Exporting(false);
    }
  }, [formFill, mode2Exporting]);

  const handleMode2SavePress = useCallback(() => {
    if (mode2Saving || mode2Resyncing || mode2Exporting) return;
    setMode2SaveRequestId((previous) => previous + 1);
  }, [mode2Exporting, mode2Resyncing, mode2Saving]);

  const handleMode2ResyncPress = useCallback(() => {
    if (mode2Saving || mode2Resyncing || mode2Exporting) return;
    setMode2ResyncRequestId((previous) => previous + 1);
  }, [mode2Exporting, mode2Resyncing, mode2Saving]);

  if (normalizedStatus === 'done' && formFill?.id) {
    const doneId = toNumber(formFill.id, formFillId);
    const isMode2 = formFill?.source_type === 'document_config' && formFill?.document_config_id;
    const isMode2Fallback =
      String(formFill?.sourceType || '').toLowerCase() === 'document_config' &&
      (formFill?.documentConfigId || formFill?.document_config_id);
    const shouldUseMode2Editor = Boolean(isMode2 || isMode2Fallback);
    const mode2Busy = mode2Saving || mode2Resyncing || mode2Exporting;
    const exportBusy = shouldUseMode2Editor ? mode2Busy : isExporting;
    const exportBusyText = shouldUseMode2Editor
      ? mode2Exporting
        ? mode2ExportProgress || 'Export en cours...'
        : mode2Saving
          ? 'Sauvegarde des modifications...'
          : mode2Resyncing
            ? 'Synchronisation des champs...'
          : ''
      : exportProgress;
    return (
      <View style={styles.doneContainer}>
        {shouldUseMode2Editor ? (
          <Mode2EditScreen
            formFill={formFill}
            onFormFillUpdated={setFormFill}
            saveRequestId={mode2SaveRequestId}
            onSavingChange={setMode2Saving}
            resyncRequestId={mode2ResyncRequestId}
            onResyncingChange={setMode2Resyncing}
          />
        ) : (
          <FormFillScreen
            route={{
              ...route,
              params: {
                ...(route?.params || {}),
                formFillId: doneId,
                resultId: doneId,
              },
            }}
            navigation={navigation}
          />
        )}

        <View style={styles.exportBar}>
          {exportBusy ? (
            <View style={styles.exportLoadingWrap}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.exportLoadingText}>{exportBusyText || 'Export en cours...'}</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.exportPrimaryButton}
                onPress={shouldUseMode2Editor ? handleMode2ExportPdf : handleExportPress}
                disabled={exportBusy}
              >
                <Text style={styles.exportPrimaryButtonText}>📄 Exporter</Text>
              </TouchableOpacity>

              {shouldUseMode2Editor ? (
                <>
                  <View style={styles.exportSecondaryRow}>
                    <TouchableOpacity
                      style={[styles.exportSecondaryButton, exportBusy && styles.buttonDisabled]}
                      onPress={handleMode2ResyncPress}
                      disabled={exportBusy}
                    >
                      <Text style={styles.exportSecondaryButtonText}>🔄 Synchroniser les champs</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.exportSecondaryRow}>
                    <TouchableOpacity
                      style={[styles.exportSecondaryButton, exportBusy && styles.buttonDisabled]}
                      onPress={handleMode2SavePress}
                      disabled={exportBusy}
                    >
                      <Text style={styles.exportSecondaryButtonText}>💾 Sauvegarder les modifications</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.exportSecondaryRow}>
                    <TouchableOpacity
                      style={[styles.exportSecondaryButton, exportBusy && styles.buttonDisabled]}
                      onPress={handleBack}
                      disabled={exportBusy}
                    >
                      <Text style={styles.exportSecondaryButtonText}>← Quitter</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {!shouldUseMode2Editor ? (
                <View style={styles.exportSecondaryRow}>
                  <TouchableOpacity
                    style={styles.exportSecondaryButton}
                    onPress={handleExportJPGPress}
                    disabled={isExporting}
                  >
                    <Text style={styles.exportSecondaryButtonText}>🖼️ Image JPG</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exportSecondaryButton}
                    onPress={() => printDocument(doneId, formFill?.document_name)}
                    disabled={isExporting}
                  >
                    <Text style={styles.exportSecondaryButtonText}>🖨️ Imprimer</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}
        </View>

        <SelectionModal
          visible={jpgPageModalVisible}
          title="Exporter en JPG"
          subtitle="Choisissez une page ou toutes les pages (export une par une)."
          items={jpgPageOptions}
          searchPlaceholder="Rechercher une page..."
          onSelect={handleSelectJpgPage}
          onClose={() => setJpgPageModalVisible(false)}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backButton}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Resultat</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (screenError || !formFill) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backButton}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Resultat</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorMessage}>{screenError || 'Remplissage introuvable'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => loadFormFill()}>
            <Text style={styles.primaryButtonText}>Recharger</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (normalizedStatus === 'pending' || normalizedStatus === 'processing') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <Text style={styles.backButton}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Resultat</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <View style={styles.statusBadgeWrap}>
            <StatusBadge status={normalizedStatus} />
          </View>
          <Text style={styles.stateTitle}>
            {normalizedStatus === 'pending' ? 'En attente de traitement…' : 'Remplissage en cours…'}
          </Text>
          <Text style={styles.pageText}>
            Page {clampedProcessed} / {safePagesTotal ?? '?'}
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>

          <Text style={styles.stateDescription}>
            L'IA analyse vos donnees et remplit les champs du formulaire.
          </Text>
          <Text style={styles.stateDescription}>Cela peut prendre quelques instants.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resultat</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.centered}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <View style={styles.statusBadgeWrap}>
          <StatusBadge status="error" />
        </View>
        <Text style={styles.stateTitle}>Le remplissage a echoue</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>

        <TouchableOpacity
          style={[styles.primaryButton, retrying && styles.buttonDisabled]}
          onPress={handleRetry}
          disabled={retrying}
        >
          {retrying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>🔄 Reessayer</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleBack} disabled={retrying}>
          <Text style={styles.secondaryButtonText}>← Retour</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  doneContainer: {
    flex: 1,
    position: 'relative',
  },
  mode2Container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mode2Header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mode2Title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  mode2Subtitle: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  mode2Scroll: {
    flex: 1,
  },
  mode2ScrollContent: {
    padding: 16,
    paddingBottom: 140,
    gap: 12,
  },
  mode2SectionCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
  },
  mode2SectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  mode2FieldRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  mode2FieldLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  mode2FieldKey: {
    marginTop: 2,
    color: Colors.textSecondary,
    fontSize: 11,
  },
  mode2FieldInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    color: Colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  mode2SaveButton: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  mode2SaveButtonDisabled: {
    opacity: 0.75,
  },
  mode2SaveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  mode2Centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: Colors.background,
  },
  mode2InfoText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  mode2ErrorText: {
    color: Colors.error || '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
  mode2ActionButton: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  mode2ActionButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  mode2EmptyText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 64,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  statusBadgeWrap: {
    marginTop: 14,
  },
  stateTitle: {
    marginTop: 12,
    color: Colors.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  pageText: {
    marginTop: 10,
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  stateDescription: {
    marginTop: 10,
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  errorEmoji: {
    fontSize: 48,
  },
  errorMessage: {
    marginTop: 10,
    color: '#991B1B',
    fontSize: 14,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  exportBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  exportLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 56,
  },
  exportLoadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  exportPrimaryButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  exportPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  exportSecondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  exportSecondaryButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  exportSecondaryButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },
});
