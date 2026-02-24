import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FIELD_TYPES = [
  { value: 'text', label: '📝 Texte' },
  { value: 'checkbox', label: '☑️ Case à cocher' },
  { value: 'radio', label: '🔘 Bouton radio' },
  { value: 'select', label: '📋 Liste déroulante' },
];
const FIELD_TYPE_TEXT = 'text';
const FIELD_TYPE_RADIO = 'radio';
const FIELD_TYPE_SELECT = 'select';

const normalizeFieldType = (value) => {
  const normalized = String(value || FIELD_TYPE_TEXT).trim().toLowerCase();
  if (!normalized) return FIELD_TYPE_TEXT;
  return normalized;
};
const CATEGORY_SUGGESTIONS = [
  'Vous',
  'Conjoint',
  'Enfant 1',
  'Enfant 2',
  'Enfant 3',
  'Proches',
  'Employeur',
  'Banque',
  'Notaire',
  'Autres',
];

export const SHEET_HEIGHT = 320;

const FieldConfigSheet = ({
  field,
  allFields,
  onUpdateField,
  onDelete,
  onDuplicate,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  const [localCategory, setLocalCategory] = useState(
    field?.category_label ?? field?.category ?? ''
  );
  const [localExplicitName, setLocalExplicitName] = useState(
    field?.display_name ?? field?.field_hint ?? ''
  );
  const [localAiDescription, setLocalAiDescription] = useState(
    field?.ai_description || ''
  );
  const [localGroupId, setLocalGroupId] = useState(field?.group_id || '');
  const [localOptionValue, setLocalOptionValue] = useState(field?.option_value || '');
  const [localFormatHint, setLocalFormatHint] = useState(field?.format_hint || '');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);

  // Reset local state when field changes
  React.useEffect(() => {
    setLocalCategory(field?.category_label ?? field?.category ?? '');
    setLocalExplicitName(field?.display_name ?? field?.field_hint ?? '');
    setLocalAiDescription(field?.ai_description || '');
    setLocalGroupId(field?.group_id || '');
    setLocalOptionValue(field?.option_value || '');
    setLocalFormatHint(field?.format_hint || '');
  }, [field?.id, field?.localId]);

  const technicalName = field?.field_name || '';
  const fieldType = normalizeFieldType(field?.field_type);

  const updateField = useCallback(
    (patch) => {
      if (onUpdateField) {
        onUpdateField(patch);
      }
    },
    [onUpdateField]
  );

  const handleCategorySelect = (category) => {
    setLocalCategory(category);
    setShowCategorySuggestions(false);
    updateField({ category_label: category });
  };

  const handleCategoryBlur = () => {
    setTimeout(() => setShowCategorySuggestions(false), 200);
    updateField({ category_label: localCategory });
  };

  const handleExplicitNameBlur = () => {
    updateField({ display_name: localExplicitName });
  };

  const handleFieldTypeChange = (type) => {
    updateField({ field_type: normalizeFieldType(type) });
  };

  const handleAiDescriptionBlur = () => {
    updateField({ ai_description: localAiDescription });
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

  const filteredCategories = useMemo(() => {
    if (!localCategory) return CATEGORY_SUGGESTIONS;
    const lower = localCategory.toLowerCase();
    return CATEGORY_SUGGESTIONS.filter((cat) =>
      cat.toLowerCase().includes(lower)
    );
  }, [localCategory]);

  if (!field) return null;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Configuration</Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Fermer</Text>
        </TouchableOpacity>
      </View>

      {/* Content - 2 columns layout */}
      <View style={styles.content}>
        {/* Left column */}
        <View style={styles.column}>
          {/* Category */}
          <View style={styles.field}>
            <Text style={styles.label}>Categorie</Text>
            <TextInput
              style={styles.input}
              value={localCategory}
              onChangeText={setLocalCategory}
              onFocus={() => setShowCategorySuggestions(true)}
              onBlur={handleCategoryBlur}
              placeholder="Vous, Conjoint..."
              placeholderTextColor="#666"
            />
            {showCategorySuggestions && filteredCategories.length > 0 && (
              <View style={styles.suggestions}>
                {filteredCategories.slice(0, 4).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={styles.suggestion}
                    onPress={() => handleCategorySelect(cat)}
                  >
                    <Text style={styles.suggestionText}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Explicit name */}
          <View style={styles.field}>
            <Text style={styles.label}>Nom explicatif</Text>
            <TextInput
              style={styles.input}
              value={localExplicitName}
              onChangeText={setLocalExplicitName}
              onBlur={handleExplicitNameBlur}
              placeholder="Nom, Date de naissance..."
              placeholderTextColor="#666"
            />
          </View>

          {/* Technical name */}
          <View style={styles.field}>
            <Text style={styles.label}>Nom technique</Text>
            <View style={styles.readonlyInput}>
              <Text style={styles.readonlyText} numberOfLines={1}>
                {technicalName || 'Auto'}
              </Text>
            </View>
          </View>
        </View>

        {/* Right column */}
        <View style={styles.column}>
          {/* Field type */}
          <View style={styles.field}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {FIELD_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeButton,
                    fieldType === type.value && styles.typeButtonActive,
                  ]}
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

          {fieldType === FIELD_TYPE_RADIO && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>group_id</Text>
                <TextInput
                  style={styles.input}
                  value={localGroupId}
                  onChangeText={setLocalGroupId}
                  onBlur={handleGroupIdBlur}
                  placeholder="ex: statut_matrimonial"
                  placeholderTextColor="#666"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>option_value</Text>
                <TextInput
                  style={styles.input}
                  value={localOptionValue}
                  onChangeText={setLocalOptionValue}
                  onBlur={handleOptionValueBlur}
                  placeholder="ex: Marié"
                  placeholderTextColor="#666"
                />
              </View>
            </>
          )}

          {fieldType === FIELD_TYPE_SELECT && (
            <View style={styles.field}>
              <Text style={styles.label}>Options (format_hint)</Text>
              <TextInput
                style={styles.input}
                value={localFormatHint}
                onChangeText={setLocalFormatHint}
                onBlur={handleFormatHintBlur}
                placeholder="ex: Marié|Célibataire|Divorcé"
                placeholderTextColor="#666"
              />
            </View>
          )}

          {/* AI description */}
          <View style={styles.field}>
            <Text style={styles.label}>Description IA</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={localAiDescription}
              onChangeText={setLocalAiDescription}
              onBlur={handleAiDescriptionBlur}
              placeholder="Aide l'IA..."
              placeholderTextColor="#666"
              multiline
              numberOfLines={2}
            />
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.duplicateButton} onPress={onDuplicate}>
          <Text style={styles.duplicateButtonText}>Dupliquer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Supprimer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    color: '#2196F3',
    fontSize: 14,
  },
  content: {
    flexDirection: 'row',
  },
  column: {
    flex: 1,
    paddingHorizontal: 4,
  },
  field: {
    marginBottom: 10,
  },
  label: {
    color: '#888',
    fontSize: 11,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    padding: 8,
    color: '#fff',
    fontSize: 13,
  },
  textArea: {
    minHeight: 50,
    textAlignVertical: 'top',
  },
  readonlyInput: {
    backgroundColor: '#222',
    borderRadius: 6,
    padding: 8,
  },
  readonlyText: {
    color: '#666',
    fontSize: 13,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  typeButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  typeButtonActive: {
    backgroundColor: '#2196F3',
  },
  typeButtonText: {
    color: '#888',
    fontSize: 11,
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#333',
    borderRadius: 6,
    marginTop: 2,
    zIndex: 10,
  },
  suggestion: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  suggestionText: {
    color: '#fff',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  duplicateButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  duplicateButtonText: {
    color: '#fff',
    fontSize: 13,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#3a2020',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ff6b6b',
    fontSize: 13,
  },
});

export default FieldConfigSheet;
