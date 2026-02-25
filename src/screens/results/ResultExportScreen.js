import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Colors from '../../constants/Colors';

export default function ResultExportScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Export PDF</Text>
      <Text style={styles.subtitle}>Fonctionnalite prevue en phase 2.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: 16,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    color: Colors.textSecondary,
    fontSize: 14,
  },
});
