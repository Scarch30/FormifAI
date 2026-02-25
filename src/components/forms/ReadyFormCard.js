import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function ReadyFormCard({
  documentName,
  templateName,
  workProfileName,
  dateLabel,
  onFill,
  onOpen,
  onOpenMenu,
  onEditTemplate,
}) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {documentName}
          </Text>
          <Text style={styles.templateLine} numberOfLines={1}>
            Template: {templateName}
          </Text>
          <Text style={styles.profileLine} numberOfLines={1}>
            Profil metier: {workProfileName || 'Aucun'}
          </Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
        <TouchableOpacity style={styles.menuButton} onPress={onOpenMenu}>
          <Text style={styles.menuText}>⋯</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.fillButton} onPress={onFill}>
        <Text style={styles.fillButtonText}>Remplir</Text>
      </TouchableOpacity>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionButton, styles.actionGap]} onPress={onOpen}>
          <Text style={styles.actionText}>Ouvrir</Text>
        </TouchableOpacity>
        {!!onEditTemplate && (
          <TouchableOpacity style={styles.actionButton} onPress={onEditTemplate}>
            <Text style={styles.actionText}>Modifier template</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  templateLine: {
    marginTop: 5,
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  profileLine: {
    marginTop: 3,
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  date: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    marginTop: -4,
    fontSize: 24,
    lineHeight: 24,
    color: '#111827',
  },
  fillButton: {
    marginTop: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fillButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionGap: {
    marginRight: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
});
