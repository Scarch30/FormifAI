import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function SourcePickerModal({
  visible,
  title = 'Comment veux-tu remplir ce formulaire ?',
  subtitle = '',
  onClose,
  onSelect,
  disabled = false,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.optionCard, disabled && styles.optionCardDisabled]}
            onPress={() => !disabled && onSelect?.('transcription')}
            disabled={disabled}
          >
            <Text style={styles.optionTitle}>🎤 Transcription vocale</Text>
            <Text style={styles.optionSubtitle}>Depuis un enregistrement audio</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, disabled && styles.optionCardDisabled]}
            onPress={() => !disabled && onSelect?.('ocr')}
            disabled={disabled}
          >
            <Text style={styles.optionTitle}>📷 Document papier (OCR)</Text>
            <Text style={styles.optionSubtitle}>Photo, image ou PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, disabled && styles.optionCardDisabled]}
            onPress={() => !disabled && onSelect?.('form_fill')}
            disabled={disabled}
          >
            <Text style={styles.optionTitle}>📋 Formulaire existant</Text>
            <Text style={styles.optionSubtitle}>Depuis un formulaire déjà rempli</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose} disabled={disabled}>
            <Text style={styles.closeButtonText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 13,
    color: '#6B7280',
  },
  optionCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  optionCardDisabled: {
    opacity: 0.6,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  optionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#4B5563',
  },
  closeButton: {
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
});
