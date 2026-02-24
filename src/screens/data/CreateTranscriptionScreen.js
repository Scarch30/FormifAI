import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';
import { transcriptions } from '../../api/client';

const TRANSCRIPTION_IN_PROGRESS_STATUSES = new Set([
  'pending',
  'processing',
  'transcribing',
  'in_progress',
  'queued',
]);

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const extractTranscriptionItem = (response) => {
  const payload = response?.data?.data || response?.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload.item || payload.result || payload.data || payload;
};

const isInProgressStatus = (status) =>
  TRANSCRIPTION_IN_PROGRESS_STATUSES.has(String(status || '').trim().toLowerCase());

export default function CreateTranscriptionScreen({ navigation, route }) {
  const routeTranscriptionId = toNumber(route?.params?.transcriptionId ?? route?.params?.id);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkedTranscriptionId, setLinkedTranscriptionId] = useState(routeTranscriptionId);
  const [linkedStatus, setLinkedStatus] = useState(null);
  const [syncingRemote, setSyncingRemote] = useState(false);
  const [textDirty, setTextDirty] = useState(false);
  const textDirtyRef = useRef(false);

  useEffect(() => {
    textDirtyRef.current = textDirty;
  }, [textDirty]);

  useEffect(() => {
    if (!routeTranscriptionId) return;
    setLinkedTranscriptionId((prev) => (prev === routeTranscriptionId ? prev : routeTranscriptionId));
  }, [routeTranscriptionId]);

  const loadLinkedTranscription = useCallback(
    async ({ silent = false } = {}) => {
      if (!linkedTranscriptionId) return null;
      if (!silent) setSyncingRemote(true);
      try {
        const response = await transcriptions.get(linkedTranscriptionId);
        const item = extractTranscriptionItem(response);
        if (!item) return null;

        const serverText = String(item?.transcription_text ?? item?.text ?? '');
        const serverStatus = String(item?.status || '').toLowerCase();
        const serverTitle = String(item?.document_name || item?.title || '').trim();

        setLinkedStatus(serverStatus || null);
        if (serverTitle) {
          setTitle((prev) => (prev.trim().length > 0 ? prev : serverTitle));
        }
        setText((prev) => {
          if (!textDirtyRef.current || !String(prev || '').trim()) {
            return serverText;
          }
          return prev;
        });

        return item;
      } catch (error) {
        console.error('Erreur chargement transcription liee:', error);
        return null;
      } finally {
        if (!silent) setSyncingRemote(false);
      }
    },
    [linkedTranscriptionId]
  );

  useEffect(() => {
    if (!linkedTranscriptionId) return;
    loadLinkedTranscription({ silent: false });
  }, [linkedTranscriptionId, loadLinkedTranscription]);

  useFocusEffect(
    useCallback(() => {
      if (!linkedTranscriptionId) return undefined;
      loadLinkedTranscription({ silent: true });
      return undefined;
    }, [linkedTranscriptionId, loadLinkedTranscription])
  );

  useEffect(() => {
    if (!linkedTranscriptionId) return;
    const uploadMarker = Number(route?.params?.recordUploadAt);
    if (!Number.isFinite(uploadMarker)) return;
    setTextDirty(false);
    loadLinkedTranscription({ silent: false });
  }, [linkedTranscriptionId, loadLinkedTranscription, route?.params?.recordUploadAt]);

  const isTranscriptionInProgress = useMemo(
    () => isInProgressStatus(linkedStatus),
    [linkedStatus]
  );

  useEffect(() => {
    if (!linkedTranscriptionId || !isTranscriptionInProgress) return undefined;
    const intervalId = setInterval(() => {
      loadLinkedTranscription({ silent: true });
    }, 2500);
    return () => clearInterval(intervalId);
  }, [isTranscriptionInProgress, linkedTranscriptionId, loadLinkedTranscription]);

  const canSave = useMemo(() => {
    if (linkedTranscriptionId) return true;
    return text.trim().length > 0;
  }, [linkedTranscriptionId, text]);

  const actionLabel = linkedTranscriptionId ? 'Sauvegarder et fermer' : 'Enregistrer';
  const textPlaceholder = isTranscriptionInProgress
    ? 'Transcription en cours...'
    : 'Collez ici la transcription...';

  const handleOpenLinkedTranscription = useCallback(() => {
    if (!linkedTranscriptionId) return;
    navigation.replace('TranscriptionDetailScreen', { transcriptionId: Number(linkedTranscriptionId) });
  }, [linkedTranscriptionId, navigation]);

  const handleBackToList = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('DataListScreen');
  }, [navigation]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (linkedTranscriptionId) {
        const trimmedTitle = title.trim();
        const trimmedText = text.trim();
        if (trimmedTitle) {
          await transcriptions.rename(linkedTranscriptionId, trimmedTitle);
        }
        if (trimmedText) {
          await transcriptions.update(linkedTranscriptionId, trimmedText);
        }
        if (typeof navigation.popToTop === 'function') {
          navigation.popToTop();
        } else {
          navigation.navigate('DataListScreen');
        }
        return;
      }

      const response = await transcriptions.create({
        title: title.trim() || undefined,
        transcription_text: text.trim(),
      });
      const created = response?.data?.data || response?.data?.item || response?.data;
      const createdId = created?.id;
      if (!createdId) {
        Alert.alert('Info', 'Transcription creee, mais identifiant introuvable.');
        navigation.goBack();
        return;
      }
      navigation.replace('TranscriptionDetailScreen', { transcriptionId: Number(createdId) });
    } catch (error) {
      console.error('Erreur sauvegarde transcription:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder cette transcription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backToListButton} onPress={handleBackToList}>
        <Text style={styles.backToListText}>← Retour à la liste</Text>
      </TouchableOpacity>

      <SectionCard title="Nouvelle transcription" subtitle="Collez un texte ou utilisez un enregistrement vocal.">
        <Text style={styles.label}>Titre (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Entretien client du 12/02"
          placeholderTextColor={Colors.textTertiary}
        />

        <View style={styles.labelRow}>
          <Text style={styles.label}>Texte de transcription</Text>
          {(isTranscriptionInProgress || syncingRemote) && (
            <Text style={styles.inlineStatusText}>
              {isTranscriptionInProgress ? 'Transcription en cours...' : 'Synchronisation...'}
            </Text>
          )}
        </View>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setTextDirty(true);
          }}
          multiline
          textAlignVertical="top"
          placeholder={textPlaceholder}
          placeholderTextColor={Colors.textTertiary}
        />

        <TouchableOpacity
          style={[styles.secondaryButton]}
          onPress={() =>
            navigation.navigate('RecordScreen', {
              transcriptionId: linkedTranscriptionId ?? undefined,
              returnToCreate: true,
            })
          }
        >
          <Text style={styles.secondaryButtonText}>🎙️ Ouvrir l'enregistreur</Text>
        </TouchableOpacity>
        {linkedTranscriptionId ? (
          <Text style={styles.linkedInfoText}>Transcription liée #{linkedTranscriptionId}</Text>
        ) : null}
      </SectionCard>

      <TouchableOpacity
        style={[styles.primaryButton, (!canSave || saving) && styles.primaryButtonDisabled]}
        onPress={handleSave}
        disabled={!canSave || saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        )}
      </TouchableOpacity>

      {linkedTranscriptionId ? (
        <TouchableOpacity
          style={[styles.openLinkedButton, saving && styles.primaryButtonDisabled]}
          onPress={handleOpenLinkedTranscription}
          disabled={saving}
        >
          <Text style={styles.openLinkedButtonText}>Ouvrir la transcription</Text>
        </TouchableOpacity>
      ) : null}
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
  backToListButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  backToListText: {
    color: Colors.primaryDark,
    fontSize: 14,
    fontWeight: '600',
  },
  label: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  labelRow: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inlineStatusText: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    marginBottom: 12,
  },
  textArea: {
    minHeight: 180,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  linkedInfoText: {
    marginTop: 8,
    color: Colors.textSecondary,
    fontSize: 12,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  openLinkedButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  openLinkedButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
