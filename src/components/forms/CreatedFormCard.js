import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const ActionButton = ({
  label,
  onPress,
  variant = 'secondary',
  loading = false,
  disabled = false,
  style,
  textStyle,
}) => (
  <TouchableOpacity
    style={[
      styles.button,
      variant === 'primary' ? styles.buttonPrimary : styles.buttonSecondary,
      (loading || disabled) && styles.buttonDisabled,
      style,
    ]}
    onPress={onPress}
    disabled={loading || disabled}
  >
    {loading ? (
      <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : '#111827'} />
    ) : (
      <Text
        style={[
          styles.buttonText,
          variant === 'primary' ? styles.buttonTextPrimary : styles.buttonTextSecondary,
          textStyle,
        ]}
      >
        {label}
      </Text>
    )}
  </TouchableOpacity>
);

export default function CreatedFormCard({
  title,
  dateLabel,
  statusLabel,
  statusReady = false,
  onFill,
  onView,
  onEdit,
  onOpenMenu,
  filling = false,
  viewing = false,
  editing = false,
  disabled = false,
  fillMuted = false,
}) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.date}>{dateLabel}</Text>
          <View style={[styles.statusBadge, statusReady ? styles.statusReady : styles.statusPending]}>
            <Text style={[styles.statusText, statusReady ? styles.statusTextReady : styles.statusTextPending]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.menuButton, disabled && styles.buttonDisabled]} onPress={onOpenMenu} disabled={disabled}>
          <Text style={styles.menuButtonText}>⋯</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <ActionButton
          label="Remplir"
          onPress={onFill}
          variant="primary"
          loading={filling}
          disabled={disabled}
          style={[styles.buttonGap, fillMuted && styles.fillButtonMuted]}
          textStyle={fillMuted ? styles.fillButtonMutedText : null}
        />
        <ActionButton
          label="Modifier"
          onPress={onEdit}
          loading={editing}
          disabled={disabled}
        />
      </View>

      {!!onView && (
        <View style={[styles.row, styles.viewRow]}>
          <ActionButton
            label="Voir le formulaire"
            onPress={onView}
            loading={viewing}
            disabled={disabled}
          />
        </View>
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
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  date: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 12,
  },
  statusBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusReady: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  statusPending: {
    backgroundColor: '#E5E7EB',
    borderColor: '#D1D5DB',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextReady: {
    color: '#166534',
  },
  statusTextPending: {
    color: '#374151',
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  menuButtonText: {
    marginTop: -4,
    fontSize: 24,
    lineHeight: 24,
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
  },
  viewRow: {
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#3B3BD4',
    borderColor: '#3B3BD4',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  buttonTextPrimary: {
    color: '#fff',
  },
  buttonTextSecondary: {
    color: '#111827',
  },
  buttonGap: {
    marginRight: 8,
  },
  fillButtonMuted: {
    backgroundColor: '#E5E7EB',
    borderColor: '#D1D5DB',
  },
  fillButtonMutedText: {
    color: '#6B7280',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
