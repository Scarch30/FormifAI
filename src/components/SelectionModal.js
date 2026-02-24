import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export default function SelectionModal({
  visible,
  title,
  items = [],
  onSelect,
  onClose,
  loading = false,
  subtitle = '',
  searchPlaceholder = 'Rechercher...',
  emptyText = 'Aucun element disponible',
  topActionLabel = '',
  onTopActionPress,
}) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);

  const filteredItems = useMemo(() => {
    const query = normalizeText(search).trim();
    if (!query) return items;
    return items.filter((item) => {
      const haystack = normalizeText(
        `${item?.title || ''} ${item?.subtitle || ''} ${item?.meta || ''}`
      );
      return haystack.includes(query);
    });
  }, [items, search]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {!!topActionLabel && typeof onTopActionPress === 'function' && (
            <TouchableOpacity style={styles.topActionButton} onPress={onTopActionPress}>
              <Text style={styles.topActionButtonText}>{topActionLabel}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title || 'Selection'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Fermer</Text>
            </TouchableOpacity>
          </View>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
          />

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(item) => String(item?.id)}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.item, item?.disabled && styles.itemDisabled]}
                  onPress={() => !item?.disabled && onSelect?.(item)}
                  disabled={item?.disabled}
                >
                  <View style={styles.itemTextWrap}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {item?.title || `Element #${item?.id ?? ''}`}
                    </Text>
                    {!!item?.subtitle && (
                      <Text style={styles.itemSubtitle} numberOfLines={2}>
                        {item.subtitle}
                      </Text>
                    )}
                    {!!item?.meta && (
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        {item.meta}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>{emptyText}</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '88%',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topActionButton: {
    marginBottom: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  topActionButtonText: {
    color: '#4338CA',
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 13,
    color: '#6B7280',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  list: {
    marginTop: 12,
  },
  loaderWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  item: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemDisabled: {
    opacity: 0.55,
  },
  itemTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  itemSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#4B5563',
  },
  itemMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
  chevron: {
    fontSize: 22,
    lineHeight: 22,
    color: '#9CA3AF',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
});
