import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Colors from '../../constants/Colors';

export default function DataWizardScreen({ route, navigation }) {
  const mode = route?.params?.mode || null;

  useEffect(() => {
    if (mode === 'transcription') {
      navigation.navigate('DataStack', { screen: 'CreateTranscriptionScreen' });
      return;
    }
    if (mode === 'ocr') {
      navigation.navigate('DataStack', { screen: 'CreateOcrScreen' });
    }
  }, [mode, navigation]);

  if (mode === 'transcription' || mode === 'ocr') return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ajouter des donnees</Text>
      <Text style={styles.subtitle}>Choisissez le type de source a creer.</Text>

      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('DataStack', { screen: 'CreateTranscriptionScreen' })}
      >
        <Text style={styles.cardTitle}>🎤 Transcription audio</Text>
        <Text style={styles.cardSubtitle}>Importer un texte ou enregistrer un vocal.</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('DataStack', { screen: 'CreateOcrScreen' })}
      >
        <Text style={styles.cardTitle}>📷 Scan OCR</Text>
        <Text style={styles.cardSubtitle}>Photographier un document et extraire son texte.</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
    color: Colors.textSecondary,
    fontSize: 15,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 13,
  },
});
