import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

export default function ConfirmActionModal({
  visible,
  title,
  message,
  actions = [],
  onClose,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {!!message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.actionsWrap}>
            {actions.map((action, index) => {
              const variant = action?.variant || 'secondary';
              let variantStyles = {
                button: styles.actionSecondary,
                text: styles.actionSecondaryText,
              };

              if (variant === 'primary') {
                variantStyles = {
                  button: styles.actionPrimary,
                  text: styles.actionPrimaryText,
                };
              }
              if (variant === 'destructive') {
                variantStyles = {
                  button: styles.actionDestructive,
                  text: styles.actionDestructiveText,
                };
              }
              if (variant === 'ghost') {
                variantStyles = {
                  button: styles.actionGhost,
                  text: styles.actionGhostText,
                };
              }

              const key = action?.key || `${action?.label || 'action'}-${index}`;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.actionButton,
                    variantStyles.button,
                    action?.disabled && styles.actionDisabled,
                  ]}
                  disabled={action?.disabled || action?.loading}
                  onPress={action?.onPress}
                >
                  {action?.loading ? (
                    <ActivityIndicator
                      size="small"
                      color={variant === 'primary' || variant === 'destructive' ? '#fff' : '#111827'}
                    />
                  ) : (
                    <Text style={[styles.actionText, variantStyles.text]}>{action?.label}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  message: {
    marginTop: 8,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  actionsWrap: {
    marginTop: 14,
  },
  actionButton: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  actionPrimary: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  actionPrimaryText: {
    color: '#fff',
  },
  actionDestructive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  actionDestructiveText: {
    color: '#fff',
  },
  actionSecondary: {
    backgroundColor: '#fff',
    borderColor: '#D1D5DB',
  },
  actionSecondaryText: {
    color: '#111827',
  },
  actionGhost: {
    backgroundColor: '#F3F4F6',
    borderColor: '#F3F4F6',
  },
  actionGhostText: {
    color: '#4B5563',
  },
  actionDisabled: {
    opacity: 0.6,
  },
});
