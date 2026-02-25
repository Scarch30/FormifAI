import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CopilotStep, walkthroughable } from 'react-native-copilot';
import { useAuth } from '../context/AuthContext';
import Colors from '../constants/Colors';
import useOnboarding from '../hooks/useOnboarding';

const decodeSafe = (value) => {
  if (typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};

const WalkthroughableTrigger = walkthroughable(TouchableOpacity);

export default function HomeHeaderMenu() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const { restartOnboarding } = useOnboarding();
  const [open, setOpen] = useState(false);

  const profileName = useMemo(() => {
    const rawName = user?.name || user?.full_name || user?.email || 'Profil';
    return decodeSafe(rawName);
  }, [user?.email, user?.full_name, user?.name]);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
  };

  const handleReplayGuide = async () => {
    setOpen(false);
    await restartOnboarding();
  };

  const handleOpenWorkProfiles = () => {
    setOpen(false);
    navigation.navigate('FormsStack', { screen: 'ProfilesListScreen' });
  };

  return (
    <>
      <CopilotStep
        name="onboarding-header-menu"
        order={8}
        text="Vous pourrez revoir ce guide et accéder à votre compte en cliquant ici."
      >
        <WalkthroughableTrigger style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.8}>
          <Feather name="menu" size={22} color={Colors.text} />
        </WalkthroughableTrigger>
      </CopilotStep>

      <Modal
        animationType="fade"
        visible={open}
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.menu} onPress={() => {}}>
            <Text style={styles.label}>Profil</Text>
            <Text style={styles.profileName} numberOfLines={2}>
              {profileName}
            </Text>

            <View style={styles.separator} />

            <TouchableOpacity style={styles.menuButton} onPress={handleReplayGuide}>
              <Feather name="book-open" size={16} color={Colors.primary} />
              <Text style={styles.menuButtonText}>🎓 Rejouer le guide</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity style={styles.menuButton} onPress={handleOpenWorkProfiles}>
              <Feather name="user" size={16} color={Colors.primary} />
              <Text style={styles.menuButtonText}>👤 Profils métier</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Feather name="log-out" size={16} color={Colors.error} />
              <Text style={styles.logoutText}>Deconnexion</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  menu: {
    position: 'absolute',
    top: 92,
    right: 16,
    minWidth: 220,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  label: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  profileName: {
    marginTop: 4,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  separator: {
    marginVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error,
  },
});
