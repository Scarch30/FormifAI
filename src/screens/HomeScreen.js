import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen({ navigation }) {
  const { logout, user } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>Bonjour {user?.name || 'David'} 👋</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Déconnexion</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.menu}>
        <TouchableOpacity
          style={styles.menuCard}
          onPress={() => navigation.navigate('TranscriptionsScreen')}
        >
          <Text style={styles.menuTitle}>Transcriptions</Text>
          <Text style={styles.menuSubtitle}>Voir toutes vos transcriptions</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuCard}
          onPress={() => navigation.navigate('TemplatesScreen')}
        >
          <Text style={styles.menuTitle}>Formulaires</Text>
          <Text style={styles.menuSubtitle}>Gérer vos formulaires importés</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuCard}
          onPress={() => navigation.navigate('FormFillsScreen')}
        >
          <Text style={styles.menuTitle}>Remplissages</Text>
          <Text style={styles.menuSubtitle}>Suivre les formulaires remplis automatiquement</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuCard}
          onPress={() => navigation.navigate('OcrDocumentsScreen')}
        >
          <Text style={styles.menuTitle}>Documents scannés</Text>
          <Text style={styles.menuSubtitle}>Consulter les analyses OCR et réutiliser le texte</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuCard}
          onPress={() => navigation.navigate('WorkProfilesScreen')}
        >
          <Text style={styles.menuTitle}>Profils</Text>
          <Text style={styles.menuSubtitle}>Créer et gérer les profils métier</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#4F46E5',
  },
  welcome: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  logout: {
    color: '#fff',
    opacity: 0.8,
  },
  menu: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    gap: 16,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  menuSubtitle: {
    color: '#666',
    fontSize: 14,
  },
});
