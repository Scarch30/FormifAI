import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FIELD_TYPES = [
  { value: 'text', label: '📝 Texte' },
  { value: 'checkbox', label: '☑️ Case à cocher' },
  { value: 'radio', label: '🔘 Bouton radio' },
  { value: 'select', label: '📋 Liste déroulante' },
];
const FIELD_TYPE_TEXT = 'text';
const FIELD_TYPE_CHECKBOX = 'checkbox';
const FIELD_TYPE_RADIO = 'radio';
const FIELD_TYPE_SELECT = 'select';

const normalizeFieldType = (value) => {
  const normalized = String(value || FIELD_TYPE_TEXT).trim().toLowerCase();
  if (!normalized) return FIELD_TYPE_TEXT;
  return normalized;
};
const FieldConfigModal = ({ visible, field, onSave, onClose }) => {
  const [config, setConfig] = useState({});
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!field) return;
    const next = { ...field };
    next.field_name = field.field_name || '';
    next.field_type = normalizeFieldType(field.field_type);
    next.group_id = field.group_id || '';
    next.option_value = field.option_value || '';
    next.format_hint = field.format_hint || '';
    next.is_checked_default = Boolean(field.is_checked_default);
    setConfig(next);
  }, [field]);

  const updateConfig = (key, value) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'line_height') {
        if (value === '') {
          next.line_height = '';
        } else {
          next.line_height = String(value).replace(',', '.');
        }
        return next;
      }
      return next;
    });
  };

  const handleSave = () => {
    const normalized = { ...config };
    normalized.field_type = normalizeFieldType(normalized.field_type);
    if (normalized.field_type === FIELD_TYPE_RADIO && !String(normalized.group_id || '').trim()) {
      Alert.alert('Groupe requis', 'Le group_id est obligatoire pour un bouton radio.');
      return;
    }
    normalized.group_id = String(normalized.group_id || '').trim();
    normalized.option_value = String(normalized.option_value || '').trim();
    normalized.format_hint = String(normalized.format_hint || '').trim();
    normalized.is_checked_default = Boolean(normalized.is_checked_default);
    const parsedLineHeight = parseFloat(
      String(normalized.line_height ?? '').replace(',', '.')
    );
    normalized.line_height =
      Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
        ? parsedLineHeight
        : 1.2;
    onSave(normalized);
    onClose();
  };

  if (!visible || !field) return null;

  const derivedFieldName = config.field_name || '';

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.modal, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.title}>Configuration du champ</Text>

          <ScrollView style={styles.scroll}>
            {/* Identification */}
            <Section title="Identification">
              <Field label="Nom technique (auto)">
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={derivedFieldName}
                  editable={false}
                  placeholder="Généré automatiquement"
                />
                <Text style={styles.helperText}>Généré automatiquement</Text>
              </Field>
              <Field label="Catégorie">
                <TextInput
                  style={styles.input}
                  value={config.category_label || ''}
                  onChangeText={(v) => updateConfig('category_label', v)}
                  placeholder="ex: Client"
                />
              </Field>
              <Field label="Nom explicatif">
                <TextInput
                  style={styles.input}
                  value={config.display_name || ''}
                  onChangeText={(v) => updateConfig('display_name', v)}
                  placeholder="ex: date naissance"
                />
              </Field>
              <Field label="Type">
                <View style={styles.typeRow}>
                  {FIELD_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[styles.typeBtn, config.field_type === type.value && styles.typeBtnActive]}
                      onPress={() => updateConfig('field_type', type.value)}
                    >
                      <Text style={styles.typeBtnText}>{type.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
              {normalizeFieldType(config.field_type) === FIELD_TYPE_CHECKBOX && (
                <Field label="Etat par défaut">
                  <View style={styles.booleanRow}>
                    <TouchableOpacity
                      style={[
                        styles.booleanChip,
                        !config.is_checked_default && styles.booleanChipActive,
                      ]}
                      onPress={() => updateConfig('is_checked_default', false)}
                    >
                      <Text
                        style={[
                          styles.booleanChipText,
                          !config.is_checked_default && styles.booleanChipTextActive,
                        ]}
                      >
                        ☐ Non coché
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.booleanChip,
                        config.is_checked_default && styles.booleanChipActive,
                      ]}
                      onPress={() => updateConfig('is_checked_default', true)}
                    >
                      <Text
                        style={[
                          styles.booleanChipText,
                          config.is_checked_default && styles.booleanChipTextActive,
                        ]}
                      >
                        ☑ Coché
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Field>
              )}
              {normalizeFieldType(config.field_type) === FIELD_TYPE_RADIO && (
                <>
                  <Field label="Groupe radio (group_id) *">
                    <TextInput
                      style={styles.input}
                      value={config.group_id || ''}
                      onChangeText={(v) => updateConfig('group_id', v)}
                      placeholder="ex: statut_matrimonial"
                      autoCapitalize="none"
                    />
                  </Field>
                  <Field label="Valeur option (option_value)">
                    <TextInput
                      style={styles.input}
                      value={config.option_value || ''}
                      onChangeText={(v) => updateConfig('option_value', v)}
                      placeholder="ex: Marié"
                    />
                  </Field>
                </>
              )}
              {normalizeFieldType(config.field_type) === FIELD_TYPE_SELECT && (
                <Field label="Options (format_hint)">
                  <TextInput
                    style={styles.input}
                    value={config.format_hint || ''}
                    onChangeText={(v) => updateConfig('format_hint', v)}
                    placeholder="ex: Marié|Célibataire|Divorcé|Veuf"
                  />
                  <Text style={styles.helperText}>Séparer les options par |</Text>
                </Field>
              )}
              <Field label="Description pour l'IA">
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={config.ai_description || ''}
                  onChangeText={(v) => updateConfig('ai_description', v)}
                  placeholder="Description pour aider l'IA à remplir ce champ"
                  multiline
                />
                <Text style={styles.helperText}>
                  Aide l'IA à comprendre ce que doit contenir ce champ (ex: Nom de naissance du client, en lettres capitales).
                </Text>
              </Field>
              <Field label="Exemple de valeur">
                <TextInput
                  style={styles.input}
                  value={config.text_example || ''}
                  onChangeText={(v) => updateConfig('text_example', v)}
                  placeholder="Ex: DUPONT, 250000\u20AC, CLI"
                />
                <Text style={styles.helperText}>
                  Exemple court de ce que contiendra ce champ. Aide l'IA à comprendre le format attendu.
                </Text>
              </Field>
            </Section>

            {/* Typographie */}
            <Section title="Typographie">
              <View style={styles.row}>
                <Field label="Taille (px)" half>
                  <TextInput
                    style={styles.input}
                    value={String(config.font_size || 12)}
                    onChangeText={(v) => updateConfig('font_size', parseFloat(v) || 12)}
                    keyboardType="numeric"
                  />
                </Field>
                <Field label="Espacement ligne" half>
                  <TextInput
                    style={styles.input}
                    value={
                      config.line_height === '' ? '' : String(config.line_height ?? 1.2)
                    }
                    onChangeText={(v) => updateConfig('line_height', v)}
                    keyboardType="decimal-pad"
                  />
                </Field>
              </View>
              <Field label="Alignement">
                <View style={styles.typeRow}>
                  {['left', 'center', 'right'].map((align) => (
                    <TouchableOpacity
                      key={align}
                      style={[styles.typeBtn, config.text_align === align && styles.typeBtnActive]}
                      onPress={() => updateConfig('text_align', align)}
                    >
                      <Text style={styles.typeBtnText}>
                        {align === 'left' ? '⬅️' : align === 'center' ? '↔️' : '➡️'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
              <Field label="Retrait L2+ (px)">
                <TextInput
                  style={styles.input}
                  value={String(config.next_lines_indent || 0)}
                  onChangeText={(v) =>
                    updateConfig('next_lines_indent', parseFloat(v) || 0)
                  }
                  keyboardType="numeric"
                />
              </Field>
            </Section>

          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Composants internes
const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Field = ({ label, children, half }) => (
  <View style={[styles.field, half && styles.fieldHalf]}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  scroll: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  field: {
    marginBottom: 12,
  },
  fieldHalf: {
    flex: 1,
    marginHorizontal: 4,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
  },
  inputMulti: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  helperText: {
    marginTop: 6,
    fontSize: 11,
    color: '#6b7280',
    lineHeight: 14,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  typeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  typeBtnActive: {
    backgroundColor: '#2196F3',
  },
  typeBtnText: {
    fontSize: 12,
  },
  booleanRow: {
    flexDirection: 'row',
    gap: 8,
  },
  booleanChip: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f3f4f6',
    paddingVertical: 9,
    alignItems: 'center',
  },
  booleanChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  booleanChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  booleanChipTextActive: {
    color: '#fff',
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#666',
  },
  saveBtn: {
    flex: 1,
    padding: 14,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default FieldConfigModal;
