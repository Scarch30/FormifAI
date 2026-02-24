import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Image,
  TextInput,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import {
  documents as documentsApi,
  formFills,
  ocrDocuments,
  templates as templatesApi,
  transcriptions,
  workProfiles,
} from '../api/client';
import formsScreenService from '../api/formsScreenService';
import { documentConfigsApi } from '../api/documentConfigsService';
import SelectionModal from '../components/SelectionModal';
import DocumentsListCard from '../components/forms/DocumentsListCard';
import TemplatesListCard from '../components/forms/TemplatesListCard';
import ReadyFormCard from '../components/forms/ReadyFormCard';
import CreatedFormCard from '../components/forms/CreatedFormCard';
import ConfirmActionModal from '../components/forms/ConfirmActionModal';
import SourcePickerModal from '../components/forms/SourcePickerModal';
import { arrayBufferToBase64, extractFileNameFromContentDisposition, sanitizeFileName } from '../utils/binaryFiles';

const TAB_DOCUMENTS = 'documents';
const TAB_TEMPLATES = 'templates';
const TAB_READY_FORMS = 'ready_forms';
const TAB_MY_CREATIONS = 'my_creations';

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
  return payload.template || payload.document || payload.item || payload.result || payload.data || payload;
};

const decodeMaybeUriComponent = (value) => {
  const raw = String(value ?? '');
  if (!raw) return '';

  try {
    return decodeURIComponent(raw);
  } catch (_error) {
    // ignore and retry with + to space conversion
  }

  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch (_error) {
    return raw;
  }
};

const mapRouteTab = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === TAB_DOCUMENTS) return TAB_DOCUMENTS;
  if (normalized === TAB_TEMPLATES) return TAB_TEMPLATES;
  if (normalized === TAB_READY_FORMS || normalized === 'readyforms' || normalized === 'ready-forms') {
    return TAB_READY_FORMS;
  }
  if (
    normalized === TAB_MY_CREATIONS ||
    normalized === 'mes_creations' ||
    normalized === 'mes-creations' ||
    normalized === 'creations'
  ) {
    return TAB_MY_CREATIONS;
  }
  return null;
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

const getItemDate = (item) => item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt;

const getItemName = (item, fallbackPrefix = 'Element') => {
  const rawName =
    item?.name ||
    item?.title ||
    item?.document_name ||
    item?.documentName ||
    item?.original_name ||
    item?.originalName ||
    item?.filename ||
    item?.file_name ||
    item?.fileName ||
    '';

  const decoded = decodeMaybeUriComponent(rawName);
  if (decoded) return decoded;
  return `${fallbackPrefix} #${item?.id ?? ''}`;
};

const getAppliedTemplateInfo = (item) => {
  const nested =
    item?.applied_template ||
    item?.appliedTemplate ||
    item?.template_applied ||
    item?.templateApplied ||
    null;

  const appliedTemplateId =
    item?.applied_template_id ||
    item?.appliedTemplateId ||
    nested?.id ||
    null;

  const rawLabel =
    item?.applied_template_name ||
    item?.appliedTemplateName ||
    nested?.name ||
    nested?.title ||
    item?.applied_template_label ||
    item?.appliedTemplateLabel ||
    (appliedTemplateId ? `Template #${appliedTemplateId}` : null);

  if (!appliedTemplateId && !rawLabel) return null;

  return {
    id: appliedTemplateId,
    label: decodeMaybeUriComponent(rawLabel || '') || (appliedTemplateId ? `Template #${appliedTemplateId}` : ''),
  };
};

const getWorkProfileInfo = (item) => {
  const nested = item?.work_profile || item?.workProfile || null;

  const rawId = item?.work_profile_id || item?.workProfileId || nested?.id || null;
  const parsedId = Number(rawId);
  const workProfileId = Number.isFinite(parsedId) ? parsedId : null;

  const rawLabel =
    item?.work_profile_name ||
    item?.workProfileName ||
    nested?.name ||
    nested?.title ||
    null;
  const decodedLabel = decodeMaybeUriComponent(rawLabel || '');

  if (!workProfileId && !decodedLabel) return null;

  return {
    id: workProfileId,
    label: decodedLabel || null,
  };
};

const getReadyFormInlineWorkProfileInfo = (item) => {
  return getWorkProfileInfo({
    work_profile_id:
      item?.applied_template_work_profile_id ??
      item?.appliedTemplateWorkProfileId ??
      item?.work_profile_id ??
      item?.workProfileId ??
      item?.applied_template?.work_profile_id ??
      item?.appliedTemplate?.workProfileId ??
      item?.applied_template?.work_profile?.id ??
      item?.appliedTemplate?.workProfile?.id,
    work_profile_name:
      item?.applied_template_work_profile_name ??
      item?.appliedTemplateWorkProfileName ??
      item?.work_profile_name ??
      item?.workProfileName ??
      item?.applied_template?.work_profile_name ??
      item?.appliedTemplate?.workProfileName ??
      item?.applied_template?.work_profile?.name ??
      item?.appliedTemplate?.workProfile?.name,
    work_profile: item?.applied_template?.work_profile || item?.appliedTemplate?.workProfile || null,
  });
};

const getAttachedDocumentsCount = (item) => {
  const rawCount = item?.attached_documents_count ?? item?.attachedDocumentsCount;
  const numeric = Number(rawCount);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  if (Array.isArray(item?.attached_document_names)) return item.attached_document_names.length;
  if (Array.isArray(item?.attachedDocumentNames)) return item.attachedDocumentNames.length;
  return 0;
};

const getAttachedDocumentNames = (item) => {
  const names = item?.attached_document_names || item?.attachedDocumentNames;
  if (!Array.isArray(names)) return [];
  return names
    .map((name) => decodeMaybeUriComponent(name))
    .filter(Boolean);
};

const toShortNameList = (names, max = 3) => {
  if (!Array.isArray(names) || names.length === 0) return '';
  const short = names.slice(0, max);
  const suffix = names.length > max ? ', ...' : '';
  return `${short.join(', ')}${suffix}`;
};

const getStatusCode = (error) => Number(error?.response?.status || error?.status || 0);
const isDoneStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'done' || normalized === 'completed';
};

const formatDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const remain = Math.round(value % 60);
  return `${minutes}m ${remain}s`;
};

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
      return 'Transcription vocale';
    case 'ocr':
      return 'Document OCR';
    case 'form_fill':
      return 'Formulaire existant';
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

const getTranscriptionName = (item) => {
  return decodeMaybeUriComponent(
    item?.title ||
      item?.document_name ||
      item?.documentName ||
      item?.session_name ||
      item?.sessionName ||
      `Transcription #${item?.id ?? ''}`
  );
};

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

const normalizeDocumentConfigList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const isDocumentConfigReady = (item) =>
  String(item?.generation_status || item?.generationStatus || '').toLowerCase() === 'ready';

const getDocumentConfigStatus = (item) =>
  String(item?.generation_status || item?.generationStatus || item?.status || '').toLowerCase();

const isDocumentConfigDraft = (item) => {
  const status = getDocumentConfigStatus(item);
  return status === 'draft' || status === 'brouillon';
};

const getDocumentConfigStatusLabel = (item) => {
  if (isDocumentConfigReady(item)) return 'Prêt';
  const status = getDocumentConfigStatus(item);
  if (status === 'draft' || status === 'brouillon') return 'Brouillon';
  if (status === 'error' || status === 'failed') return 'Erreur';
  return 'En cours...';
};

const resolveDocumentConfigPreviewTemplateId = (item) => {
  const candidates = [
    item?.preview_template_id,
    item?.previewTemplateId,
    item?.template_id,
    item?.templateId,
    item?.document_id,
    item?.documentId,
    item?.result_document_id,
    item?.resultDocumentId,
    item?.result_template_id,
    item?.resultTemplateId,
    item?.output_document_id,
    item?.outputDocumentId,
    item?.output_template_id,
    item?.outputTemplateId,
    item?.generated_document_id,
    item?.generatedDocumentId,
    item?.generated_template_id,
    item?.generatedTemplateId,
    item?.config?.preview_template_id,
    item?.config?.previewTemplateId,
    item?.config?.template_id,
    item?.config?.templateId,
    item?.config?.document_id,
    item?.config?.documentId,
    item?.config?.meta?.template_id,
    item?.config?.meta?.templateId,
    item?.config?.meta?.document_id,
    item?.config?.meta?.documentId,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
  }
  return null;
};

export default function TemplatesScreen({ navigation, route }) {
  const rawRouteTabParam = route?.params?.tab;
  const requestedTab = mapRouteTab(rawRouteTabParam);

  const [activeTab, setActiveTab] = useState(requestedTab || TAB_DOCUMENTS);
  const [documents, setDocuments] = useState([]);
  const [templateItems, setTemplateItems] = useState([]);
  const [readyForms, setReadyForms] = useState([]);
  const [createdConfigs, setCreatedConfigs] = useState([]);
  const [workProfileItems, setWorkProfileItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState('');
  const [screenError, setScreenError] = useState('');

  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmModalTitle, setConfirmModalTitle] = useState('');
  const [confirmModalMessage, setConfirmModalMessage] = useState('');
  const [confirmModalActions, setConfirmModalActions] = useState([]);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const [readyFormMenuVisible, setReadyFormMenuVisible] = useState(false);
  const [readyFormMenuItem, setReadyFormMenuItem] = useState(null);
  const [creationMenuVisible, setCreationMenuVisible] = useState(false);
  const [creationMenuItem, setCreationMenuItem] = useState(null);

  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);
  const [templatePickerMode, setTemplatePickerMode] = useState('associate');
  const [templatePickerDocument, setTemplatePickerDocument] = useState(null);

  const [documentPickerVisible, setDocumentPickerVisible] = useState(false);
  const [documentPickerTemplate, setDocumentPickerTemplate] = useState(null);

  const [transcriptionPickerVisible, setTranscriptionPickerVisible] = useState(false);
  const [transcriptionPickerDocument, setTranscriptionPickerDocument] = useState(null);
  const [transcriptionPickerItems, setTranscriptionPickerItems] = useState([]);
  const [transcriptionPickerLoading, setTranscriptionPickerLoading] = useState(false);

  const [sourcePickerVisible, setSourcePickerVisible] = useState(false);
  const [sourcePickerDocument, setSourcePickerDocument] = useState(null);

  const [formFillPickerVisible, setFormFillPickerVisible] = useState(false);
  const [formFillPickerDocument, setFormFillPickerDocument] = useState(null);
  const [formFillPickerItems, setFormFillPickerItems] = useState([]);
  const [formFillPickerLoading, setFormFillPickerLoading] = useState(false);

  const [ocrFlowVisible, setOcrFlowVisible] = useState(false);
  const [ocrFlowDocument, setOcrFlowDocument] = useState(null);
  const [ocrTitle, setOcrTitle] = useState('');
  const [ocrImages, setOcrImages] = useState([]);
  const [ocrFlowLoading, setOcrFlowLoading] = useState(false);
  const [ocrFlowStep, setOcrFlowStep] = useState('idle');
  const [ocrFlowStatusText, setOcrFlowStatusText] = useState('');

  const ocrPollingRef = useRef(null);
  const ocrPollBusyRef = useRef(false);
  const actionLockRef = useRef(false);

  const openConfirmModal = ({ title, message, actions }) => {
    setConfirmModalTitle(title || 'Confirmation');
    setConfirmModalMessage(message || '');
    setConfirmModalActions(actions || []);
    setConfirmModalVisible(true);
  };

  const closeConfirmModal = () => {
    setConfirmModalVisible(false);
    setConfirmModalTitle('');
    setConfirmModalMessage('');
    setConfirmModalActions([]);
  };

  const closeRenameModal = () => {
    if (renameSaving) return;
    setRenameModalVisible(false);
    setRenameTarget(null);
    setRenameValue('');
  };

  const closeReadyFormMenu = () => {
    setReadyFormMenuVisible(false);
    setReadyFormMenuItem(null);
  };

  const closeCreationMenu = () => {
    setCreationMenuVisible(false);
    setCreationMenuItem(null);
  };

  const clearOcrPolling = useCallback(() => {
    if (ocrPollingRef.current) {
      clearInterval(ocrPollingRef.current);
      ocrPollingRef.current = null;
    }
    ocrPollBusyRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      clearOcrPolling();
    };
  }, [clearOcrPolling]);

  const loadData = useCallback(async ({ silent } = {}) => {
    if (!silent) {
      setLoading(true);
      setScreenError('');
    }

    try {
      const [
        documentsResponse,
        templatesResponse,
        readyFormsResponse,
        workProfilesResponse,
        documentConfigsResponse,
      ] = await Promise.all([
        formsScreenService.listDocumentsView(),
        formsScreenService.listTemplatesView(),
        formsScreenService.listReadyFormsView(),
        workProfiles.list().catch((error) => {
          if (getStatusCode(error) !== 404) {
            console.error('Erreur chargement profils metier:', error);
          }
          return null;
        }),
        documentConfigsApi.list().catch((error) => {
          if (getStatusCode(error) !== 404) {
            console.error('Erreur chargement configurations IA:', error);
          }
          return [];
        }),
      ]);

      setDocuments(extractList(documentsResponse));
      setTemplateItems(extractList(templatesResponse));
      setReadyForms(extractList(readyFormsResponse));
      setCreatedConfigs(normalizeDocumentConfigList(documentConfigsResponse));
      setWorkProfileItems(workProfilesResponse ? extractList(workProfilesResponse) : []);
      setScreenError('');
    } catch (error) {
      const status = getStatusCode(error);
      if (status === 404) {
        try {
          const [
            fallbackDocumentsResponse,
            fallbackTemplatesResponse,
            fallbackAllTemplatesResponse,
            fallbackLegacyDocumentsResponse,
            fallbackReadyFormsResponse,
            fallbackWorkProfilesResponse,
            fallbackDocumentConfigsResponse,
          ] = await Promise.all([
            templatesApi.listByKind('document').catch(() => null),
            templatesApi.listByKind('template').catch(() => null),
            templatesApi.list().catch(() => null),
            documentsApi.list().catch(() => null),
            formFills.listFormFills().catch(() => null),
            workProfiles.list().catch(() => null),
            documentConfigsApi.list().catch(() => []),
          ]);

          const fallbackReadyForms = extractList(fallbackReadyFormsResponse).filter((item) =>
            isDoneStatus(item?.status)
          );

          const mergedFallbackDocuments = [
            ...extractList(fallbackDocumentsResponse),
            ...extractList(fallbackLegacyDocumentsResponse),
            ...extractList(fallbackAllTemplatesResponse).filter((entry) => {
              const kind = String(entry?.kind || entry?.type || '').toLowerCase();
              return kind === 'document';
            }),
          ];
          const mergedFallbackTemplates = [
            ...extractList(fallbackTemplatesResponse),
            ...extractList(fallbackAllTemplatesResponse).filter((entry) => {
              const kind = String(entry?.kind || entry?.type || '').toLowerCase();
              return kind === 'template';
            }),
          ];

          setDocuments(mergedFallbackDocuments);
          setTemplateItems(mergedFallbackTemplates);
          setReadyForms(fallbackReadyForms);
          setCreatedConfigs(normalizeDocumentConfigList(fallbackDocumentConfigsResponse));
          setWorkProfileItems(extractList(fallbackWorkProfilesResponse));
          setScreenError('');
          return;
        } catch (fallbackError) {
          if (getStatusCode(fallbackError) !== 404) {
            console.error('Erreur fallback chargement formulaires:', fallbackError);
          }
          setDocuments([]);
          setTemplateItems([]);
          setReadyForms([]);
          setCreatedConfigs([]);
          setWorkProfileItems([]);
          setScreenError('');
          return;
        }
      }

      console.error('Erreur chargement formulaires:', error);
      setCreatedConfigs([]);
      setScreenError('Impossible de charger les formulaires');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!requestedTab) return;
    setActiveTab(requestedTab);

    // Treat route params.tab as a one-shot navigation hint so returning from child screens
    // keeps the user's current tab instead of resetting to "Documents".
    if (rawRouteTabParam !== undefined) {
      navigation.setParams({ tab: undefined });
    }
  }, [navigation, requestedTab, rawRouteTabParam]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData({ silent: true });
    setRefreshing(false);
  };

  const withAction = async (key, action) => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    setActionKey(key);
    try {
      await action();
      return true;
    } finally {
      setActionKey('');
      actionLockRef.current = false;
    }
  };

  const handleOpenDocument = (item) => {
    if (!item?.id) return;
    navigation.navigate('TemplateDetailScreen', { id: item.id });
  };

  const handleOpenTemplate = (item) => {
    if (!item?.id) return;
    navigation.navigate('TemplateSetupScreen', {
      templateId: Number(item.id),
    });
  };

  const handleOpenAppliedTemplateEditor = (item) => {
    const appliedInfo = getAppliedTemplateInfo(item);
    if (!appliedInfo?.id) return;
    navigation.navigate('TemplateEditorScreen', { templateId: appliedInfo.id });
  };

  const openRenameModal = (item, kind = 'document') => {
    if (!item?.id) return;
    const normalizedKind = kind === 'template' ? 'template' : 'document';
    const fallback = normalizedKind === 'template' ? 'Template' : 'Document';
    const currentName = getItemName(item, fallback);
    setRenameTarget({
      id: Number(item.id),
      kind: normalizedKind,
      currentName,
    });
    setRenameValue(currentName);
    setRenameModalVisible(true);
  };

  const handleSubmitRename = async () => {
    if (!renameTarget?.id || renameSaving) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      Alert.alert('Nom requis', 'Saisissez un nom valide.');
      return;
    }

    const currentName = String(renameTarget?.currentName || '').trim();
    if (nextName === currentName) {
      closeRenameModal();
      return;
    }

    const actionPrefix = renameTarget.kind === 'template' ? 'template' : 'document';
    setRenameSaving(true);

    try {
      const renamed = await withAction(`rename-${actionPrefix}-${renameTarget.id}`, async () => {
        await templatesApi.update(renameTarget.id, {
          name: nextName,
        });
        await loadData({ silent: true });
      });
      if (!renamed) return;
      setRenameModalVisible(false);
      setRenameTarget(null);
      setRenameValue('');
    } catch (error) {
      console.error('Erreur renommage element:', error);
      Alert.alert('Erreur', 'Impossible de renommer cet élément');
    } finally {
      setRenameSaving(false);
    }
  };

  const handleCreateTemplateFromDocument = async (documentItem) => {
    if (!documentItem?.id) return;

    await withAction(`doc-clone-${documentItem.id}`, async () => {
      try {
        const response = await formsScreenService.cloneAsTemplateFromDocument(documentItem.id);
        const cloned = extractItem(response);
        await loadData({ silent: true });

        if (cloned?.id) {
          navigation.navigate('TemplateEditorScreen', { templateId: cloned.id });
          return;
        }

        Alert.alert('Succès', 'Template créé, mais ouverture automatique impossible.');
      } catch (error) {
        console.error('Erreur creation template depuis document:', error);
        Alert.alert('Erreur', 'Impossible de creer le template');
      }
    });
  };

  const handleDuplicateTemplate = async (templateItem) => {
    if (!templateItem?.id) return;

    await withAction(`template-duplicate-${templateItem.id}`, async () => {
      try {
        await formsScreenService.duplicateTemplate(templateItem.id);
        Alert.alert('Succès', 'Template dupliqué');
        await loadData({ silent: true });
      } catch (error) {
        console.error('Erreur duplication template:', error);
        Alert.alert('Erreur', 'Impossible de dupliquer ce template');
      }
    });
  };

  const closeTemplatePicker = () => {
    setTemplatePickerVisible(false);
    setTemplatePickerDocument(null);
    setTemplatePickerMode('associate');
  };

  const openTemplatePickerForDocument = (documentItem, mode) => {
    if (!documentItem?.id) return;
    if (!templateItems.length) {
      Alert.alert('Template requis', 'Aucun template disponible.');
      return;
    }

    setTemplatePickerDocument(documentItem);
    setTemplatePickerMode(mode === 'apply' ? 'apply' : 'associate');
    setTemplatePickerVisible(true);
  };

  const handleSelectTemplateForDocument = async (selectionItem) => {
    const templateItem = selectionItem?.raw || selectionItem;
    if (!templatePickerDocument?.id || !templateItem?.id) return;

    const documentId = templatePickerDocument.id;
    const templateId = templateItem.id;
    const mode = templatePickerMode;

    closeTemplatePicker();

    if (mode === 'associate') {
      await withAction(`doc-associate-${documentId}`, async () => {
        try {
          await formsScreenService.associateTemplateToDocument(documentId, templateId);
          Alert.alert('Succès', 'Template associé au document');
          await loadData({ silent: true });
        } catch (error) {
          console.error('Erreur association template:', error);
          Alert.alert('Erreur', 'Impossible d associer ce template');
        }
      });
      return;
    }

    await withAction(`doc-apply-${documentId}-${templateId}`, async () => {
      try {
        await formsScreenService.applyTemplateToDocument(documentId, templateId, 'clone');
        Alert.alert('Succès', 'Template appliqué au document (mode clone)');
        await loadData({ silent: true });
      } catch (error) {
        console.error('Erreur application template document:', error);
        Alert.alert('Erreur', 'Impossible d appliquer ce template');
      }
    });
  };

  const closeDocumentPicker = () => {
    setDocumentPickerVisible(false);
    setDocumentPickerTemplate(null);
  };

  const handleOpenDocumentPickerForTemplate = (templateItem) => {
    if (!templateItem?.id) return;
    if (!documents.length) {
      Alert.alert('Document requis', 'Aucun document disponible.');
      return;
    }
    setDocumentPickerTemplate(templateItem);
    setDocumentPickerVisible(true);
  };

  const handleSelectDocumentForTemplate = async (selectionItem) => {
    const documentItem = selectionItem?.raw || selectionItem;
    if (!documentPickerTemplate?.id || !documentItem?.id) return;

    const templateId = documentPickerTemplate.id;
    const documentId = documentItem.id;
    closeDocumentPicker();

    await withAction(`template-apply-${templateId}-${documentId}`, async () => {
      try {
        await formsScreenService.applyTemplateToDocument(documentId, templateId, 'clone');
        Alert.alert('Succès', 'Template appliqué au document sélectionné');
        await loadData({ silent: true });
      } catch (error) {
        console.error('Erreur application template depuis template:', error);
        Alert.alert('Erreur', 'Impossible d appliquer ce template');
      }
    });
  };

  const getLinkedDocumentsForTemplate = (templateItem) => {
    if (!templateItem?.id) return [];
    const templateId = String(templateItem.id);
    const byTemplateId = documents.filter((documentItem) => {
      const appliedInfo = getAppliedTemplateInfo(documentItem);
      return String(appliedInfo?.id || '') === templateId;
    });
    if (byTemplateId.length > 0) return byTemplateId;

    const attachedNames = new Set(getAttachedDocumentNames(templateItem).map((name) => String(name || '').trim()));
    if (!attachedNames.size) return [];

    return documents.filter((documentItem) => {
      const documentName = String(getItemName(documentItem, 'Document') || '').trim();
      return attachedNames.has(documentName);
    });
  };

  const handleDissociateLinkedDocumentsFromTemplate = (templateItem) => {
    if (!templateItem?.id) return;
    const linkedDocuments = getLinkedDocumentsForTemplate(templateItem);
    const attachedCount = getAttachedDocumentsCount(templateItem);
    const count = linkedDocuments.length || attachedCount;

    if (!count) {
      Alert.alert('Information', 'Aucun document lié à dissocier.');
      return;
    }

    if (linkedDocuments.length === 0) {
      Alert.alert(
        'Information',
        'Impossible de résoudre automatiquement les documents liés. Ouvre l’onglet Documents pour dissocier manuellement.'
      );
      setActiveTab(TAB_DOCUMENTS);
      return;
    }

    openConfirmModal({
      title: 'Dissocier les documents liés ?',
      message: `Ce template est lié à ${count} document(s).`,
      actions: [
        {
          key: 'dissociate-linked-confirm',
          label: 'Dissocier',
          variant: 'destructive',
          onPress: async () => {
            closeConfirmModal();
            await withAction(`template-dissociate-${templateItem.id}`, async () => {
              const settled = await Promise.allSettled(
                linkedDocuments.map((documentItem) =>
                  formsScreenService.dissociateTemplateFromDocument(documentItem.id)
                )
              );
              const failedCount = settled.filter((entry) => entry.status === 'rejected').length;
              await loadData({ silent: true });

              if (failedCount === 0) {
                Alert.alert('Succès', `${linkedDocuments.length} document(s) dissocié(s)`);
                return;
              }

              Alert.alert(
                'Partiel',
                `${linkedDocuments.length - failedCount}/${linkedDocuments.length} document(s) dissocié(s)`
              );
            });
          },
        },
        {
          key: 'dissociate-linked-view-docs',
          label: 'Voir documents liés',
          variant: 'secondary',
          onPress: () => {
            closeConfirmModal();
            setActiveTab(TAB_DOCUMENTS);
          },
        },
        {
          key: 'dissociate-linked-cancel',
          label: 'Annuler',
          variant: 'ghost',
          onPress: closeConfirmModal,
        },
      ],
    });
  };

  const dissociateDocumentTemplate = async (documentItem, { notify = true } = {}) => {
    const appliedInfo = getAppliedTemplateInfo(documentItem);
    if (!documentItem?.id || !appliedInfo?.id) {
      if (notify) Alert.alert('Information', 'Aucun template à dissocier.');
      return;
    }

    await withAction(`doc-dissociate-${documentItem.id}`, async () => {
      try {
        await formsScreenService.dissociateTemplateFromDocument(documentItem.id);
        await loadData({ silent: true });
        if (notify) Alert.alert('Succès', 'Template dissocié du document');
      } catch (error) {
        console.error('Erreur dissociation template:', error);
        Alert.alert('Erreur', 'Impossible de dissocier ce template');
      }
    });
  };

  const handleDissociateTemplate = (documentItem) => {
    const appliedInfo = getAppliedTemplateInfo(documentItem);
    if (!appliedInfo?.id) {
      Alert.alert('Information', 'Aucun template à dissocier.');
      return;
    }

    openConfirmModal({
      title: 'Dissocier le template ?',
      message: `${getItemName(documentItem, 'Document')}\n\nTemplate: ${appliedInfo.label}`,
      actions: [
        {
          key: 'cancel',
          label: 'Annuler',
          variant: 'ghost',
          onPress: closeConfirmModal,
        },
        {
          key: 'confirm-dissociate',
          label: 'Dissocier',
          variant: 'destructive',
          onPress: async () => {
            closeConfirmModal();
            await dissociateDocumentTemplate(documentItem, { notify: true });
          },
        },
      ],
    });
  };

  const executeDuplicateDocument = async (documentItem) => {
    if (!documentItem?.id) return;
    const sourceAppliedInfo = getAppliedTemplateInfo(documentItem);
    const sourceIsLinked = Boolean(sourceAppliedInfo?.id);

    await withAction(`doc-duplicate-${documentItem.id}`, async () => {
      try {
        const previousDocumentIds = new Set(
          documents
            .map((item) => String(item?.id || ''))
            .filter(Boolean)
        );
        const response = await formsScreenService.duplicateDocument(documentItem.id);
        const duplicatedItem = extractItem(response);
        const responseDocumentId =
          duplicatedItem?.id ||
          duplicatedItem?.document_id ||
          duplicatedItem?.documentId ||
          null;
        let dissociationFailed = false;

        if (sourceIsLinked) {
          let duplicatedDocumentId = null;

          try {
            const latestDocumentsResponse = await formsScreenService.listDocumentsView();
            const latestDocuments = extractList(latestDocumentsResponse);
            const sourceId = String(documentItem.id);
            const responseId = responseDocumentId ? String(responseDocumentId) : '';

            const responseIdIsDocument = responseId
              ? latestDocuments.some((item) => String(item?.id || '') === responseId)
              : false;

            if (responseId && responseId !== sourceId && responseIdIsDocument) {
              duplicatedDocumentId = responseId;
            } else {
              const newCandidates = latestDocuments.filter((item) => {
                const id = String(item?.id || '');
                if (!id || id === sourceId) return false;
                return !previousDocumentIds.has(id);
              });

              if (newCandidates.length > 0) {
                newCandidates.sort((a, b) => {
                  const aDate = new Date(getItemDate(a) || 0).getTime();
                  const bDate = new Date(getItemDate(b) || 0).getTime();
                  return bDate - aDate;
                });
                duplicatedDocumentId = String(newCandidates[0]?.id || '');
              }
            }

            if (!duplicatedDocumentId) {
              for (let attempt = 0; attempt < 3 && !duplicatedDocumentId; attempt += 1) {
                await new Promise((resolve) => setTimeout(resolve, 250));
                const retryResponse = await formsScreenService.listDocumentsView();
                const retryDocuments = extractList(retryResponse);
                const retryCandidates = retryDocuments.filter((item) => {
                  const id = String(item?.id || '');
                  if (!id || id === sourceId) return false;
                  return !previousDocumentIds.has(id);
                });
                if (retryCandidates.length > 0) {
                  retryCandidates.sort((a, b) => {
                    const aDate = new Date(getItemDate(a) || 0).getTime();
                    const bDate = new Date(getItemDate(b) || 0).getTime();
                    return bDate - aDate;
                  });
                  duplicatedDocumentId = String(retryCandidates[0]?.id || '');
                }
              }
            }

            if (!duplicatedDocumentId) {
              throw new Error('newDocId introuvable après duplication');
            }

            await formsScreenService.dissociateTemplateFromDocument(duplicatedDocumentId);
          } catch (unlinkError) {
            console.error('Erreur dissociation duplicata:', unlinkError);
            dissociationFailed = true;
          }
        }

        await loadData({ silent: true });
        if (sourceIsLinked && dissociationFailed) {
          Alert.alert(
            'Partiel',
            'Document dupliqué, mais la dissociation du duplicata a échoué.'
          );
          return;
        }
        Alert.alert('Succès', sourceIsLinked ? 'Document dupliqué sans template' : 'Document dupliqué');
      } catch (error) {
        console.error('Erreur duplication document:', error);
        Alert.alert('Erreur', 'Impossible de dupliquer ce document');
      }
    });
  };

  const handleDuplicateDocument = (documentItem) => {
    executeDuplicateDocument(documentItem);
  };

  const executeDeleteDocument = async (documentItem, { dissociate = false } = {}) => {
    if (!documentItem?.id) return;

    await withAction(`doc-delete-${documentItem.id}-${dissociate ? 'dissociate' : 'plain'}`, async () => {
      try {
        await formsScreenService.deleteDocument(documentItem.id, { dissociate });
        await loadData({ silent: true });
        Alert.alert('Succès', 'Document supprimé');
      } catch (error) {
        const status = getStatusCode(error);
        if (status === 409 && !dissociate) {
          try {
            await formsScreenService.deleteDocument(documentItem.id, { dissociate: true });
            await loadData({ silent: true });
            Alert.alert('Succès', 'Document supprimé');
            return;
          } catch (retryError) {
            console.error('Erreur suppression document avec dissociation:', retryError);
          }
        }

        console.error('Erreur suppression document:', error);
        Alert.alert('Erreur', 'Impossible de supprimer ce document');
      }
    });
  };

  const handleDeleteDocument = (documentItem) => {
    const appliedInfo = getAppliedTemplateInfo(documentItem);
    const documentName = getItemName(documentItem, 'Document');
    const isLinked = Boolean(appliedInfo?.id);

    if (!isLinked) {
      openConfirmModal({
        title: 'Supprimer ce document ?',
        message: `${documentName}\n\nCette action est irréversible.`,
        actions: [
          {
            key: 'cancel',
            label: 'Annuler',
            variant: 'ghost',
            onPress: closeConfirmModal,
          },
          {
            key: 'delete',
            label: 'Supprimer',
            variant: 'destructive',
            onPress: async () => {
              closeConfirmModal();
              await executeDeleteDocument(documentItem, { dissociate: false });
            },
          },
        ],
      });
      return;
    }

    openConfirmModal({
      title: 'Supprimer ce document ?',
      message:
        `${documentName}\n\nLe template sera dissocié automatiquement puis le document sera supprimé.`,
      actions: [
        {
          key: 'delete-linked',
          label: 'Supprimer',
          variant: 'destructive',
          onPress: async () => {
            closeConfirmModal();
            await executeDeleteDocument(documentItem, { dissociate: true });
          },
        },
        {
          key: 'cancel',
          label: 'Annuler',
          variant: 'ghost',
          onPress: closeConfirmModal,
        },
      ],
    });
  };

  const executeDeleteTemplate = async (templateItem, { force = false } = {}) => {
    if (!templateItem?.id) return;

    await withAction(`template-delete-${templateItem.id}-${force ? 'force' : 'plain'}`, async () => {
      try {
        await formsScreenService.deleteTemplate(templateItem.id, { force });
        await loadData({ silent: true });
        Alert.alert('Succès', 'Template supprimé');
      } catch (error) {
        const status = getStatusCode(error);
        if (status === 409 && !force) {
          const count = getAttachedDocumentsCount(templateItem);
          const linkedNames = getAttachedDocumentNames(templateItem);
          const namesPreview = toShortNameList(linkedNames, 3);

          openConfirmModal({
            title: 'Template utilisé',
            message:
              `Ce template est utilisé par ${count} document(s).` +
              (namesPreview ? `\n\nLié à: ${namesPreview}` : ''),
            actions: [
              {
                key: 'force-delete',
                label: 'Forcer suppression + dissocier documents',
                variant: 'destructive',
                onPress: async () => {
                  closeConfirmModal();
                  await executeDeleteTemplate(templateItem, { force: true });
                },
              },
              {
                key: 'view-linked-docs',
                label: 'Voir documents liés',
                variant: 'secondary',
                onPress: () => {
                  closeConfirmModal();
                  setActiveTab(TAB_DOCUMENTS);
                },
              },
              {
                key: 'cancel',
                label: 'Annuler',
                variant: 'ghost',
                onPress: closeConfirmModal,
              },
            ],
          });
          return;
        }

        console.error('Erreur suppression template:', error);
        Alert.alert('Erreur', 'Impossible de supprimer ce template');
      }
    });
  };

  const handleDeleteTemplate = (templateItem) => {
    const count = getAttachedDocumentsCount(templateItem);
    const names = getAttachedDocumentNames(templateItem);
    const namesPreview = toShortNameList(names, 3);

    if (count <= 0) {
      openConfirmModal({
        title: 'Supprimer ce template ?',
        message: `${getItemName(templateItem, 'Template')}\n\nCette action est irréversible.`,
        actions: [
          {
            key: 'cancel',
            label: 'Annuler',
            variant: 'ghost',
            onPress: closeConfirmModal,
          },
          {
            key: 'delete-template',
            label: 'Supprimer',
            variant: 'destructive',
            onPress: async () => {
              closeConfirmModal();
              await executeDeleteTemplate(templateItem, { force: false });
            },
          },
        ],
      });
      return;
    }

    openConfirmModal({
      title: 'Template utilisé',
      message:
        `Ce template est utilisé par ${count} document(s).` +
        (namesPreview ? `\n\nLié à: ${namesPreview}` : ''),
      actions: [
        {
          key: 'force-delete',
          label: 'Forcer suppression + dissocier documents',
          variant: 'destructive',
          onPress: async () => {
            closeConfirmModal();
            await executeDeleteTemplate(templateItem, { force: true });
          },
        },
        {
          key: 'view-linked-docs',
          label: 'Voir documents liés',
          variant: 'secondary',
          onPress: () => {
            closeConfirmModal();
            setActiveTab(TAB_DOCUMENTS);
          },
        },
        {
          key: 'cancel',
          label: 'Annuler',
          variant: 'ghost',
          onPress: closeConfirmModal,
        },
      ],
    });
  };

  const ensureDocumentReadyForFill = (documentItem) => {
    if (!documentItem?.id) return false;
    const appliedTemplateInfo = getAppliedTemplateInfo(documentItem);
    if (!appliedTemplateInfo?.id) {
      Alert.alert('Template requis', 'Associez un template avant de remplir ce document.');
      return false;
    }
    return true;
  };

  const closeSourcePicker = () => {
    setSourcePickerVisible(false);
    setSourcePickerDocument(null);
  };

  const handleOpenSourcePickerForDocument = (documentItem) => {
    if (!ensureDocumentReadyForFill(documentItem)) return;
    setSourcePickerDocument(documentItem);
    setSourcePickerVisible(true);
  };

  const closeTranscriptionPicker = () => {
    setTranscriptionPickerVisible(false);
    setTranscriptionPickerDocument(null);
    setTranscriptionPickerItems([]);
    setTranscriptionPickerLoading(false);
  };

  const loadTranscriptionPickerItems = async () => {
    setTranscriptionPickerLoading(true);
    try {
      const response = await transcriptions.list();
      const items = extractList(response);
      setTranscriptionPickerItems(items);
    } catch (error) {
      console.error('Erreur chargement transcriptions pour remplissage:', error);
      Alert.alert('Erreur', 'Impossible de charger les transcriptions');
      setTranscriptionPickerItems([]);
    } finally {
      setTranscriptionPickerLoading(false);
    }
  };

  const handleOpenTranscriptionPickerForDocument = async (documentItem) => {
    if (!ensureDocumentReadyForFill(documentItem)) return;
    setTranscriptionPickerDocument(documentItem);
    setTranscriptionPickerVisible(true);
    await loadTranscriptionPickerItems();
  };

  const handleSelectTranscriptionForDocument = async (selectionItem) => {
    const transcriptionItem = selectionItem?.raw || selectionItem;
    if (!transcriptionPickerDocument?.id || !transcriptionItem?.id) return;

    const actionId = `doc-fill-transcription-${transcriptionPickerDocument.id}-${transcriptionItem.id}`;
    await withAction(actionId, async () => {
      try {
        const response = await formFills.createFormFill(
          transcriptionPickerDocument.id,
          'transcription',
          transcriptionItem.id
        );
        const created = extractItem(response);
        if (!created?.id) {
          Alert.alert('Erreur', 'Remplissage créé, mais ouverture impossible.');
          return;
        }

        closeTranscriptionPicker();
        navigation.navigate('FormFill', { formFillId: created.id });
      } catch (error) {
        console.error('Erreur creation form fill (transcription):', error);
        Alert.alert('Erreur', 'Impossible de lancer le remplissage');
      }
    });
  };

  const closeFormFillPicker = () => {
    setFormFillPickerVisible(false);
    setFormFillPickerDocument(null);
    setFormFillPickerItems([]);
    setFormFillPickerLoading(false);
  };

  const loadFormFillPickerItems = async () => {
    setFormFillPickerLoading(true);
    try {
      const response = await formFills.listFormFills();
      const items = extractList(response).filter((item) => {
        const status = String(item?.status || '').toLowerCase();
        return status === 'done' || status === 'completed';
      });
      setFormFillPickerItems(items);
    } catch (error) {
      console.error('Erreur chargement form fills source:', error);
      Alert.alert('Erreur', 'Impossible de charger les formulaires remplis');
      setFormFillPickerItems([]);
    } finally {
      setFormFillPickerLoading(false);
    }
  };

  const handleOpenFormFillPickerForDocument = async (documentItem) => {
    if (!ensureDocumentReadyForFill(documentItem)) return;
    setFormFillPickerDocument(documentItem);
    setFormFillPickerVisible(true);
    await loadFormFillPickerItems();
  };

  const handleSelectFormFillForDocument = async (selectionItem) => {
    const selected = selectionItem?.raw || selectionItem;
    if (!formFillPickerDocument?.id || !selected?.id) return;

    const actionId = `doc-fill-form-fill-${formFillPickerDocument.id}-${selected.id}`;
    await withAction(actionId, async () => {
      try {
        const response = await formFills.createFormFill(formFillPickerDocument.id, 'form_fill', selected.id);
        const created = extractItem(response);
        if (!created?.id) {
          Alert.alert('Erreur', 'Remplissage créé, mais ouverture impossible.');
          return;
        }
        closeFormFillPicker();
        navigation.navigate('FormFill', { formFillId: created.id });
      } catch (error) {
        console.error('Erreur creation form fill (form fill):', error);
        Alert.alert('Erreur', 'Impossible de lancer le remplissage');
      }
    });
  };

  const pushOcrAssets = useCallback((assets = []) => {
    if (!Array.isArray(assets) || assets.length === 0) return;
    setOcrImages((prev) => {
      const next = [...prev];
      assets.forEach((asset, index) => {
        const normalized = buildOcrImageFromAsset(asset, prev.length + index);
        if (normalized) next.push(normalized);
      });
      return next;
    });
  }, []);

  const closeOcrFlow = () => {
    clearOcrPolling();
    setOcrFlowVisible(false);
    setOcrFlowDocument(null);
    setOcrTitle('');
    setOcrImages([]);
    setOcrFlowLoading(false);
    setOcrFlowStep('idle');
    setOcrFlowStatusText('');
  };

  const handleOpenOcrFlowForDocument = (documentItem) => {
    if (!ensureDocumentReadyForFill(documentItem)) return;
    setOcrFlowDocument(documentItem);
    setOcrTitle(`${getItemName(documentItem, 'Document')} - OCR`);
    setOcrImages([]);
    setOcrFlowStep('idle');
    setOcrFlowStatusText('');
    setOcrFlowVisible(true);
  };

  const handlePickOcrFromCamera = async () => {
    if (ocrFlowLoading) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission refusée', 'Autorisez l accès à la caméra');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images,
        quality: 0.8,
      });

      if (result?.canceled || result?.cancelled) return;
      pushOcrAssets(result?.assets || []);
    } catch (error) {
      console.error('Erreur capture OCR:', error);
      Alert.alert('Erreur', 'Impossible d ouvrir la caméra');
    }
  };

  const handlePickOcrFromGallery = async () => {
    if (ocrFlowLoading) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission refusée', 'Autorisez l accès à la galerie');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images,
        quality: 0.9,
      });

      if (result?.canceled || result?.cancelled) return;
      pushOcrAssets(result?.assets || []);
    } catch (error) {
      console.error('Erreur galerie OCR:', error);
      Alert.alert('Erreur', 'Impossible d ouvrir la galerie');
    }
  };

  const handlePickOcrFromFiles = async () => {
    if (ocrFlowLoading) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result?.canceled || result?.cancelled || result?.type === 'cancel') return;
      const assets = result?.assets || (result ? [result] : []);
      pushOcrAssets(assets);
    } catch (error) {
      console.error('Erreur import fichier OCR:', error);
      Alert.alert('Erreur', 'Impossible d importer ce fichier');
    }
  };

  const handleRemoveOcrImageAt = (index) => {
    if (ocrFlowLoading) return;
    setOcrImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleStartOcrFlow = async () => {
    if (!ocrFlowDocument?.id) return;
    if (!ocrImages.length) {
      Alert.alert('OCR', 'Ajoutez au moins un document (photo ou PDF)');
      return;
    }
    if (ocrFlowLoading) return;

    setOcrFlowLoading(true);
    setOcrFlowStep('uploading');
    setOcrFlowStatusText('Envoi des documents...');
    clearOcrPolling();
    const targetDocumentId = ocrFlowDocument.id;

    try {
      const ocrResponse = await ocrDocuments.createOcrDocument(
        ocrTitle.trim() || `OCR ${Date.now()}`,
        ocrImages
      );
      const createdOcr = extractItem(ocrResponse);
      const ocrDocumentId =
        createdOcr?.id ||
        createdOcr?.ocr_document_id ||
        createdOcr?.ocrDocumentId ||
        null;

      if (!ocrDocumentId) {
        throw new Error('OCR document id manquant');
      }

      const pollStatus = async () => {
        if (ocrPollBusyRef.current) return;
        ocrPollBusyRef.current = true;

        try {
          const detailResponse = await ocrDocuments.getOcrDocument(ocrDocumentId);
          const detail = extractItem(detailResponse) || {};
          const status = String(detail?.status || '').toLowerCase();

          if (status === 'done') {
            clearOcrPolling();
            setOcrFlowStep('creating_fill');
            setOcrFlowStatusText('OCR terminé, création du remplissage...');

            const fillResponse = await formFills.createFormFill(targetDocumentId, 'ocr', ocrDocumentId);
            const createdFill = extractItem(fillResponse);
            if (!createdFill?.id) {
              Alert.alert('Erreur', 'Remplissage créé, mais ouverture impossible.');
              setOcrFlowLoading(false);
              return 'error';
            }

            closeOcrFlow();
            navigation.navigate('FormFill', { formFillId: createdFill.id });
            return 'done';
          }

          if (status === 'error') {
            clearOcrPolling();
            setOcrFlowLoading(false);
            setOcrFlowStep('error');
            Alert.alert('Erreur OCR', detail?.error_message || detail?.errorMessage || 'L analyse OCR a échoué');
            return 'error';
          }

          setOcrFlowStep('processing');
          setOcrFlowStatusText('Analyse OCR en cours...');
          return 'pending';
        } catch (pollError) {
          clearOcrPolling();
          setOcrFlowLoading(false);
          console.error('Erreur polling OCR:', pollError);
          Alert.alert('Erreur', 'Impossible de suivre l état de l OCR');
          return 'error';
        } finally {
          ocrPollBusyRef.current = false;
        }
      };

      setOcrFlowStep('processing');
      setOcrFlowStatusText('Analyse OCR en cours...');
      const firstPollResult = await pollStatus();

      if (firstPollResult === 'pending' && !ocrPollingRef.current) {
        ocrPollingRef.current = setInterval(() => {
          pollStatus();
        }, 3000);
      }
    } catch (error) {
      clearOcrPolling();
      setOcrFlowLoading(false);
      setOcrFlowStep('error');
      console.error('Erreur lancement OCR:', error);
      Alert.alert('Erreur', 'Impossible de lancer l analyse OCR');
    }
  };

  const handleSelectFillSource = async (sourceType) => {
    const targetDocument = sourcePickerDocument;
    closeSourcePicker();
    if (!targetDocument?.id) return;

    if (sourceType === 'transcription') {
      await handleOpenTranscriptionPickerForDocument(targetDocument);
      return;
    }
    if (sourceType === 'ocr') {
      handleOpenOcrFlowForDocument(targetDocument);
      return;
    }
    if (sourceType === 'form_fill') {
      await handleOpenFormFillPickerForDocument(targetDocument);
    }
  };

  const templateSelectionItems = useMemo(
    () =>
      templateItems.map((item) => ({
        id: item?.id,
        raw: item,
        title: getItemName(item, 'Template'),
        subtitle: formatDate(getItemDate(item)),
        meta: `Documents liés: ${getAttachedDocumentsCount(item)}`,
      })),
    [templateItems]
  );

  const documentSelectionItems = useMemo(
    () =>
      documents.map((item) => {
        const appliedInfo = getAppliedTemplateInfo(item);
        return {
          id: item?.id,
          raw: item,
          title: getItemName(item, 'Document'),
          subtitle: formatDate(getItemDate(item)),
          meta: `Template appliqué: ${appliedInfo?.label || 'Aucun'}`,
        };
      }),
    [documents]
  );

  const activeItems = useMemo(() => {
    if (activeTab === TAB_DOCUMENTS) return documents;
    if (activeTab === TAB_TEMPLATES) return templateItems;
    if (activeTab === TAB_MY_CREATIONS) return createdConfigs;
    return readyForms;
  }, [activeTab, createdConfigs, documents, readyForms, templateItems]);

  const templateById = useMemo(() => {
    const map = new Map();
    templateItems.forEach((item) => {
      if (item?.id === null || item?.id === undefined) return;
      map.set(String(item.id), item);
    });
    return map;
  }, [templateItems]);

  const workProfileNameById = useMemo(() => {
    const map = new Map();
    workProfileItems.forEach((item) => {
      const id = Number(item?.id);
      if (!Number.isFinite(id)) return;
      const name = decodeMaybeUriComponent(item?.name || item?.title || '');
      if (!name) return;
      map.set(id, name);
    });
    return map;
  }, [workProfileItems]);

  const getWorkProfileDisplayName = useCallback((profileInfo) => {
    if (!profileInfo) return null;
    const explicitLabel = decodeMaybeUriComponent(profileInfo?.label || '');
    if (explicitLabel) return explicitLabel;
    const numericId = Number(profileInfo?.id);
    if (!Number.isFinite(numericId)) return null;
    return workProfileNameById.get(numericId) || null;
  }, [workProfileNameById]);

  const renderDocumentItem = ({ item }) => {
    const appliedInfo = getAppliedTemplateInfo(item);
    const isLinked = Boolean(appliedInfo?.id);
    return (
      <DocumentsListCard
        name={getItemName(item, 'Document')}
        dateLabel={formatDate(getItemDate(item))}
        appliedTemplateLabel={appliedInfo?.label || 'Aucun'}
        isLinkedToTemplate={isLinked}
        onOpen={() => handleOpenDocument(item)}
        onRename={() => openRenameModal(item, 'document')}
        onCreateTemplate={() => handleCreateTemplateFromDocument(item)}
        onAssociateTemplate={() => openTemplatePickerForDocument(item, 'associate')}
        onDissociateTemplate={() => handleDissociateTemplate(item)}
        onDeleteDocument={() => handleDeleteDocument(item)}
        onDuplicateDocument={() => handleDuplicateDocument(item)}
        filling={
          actionKey.startsWith(`doc-fill-transcription-${item?.id}-`) ||
          actionKey.startsWith(`doc-fill-form-fill-${item?.id}-`)
        }
        renaming={actionKey === `rename-document-${item?.id}`}
        creating={actionKey === `doc-clone-${item?.id}`}
        associating={actionKey === `doc-associate-${item?.id}`}
        dissociating={actionKey === `doc-dissociate-${item?.id}`}
        deleting={actionKey.startsWith(`doc-delete-${item?.id}-`)}
        duplicating={actionKey === `doc-duplicate-${item?.id}`}
      />
    );
  };

  const renderTemplateItem = ({ item }) => {
    const attachedNames = getAttachedDocumentNames(item);
    const attachedCount = getAttachedDocumentsCount(item);
    const hasLinkedDocuments = attachedCount > 0;
    const workProfileInfo = getWorkProfileInfo(item);
    const workProfileName = getWorkProfileDisplayName(workProfileInfo);
    return (
      <TemplatesListCard
        name={getItemName(item, 'Template')}
        dateLabel={formatDate(getItemDate(item))}
        attachedCount={attachedCount}
        attachedNamesText={toShortNameList(attachedNames, 3)}
        workProfileLabel={workProfileName}
        onOpen={() => handleOpenTemplate(item)}
        onRename={() => openRenameModal(item, 'template')}
        onEditDescription={() =>
          navigation.navigate('TemplateSetupScreen', {
            templateId: Number(item?.id),
            highlightDescription: true,
          })
        }
        onDuplicate={() => handleDuplicateTemplate(item)}
        onManageProfile={() =>
          navigation.navigate('ProfilePickerScreen', {
            formId: Number(item?.id),
            currentProfileId: workProfileInfo?.id ?? null,
          })
        }
        onApplyToDocument={() =>
          hasLinkedDocuments
            ? handleDissociateLinkedDocumentsFromTemplate(item)
            : handleOpenDocumentPickerForTemplate(item)
        }
        onDeleteTemplate={() => handleDeleteTemplate(item)}
        openingDisabled={false}
        renaming={actionKey === `rename-template-${item?.id}`}
        duplicating={actionKey === `template-duplicate-${item?.id}`}
        applying={
          actionKey.startsWith(`template-apply-${item?.id}-`) ||
          actionKey === `template-dissociate-${item?.id}`
        }
        deleting={actionKey.startsWith(`template-delete-${item?.id}-`)}
        applyLabel={hasLinkedDocuments ? 'Dissocier' : 'Appliquer a un document'}
      />
    );
  };

  const openReadyFormMenu = (item) => {
    setReadyFormMenuItem(item);
    setReadyFormMenuVisible(true);
  };

  const renderReadyFormItem = ({ item }) => {
    const appliedInfo = getAppliedTemplateInfo(item);
    const templateWorkProfileInfo =
      appliedInfo?.id !== null && appliedInfo?.id !== undefined
        ? getWorkProfileInfo(templateById.get(String(appliedInfo.id)))
        : null;
    const inlineWorkProfileInfo = getReadyFormInlineWorkProfileInfo(item);
    const inlineWorkProfileName = getWorkProfileDisplayName(inlineWorkProfileInfo);
    const templateWorkProfileName = getWorkProfileDisplayName(templateWorkProfileInfo);
    return (
      <ReadyFormCard
        documentName={getItemName(item, 'Document')}
        templateName={appliedInfo?.label || 'Aucun'}
        workProfileName={inlineWorkProfileName || templateWorkProfileName || 'Aucun'}
        dateLabel={formatDate(getItemDate(item))}
        onFill={() => handleOpenSourcePickerForDocument(item)}
        onOpen={() => handleOpenDocument(item)}
        onOpenMenu={() => openReadyFormMenu(item)}
        onEditTemplate={appliedInfo?.id ? () => handleOpenAppliedTemplateEditor(item) : null}
      />
    );
  };

  const openCreationMenu = (item) => {
    setCreationMenuItem(item);
    setCreationMenuVisible(true);
  };

  const handleOpenCreatedConfigEditor = (item) => {
    if (!item?.id) return;
    navigation.navigate('ConfigEditorScreen', {
      documentConfigId: Number(item.id),
      documentTitle: getItemName(item, 'Formulaire'),
    });
  };

  const navigateToCreatedConfigFillScreen = (item, { previewOnly = false } = {}) => {
    if (!item?.id) return;
    const previewTemplateId = resolveDocumentConfigPreviewTemplateId(item);
    const params = {
      documentConfigId: Number(item.id),
      documentTitle: getItemName(item, 'Formulaire'),
      previewOnly,
    };
    if (previewTemplateId) {
      params.previewTemplateId = previewTemplateId;
    }
    navigation.navigate('FillDocScreen', params);
  };

  const handleFillCreatedConfig = (item) => {
    navigateToCreatedConfigFillScreen(item, { previewOnly: false });
  };

  const handleViewCreatedConfig = (item) => {
    navigateToCreatedConfigFillScreen(item, { previewOnly: true });
  };

  const handlePreviewCreatedConfig = async (item) => {
    if (!item?.id) return;

    const previewed = await withAction(`creation-preview-${item.id}`, async () => {
      await documentConfigsApi.build(item.id);
      const response = await documentConfigsApi.preview(item.id);
      const fileNameFromHeader = extractFileNameFromContentDisposition(response?.contentDisposition);
      const fallbackName = `${sanitizeFileName(getItemName(item, 'formulaire'))}.docx`;
      const fileName = fileNameFromHeader || fallbackName;

      const targetDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!targetDir) {
        throw new Error('Stockage local indisponible.');
      }

      const targetUri = `${targetDir}${fileName}`;
      await FileSystem.writeAsStringAsync(targetUri, arrayBufferToBase64(response?.arrayBuffer), {
        encoding: FileSystem.EncodingType.Base64,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        throw new Error('Le partage est indisponible sur cet appareil.');
      }

      await Sharing.shareAsync(targetUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        dialogTitle: 'Prévisualiser DOCX',
      });
    });

    if (!previewed) return;
  };

  const handleDeleteCreatedConfig = (item) => {
    if (!item?.id) return;
    openConfirmModal({
      title: 'Supprimer ce formulaire ?',
      message: getItemName(item, 'Formulaire'),
      actions: [
        { key: 'cancel', label: 'Annuler', variant: 'ghost', onPress: closeConfirmModal },
        {
          key: 'delete',
          label: 'Supprimer',
          variant: 'destructive',
          onPress: async () => {
            closeConfirmModal();
            const deleted = await withAction(`creation-delete-${item.id}`, async () => {
              await documentConfigsApi.remove(item.id);
              await loadData({ silent: true });
            });
            if (deleted) {
              Alert.alert('Succès', 'Formulaire supprimé');
            }
          },
        },
      ],
    });
  };

  const renderCreatedConfigItem = ({ item }) => {
    const statusReady = isDocumentConfigReady(item);
    const statusLabel = getDocumentConfigStatusLabel(item);
    const statusDraft = isDocumentConfigDraft(item);

    return (
      <CreatedFormCard
        title={getItemName(item, 'Formulaire')}
        dateLabel={formatDate(item?.created_at || item?.createdAt || getItemDate(item))}
        statusLabel={statusLabel}
        statusReady={statusReady}
        onFill={() => {
          if (!statusReady) {
            if (statusDraft) {
              Alert.alert('Brouillon', "Vous devez d'abord finaliser le formulaire");
              return;
            }
            Alert.alert('En cours...', 'La génération est encore en cours. Réessayez dans un instant.');
            return;
          }
          handleFillCreatedConfig(item);
        }}
        onView={() => {
          if (!statusReady) {
            if (statusDraft) {
              Alert.alert('Brouillon', "Vous devez d'abord finaliser le formulaire");
              return;
            }
            Alert.alert('En cours...', 'La génération est encore en cours. Réessayez dans un instant.');
            return;
          }
          handleViewCreatedConfig(item);
        }}
        onEdit={() => handleOpenCreatedConfigEditor(item)}
        onOpenMenu={() => openCreationMenu(item)}
        filling={actionKey === `creation-fill-${item?.id}`}
        viewing={actionKey === `creation-view-${item?.id}`}
        editing={actionKey === `creation-edit-${item?.id}`}
        fillMuted={statusDraft}
        disabled={actionKey === `creation-preview-${item?.id}` || actionKey === `creation-delete-${item?.id}`}
      />
    );
  };

  const renderActiveItem = ({ item }) => {
    if (activeTab === TAB_DOCUMENTS) return renderDocumentItem({ item });
    if (activeTab === TAB_TEMPLATES) return renderTemplateItem({ item });
    if (activeTab === TAB_MY_CREATIONS) return renderCreatedConfigItem({ item });
    return renderReadyFormItem({ item });
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.empty}>
          <ActivityIndicator size="small" color="#4F46E5" />
        </View>
      );
    }

    if (screenError) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{screenError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadData()}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }

    let title = 'Aucun élément';
    let subtitle = 'Aucune donnée à afficher pour le moment.';

    if (activeTab === TAB_DOCUMENTS) {
      title = 'Aucun document';
      subtitle = 'Les documents importés apparaîtront ici.';
    }
    if (activeTab === TAB_TEMPLATES) {
      title = 'Aucun template';
      subtitle = 'Importez ou créez un template pour démarrer.';
    }
    if (activeTab === TAB_READY_FORMS) {
      title = 'Aucun formulaire prêt';
      subtitle = 'Associez un template à un document pour le voir ici.';
    }
    if (activeTab === TAB_MY_CREATIONS) {
      title = 'Aucune création';
      subtitle = 'Créez un formulaire avec l’IA pour le voir ici.';
    }

    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{title}</Text>
        <Text style={styles.emptySubtext}>{subtitle}</Text>
      </View>
    );
  };

  const readyFormMenuActions = (() => {
    const appliedInfo = getAppliedTemplateInfo(readyFormMenuItem);
    return [
      {
        key: 'ready-rename',
        label: 'Renommer',
        variant: 'secondary',
        onPress: () => {
          const item = readyFormMenuItem;
          closeReadyFormMenu();
          openRenameModal(item, 'document');
        },
      },
      {
        key: 'ready-dissociate',
        label: 'Dissocier',
        variant: 'secondary',
        disabled: !appliedInfo?.id,
        onPress: async () => {
          closeReadyFormMenu();
          await handleDissociateTemplate(readyFormMenuItem);
        },
      },
      {
        key: 'ready-delete',
        label: 'Supprimer',
        variant: 'destructive',
        onPress: async () => {
          closeReadyFormMenu();
          await handleDeleteDocument(readyFormMenuItem);
        },
      },
      {
        key: 'ready-edit-template',
        label: 'Modifier template',
        variant: 'secondary',
        disabled: !appliedInfo?.id,
        onPress: () => {
          closeReadyFormMenu();
          handleOpenAppliedTemplateEditor(readyFormMenuItem);
        },
      },
      {
        key: 'ready-cancel',
        label: 'Annuler',
        variant: 'ghost',
        onPress: closeReadyFormMenu,
      },
    ];
  })();

  const creationMenuActions = (() => {
    const isReady = isDocumentConfigReady(creationMenuItem);
    return [
      {
        key: 'creation-view-form',
        label: 'Voir le formulaire',
        variant: 'secondary',
        disabled: !isReady,
        onPress: () => {
          const item = creationMenuItem;
          closeCreationMenu();
          if (!item) return;
          handleViewCreatedConfig(item);
        },
      },
      {
        key: 'creation-preview',
        label: 'Prévisualiser DOCX',
        variant: 'secondary',
        disabled: !isReady,
        onPress: async () => {
          const item = creationMenuItem;
          closeCreationMenu();
          if (!item) return;
          await handlePreviewCreatedConfig(item);
        },
      },
      {
        key: 'creation-delete',
        label: 'Supprimer',
        variant: 'destructive',
        onPress: async () => {
          const item = creationMenuItem;
          closeCreationMenu();
          if (!item) return;
          handleDeleteCreatedConfig(item);
        },
      },
      {
        key: 'creation-cancel',
        label: 'Annuler',
        variant: 'ghost',
        onPress: closeCreationMenu,
      },
    ];
  })();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Retour</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={styles.headerTitle}>Formulaires</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('ProfilesListScreen')}>
            <Text style={[styles.headerAction, styles.headerActionGap]}>Profils</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('ResultsStack', {
                screen: 'ResultsListScreen',
              })
            }
          >
            <Text style={styles.headerAction}>Résultats</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === TAB_DOCUMENTS && styles.tabButtonActive]}
          onPress={() => setActiveTab(TAB_DOCUMENTS)}
        >
          <Text style={[styles.tabButtonText, activeTab === TAB_DOCUMENTS && styles.tabButtonTextActive]}>
            Documents
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === TAB_TEMPLATES && styles.tabButtonActive]}
          onPress={() => setActiveTab(TAB_TEMPLATES)}
        >
          <Text style={[styles.tabButtonText, activeTab === TAB_TEMPLATES && styles.tabButtonTextActive]}>
            Templates
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === TAB_READY_FORMS && styles.tabButtonActive]}
          onPress={() => setActiveTab(TAB_READY_FORMS)}
        >
          <Text style={[styles.tabButtonText, activeTab === TAB_READY_FORMS && styles.tabButtonTextActive]}>
            Prêts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === TAB_MY_CREATIONS && styles.tabButtonActive]}
          onPress={() => setActiveTab(TAB_MY_CREATIONS)}
        >
          <Text style={[styles.tabButtonText, activeTab === TAB_MY_CREATIONS && styles.tabButtonTextActive]}>
            Mes créations
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeItems}
        renderItem={renderActiveItem}
        keyExtractor={(item) => String(item?.id || `${getItemName(item)}-${getItemDate(item) || ''}`)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={renderEmpty}
      />

      <SelectionModal
        visible={templatePickerVisible}
        title={templatePickerMode === 'apply' ? 'Appliquer un template' : 'Associer un template'}
        subtitle={templatePickerDocument ? getItemName(templatePickerDocument, 'Document') : ''}
        items={templateSelectionItems}
        onSelect={handleSelectTemplateForDocument}
        onClose={closeTemplatePicker}
        searchPlaceholder="Rechercher un template..."
        emptyText="Aucun template disponible"
      />

      <SelectionModal
        visible={documentPickerVisible}
        title="Appliquer à un document"
        subtitle={documentPickerTemplate ? getItemName(documentPickerTemplate, 'Template') : ''}
        items={documentSelectionItems}
        onSelect={handleSelectDocumentForTemplate}
        onClose={closeDocumentPicker}
        searchPlaceholder="Rechercher un document..."
        emptyText="Aucun document disponible"
      />

      <SourcePickerModal
        visible={sourcePickerVisible}
        subtitle={sourcePickerDocument ? getItemName(sourcePickerDocument, 'Document') : ''}
        onSelect={handleSelectFillSource}
        onClose={closeSourcePicker}
      />

      <SelectionModal
        visible={formFillPickerVisible}
        title="Choisir un formulaire rempli"
        subtitle={formFillPickerDocument ? getItemName(formFillPickerDocument, 'Document') : ''}
        loading={
          formFillPickerLoading ||
          (formFillPickerDocument?.id
            ? actionKey.startsWith(`doc-fill-form-fill-${formFillPickerDocument.id}-`)
            : false)
        }
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
        onSelect={handleSelectFormFillForDocument}
        onClose={closeFormFillPicker}
        searchPlaceholder="Rechercher un formulaire rempli..."
        emptyText="Aucun formulaire rempli disponible"
      />

      <Modal
        visible={ocrFlowVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!ocrFlowLoading) closeOcrFlow();
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Document papier (OCR)</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {ocrFlowDocument ? getItemName(ocrFlowDocument, 'Document') : ''}
            </Text>

            <TextInput
              style={styles.ocrTitleInput}
              value={ocrTitle}
              onChangeText={setOcrTitle}
              editable={!ocrFlowLoading}
              placeholder="Titre OCR"
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={[styles.actionSmallButton, styles.buttonGap, ocrFlowLoading && styles.actionButtonDisabled]}
                onPress={handlePickOcrFromCamera}
                disabled={ocrFlowLoading}
              >
                <Text style={styles.actionSmallButtonText}>📸 Prendre une photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionSmallButton, ocrFlowLoading && styles.actionButtonDisabled]}
                onPress={handlePickOcrFromGallery}
                disabled={ocrFlowLoading}
              >
                <Text style={styles.actionSmallButtonText}>🖼️ Importer</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={[styles.actionSmallButton, ocrFlowLoading && styles.actionButtonDisabled]}
                onPress={handlePickOcrFromFiles}
                disabled={ocrFlowLoading}
              >
                <Text style={styles.actionSmallButtonText}>📄 Importer PDF/Image</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.ocrThumbsSection}>
              <Text style={styles.ocrThumbsTitle}>Pages ({ocrImages.length})</Text>
              {ocrImages.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {ocrImages.map((imageItem, index) => (
                    <View key={`${imageItem.uri}-${index}`} style={styles.ocrThumbItem}>
                      {isImageMimeType(imageItem?.type || imageItem?.mimeType) ? (
                        <Image source={{ uri: imageItem.uri }} style={styles.ocrThumbImage} />
                      ) : (
                        <View style={styles.ocrThumbFilePlaceholder}>
                          <Text style={styles.ocrThumbFileIcon}>📄</Text>
                          <Text style={styles.ocrThumbFileName} numberOfLines={2}>
                            {imageItem?.fileName || `Fichier ${index + 1}`}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.ocrThumbRemove}
                        onPress={() => handleRemoveOcrImageAt(index)}
                        disabled={ocrFlowLoading}
                      >
                        <Text style={styles.ocrThumbRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.ocrThumbsEmpty}>Aucun document ajouté</Text>
              )}
            </View>

            {!!ocrFlowStatusText && <Text style={styles.ocrStatusText}>{ocrFlowStatusText}</Text>}
            {ocrFlowStep !== 'idle' && <Text style={styles.ocrStepText}>Étape: {ocrFlowStep}</Text>}

            <TouchableOpacity
              style={[
                styles.modalCloseButton,
                styles.ocrAnalyzeButton,
                (ocrFlowLoading || ocrImages.length === 0) && styles.actionButtonDisabled,
              ]}
              onPress={handleStartOcrFlow}
              disabled={ocrFlowLoading || ocrImages.length === 0}
            >
              {ocrFlowLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalCloseButtonText}>Analyser le document</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalCloseButton, styles.ocrCancelButton]}
              onPress={closeOcrFlow}
              disabled={ocrFlowLoading}
            >
              <Text style={styles.modalCloseButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SelectionModal
        visible={transcriptionPickerVisible}
        title="Choisir une transcription"
        subtitle={transcriptionPickerDocument ? getItemName(transcriptionPickerDocument, 'Document') : ''}
        loading={
          transcriptionPickerLoading ||
          (transcriptionPickerDocument?.id
            ? actionKey.startsWith(`doc-fill-transcription-${transcriptionPickerDocument.id}-`)
            : false)
        }
        items={transcriptionPickerItems.map((item) => {
          const duration = formatDuration(item?.audio_duration_seconds || item?.audioDurationSeconds);
          return {
            id: item?.id,
            raw: item,
            title: getTranscriptionName(item),
            subtitle: formatDate(item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt),
            meta: duration ? `Durée: ${duration}` : '',
          };
        })}
        onSelect={handleSelectTranscriptionForDocument}
        onClose={closeTranscriptionPicker}
        searchPlaceholder="Rechercher une transcription..."
        emptyText="Aucune transcription disponible"
      />

      <ConfirmActionModal
        visible={confirmModalVisible}
        title={confirmModalTitle}
        message={confirmModalMessage}
        actions={confirmModalActions}
        onClose={closeConfirmModal}
      />

      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRenameModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {renameTarget?.kind === 'template' ? 'Renommer le template' : 'Renommer le document'}
            </Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {renameTarget?.currentName || ''}
            </Text>

            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Nouveau nom"
              placeholderTextColor="#9CA3AF"
              autoFocus
              editable={!renameSaving}
              returnKeyType="done"
              onSubmitEditing={handleSubmitRename}
            />

            <View style={styles.renameActionsRow}>
              <TouchableOpacity
                style={[styles.actionSmallButton, styles.buttonGap, renameSaving && styles.actionButtonDisabled]}
                onPress={closeRenameModal}
                disabled={renameSaving}
              >
                <Text style={styles.actionSmallButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionSmallButton,
                  styles.renameSaveButton,
                  (renameSaving || !renameValue.trim()) && styles.actionButtonDisabled,
                ]}
                onPress={handleSubmitRename}
                disabled={renameSaving || !renameValue.trim()}
              >
                {renameSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.renameSaveButtonText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmActionModal
        visible={readyFormMenuVisible}
        title="Actions"
        message={readyFormMenuItem ? getItemName(readyFormMenuItem, 'Document') : ''}
        actions={readyFormMenuActions}
        onClose={closeReadyFormMenu}
      />

      <ConfirmActionModal
        visible={creationMenuVisible}
        title="Actions"
        message={creationMenuItem ? getItemName(creationMenuItem, 'Formulaire') : ''}
        actions={creationMenuActions}
        onClose={closeCreationMenu}
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
  headerAction: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  headerActionGap: {
    marginRight: 12,
  },
  headerActions: {
    width: 140,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  headerSpacer: {
    width: 140,
  },
  tabsRow: {
    flexDirection: 'row',
    margin: 15,
    marginBottom: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#4F46E5',
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    textAlign: 'center',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  list: {
    paddingHorizontal: 15,
    paddingBottom: 90,
  },
  empty: {
    alignItems: 'center',
    marginTop: 120,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 6,
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  modalSubtitle: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 13,
    color: '#6B7280',
  },
  modalCloseButton: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#111827',
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  sourceOptionCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  sourceOptionTitle: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  sourceOptionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#4B5563',
  },
  buttonsRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  actionSmallButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  actionSmallButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  buttonGap: {
    marginRight: 8,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  ocrTitleInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 8,
  },
  renameInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 8,
  },
  renameActionsRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  renameSaveButton: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  renameSaveButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  ocrThumbsSection: {
    marginTop: 8,
    marginBottom: 6,
  },
  ocrThumbsTitle: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
    marginBottom: 6,
  },
  ocrThumbItem: {
    width: 88,
    height: 88,
    marginRight: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  ocrThumbImage: {
    width: '100%',
    height: '100%',
  },
  ocrThumbFilePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
  },
  ocrThumbFileIcon: {
    fontSize: 18,
  },
  ocrThumbFileName: {
    marginTop: 4,
    fontSize: 10,
    color: '#1F2937',
    textAlign: 'center',
  },
  ocrThumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ocrThumbRemoveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
  },
  ocrThumbsEmpty: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  ocrStatusText: {
    marginTop: 6,
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  ocrStepText: {
    marginTop: 2,
    fontSize: 11,
    color: '#6B7280',
  },
  ocrAnalyzeButton: {
    backgroundColor: '#4F46E5',
  },
  ocrCancelButton: {
    backgroundColor: '#111827',
  },
});
