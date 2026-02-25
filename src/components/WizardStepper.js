import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '../constants/Colors';

export default function WizardStepper({ steps = [], currentStep = 0 }) {
  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isDone = index < currentStep;
        return (
          <View style={styles.stepWrap} key={`${step}-${index}`}>
            <View
              style={[
                styles.dot,
                isDone && styles.dotDone,
                isActive && styles.dotActive,
              ]}
            >
              <Text style={[styles.dotText, (isDone || isActive) && styles.dotTextActive]}>
                {index + 1}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={[styles.label, (isDone || isActive) && styles.labelActive]}
            >
              {step}
            </Text>
            {index < steps.length - 1 ? (
              <View style={[styles.line, (isDone || isActive) && styles.lineActive]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  dotDone: {
    backgroundColor: Colors.primaryDark,
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
  dotText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  dotTextActive: {
    color: '#fff',
  },
  label: {
    flexShrink: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    marginRight: 6,
  },
  labelActive: {
    color: Colors.text,
    fontWeight: '600',
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginRight: 6,
  },
  lineActive: {
    backgroundColor: Colors.primary,
  },
});
