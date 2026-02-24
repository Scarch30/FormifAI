import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';

const STATUS_MAP = {
  pending: {
    label: 'En attente',
    backgroundColor: '#FEF3C7',
    textColor: '#92400E',
  },
  processing: {
    label: 'En cours',
    backgroundColor: '#FEF3C7',
    textColor: '#92400E',
    showLoader: true,
    pulse: true,
  },
  done: {
    label: 'Terminé',
    backgroundColor: '#D1FAE5',
    textColor: '#065F46',
  },
  completed: {
    label: 'Terminé',
    backgroundColor: '#D1FAE5',
    textColor: '#065F46',
  },
  error: {
    label: 'Erreur',
    backgroundColor: '#FEE2E2',
    textColor: '#991B1B',
  },
};

export default function StatusBadge({ status, style }) {
  const normalizedStatus = String(status || '').toLowerCase();
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  const mapped = useMemo(() => {
    return (
      STATUS_MAP[normalizedStatus] || {
        label: status || 'Inconnu',
        backgroundColor: '#E5E7EB',
        textColor: '#4B5563',
      }
    );
  }, [normalizedStatus, status]);

  useEffect(() => {
    if (!mapped.pulse) {
      pulseOpacity.setValue(1);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 0.5,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [mapped.pulse, pulseOpacity]);

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          backgroundColor: mapped.backgroundColor,
          opacity: mapped.pulse ? pulseOpacity : 1,
        },
        style,
      ]}
    >
      {mapped.showLoader ? (
        <ActivityIndicator size={10} color={mapped.textColor} style={styles.loader} />
      ) : null}
      <Text style={[styles.text, { color: mapped.textColor }]}>{mapped.label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  loader: {
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
