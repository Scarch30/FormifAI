import React from 'react';
import { Text, StyleSheet } from 'react-native';

const ICONS = {
  transcription: '🎤',
  ocr: '📷',
  form_fill: '📋',
};

export default function SourceIcon({ sourceType, style }) {
  return <Text style={[styles.icon, style]}>{ICONS[sourceType] || '•'}</Text>;
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 16,
  },
});
