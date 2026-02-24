import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { documents, templates } from '../../api/client';
import Colors from '../../constants/Colors';
import EmptyState from '../../components/EmptyState';
import SectionCard from '../../components/SectionCard';
import { extractList, sortByCreatedAtDesc } from '../../utils/apiData';
import { getDocumentName, getFieldsCount, getPagesCount } from '../../utils/entityResolvers';

export default function FormsListScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesRes, documentsRes, fallbackRes] = await Promise.all([
        templates.listByKind('template').catch(() => null),
        templates.listByKind('document').catch(() => null),
        templates.list().catch(() => null),
      ]);
      const legacyDocumentsRes = await documents.list().catch(() => null);

      const templatesItems = extractList(templatesRes).map((item) => ({
        ...item,
        _kind: 'template',
      }));
      const documentsItems = extractList(documentsRes).map((item) => ({
        ...item,
        _kind: 'document',
      }));
      const fallbackItems = extractList(fallbackRes).map((item) => ({
        ...item,
        _kind: item?.kind || item?.type || 'unknown',
      }));
      const legacyDocumentsItems = extractList(legacyDocumentsRes).map((item) => ({
        ...item,
        _kind: 'document',
      }));

      const merged = [...templatesItems, ...documentsItems];
      const sourceItems = merged.length ? merged : [...fallbackItems, ...legacyDocumentsItems];
      const byId = new Map();

      sourceItems.forEach((item, index) => {
        const key = item?.id !== undefined && item?.id !== null ? `id-${item.id}` : `idx-${index}`;
        if (!byId.has(key)) {
          byId.set(key, item);
        }
      });

      setItems(sortByCreatedAtDesc([...byId.values()]));
    } catch (error) {
      if (Number(error?.response?.status) !== 404) {
        console.error('Erreur chargement formulaires:', error);
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'template') return items.filter((item) => item?._kind === 'template');
    if (filter === 'document') return items.filter((item) => item?._kind === 'document');
    return items;
  }, [filter, items]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Formulaires</Text>
          <Text style={styles.subtitle}>Vos modeles de formulaires.</Text>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.navigate('ProfilesListScreen')}
        >
          <Text style={styles.headerButtonText}>Profils metier</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.importButton} onPress={() => navigation.navigate('ImportFormScreen')}>
        <Text style={styles.importButtonText}>📄 Importer un formulaire</Text>
      </TouchableOpacity>

      <View style={styles.headerActionsRow}>
        <TouchableOpacity
          style={[styles.headerActionPill, filter === 'all' && styles.headerActionPillActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.headerActionText, filter === 'all' && styles.headerActionTextActive]}>Tous</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerActionPill, filter === 'template' && styles.headerActionPillActive]}
          onPress={() => setFilter('template')}
        >
          <Text style={[styles.headerActionText, filter === 'template' && styles.headerActionTextActive]}>Modeles</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerActionPill, filter === 'document' && styles.headerActionPillActive]}
          onPress={() => setFilter('document')}
        >
          <Text style={[styles.headerActionText, filter === 'document' && styles.headerActionTextActive]}>Documents</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.resultsButton}
          onPress={() =>
            navigation.navigate('ResultsStack', {
              screen: 'ResultsListScreen',
            })
          }
        >
          <Text style={styles.resultsButtonText}>✅ Remplis</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item, index) =>
            `${String(item?._kind || item?.kind || 'item')}-${String(item?.id ?? index)}`
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const profileName =
              item?.work_profile?.name || item?.workProfile?.name || 'Aucun';
            const hasAppliedTemplate = Boolean(item?.applied_template_id || item?.appliedTemplateId);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation.navigate('FormDetailScreen', { formId: Number(item?.id) })}
              >
                <Text style={styles.cardTitle} numberOfLines={1}>{getDocumentName(item)}</Text>
                <Text style={styles.cardMeta}>
                  {getPagesCount(item)} pages • {getFieldsCount(item)} champs
                </Text>
                <Text style={styles.cardMeta}>Profil: {profileName}</Text>
                <Text style={styles.kindBadge}>
                  {item?._kind === 'template' ? 'Modele' : item?._kind === 'document' ? 'Document' : String(item?.kind || '')}
                </Text>
                {hasAppliedTemplate ? (
                  <Text style={styles.readyBadge}>Pret a l'emploi</Text>
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <SectionCard>
              <EmptyState
                icon="📄"
                title="Aucun formulaire importe"
                subtitle="Importez un formulaire pour commencer."
                actions={[
                  { label: 'Importer un formulaire', onPress: () => navigation.navigate('ImportFormScreen') },
                  {
                    label: 'Voir les formulaires remplis',
                    onPress: () =>
                      navigation.navigate('ResultsStack', {
                        screen: 'ResultsListScreen',
                      }),
                  },
                ]}
              />
            </SectionCard>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 15,
  },
  headerButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerButtonText: {
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  importButton: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    paddingVertical: 12,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  headerActionsRow: {
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerActionPillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  headerActionText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  headerActionTextActive: {
    color: Colors.primaryDark,
  },
  resultsButton: {
    marginLeft: 'auto',
    borderRadius: 8,
    backgroundColor: '#ECFDF3',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  resultsButtonText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cardMeta: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  kindBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    color: '#1D4ED8',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
  },
  readyBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    color: '#166534',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
  },
});
