import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';

export default function TemplateWizardScreen({ navigation }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Wizard modele de formulaire</Text>
      <Text style={styles.subtitle}>Flow recommande: importer, placer les champs, associer un profil.</Text>

      <SectionCard title="Etape 1" subtitle="Importer un fichier PDF ou image">
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('FormsStack', { screen: 'ImportFormScreen' })}
        >
          <Text style={styles.primaryButtonText}>📄 Importer un formulaire</Text>
        </TouchableOpacity>
      </SectionCard>

      <SectionCard title="Etape 2" subtitle="Placer les champs dans l'editeur">
        <Text style={styles.hintText}>
          Une fois le formulaire importe, l'editeur s'ouvre automatiquement.
        </Text>
      </SectionCard>

      <SectionCard title="Etape 3" subtitle="Associer un profil metier (optionnel)">
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('FormsStack', { screen: 'ProfilesListScreen' })}
        >
          <Text style={styles.secondaryButtonText}>👤 Ouvrir les profils metier</Text>
        </TouchableOpacity>
      </SectionCard>

      <SectionCard title="Terminer" subtitle="Consulter les formulaires importes">
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('FormsStack', { screen: 'FormsListScreen' })}
        >
          <Text style={styles.secondaryButtonText}>✅ Aller aux formulaires</Text>
        </TouchableOpacity>
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 8,
    color: Colors.textSecondary,
    fontSize: 15,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  hintText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
});
