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

export default function DocumentsListCard({
  name,
  dateLabel,
  appliedTemplateLabel,
  isLinkedToTemplate,
  onOpen,
  onRename,
  onFill,
  onCreateTemplate,
  onAssociateTemplate,
  onDissociateTemplate,
  onDeleteDocument,
  onDuplicateDocument,
  filling,
  renaming,
  creating,
  associating,
  dissociating,
  deleting,
  duplicating,
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.date}>{dateLabel}</Text>
      <Text style={styles.meta} numberOfLines={2}>
        Template applique: {appliedTemplateLabel || 'Aucun'}
      </Text>

      {isLinkedToTemplate ? (
        <>
          {!!onFill && (
            <View style={styles.row}>
              <ActionButton
                label="Remplir"
                onPress={onFill}
                variant="primary"
                loading={filling}
                style={styles.fillButton}
              />
            </View>
          )}

          {!!onRename && (
            <View style={styles.row}>
              <ActionButton
                label="Renommer"
                onPress={onRename}
                loading={renaming}
                style={styles.fillButton}
              />
            </View>
          )}

          <View style={styles.row}>
            <ActionButton label="Ouvrir" onPress={onOpen} style={styles.buttonGap} />
            <ActionButton
              label="Dissocier"
              onPress={onDissociateTemplate}
              loading={dissociating}
            />
          </View>

          <View style={styles.row}>
            <ActionButton
              label="Supprimer"
              onPress={onDeleteDocument}
              style={styles.buttonGap}
              loading={deleting}
            />
            <ActionButton
              label="Dupliquer"
              onPress={onDuplicateDocument}
              variant="primary"
              loading={duplicating}
            />
          </View>
        </>
      ) : (
        <>
          {!!onRename && (
            <View style={styles.row}>
              <ActionButton
                label="Renommer"
                onPress={onRename}
                loading={renaming}
                style={styles.fillButton}
              />
            </View>
          )}

          <View style={styles.row}>
            <ActionButton label="Ouvrir" onPress={onOpen} style={styles.buttonGap} />
            <ActionButton
              label="Associer a un template"
              onPress={onAssociateTemplate}
              loading={associating}
            />
          </View>

          <View style={styles.row}>
            <ActionButton
              label="Creer Template"
              onPress={onCreateTemplate}
              variant="primary"
              style={styles.buttonGap}
              loading={creating}
            />
            <ActionButton
              label="Dupliquer"
              onPress={onDuplicateDocument}
              variant="primary"
              loading={duplicating}
            />
          </View>

          <View style={styles.row}>
            <ActionButton
              label="Supprimer"
              onPress={onDeleteDocument}
              variant="secondary"
              loading={deleting}
              style={styles.fillButton}
            />
          </View>
        </>
      )}
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
    marginTop: 6,
    marginBottom: 2,
    color: '#374151',
    fontSize: 12,
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
  fillButton: {
    flex: 1,
  },
});
