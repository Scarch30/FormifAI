import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCopilot } from 'react-native-copilot';

const ONBOARDING_DONE_KEY = 'onboarding_done';

export const ONBOARDING_STEPS = [
  'onboarding-tab-home',
  'onboarding-fab',
  'onboarding-tab-data',
  'onboarding-tab-forms',
  'onboarding-tab-results',
  'onboarding-home-actions',
  'onboarding-home-resume',
  'onboarding-header-menu',
];

const STOP_REASON = {
  MANUAL: 'manual',
  COMPLETE: 'complete',
  RESTART: 'restart',
};

const OnboardingContext = createContext(null);

const getNextStepName = (currentStepName) => {
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStepName);
  if (currentIndex < 0) return ONBOARDING_STEPS[0] || null;
  return ONBOARDING_STEPS[currentIndex + 1] || null;
};

export function OnboardingProvider({ children }) {
  const { start, stop, copilotEvents } = useCopilot();
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentStepName, setCurrentStepName] = useState('');

  const currentStepNameRef = useRef('');
  const stopReasonRef = useRef(null);
  const autoTriggeredRef = useRef(false);
  const startTimeoutRef = useRef(null);

  const markDone = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    } catch (error) {
      console.warn('Onboarding: impossible de sauvegarder le flag done:', error?.message);
    }
  }, []);

  const clearDone = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_DONE_KEY);
    } catch (error) {
      console.warn('Onboarding: impossible de reinitialiser le flag done:', error?.message);
    }
  }, []);

  const runStart = useCallback(
    (fromStepName = ONBOARDING_STEPS[0]) =>
      new Promise((resolve) => {
        if (startTimeoutRef.current) {
          clearTimeout(startTimeoutRef.current);
        }

        startTimeoutRef.current = setTimeout(async () => {
          startTimeoutRef.current = null;
          try {
            await start(fromStepName);
          } catch (error) {
            console.warn('Onboarding: start a echoue:', error?.message);
          } finally {
            resolve();
          }
        }, 350);
      }),
    [start]
  );

  const startOnboarding = useCallback(async () => {
    stopReasonRef.current = null;
    await runStart(ONBOARDING_STEPS[0]);
  }, [runStart]);

  const stopOnboarding = useCallback(async () => {
    stopReasonRef.current = STOP_REASON.MANUAL;
    await stop();
  }, [stop]);

  const completeOnboarding = useCallback(async () => {
    stopReasonRef.current = STOP_REASON.COMPLETE;
    await markDone();
    await stop();
  }, [markDone, stop]);

  const restartOnboarding = useCallback(async () => {
    await clearDone();
    autoTriggeredRef.current = false;

    if (isOnboarding) {
      stopReasonRef.current = STOP_REASON.RESTART;
      await stop();
    }

    await runStart(ONBOARDING_STEPS[0]);
  }, [clearDone, isOnboarding, runStart, stop]);

  const maybeStartOnHome = useCallback(async () => {
    if (autoTriggeredRef.current || isOnboarding) return;

    try {
      const done = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);
      if (done === 'true') {
        autoTriggeredRef.current = true;
        return;
      }
    } catch (error) {
      console.warn('Onboarding: lecture du flag impossible:', error?.message);
    }

    autoTriggeredRef.current = true;
    await runStart(ONBOARDING_STEPS[0]);
  }, [isOnboarding, runStart]);

  useEffect(() => {
    const onStart = () => {
      setIsOnboarding(true);
    };

    const onStepChange = (step) => {
      const name = String(step?.name || '');
      const order = Number(step?.order || 0);
      currentStepNameRef.current = name;
      setCurrentStepName(name);
      setCurrentStep(order);
    };

    const onStop = async () => {
      const stopReason = stopReasonRef.current;
      stopReasonRef.current = null;
      setIsOnboarding(false);

      if (stopReason === STOP_REASON.MANUAL || stopReason === STOP_REASON.RESTART) {
        return;
      }

      if (stopReason === STOP_REASON.COMPLETE) {
        return;
      }

      const nextStepName = getNextStepName(currentStepNameRef.current);
      if (nextStepName) {
        await runStart(nextStepName);
        return;
      }

      await markDone();
    };

    copilotEvents.on('start', onStart);
    copilotEvents.on('stepChange', onStepChange);
    copilotEvents.on('stop', onStop);

    return () => {
      copilotEvents.off('start', onStart);
      copilotEvents.off('stepChange', onStepChange);
      copilotEvents.off('stop', onStop);
    };
  }, [copilotEvents, markDone, runStart]);

  useEffect(
    () => () => {
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
      }
    },
    []
  );

  const value = useMemo(
    () => ({
      isOnboarding,
      currentStep,
      currentStepName,
      startOnboarding,
      stopOnboarding,
      completeOnboarding,
      restartOnboarding,
      maybeStartOnHome,
    }),
    [
      completeOnboarding,
      currentStep,
      currentStepName,
      isOnboarding,
      maybeStartOnHome,
      restartOnboarding,
      startOnboarding,
      stopOnboarding,
    ]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export default function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding doit etre utilise dans <OnboardingProvider>.');
  }
  return context;
}
