import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

const BackButton = ({ onBack }) => (
  <TouchableOpacity style={styles.backButton} onPress={onBack}>
    <Text style={styles.backArrow}>←</Text>
    <Text style={styles.backButtonText}>Retour</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backArrow: {
    fontSize: 16,
    color: '#2196F3',
    marginRight: 6,
  },
  backButtonText: {
    color: '#2196F3',
    fontSize: 14,
  },
});

export default BackButton;
export { BackButton };
