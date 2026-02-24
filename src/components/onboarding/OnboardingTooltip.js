import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCopilot } from 'react-native-copilot';
import Colors from '../../constants/Colors';

const WELCOME_TITLE = 'Bienvenue ! suivez le guide…';
const STEP_TITLE = 'Suivez le guide…';

export default function OnboardingTooltip() {
  const {
    currentStep,
    currentStepNumber,
    totalStepsNumber,
    isFirstStep,
    isLastStep,
    goToPrev,
    goToNext,
    stop,
  } = useCopilot();
  const stepName = String(currentStep?.name || '');
  const title = stepName === 'onboarding-tab-home' ? WELCOME_TITLE : STEP_TITLE;

  const handlePreviousPress = useCallback(() => {
    void goToPrev();
  }, [goToPrev]);

  const handlePrimaryPress = useCallback(() => {
    if (isLastStep) {
      void stop();
      return;
    }
    void goToNext();
  }, [goToNext, isLastStep, stop]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{currentStep?.text || ''}</Text>

      <View style={styles.footer}>
        <Text style={styles.progress}>
          {currentStepNumber}/{totalStepsNumber}
        </Text>

        <View style={styles.actions}>
          {!isFirstStep ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={handlePreviousPress}>
              <Text style={styles.secondaryButtonText}>Précédent</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.primaryButton} onPress={handlePrimaryPress}>
            <Text style={styles.primaryButtonText}>{isLastStep ? "C'est parti !" : 'Suivant'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  footer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progress: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
