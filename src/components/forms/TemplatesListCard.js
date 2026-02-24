import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';

function ActionButton({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  loading = false,
  style,
}) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        style,
        variant === 'primary' ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : '#111827'} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' ? styles.buttonTextPrimary : styles.buttonTextSecondary,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function TemplatesListCard({
  name,
  dateLabel,
  attachedCount,
  attachedNamesText,
  workProfileLabel,
  onOpen,
  onRename,
  onEditDescription,
  onDuplicate,
  onManageProfile,
  onApplyToDocument,
  onDeleteTemplate,
  openingDisabled,
  renaming,
  duplicating,
  applying,
  deleting,
  applyLabel,
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.date}>{dateLabel}</Text>
      <Text style={styles.meta}>Documents lies: {attachedCount}</Text>
      {!!attachedNamesText && (
        <Text style={styles.metaSecondary} numberOfLines={2}>
          Lie a: {attachedNamesText}
        </Text>
      )}
      <Text style={styles.metaSecondary} numberOfLines={1}>
        Profil metier: {workProfileLabel || 'Aucun'}
      </Text>

      <View style={styles.row}>
        <ActionButton
          label="Ouvrir"
          onPress={onOpen}
          style={styles.buttonGap}
          disabled={openingDisabled}
        />
        <ActionButton
          label="Dupliquer"
          onPress={onDuplicate}
          variant="primary"
          loading={duplicating}
        />
      </View>

      {!!onRename && (
        <View style={styles.row}>
          <ActionButton
            label="Renommer"
            onPress={onRename}
            style={styles.profileButton}
            loading={renaming}
          />
        </View>
      )}

      {!!onEditDescription && (
        <View style={styles.row}>
          <ActionButton
            label="Description pour l'IA"
            onPress={onEditDescription}
            style={styles.profileButton}
          />
        </View>
      )}

      {!!onManageProfile && (
        <View style={styles.row}>
          <ActionButton
            label={workProfileLabel ? 'Changer profil metier' : 'Associer profil metier'}
            onPress={onManageProfile}
            style={styles.profileButton}
          />
        </View>
      )}

      <View style={styles.row}>
        <ActionButton
          label={applyLabel || 'Appliquer a un document'}
          onPress={onApplyToDocument}
          style={styles.buttonGap}
          variant="primary"
          loading={applying}
        />
        <ActionButton
          label="Supprimer"
          onPress={onDeleteTemplate}
          loading={deleting}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  date: {
    marginTop: 6,
    color: '#6B7280',
    fontSize: 13,
  },
  meta: {
    marginTop: 8,
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  metaSecondary: {
    marginTop: 4,
    fontSize: 12,
    color: '#4B5563',
  },
  row: {
    flexDirection: 'row',
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  buttonGap: {
    marginRight: 8,
  },
  profileButton: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  buttonTextPrimary: {
    color: '#fff',
  },
  buttonTextSecondary: {
    color: '#111827',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
