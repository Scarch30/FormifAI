import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { documentConfigsApi } from '../../api/documentConfigsService';
import { arrayBufferToBase64, extractFileNameFromContentDisposition, sanitizeFileName } from '../../utils/binaryFiles';
import { flattenFields } from '../../utils/documentConfigFields';

const PRIMARY = '#3B3BD4';
const GENERATION_POLL_INTERVAL_MS = 2000;

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'signature', label: 'Signature' },
];

const TABLE_COLUMN_TYPE_OPTIONS = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Case à cocher' },
];

const toSnakeCase = (str) =>
  String(str || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const normalizeTableColumnType = (value) => {
  const normalized = String(value || '').toLowerCase();
  return TABLE_COLUMN_TYPE_OPTIONS.some((option) => option.value === normalized) ? normalized : 'text';
};

const normalizeGenerationStatus = (value) => String(value || '').trim().toLowerCase();

const extractGenerationStatus = (payload) => {
  const candidates = [
    payload?.generation_status,
    payload?.generationStatus,
    payload?.status,
    payload?.config?.generation_status,
    payload?.config?.generationStatus,
    payload?.item?.generation_status,
    payload?.item?.generationStatus,
    payload?.data?.generation_status,
    payload?.data?.generationStatus,
    payload?.document_config?.generation_status,
    payload?.documentConfig?.generationStatus,
  ];

  const found = candidates.find((entry) => entry !== undefined && entry !== null);
  return normalizeGenerationStatus(found);
};

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const cloneDeep = (value) => JSON.parse(JSON.stringify(value));

const createDefaultConfig = () => ({
  meta: { title: '', page_format: 'A4', orientation: 'portrait' },
  style: { colors: { primary: '#3B3BD4', secondary: '#2E7D9A' }, margins: {} },
  header: { enabled: true, title: '', subtitle: '' },
  footer: { enabled: true, text: '', show_page_numbers: true },
  sections: [],
  page_breaks: [],
});

const createFieldItem = () => ({
  label: '',
  tag: '',
  type: 'text',
  row: 1,
  width: 100,
});

const createTableColumn = () => ({
  id: '',
  header: '',
  tag: '',
  type: 'text',
  width: 50,
});

const createSection = (type = 'fields') => {
  const id = `s_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  if (type === 'table') {
    return {
      id,
      title: '',
      type: 'table',
      iterable: '',
      columns: [createTableColumn()],
    };
  }
  if (type === 'freetext') {
    return {
      id,
      title: '',
      type: 'freetext',
      tag: '',
    };
  }
  return {
    id,
    title: '',
    type: 'fields',
    fields: [createFieldItem()],
  };
};

const normalizeSectionType = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'table') return 'table';
  if (normalized === 'freetext' || normalized === 'free_text' || normalized === 'free-text') return 'freetext';
  return 'fields';
};

const normalizeSection = (rawSection, index) => {
  const section = rawSection && typeof rawSection === 'object' ? rawSection : {};
  const type = normalizeSectionType(section.type);
  const id = section.id || `s${index + 1}`;
  const title = String(section.title || `Section ${index + 1}`);

  if (type === 'table') {
    const columns = Array.isArray(section.columns) && section.columns.length > 0
      ? section.columns.map((column) => ({
          id: String(column?.id || ''),
          header: String(column?.header || column?.id || ''),
          tag: String(column?.tag || ''),
          type: String(column?.type || 'text'),
          width: Number(column?.width) || 50,
        }))
      : [createTableColumn()];

    return {
      id,
      title,
      type,
      iterable: String(section.iterable || ''),
      columns,
    };
  }

  if (type === 'freetext') {
    return {
      id,
      title,
      type,
      tag: String(section.tag || ''),
    };
  }

  const flattenedFields = flattenFields(section.fields, { includeTaglessFields: true });
  const fields = flattenedFields.length > 0
    ? flattenedFields.map((field, fieldIndex) => ({
        label: String(field?.label || ''),
        tag: String(field?.tag || ''),
        type: String(field?.type || 'text'),
        row: Number(field?.row) || fieldIndex + 1,
        width: Number(field?.width) || 100,
      }))
    : [createFieldItem()];

  return {
    id,
    title,
    type: 'fields',
    fields,
  };
};

const normalizeConfig = (rawConfig) => {
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const base = createDefaultConfig();
  const sections = Array.isArray(config.sections)
    ? config.sections.map((section, index) => normalizeSection(section, index))
    : [];

  return {
    ...base,
    ...config,
    meta: {
      ...base.meta,
      ...(config.meta || {}),
      title: String(config?.meta?.title || ''),
    },
    header: {
      ...base.header,
      ...(config.header || {}),
      subtitle: String(config?.header?.subtitle || ''),
    },
    footer: {
      ...base.footer,
      ...(config.footer || {}),
      text: String(config?.footer?.text || ''),
      show_page_numbers: Boolean(config?.footer?.show_page_numbers ?? true),
    },
    sections,
    page_breaks: Array.isArray(config.page_breaks) ? config.page_breaks : [],
  };
};

const getSectionBadgeStyle = (type) => {
  if (type === 'table') {
    return {
      backgroundColor: '#DCFCE7',
      color: '#166534',
      label: 'table',
    };
  }
  if (type === 'freetext') {
    return {
      backgroundColor: '#E5E7EB',
      color: '#374151',
      label: 'texte libre',
    };
  }
  return {
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    label: 'fields',
  };
};

const getSectionCountLabel = (section) => {
  if (!section || typeof section !== 'object') return '0 élément';
  if (section.type === 'fields') {
    return `${flattenFields(section.fields, { includeTaglessFields: true }).length} champ(s)`;
  }
  if (section.type === 'table') return `${Array.isArray(section.columns) ? section.columns.length : 0} colonne(s)`;
  return 'Texte libre';
};

const updateSectionType = (sectionDraft, nextType) => {
  const current = sectionDraft && typeof sectionDraft === 'object' ? sectionDraft : createSection('fields');
  const normalizedType = normalizeSectionType(nextType);
  const base = {
    ...current,
    type: normalizedType,
  };

  if (normalizedType === 'table') {
    return {
      ...base,
      iterable: String(base.iterable || ''),
      columns: Array.isArray(base.columns) && base.columns.length > 0 ? base.columns : [createTableColumn()],
      fields: undefined,
      tag: undefined,
    };
  }

  if (normalizedType === 'freetext') {
    return {
      ...base,
      tag: String(base.tag || ''),
      fields: undefined,
      columns: undefined,
      iterable: undefined,
    };
  }

  return {
    ...base,
    fields: Array.isArray(base.fields) && base.fields.length > 0 ? base.fields : [createFieldItem()],
    columns: undefined,
    iterable: undefined,
    tag: undefined,
  };
};

export default function ConfigEditorScreen({ navigation, route }) {
  const documentConfigId = Number(route?.params?.documentConfigId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('ready');
  const [building, setBuilding] = useState(false);
  const [localConfig, setLocalConfig] = useState(createDefaultConfig());
  const [savedConfig, setSavedConfig] = useState(createDefaultConfig());

  const [editingSectionIndex, setEditingSectionIndex] = useState(-1);
  const [sectionModalVisible, setSectionModalVisible] = useState(false);
  const [sectionDraft, setSectionDraft] = useState(createSection('fields'));
  const generationPollingRunRef = useRef(0);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(localConfig) !== JSON.stringify(savedConfig),
    [localConfig, savedConfig]
  );
  const showGenerationBanner = normalizeGenerationStatus(generationStatus) !== 'ready';

  useEffect(
    () => () => {
      generationPollingRunRef.current += 1;
    },
    []
  );

  const applyConfigFromResponse = (response) => {
    const resolvedConfig = normalizeConfig(response?.config || response);
    const nextGenerationStatus = extractGenerationStatus(response) || 'ready';
    setLocalConfig(resolvedConfig);
    setSavedConfig(cloneDeep(resolvedConfig));
    setGenerationStatus(nextGenerationStatus);
  };

  const loadConfig = async () => {
    if (!Number.isFinite(documentConfigId)) {
      Alert.alert('Erreur', 'Identifiant de configuration invalide.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await documentConfigsApi.get(documentConfigId);
      applyConfigFromResponse(response);
    } catch (error) {
      console.error('Erreur chargement config:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de charger la configuration.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadConfig();
    }, [documentConfigId])
  );

  const pollGenerationUntilReady = async () => {
    const runId = generationPollingRunRef.current + 1;
    generationPollingRunRef.current = runId;

    while (generationPollingRunRef.current === runId) {
      try {
        const response = await documentConfigsApi.get(documentConfigId);
        const nextStatus = extractGenerationStatus(response) || 'ready';
        setGenerationStatus(nextStatus);

        if (nextStatus === 'ready') {
          applyConfigFromResponse(response);
          setBuilding(false);
          return;
        }

        if (nextStatus === 'error' || nextStatus === 'failed') {
          setBuilding(false);
          Alert.alert('Erreur', 'La génération du formulaire a échoué.');
          return;
        }
      } catch (error) {
        console.error('Erreur polling génération document config:', error);
        setBuilding(false);
        Alert.alert('Erreur', 'Impossible de suivre la génération du formulaire.');
        return;
      }

      await wait(GENERATION_POLL_INTERVAL_MS);
    }

    setBuilding(false);
  };

  const handleBuildWithAi = async () => {
    if (building || saving || previewing) return;
    if (!Number.isFinite(documentConfigId)) {
      Alert.alert('Erreur', 'Identifiant de configuration invalide.');
      return;
    }

    setBuilding(true);
    setGenerationStatus((previous) => (previous === 'ready' ? 'processing' : previous || 'processing'));

    try {
      await documentConfigsApi.build(documentConfigId);
    } catch (error) {
      console.error('Erreur lancement génération document config:', error);
      setBuilding(false);
      Alert.alert('Erreur', error?.message || 'Impossible de lancer la génération IA.');
      return;
    }

    await pollGenerationUntilReady();
  };

  const saveConfig = async ({ silent } = {}) => {
    if (saving) return false;
    if (!Number.isFinite(documentConfigId)) {
      if (!silent) {
        Alert.alert('Erreur', 'Identifiant de configuration invalide.');
      }
      return false;
    }
    setSaving(true);
    try {
      await documentConfigsApi.update(documentConfigId, localConfig);
      setSavedConfig(cloneDeep(localConfig));
      if (!silent) {
        Alert.alert('Succès', 'Configuration sauvegardée.');
      }
      return true;
    } catch (error) {
      console.error('Erreur sauvegarde config:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de sauvegarder la configuration.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (previewing || rebuilding) return;
    setPreviewing(true);
    try {
      if (hasUnsavedChanges) {
        const saved = await saveConfig({ silent: true });
        if (!saved) return;
      }

      await documentConfigsApi.build(documentConfigId);
      const previewResponse = await documentConfigsApi.preview(documentConfigId);

      const fromHeader = extractFileNameFromContentDisposition(previewResponse?.contentDisposition);
      const fallbackTitle = sanitizeFileName(localConfig?.meta?.title || `formulaire_${documentConfigId}`, `formulaire_${documentConfigId}`);
      const fileName = fromHeader || `${fallbackTitle}.docx`;
      const targetDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!targetDir) {
        throw new Error('Stockage local indisponible.');
      }

      const targetUri = `${targetDir}${fileName}`;
      const base64 = arrayBufferToBase64(previewResponse?.arrayBuffer);
      await FileSystem.writeAsStringAsync(targetUri, base64, {
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
    } catch (error) {
      console.error('Erreur preview DOCX:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de prévisualiser le DOCX.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleRebuild = async () => {
    if (rebuilding || previewing || saving || building) return;
    if (!Number.isFinite(documentConfigId)) {
      Alert.alert('Erreur', 'Identifiant de configuration invalide.');
      return;
    }

    setRebuilding(true);
    try {
      await documentConfigsApi.rebuildDocx(documentConfigId);
      Alert.alert('Succès', 'Le DOCX a été regénéré avec succès.');
    } catch (error) {
      console.error('Erreur regénération DOCX:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de regénérer le DOCX.');
    } finally {
      setRebuilding(false);
    }
  };

  useLayoutEffect(() => {
    const title = localConfig?.meta?.title
      ? `Mon formulaire — ${localConfig.meta.title}`
      : 'Mon formulaire';
    navigation.setOptions({
      title,
      headerRight: () => (
        <TouchableOpacity style={styles.headerSaveButton} onPress={() => saveConfig()} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={PRIMARY} />
          ) : (
            <Text style={styles.headerSaveButtonText}>Sauvegarder</Text>
          )}
        </TouchableOpacity>
      ),
    });
  }, [localConfig, navigation, saving]);

  const openSectionEditor = (section, index) => {
    setEditingSectionIndex(index);
    setSectionDraft(cloneDeep(section));
    setSectionModalVisible(true);
  };

  const openNewSectionEditor = () => {
    setEditingSectionIndex(-1);
    setSectionDraft(createSection('fields'));
    setSectionModalVisible(true);
  };

  const closeSectionModal = () => {
    setSectionModalVisible(false);
    setEditingSectionIndex(-1);
    setSectionDraft(createSection('fields'));
  };

  const confirmDeleteSection = (sectionIndex) => {
    Alert.alert(
      'Supprimer la section',
      'Confirmez-vous la suppression de cette section ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () =>
            setLocalConfig((previous) => ({
              ...previous,
              sections: previous.sections.filter((_, index) => index !== sectionIndex),
            })),
        },
      ],
      { cancelable: true }
    );
  };

  const persistSectionDraft = () => {
    const sectionTitle = String(sectionDraft?.title || '').trim();
    if (!sectionTitle) {
      Alert.alert('Titre requis', 'Saisissez un titre de section.');
      return;
    }

    const sectionType = normalizeSectionType(sectionDraft?.type);
    let resolvedSectionDraft = {
      ...sectionDraft,
      title: sectionTitle,
    };

    if (sectionType === 'table') {
      const inputColumns = Array.isArray(sectionDraft?.columns) ? sectionDraft.columns : [];
      const namedColumns = inputColumns
        .map((column) => ({
          name: String(column?.header || '').trim(),
          type: normalizeTableColumnType(column?.type),
        }))
        .filter((column) => column.name);

      if (namedColumns.length === 0) {
        Alert.alert('Colonnes requises', 'Ajoutez au moins une colonne avec un nom.');
        return;
      }

      const generatedIterable = toSnakeCase(sectionTitle) || 'lignes';
      const generatedWidth = Math.round((100 / namedColumns.length) * 100) / 100;
      const usedIds = new Set();
      const generatedColumns = namedColumns.map((column, index) => {
        const baseId = toSnakeCase(column.name) || `colonne_${index + 1}`;
        let nextId = baseId;
        let suffix = 2;
        while (usedIds.has(nextId)) {
          nextId = `${baseId}_${suffix}`;
          suffix += 1;
        }
        usedIds.add(nextId);

        return {
          id: nextId,
          header: column.name,
          tag: '',
          type: column.type,
          width: generatedWidth,
        };
      });

      resolvedSectionDraft = {
        ...resolvedSectionDraft,
        type: 'table',
        iterable: generatedIterable,
        columns: generatedColumns,
      };
    }

    const normalized = normalizeSection(
      {
        ...resolvedSectionDraft,
      },
      editingSectionIndex >= 0 ? editingSectionIndex : localConfig.sections.length
    );

    setLocalConfig((previous) => {
      const currentSections = Array.isArray(previous.sections) ? [...previous.sections] : [];
      if (editingSectionIndex >= 0) {
        currentSections[editingSectionIndex] = normalized;
      } else {
        currentSections.push(normalized);
      }
      return {
        ...previous,
        sections: currentSections,
      };
    });

    closeSectionModal();
  };

  const askFieldType = (onSelect) => {
    Alert.alert(
      'Type',
      'Sélectionnez un type',
      [
        ...FIELD_TYPE_OPTIONS.map((option) => ({
          text: option.label,
          onPress: () => onSelect(option.value),
        })),
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const renderFieldsDraft = () => (
    <View>
      {(sectionDraft?.fields || []).map((field, index) => (
        <View key={`field-${index}`} style={styles.modalListItem}>
          <TextInput
            style={styles.modalInput}
            value={field?.label || ''}
            onChangeText={(value) =>
              setSectionDraft((previous) => {
                const next = cloneDeep(previous);
                next.fields[index].label = value;
                return next;
              })
            }
            placeholder="Label"
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={styles.modalInput}
            value={field?.tag || ''}
            onChangeText={(value) =>
              setSectionDraft((previous) => {
                const next = cloneDeep(previous);
                next.fields[index].tag = value;
                return next;
              })
            }
            placeholder="Tag (ex: d.nom_client)"
            placeholderTextColor="#9CA3AF"
          />

          <View style={styles.modalRow}>
            <TouchableOpacity
              style={[styles.modalSelectButton, styles.modalButtonGap]}
              onPress={() =>
                askFieldType((nextType) =>
                  setSectionDraft((previous) => {
                    const next = cloneDeep(previous);
                    next.fields[index].type = nextType;
                    return next;
                  })
                )
              }
            >
              <Text style={styles.modalSelectText}>{field?.type || 'text'}</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.modalInput, styles.modalWidthInput, styles.modalButtonGap]}
              value={String(field?.width ?? 100)}
              onChangeText={(value) =>
                setSectionDraft((previous) => {
                  const next = cloneDeep(previous);
                  next.fields[index].width = Number(value) || 100;
                  return next;
                })
              }
              placeholder="Largeur %"
              keyboardType="numeric"
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity
              style={styles.modalDeleteButton}
              onPress={() =>
                setSectionDraft((previous) => {
                  const next = cloneDeep(previous);
                  if (next.fields.length <= 1) return next;
                  next.fields = next.fields.filter((_, itemIndex) => itemIndex !== index);
                  return next;
                })
              }
            >
              <Text style={styles.modalDeleteButtonText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={styles.modalAddButton}
        onPress={() =>
          setSectionDraft((previous) => {
            const next = cloneDeep(previous);
            next.fields = [...(next.fields || []), createFieldItem()];
            return next;
          })
        }
      >
        <Text style={styles.modalAddButtonText}>+ Ajouter un champ</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTableDraft = () => (
    <View>
      <Text style={styles.modalFieldLabel}>Comment s&apos;appelle ce tableau ?</Text>
      <TextInput
        style={styles.modalInput}
        value={sectionDraft?.title || ''}
        onChangeText={(value) =>
          setSectionDraft((previous) => ({
            ...previous,
            title: value,
          }))
        }
        placeholder="Ex: Liste des livrables"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.modalFieldLabel}>Colonnes</Text>
      {(sectionDraft?.columns || []).map((column, index) => (
        <View key={`column-${index}`} style={styles.modalListItem}>
          <TextInput
            style={styles.modalInput}
            value={column?.header || ''}
            onChangeText={(value) =>
              setSectionDraft((previous) => {
                const next = cloneDeep(previous);
                next.columns[index].header = value;
                return next;
              })
            }
            placeholder="Nom de la colonne"
            placeholderTextColor="#9CA3AF"
          />

          <View style={styles.tableTypePickerRow}>
            {TABLE_COLUMN_TYPE_OPTIONS.map((option) => {
              const isSelected = normalizeTableColumnType(column?.type) === option.value;
              return (
                <TouchableOpacity
                  key={`column-${index}-${option.value}`}
                  style={[styles.tableTypePill, isSelected && styles.tableTypePillActive]}
                  onPress={() =>
                    setSectionDraft((previous) => {
                      const next = cloneDeep(previous);
                      next.columns[index].type = option.value;
                      return next;
                    })
                  }
                >
                  <Text style={[styles.tableTypePillText, isSelected && styles.tableTypePillTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.modalRowRight}>
            <TouchableOpacity
              style={styles.modalDeleteButton}
              onPress={() =>
                setSectionDraft((previous) => {
                  const next = cloneDeep(previous);
                  if (next.columns.length <= 1) return next;
                  next.columns = next.columns.filter((_, itemIndex) => itemIndex !== index);
                  return next;
                })
              }
            >
                <Text style={styles.modalDeleteButtonText}>🗑️</Text>
              </TouchableOpacity>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={styles.modalAddButton}
        onPress={() =>
          setSectionDraft((previous) => {
            const next = cloneDeep(previous);
            next.columns = [...(next.columns || []), createTableColumn()];
            return next;
          })
        }
      >
        <Text style={styles.modalAddButtonText}>+ Ajouter une colonne</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFreeTextDraft = () => (
    <TextInput
      style={styles.modalInput}
      value={sectionDraft?.tag || ''}
      onChangeText={(value) =>
        setSectionDraft((previous) => ({
          ...previous,
          tag: value,
        }))
      }
      placeholder="Tag Carbone"
      placeholderTextColor="#9CA3AF"
    />
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {showGenerationBanner ? (
          <View style={styles.generationBanner}>
            <Text style={styles.generationBannerText}>Ce formulaire n&apos;a pas encore été généré</Text>

            {building ? (
              <View style={styles.generationProgressRow}>
                <ActivityIndicator size="small" color={PRIMARY} />
                <Text style={styles.generationProgressText}>Génération en cours...</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.generationBannerButton} onPress={handleBuildWithAi}>
                <Text style={styles.generationBannerButtonText}>Générer avec l&apos;IA</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Informations générales</Text>
          <TextInput
            style={styles.input}
            value={localConfig?.meta?.title || ''}
            onChangeText={(value) =>
              setLocalConfig((previous) => ({
                ...previous,
                meta: {
                  ...(previous.meta || {}),
                  title: value,
                },
              }))
            }
            placeholder="Titre du document"
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={styles.input}
            value={localConfig?.header?.subtitle || ''}
            onChangeText={(value) =>
              setLocalConfig((previous) => ({
                ...previous,
                header: {
                  ...(previous.header || {}),
                  subtitle: value,
                },
              }))
            }
            placeholder="En-tête"
            placeholderTextColor="#9CA3AF"
          />
          <TextInput
            style={styles.input}
            value={localConfig?.footer?.text || ''}
            onChangeText={(value) =>
              setLocalConfig((previous) => ({
                ...previous,
                footer: {
                  ...(previous.footer || {}),
                  text: value,
                },
              }))
            }
            placeholder="Pied de page"
            placeholderTextColor="#9CA3AF"
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Numérotation des pages</Text>
            <Switch
              value={Boolean(localConfig?.footer?.show_page_numbers)}
              onValueChange={(nextValue) =>
                setLocalConfig((previous) => ({
                  ...previous,
                  footer: {
                    ...(previous.footer || {}),
                    show_page_numbers: nextValue,
                  },
                }))
              }
              trackColor={{ true: '#C7D2FE', false: '#E5E7EB' }}
              thumbColor={Boolean(localConfig?.footer?.show_page_numbers) ? PRIMARY : '#fff'}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Structure du formulaire</Text>

          {(localConfig?.sections || []).map((section, index) => {
            const badge = getSectionBadgeStyle(section?.type);
            return (
              <View key={`${section?.id || 'section'}-${index}`} style={styles.sectionItem}>
                <View style={styles.sectionItemHeader}>
                  <View style={styles.sectionItemTextWrap}>
                    <Text style={styles.sectionItemTitle} numberOfLines={1}>
                      {index + 1}. {section?.title || `Section ${index + 1}`}
                    </Text>
                    <Text style={styles.sectionItemSubtitle}>{getSectionCountLabel(section)}</Text>
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: badge.backgroundColor }]}>
                    <Text style={[styles.typeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                </View>

                <View style={styles.sectionItemActions}>
                  <TouchableOpacity
                    style={[styles.sectionActionButton, styles.sectionActionGap]}
                    onPress={() => openSectionEditor(section, index)}
                  >
                    <Text style={styles.sectionActionText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.sectionActionButton} onPress={() => confirmDeleteSection(index)}>
                    <Text style={styles.sectionActionText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <TouchableOpacity style={styles.addSectionButton} onPress={openNewSectionEditor}>
            <Text style={styles.addSectionButtonText}>+ Ajouter une section</Text>
          </TouchableOpacity>
        </View>

        {hasUnsavedChanges ? (
          <Text style={styles.unsavedIndicator}>• Modifications non sauvegardées</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerButton, styles.footerOutlineButton]}
          onPress={handlePreview}
          disabled={previewing || rebuilding}
        >
          {previewing ? (
            <ActivityIndicator size="small" color={PRIMARY} />
          ) : (
            <Text style={styles.footerOutlineButtonText}>Prévisualiser DOCX</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerButton, styles.footerOutlineButton]}
          onPress={handleRebuild}
          disabled={rebuilding}
        >
          {rebuilding ? (
            <View style={styles.footerButtonLoadingContent}>
              <ActivityIndicator size="small" color={PRIMARY} />
              <Text style={styles.footerOutlineButtonText}>Regénération...</Text>
            </View>
          ) : (
            <Text style={styles.footerOutlineButtonText}>Regénérer le DOCX</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerButton, styles.footerPrimaryButton]}
          onPress={() =>
            navigation.navigate('FillDocScreen', {
              documentConfigId,
              documentTitle: localConfig?.meta?.title || '',
            })
          }
          disabled={rebuilding}
        >
          <Text style={styles.footerPrimaryButtonText}>Remplir ce formulaire</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={sectionModalVisible} animationType="slide" onRequestClose={closeSectionModal}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingSectionIndex >= 0 ? 'Modifier la section' : 'Ajouter une section'}
            </Text>
            <TouchableOpacity onPress={closeSectionModal}>
              <Text style={styles.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {sectionDraft?.type !== 'table' ? (
              <TextInput
                style={styles.modalInput}
                value={sectionDraft?.title || ''}
                onChangeText={(value) =>
                  setSectionDraft((previous) => ({
                    ...previous,
                    title: value,
                  }))
                }
                placeholder="Titre"
                placeholderTextColor="#9CA3AF"
              />
            ) : null}

            <View style={styles.modalTypeRow}>
              <TouchableOpacity
                style={[
                  styles.modalTypeButton,
                  sectionDraft?.type === 'fields' && styles.modalTypeButtonActive,
                  styles.modalButtonGap,
                ]}
                onPress={() => setSectionDraft((previous) => updateSectionType(previous, 'fields'))}
              >
                <Text
                  style={[
                    styles.modalTypeButtonText,
                    sectionDraft?.type === 'fields' && styles.modalTypeButtonTextActive,
                  ]}
                >
                  Champs
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalTypeButton,
                  sectionDraft?.type === 'table' && styles.modalTypeButtonActive,
                  styles.modalButtonGap,
                ]}
                onPress={() => setSectionDraft((previous) => updateSectionType(previous, 'table'))}
              >
                <Text
                  style={[
                    styles.modalTypeButtonText,
                    sectionDraft?.type === 'table' && styles.modalTypeButtonTextActive,
                  ]}
                >
                  Tableau
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalTypeButton,
                  sectionDraft?.type === 'freetext' && styles.modalTypeButtonActive,
                ]}
                onPress={() => setSectionDraft((previous) => updateSectionType(previous, 'freetext'))}
              >
                <Text
                  style={[
                    styles.modalTypeButtonText,
                    sectionDraft?.type === 'freetext' && styles.modalTypeButtonTextActive,
                  ]}
                >
                  Texte libre
                </Text>
              </TouchableOpacity>
            </View>

            {sectionDraft?.type === 'fields' ? renderFieldsDraft() : null}
            {sectionDraft?.type === 'table' ? renderTableDraft() : null}
            {sectionDraft?.type === 'freetext' ? renderFreeTextDraft() : null}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.modalFooterButton, styles.modalFooterCancel]} onPress={closeSectionModal}>
              <Text style={styles.modalFooterCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalFooterButton, styles.modalFooterSave]} onPress={persistSectionDraft}>
              <Text style={styles.modalFooterSaveText}>Enregistrer</Text>
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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
    paddingBottom: 132,
  },
  generationBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  generationBannerText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '700',
  },
  generationBannerButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: PRIMARY,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  generationBannerButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  generationProgressRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  generationProgressText: {
    marginLeft: 8,
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#111827',
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  switchRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  sectionItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  sectionItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionItemTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  sectionItemTitle: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  sectionItemSubtitle: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 12,
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionItemActions: {
    flexDirection: 'row',
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  sectionActionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  sectionActionGap: {
    marginRight: 8,
  },
  sectionActionText: {
    fontSize: 15,
  },
  addSectionButton: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PRIMARY,
    borderStyle: 'dashed',
    paddingVertical: 12,
    alignItems: 'center',
  },
  addSectionButtonText: {
    color: PRIMARY,
    fontWeight: '700',
    fontSize: 14,
  },
  unsavedIndicator: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footerButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  footerButtonLoadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerOutlineButton: {
    borderWidth: 1,
    borderColor: PRIMARY,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  footerOutlineButtonText: {
    color: PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  footerPrimaryButton: {
    backgroundColor: PRIMARY,
  },
  footerPrimaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  headerSaveButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  headerSaveButtonText: {
    color: PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  modalCloseText: {
    color: PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  modalContent: {
    padding: 16,
    paddingBottom: 130,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    backgroundColor: '#fff',
    marginBottom: 8,
    fontSize: 14,
  },
  modalTypeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  modalFieldLabel: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 6,
  },
  modalTypeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalTypeButtonActive: {
    borderColor: PRIMARY,
    backgroundColor: '#EEF2FF',
  },
  modalTypeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  modalTypeButtonTextActive: {
    color: PRIMARY,
  },
  modalListItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalSelectButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSelectText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  modalWidthInput: {
    flex: 1,
    marginBottom: 0,
  },
  modalRowRight: {
    marginTop: 6,
    alignItems: 'flex-end',
  },
  tableTypePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  tableTypePill: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
    marginRight: 6,
    marginBottom: 6,
  },
  tableTypePillActive: {
    borderColor: PRIMARY,
    backgroundColor: '#EEF2FF',
  },
  tableTypePillText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '700',
  },
  tableTypePillTextActive: {
    color: PRIMARY,
  },
  modalDeleteButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  modalDeleteButtonText: {
    fontSize: 16,
  },
  modalAddButton: {
    borderWidth: 1,
    borderColor: PRIMARY,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  modalAddButtonText: {
    color: PRIMARY,
    fontSize: 13,
    fontWeight: '700',
  },
  modalFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalFooterButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooterCancel: {
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  modalFooterCancelText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },
  modalFooterSave: {
    backgroundColor: PRIMARY,
  },
  modalFooterSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalButtonGap: {
    marginRight: 8,
  },
});
