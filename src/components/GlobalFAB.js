import React, { useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CopilotStep, walkthroughable } from 'react-native-copilot';
import Colors from '../constants/Colors';

const MENU_ITEMS = [
  {
    key: 'form',
    icon: '📄',
    label: 'Importer un formulaire',
    target: { tab: 'FormsStack', screen: 'ImportFormScreen' },
  },
  {
    key: 'create-form',
    icon: '✏️',
    label: 'Créer mon formulaire',
    target: { tab: 'FormsStack', screen: 'GenerationRequestScreen' },
  },
  {
    key: 'fill',
    icon: '✨',
    label: 'Nouveau remplissage',
    target: { tab: 'HomeStack', screen: 'FillWizardScreen' },
  },
  {
    key: 'transcription',
    icon: '🎤',
    label: 'Nouvelle transcription',
    target: { tab: 'DataStack', screen: 'CreateTranscriptionScreen' },
  },
  {
    key: 'ocr',
    icon: '📷',
    label: 'Nouveau scan OCR',
    target: { tab: 'DataStack', screen: 'CreateOcrScreen' },
  },
  {
    key: 'work-profile',
    icon: '👤',
    label: 'Nouveau profil metier',
    target: { tab: 'FormsStack', screen: 'ProfileCreateScreen' },
  },
];

const WalkthroughableFab = walkthroughable(View);

export default function GlobalFAB({ hidden = false, rootRouteName = 'AppTabs' }) {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;

  const toggledStyle = useMemo(
    () => ({
      opacity: animation,
      transform: [
        {
          translateY: animation.interpolate({
            inputRange: [0, 1],
            outputRange: [10, 0],
          }),
        },
      ],
    }),
    [animation]
  );

  const toggleMenu = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(animation, {
      toValue: next ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const handleNavigate = (target) => {
    setOpen(false);
    Animated.timing(animation, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();

    navigation.navigate(rootRouteName, {
      screen: target.tab,
      params: { screen: target.screen },
    });
  };

  if (hidden) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      {open ? (
        <Animated.View style={[styles.menu, toggledStyle]}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.menuItem}
              onPress={() => handleNavigate(item.target)}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      ) : null}

      <CopilotStep
        name="onboarding-fab"
        order={2}
        text="Appuyez ici pour lancer une action rapide : nouveau remplissage, transcription, OCR, import de formulaire ou création IA."
      >
        <WalkthroughableFab>
          <TouchableOpacity style={styles.fab} onPress={toggleMenu}>
            <Text style={styles.fabText}>{open ? '×' : '+'}</Text>
          </TouchableOpacity>
        </WalkthroughableFab>
      </CopilotStep>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    alignItems: 'flex-end',
    zIndex: 100,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '400',
  },
  menu: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 8,
    marginBottom: 10,
    minWidth: 220,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  menuIcon: {
    fontSize: 16,
  },
  menuLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
});
