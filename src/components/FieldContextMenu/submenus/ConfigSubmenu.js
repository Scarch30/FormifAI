import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import BackButton from '../BackButton';

const FIELD_TYPES = [
  { value: 'text', label: '📝 Texte' },
  { value: 'checkbox', label: '☑️ Case à cocher' },
  { value: 'radio', label: '🔘 Bouton radio' },
  { value: 'select', label: '📋 Liste déroulante' },
];
const DEFAULT_CATEGORY = 'Générale';
const FIELD_TYPE_TEXT = 'text';
const FIELD_TYPE_CHECKBOX = 'checkbox';
const FIELD_TYPE_RADIO = 'radio';
const FIELD_TYPE_SELECT = 'select';

const normalizeFieldType = (value) => {
  const normalized = String(value || FIELD_TYPE_TEXT).trim().toLowerCase();
  if (!normalized) return FIELD_TYPE_TEXT;
  return normalized;
};

const ConfigSubmenu = ({
  field,
  allFields,
  onUpdateField,
  onDelete,
  onDuplicate,
  onSave,
  scrollMaxHeight,
  onBack,
}) => {
  const [localCategory, setLocalCategory] = useState(
    field?.category_label ?? field?.category ?? DEFAULT_CATEGORY
  );
  const [localExplicitName, setLocalExplicitName] = useState(
    field?.display_name ?? field?.field_hint ?? ''
  );
  const [localAiDescription, setLocalAiDescription] = useState(
    field?.ai_description || ''
  );
  const [localTextExample, setLocalTextExample] = useState(
    field?.text_example || ''
  );
  const [localFieldType, setLocalFieldType] = useState(
    normalizeFieldType(field?.field_type)
  );
  const [localIsCheckedDefault, setLocalIsCheckedDefault] = useState(
    Boolean(field?.is_checked_default)
  );
  const [localGroupId, setLocalGroupId] = useState(field?.group_id || '');
  const [localOptionValue, setLocalOptionValue] = useState(field?.option_value || '');
  const [localFormatHint, setLocalFormatHint] = useState(field?.format_hint || '');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const scrollRef = useRef(null);

  React.useEffect(() => {
    setLocalCategory(field?.category_label ?? field?.category ?? DEFAULT_CATEGORY);
    setLocalExplicitName(field?.display_name ?? field?.field_hint ?? '');
    setLocalAiDescription(field?.ai_description || '');
    setLocalTextExample(field?.text_example || '');
    setLocalFieldType(normalizeFieldType(field?.field_type));
    setLocalIsCheckedDefault(Boolean(field?.is_checked_default));
    setLocalGroupId(field?.group_id || '');
    setLocalOptionValue(field?.option_value || '');
    setLocalFormatHint(field?.format_hint || '');
  }, [field?.id, field?.localId]);

  // Scroll to a focused input so it stays visible above the keyboard
  const scrollToInput = useCallback((event) => {
    const node = event?.nativeEvent?.target;
    if (node && scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard) {
      scrollRef.current.scrollResponderScrollNativeHandleToKeyboard(node, 80, true);
    } else if (scrollRef.current) {
      // Fallback: measure the input position and scroll to it
      setTimeout(() => {
        event?.target?.measureLayout?.(
          scrollRef.current,
          (_x, y) => {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
          },
          () => {}
        );
      }, 100);
    }
  }, []);

  // Get existing categories from all fields + default
  const existingCategories = useMemo(() => {
    const categories = new Set([DEFAULT_CATEGORY]);
    (allFields || []).forEach((f) => {
      const cat = f.category_label || f.category;
      if (cat && cat.trim()) {
        categories.add(cat.trim());
      }
    });
    return Array.from(categories).sort((a, b) => {
      // Keep "Générale" first
      if (a === DEFAULT_CATEGORY) return -1;
      if (b === DEFAULT_CATEGORY) return 1;
      return a.localeCompare(b);
    });
  }, [allFields]);

  const technicalName = field?.field_name || '';

  const handleCategorySelect = (category) => {
    setLocalCategory(category);
    setShowCategoryDropdown(false);
    setIsCreatingNewCategory(false);
    updateField({ category_label: category });
  };

  const handleCreateNewCategory = () => {
    setIsCreatingNewCategory(true);
    setShowCategoryDropdown(false);
  };

  const handleNewCategoryConfirm = () => {
    if (newCategoryName.trim()) {
      const cat = newCategoryName.trim();
      setLocalCategory(cat);
      setIsCreatingNewCategory(false);
      updateField({ category_label: cat });
      setNewCategoryName('');
    }
  };

  const handleExplicitNameChange = (text) => {
    setLocalExplicitName(text);
  };

  const handleExplicitNameBlur = () => {
    updateField({ display_name: localExplicitName });
  };

  const handleFieldTypeChange = (type) => {
    const normalizedType = normalizeFieldType(type);
    setLocalFieldType(normalizedType);
    const patch = { field_type: normalizedType };
    if (normalizedType === FIELD_TYPE_CHECKBOX) {
      patch.is_checked_default = Boolean(localIsCheckedDefault);
    }
    if (normalizedType === FIELD_TYPE_RADIO) {
      const fallbackGroup = localGroupId.trim() || `group_${field?.id || field?.localId || Date.now()}`;
      const fallbackOption =
        localOptionValue.trim() ||
        localExplicitName.trim() ||
        String(field?.display_name || field?.field_label || '').trim();
      setLocalGroupId(fallbackGroup);
      setLocalOptionValue(fallbackOption);
      patch.group_id = fallbackGroup;
      patch.option_value = fallbackOption;
    }
    if (normalizedType === FIELD_TYPE_SELECT) {
      patch.format_hint = localFormatHint || '';
    }
    updateField(patch);
  };

  const handleAiDescriptionChange = (text) => {
    setLocalAiDescription(text);
  };

  const handleAiDescriptionBlur = () => {
    updateField({ ai_description: localAiDescription });
  };

  const handleTextExampleChange = (text) => {
    setLocalTextExample(text);
  };

  const handleTextExampleBlur = () => {
    updateField({ text_example: localTextExample });
  };

  const handleGroupIdBlur = () => {
    updateField({ group_id: localGroupId.trim() });
  };

  const handleOptionValueBlur = () => {
    updateField({ option_value: localOptionValue.trim() });
  };

  const handleFormatHintBlur = () => {
    updateField({ format_hint: localFormatHint.trim() });
  };

  const toggleCheckedDefault = (checked) => {
    setLocalIsCheckedDefault(checked);
    updateField({ is_checked_default: checked });
  };

  const handleCopyTechnicalName = () => {
    if (!technicalName) {
      Alert.alert('Nom technique', 'Généré automatiquement après sauvegarde.', [
        { text: 'OK', style: 'default' },
      ]);
      return;
    }
    Alert.alert('Nom technique', technicalName, [
      { text: 'OK', style: 'default' },
    ]);
  };

  const updateField = useCallback(
    (patch) => {
      if (onUpdateField) {
        onUpdateField(patch);
      }
    },
    [onUpdateField]
  );

  const handleDelete = () => {
    Alert.alert(
      'Supprimer le champ',
      'Voulez-vous vraiment supprimer ce champ ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            if (onDelete) onDelete();
          },
        },
      ]
    );
  };

  const fieldType = localFieldType || FIELD_TYPE_TEXT;
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  const handleSave = async () => {
    if (saveState === 'saving') return;
    if (fieldType === FIELD_TYPE_RADIO && !localGroupId.trim()) {
      Alert.alert('Groupe requis', 'Le group_id est obligatoire pour un bouton radio.');
      return;
    }
    // Flush all pending local state to parent before triggering save
    const patch = {};
    if (localCategory !== (field?.category_label ?? field?.category ?? DEFAULT_CATEGORY)) {
      patch.category_label = localCategory;
    }
    if (localExplicitName !== (field?.display_name ?? field?.field_hint ?? '')) {
      patch.display_name = localExplicitName;
    }
    if (localAiDescription !== (field?.ai_description || '')) {
      patch.ai_description = localAiDescription;
    }
    if (localTextExample !== (field?.text_example || '')) {
      patch.text_example = localTextExample;
    }
    if (fieldType !== normalizeFieldType(field?.field_type)) {
      patch.field_type = fieldType;
    }
    if (fieldType === FIELD_TYPE_CHECKBOX) {
      if (Boolean(localIsCheckedDefault) !== Boolean(field?.is_checked_default)) {
        patch.is_checked_default = Boolean(localIsCheckedDefault);
      }
    }
    if (fieldType === FIELD_TYPE_RADIO) {
      if (localGroupId.trim() !== String(field?.group_id || '').trim()) {
        patch.group_id = localGroupId.trim();
      }
      if (localOptionValue.trim() !== String(field?.option_value || '').trim()) {
        patch.option_value = localOptionValue.trim();
      }
    }
    if (fieldType === FIELD_TYPE_SELECT) {
      if (localFormatHint.trim() !== String(field?.format_hint || '').trim()) {
        patch.format_hint = localFormatHint.trim();
      }
    }
    if (Object.keys(patch).length > 0) {
      updateField(patch);
    }
    if (onSave) {
      setSaveState('saving');
      try {
        await onSave();
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2000);
      } catch {
        setSaveState('error');
        setTimeout(() => setSaveState('idle'), 2500);
      }
    }
  };

  const saveButtonLabel =
    saveState === 'saving' ? 'Sauvegarde...' :
    saveState === 'saved' ? 'Sauvegardé ✓' :
    saveState === 'error' ? 'Erreur ✗' :
    'Sauvegarder';

  const scrollStyle = scrollMaxHeight > 0
    ? { maxHeight: scrollMaxHeight }
    : null;

  return (
    <View style={styles.container}>
      <BackButton onBack={onBack} />
      <ScrollView
        ref={scrollRef}
        style={[styles.scrollContent, scrollStyle]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        persistentScrollbar={true}
      >

      {/* Category - Dropdown */}
      <View style={styles.section}>
        <Text style={styles.label}>Catégorie</Text>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => {
            setShowCategoryDropdown(!showCategoryDropdown);
          }}
        >
          <Text style={styles.dropdownText}>
            {localCategory || DEFAULT_CATEGORY}
          </Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>
        {showCategoryDropdown && (
          <View style={styles.dropdownList}>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleCreateNewCategory}
            >
              <Text style={[styles.dropdownItemText, styles.createNewText]}>
                + Créer une catégorie...
              </Text>
            </TouchableOpacity>
            {existingCategories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.dropdownItem,
                  localCategory === cat && styles.dropdownItemActive,
                ]}
                onPress={() => handleCategorySelect(cat)}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    localCategory === cat && styles.dropdownItemTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {isCreatingNewCategory && (
          <View style={styles.newItemRow}>
            <TextInput
              style={styles.newItemInput}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              onFocus={scrollToInput}
              placeholder="Nom de la catégorie"
              placeholderTextColor="#666"
              autoFocus
            />
            <TouchableOpacity
              style={styles.newItemButton}
              onPress={handleNewCategoryConfirm}
            >
              <Text style={styles.newItemButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Explicit name */}
      <View style={styles.section}>
        <Text style={styles.label}>Nom explicatif</Text>
        <TextInput
          style={styles.input}
          value={localExplicitName}
          onChangeText={handleExplicitNameChange}
          onFocus={scrollToInput}
          onBlur={handleExplicitNameBlur}
          placeholder="Nom de famille, Date de naissance..."
          placeholderTextColor="#666"
        />
      </View>

      {/* Technical name (readonly) */}
      <View style={styles.section}>
        <Text style={styles.label}>Nom technique (auto)</Text>
        <View style={styles.technicalRow}>
          <View style={styles.technicalInput}>
            <Text style={styles.technicalText}>
              {technicalName || 'Généré automatiquement'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={handleCopyTechnicalName}
          >
            <Text style={styles.copyButtonText}>Copier</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helperText}>Généré automatiquement</Text>
      </View>

      {/* Field type */}
      <View style={styles.section}>
        <Text style={styles.label}>Type de donnees</Text>
        <View style={styles.typeRow}>
          {FIELD_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[styles.typeButton, fieldType === type.value && styles.typeButtonActive]}
              onPress={() => handleFieldTypeChange(type.value)}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  fieldType === type.value && styles.typeButtonTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {fieldType === FIELD_TYPE_CHECKBOX && (
        <View style={styles.section}>
          <Text style={styles.label}>Etat par défaut</Text>
          <View style={styles.booleanRow}>
            <TouchableOpacity
              style={[styles.booleanChip, !localIsCheckedDefault && styles.booleanChipActive]}
              onPress={() => toggleCheckedDefault(false)}
            >
              <Text style={[styles.booleanChipText, !localIsCheckedDefault && styles.booleanChipTextActive]}>
                ☐ Non coché
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.booleanChip, localIsCheckedDefault && styles.booleanChipActive]}
              onPress={() => toggleCheckedDefault(true)}
            >
              <Text style={[styles.booleanChipText, localIsCheckedDefault && styles.booleanChipTextActive]}>
                ☑ Coché
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {fieldType === FIELD_TYPE_RADIO && (
        <View style={styles.section}>
          <Text style={styles.label}>Groupe radio (group_id) *</Text>
          <TextInput
            style={styles.input}
            value={localGroupId}
            onChangeText={setLocalGroupId}
            onFocus={scrollToInput}
            onBlur={handleGroupIdBlur}
            placeholder="ex: statut_matrimonial"
            placeholderTextColor="#666"
            autoCapitalize="none"
          />
          <Text style={styles.label}>Valeur de l'option</Text>
          <TextInput
            style={styles.input}
            value={localOptionValue}
            onChangeText={setLocalOptionValue}
            onFocus={scrollToInput}
            onBlur={handleOptionValueBlur}
            placeholder="ex: Marié"
            placeholderTextColor="#666"
          />
        </View>
      )}

      {fieldType === FIELD_TYPE_SELECT && (
        <View style={styles.section}>
          <Text style={styles.label}>Options (format_hint)</Text>
          <TextInput
            style={styles.input}
            value={localFormatHint}
            onChangeText={setLocalFormatHint}
            onFocus={scrollToInput}
            onBlur={handleFormatHintBlur}
            placeholder="ex: Marié|Célibataire|Divorcé|Veuf"
            placeholderTextColor="#666"
          />
          <Text style={styles.helperText}>
            Séparez les options avec le caractère |.
          </Text>
        </View>
      )}

      {/* AI description */}
      <View style={styles.section}>
        <Text style={styles.label}>Description pour l'IA</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={localAiDescription}
          onChangeText={handleAiDescriptionChange}
          onFocus={scrollToInput}
          onBlur={handleAiDescriptionBlur}
          placeholder="Description pour aider l'IA a remplir ce champ..."
          placeholderTextColor="#666"
          multiline
          numberOfLines={3}
        />
        <Text style={styles.helperText}>
          Aide l'IA à comprendre ce que doit contenir ce champ (ex: Nom de naissance du client, en lettres capitales).
        </Text>
      </View>

      {/* Text example for AI */}
      <View style={styles.section}>
        <Text style={styles.label}>Exemple de valeur</Text>
        <TextInput
          style={styles.input}
          value={localTextExample}
          onChangeText={handleTextExampleChange}
          onFocus={scrollToInput}
          onBlur={handleTextExampleBlur}
          placeholder="Ex: DUPONT, 250000\u20AC, CLI"
          placeholderTextColor="#666"
        />
        <Text style={styles.helperText}>
          Exemple court de ce que contiendra ce champ. Aide l'IA à comprendre le format attendu.
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.duplicateButton} onPress={onDuplicate}>
          <Text style={styles.duplicateButtonText}>Dupliquer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Supprimer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.saveButton,
            saveState === 'saved' && styles.saveButtonSuccess,
            saveState === 'error' && styles.saveButtonError,
            saveState === 'saving' && styles.saveButtonSaving,
          ]}
          onPress={handleSave}
          disabled={saveState === 'saving'}
        >
          <Text
            style={[
              styles.saveButtonText,
              saveState === 'saved' && styles.saveButtonTextSuccess,
              saveState === 'error' && styles.saveButtonTextError,
            ]}
          >
            {saveButtonLabel}
          </Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // No flex:1 — sized by ScrollView maxHeight from parent
  },
  scrollContent: {
    // maxHeight applied dynamically via scrollMaxHeight prop
  },
  section: {
    marginBottom: 12,
  },
  label: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  input: {
    backgroundColor: '#333',
    borderRadius: 6,
    padding: 10,
    color: '#fff',
    fontSize: 13,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  helperText: {
    marginTop: 6,
    fontSize: 11,
    color: '#8a8a8a',
    lineHeight: 14,
  },
  technicalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  technicalInput: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    padding: 10,
  },
  technicalText: {
    color: '#888',
    fontSize: 13,
  },
  copyButton: {
    backgroundColor: '#444',
    borderRadius: 6,
    padding: 10,
    marginLeft: 8,
  },
  copyButtonText: {
    color: '#2196F3',
    fontSize: 12,
  },
  dropdown: {
    backgroundColor: '#333',
    borderRadius: 6,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    color: '#fff',
    fontSize: 13,
  },
  dropdownPlaceholder: {
    color: '#666',
    fontSize: 13,
  },
  dropdownArrow: {
    color: '#666',
    fontSize: 10,
  },
  dropdownList: {
    backgroundColor: '#333',
    borderRadius: 6,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  dropdownItemActive: {
    backgroundColor: '#2196F3',
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 13,
  },
  dropdownItemTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  createNewText: {
    color: '#2196F3',
  },
  newItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  newItemInput: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 6,
    padding: 10,
    color: '#fff',
    fontSize: 13,
  },
  newItemButton: {
    backgroundColor: '#2196F3',
    borderRadius: 6,
    padding: 10,
    marginLeft: 8,
  },
  newItemButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#333',
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  typeButtonActive: {
    backgroundColor: '#2196F3',
  },
  typeButtonText: {
    color: '#aaa',
    fontSize: 12,
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  booleanRow: {
    flexDirection: 'row',
    gap: 8,
  },
  booleanChip: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4b5563',
    backgroundColor: '#2a2a2a',
    paddingVertical: 9,
    alignItems: 'center',
  },
  booleanChipActive: {
    borderColor: '#60a5fa',
    backgroundColor: '#1d4ed8',
  },
  booleanChipText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  booleanChipTextActive: {
    color: '#fff',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  duplicateButton: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginRight: 6,
  },
  duplicateButtonText: {
    color: '#fff',
    fontSize: 13,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#5c2020',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginRight: 6,
  },
  deleteButtonText: {
    color: '#ff6b6b',
    fontSize: 13,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#1a4d1a',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
  },
  saveButtonSuccess: {
    backgroundColor: '#166534',
  },
  saveButtonTextSuccess: {
    color: '#86efac',
  },
  saveButtonError: {
    backgroundColor: '#7f1d1d',
  },
  saveButtonTextError: {
    color: '#fca5a5',
  },
  saveButtonSaving: {
    opacity: 0.7,
  },
});

export default ConfigSubmenu;
