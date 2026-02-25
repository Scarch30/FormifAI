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
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { audio, transcriptions } from '../../api/client';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';
import StatusBadge from '../../components/StatusBadge';
import { extractItem, extractList, formatDate, toNumber } from '../../utils/apiData';
import { getTranscriptionTitle } from '../../utils/entityResolvers';

const APPEND_POLL_INTERVAL_MS = 2000;
const APPEND_POLL_TIMEOUT_MS = 60000;
const PROCESSING_STATUSES = new Set(['pending', 'processing', 'transcribing', 'in_progress', 'queued']);

const normalizeStatus = (status) => String(status || '').trim().toLowerCase();
const isProcessingStatus = (status) => PROCESSING_STATUSES.has(normalizeStatus(status));

const getAudioFileId = (file, index = 0) =>
  String(file?.id ?? file?.filename ?? file?.file_name ?? file?.fileName ?? file?.name ?? index);

const getAudioFileLabel = (file, index = 0) =>
  String(
    file?.original_name ||
      file?.originalName ||
      file?.name ||
      file?.filename ||
      file?.file_name ||
      file?.fileName ||
      `Audio ${index + 1}`
  );

const getAudioFileFilename = (file) =>
  file?.filename || file?.file_name || file?.fileName || file?.name || null;

const getAudioFileDirectUri = (file) =>
  String(
    file?.url ||
      file?.uri ||
      file?.file_url ||
      file?.fileUrl ||
      file?.download_url ||
      file?.downloadUrl ||
      file?.public_url ||
      file?.publicUrl ||
      ''
  ).trim();

const getAudioFileDurationSeconds = (file) => {
  const seconds = Number(
    file?.duration_seconds ??
      file?.durationSeconds ??
      file?.audio_duration_seconds ??
      file?.audioDurationSeconds
  );
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds);
};

const getAudioFileDurationMillis = (file) => {
  const seconds = getAudioFileDurationSeconds(file);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds * 1000;
};

const formatMillis = (millis) => {
  if (!Number.isFinite(millis) || millis <= 0) return '00:00';
  const totalSeconds = Math.floor(millis / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const getAudioFileSortTime = (file) => {
  const raw = file?.created_at || file?.createdAt || file?.uploaded_at || file?.uploadedAt || null;
  const time = new Date(raw || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

const sortAudioFilesOldestFirst = (files = []) =>
  [...files].sort((a, b) => getAudioFileSortTime(a) - getAudioFileSortTime(b));

const getTranscriptionErrorMessage = (item) =>
  String(
    item?.error_message ||
      item?.errorMessage ||
      item?.last_error ||
      item?.lastError ||
      item?.error ||
      ''
  ).trim();

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export default function TranscriptionDetailScreen({ route, navigation }) {
  const transcriptionId =
    toNumber(route?.params?.transcriptionId, null) ?? toNumber(route?.params?.id, null);

  const [loading, setLoading] = useState(true);
  const [savingRename, setSavingRename] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const [data, setData] = useState(null);
  const [editedText, setEditedText] = useState('');
  const [hasTextChanges, setHasTextChanges] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [audioFiles, setAudioFiles] = useState([]);
  const [playingFileId, setPlayingFileId] = useState(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioPlayback, setAudioPlayback] = useState({
    fileId: null,
    positionMillis: 0,
    durationMillis: 0,
    isSeeking: false,
  });
  const [appendPolling, setAppendPolling] = useState(false);
  const [appendErrorMessage, setAppendErrorMessage] = useState('');
  const [appendErrorType, setAppendErrorType] = useState('');
  const [retryingStatus, setRetryingStatus] = useState(false);

  const soundRef = useRef(null);
  const pollingRunRef = useRef(0);
  const lastHandledUploadMarkerRef = useRef(null);

  const stopAudioPlayback = useCallback(async () => {
    if (!soundRef.current) {
      setPlayingFileId(null);
      setIsAudioPlaying(false);
      setAudioPlayback({ fileId: null, positionMillis: 0, durationMillis: 0, isSeeking: false });
      return;
    }

    try {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
    } catch (error) {
      console.error('Erreur arrêt audio transcription:', error);
    } finally {
      soundRef.current = null;
      setPlayingFileId(null);
      setIsAudioPlaying(false);
      setAudioPlayback({ fileId: null, positionMillis: 0, durationMillis: 0, isSeeking: false });
    }
  }, []);

  const loadData = useCallback(
    async ({ showLoader = true, showFailureAlert = true } = {}) => {
      if (!transcriptionId) return null;
      if (showLoader) setLoading(true);

      try {
        const [transcriptionResponse, audioResponse] = await Promise.all([
          transcriptions.get(transcriptionId),
          audio.listByTranscription(transcriptionId).catch((error) => {
            console.error('Erreur chargement fichiers audio transcription:', error);
            return null;
          }),
        ]);
        const item = extractItem(transcriptionResponse) || transcriptionResponse?.data || null;

        if (!item) {
          setData(null);
          setAudioFiles([]);
          setEditedText('');
          setHasTextChanges(false);
          return null;
        }

        setData(item);
        setNameDraft(getTranscriptionTitle(item));
        setEditedText(String(item?.transcription_text || item?.text || ''));
        setHasTextChanges(false);

        const files = audioResponse ? extractList(audioResponse) : [];
        setAudioFiles(sortAudioFilesOldestFirst(Array.isArray(files) ? files : []));
        return item;
      } catch (error) {
        console.error('Erreur chargement transcription:', error);
        if (showFailureAlert) {
          Alert.alert('Erreur', 'Impossible de charger la transcription');
          navigation.goBack();
        }
        return null;
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [navigation, transcriptionId]
  );

  const startAppendPolling = useCallback(async () => {
    if (!transcriptionId) return;

    const runId = pollingRunRef.current + 1;
    pollingRunRef.current = runId;
    setAppendPolling(true);
    setAppendErrorMessage('');
    setAppendErrorType('');

    let elapsed = 0;

    while (pollingRunRef.current === runId && elapsed <= APPEND_POLL_TIMEOUT_MS) {
      const item = await loadData({ showLoader: false, showFailureAlert: false });
      const status = normalizeStatus(item?.status);

      if (pollingRunRef.current !== runId) return;

      if (status === 'ready') {
        setAppendPolling(false);
        setAppendErrorMessage('');
        setAppendErrorType('');
        return;
      }

      if (status === 'error') {
        const backendMessage = getTranscriptionErrorMessage(item);
        setAppendPolling(false);
        setAppendErrorType('error');
        setAppendErrorMessage(
          backendMessage || "La transcription du nouveau vocal a échoué. Vous pouvez réessayer."
        );
        return;
      }

      if (!isProcessingStatus(status)) {
        setAppendPolling(false);
        setAppendErrorMessage('');
        return;
      }

      elapsed += APPEND_POLL_INTERVAL_MS;
      if (elapsed > APPEND_POLL_TIMEOUT_MS) break;
      await sleep(APPEND_POLL_INTERVAL_MS);
    }

    if (pollingRunRef.current === runId) {
      setAppendPolling(false);
      setAppendErrorType('timeout');
      setAppendErrorMessage(
        "Le traitement prend plus de temps que prévu. Vous pouvez rafraîchir l'état."
      );
    }
  }, [loadData, transcriptionId]);

  useEffect(() => {
    return () => {
      pollingRunRef.current += 1;
      stopAudioPlayback();
    };
  }, [stopAudioPlayback]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {
        stopAudioPlayback();
      };
    }, [loadData, stopAudioPlayback])
  );

  useEffect(() => {
    const uploadMarker = Number(route?.params?.recordUploadAt);
    if (!Number.isFinite(uploadMarker)) return;
    if (lastHandledUploadMarkerRef.current === uploadMarker) return;
    lastHandledUploadMarkerRef.current = uploadMarker;
    startAppendPolling();
  }, [route?.params?.recordUploadAt, startAppendPolling]);

  const handleToggleAudioPlayback = async (file, index) => {
    if (!file) {
      Alert.alert('Audio introuvable', "Aucun fichier audio n'est disponible.");
      return;
    }

    const fileId = getAudioFileId(file, index);
    try {
      if (playingFileId === fileId && soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await soundRef.current.pauseAsync();
          setIsAudioPlaying(false);
        } else if (status.isLoaded) {
          await soundRef.current.playAsync();
          setIsAudioPlaying(true);
        }
        return;
      }

      await stopAudioPlayback();

      let sourceUri = '';
      const filename = getAudioFileFilename(file);
      if (filename) {
        sourceUri = await audio.getFileUrl(filename);
      }
      if (!sourceUri) {
        sourceUri = getAudioFileDirectUri(file);
      }
      if (!sourceUri) {
        Alert.alert('Audio introuvable', "Le fichier audio n'a pas d'URL exploitable.");
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: sourceUri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;

          setIsAudioPlaying(status.isPlaying);
          setAudioPlayback({
            fileId,
            positionMillis: status.positionMillis || 0,
            durationMillis: status.durationMillis || getAudioFileDurationMillis(file),
            isSeeking: false,
          });

          if (status.didJustFinish) {
            setPlayingFileId(null);
            setIsAudioPlaying(false);
            soundRef.current?.unloadAsync();
            soundRef.current = null;
            setAudioPlayback({ fileId: null, positionMillis: 0, durationMillis: 0, isSeeking: false });
          }
        }
      );

      await sound.setProgressUpdateIntervalAsync(500);
      soundRef.current = sound;
      setPlayingFileId(fileId);
      setIsAudioPlaying(true);
      setAudioPlayback({
        fileId,
        positionMillis: 0,
        durationMillis: getAudioFileDurationMillis(file),
        isSeeking: false,
      });
    } catch (error) {
      console.error('Erreur lecture audio transcription:', error);
      Alert.alert('Erreur', "Impossible de lire le fichier audio");
      setPlayingFileId(null);
      setIsAudioPlaying(false);
      setAudioPlayback({ fileId: null, positionMillis: 0, durationMillis: 0, isSeeking: false });
    }
  };

  const handleCopy = async () => {
    const text = String(editedText || '');
    if (!text) return;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copie', 'Texte copie dans le presse-papiers');
  };

  const handleSaveText = async () => {
    if (!transcriptionId) return;
    const nextText = String(editedText ?? '');
    if (nextText === String(data?.transcription_text ?? data?.text ?? '')) {
      setHasTextChanges(false);
      return;
    }

    setSavingText(true);
    try {
      await transcriptions.update(transcriptionId, nextText);
      await loadData({ showLoader: false, showFailureAlert: false });
      Alert.alert('Enregistré', 'Texte de transcription mis à jour');
    } catch (error) {
      console.error('Erreur sauvegarde texte transcription:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder le texte');
    } finally {
      setSavingText(false);
    }
  };

  const handleRename = async () => {
    if (!transcriptionId || !nameDraft.trim()) {
      setEditingName(false);
      return;
    }

    setSavingRename(true);
    try {
      await transcriptions.rename(transcriptionId, nameDraft.trim());
      setEditingName(false);
      await loadData({ showLoader: false, showFailureAlert: false });
    } catch (error) {
      console.error('Erreur renommage transcription:', error);
      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        'Impossible de renommer cette transcription';
      Alert.alert('Erreur', apiMessage);
    } finally {
      setSavingRename(false);
    }
  };

  const handleDelete = () => {
    if (!transcriptionId) return;
    Alert.alert('Supprimer', 'Supprimer cette transcription ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await stopAudioPlayback();
            await transcriptions.delete(transcriptionId);
            navigation.goBack();
          } catch (error) {
            console.error('Erreur suppression transcription:', error);
            Alert.alert('Erreur', 'Impossible de supprimer cette transcription');
          }
        },
      },
    ]);
  };

  const handleAddAudio = async () => {
    if (!transcriptionId) return;
    await stopAudioPlayback();
    navigation.navigate('RecordScreen', {
      transcriptionId,
      returnToTranscriptionDetail: true,
    });
  };

  const handleRetryStatus = async () => {
    setRetryingStatus(true);
    try {
      await startAppendPolling();
    } finally {
      setRetryingStatus(false);
    }
  };

  const normalizedStatus = normalizeStatus(data?.status);
  const isProcessing = isProcessingStatus(normalizedStatus) || appendPolling;
  const buttonsDisabled = isProcessing || savingRename || savingText;
  const backendError = getTranscriptionErrorMessage(data);
  const statusErrorMessage = appendErrorMessage || (normalizedStatus === 'error' ? backendError : '');
  const retryLabel = appendErrorType === 'timeout' ? 'Rafraîchir' : 'Réessayer';

  const audioListWithProgress = useMemo(
    () =>
      audioFiles.map((file, index) => {
        const audioId = getAudioFileId(file, index);
        const isActive = audioPlayback.fileId === audioId;
        const durationMillis = isActive
          ? audioPlayback.durationMillis || getAudioFileDurationMillis(file)
          : getAudioFileDurationMillis(file);
        const positionMillis = isActive ? audioPlayback.positionMillis || 0 : 0;
        const progress = durationMillis > 0 ? Math.min(positionMillis / durationMillis, 1) : 0;
        const durationSeconds = getAudioFileDurationSeconds(file);

        return {
          file,
          index,
          audioId,
          isActive,
          durationMillis,
          positionMillis,
          progress,
          durationSeconds,
        };
      }),
    [audioFiles, audioPlayback.durationMillis, audioPlayback.fileId, audioPlayback.positionMillis]
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>Transcription introuvable</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={styles.backToListButton}
        onPress={() => navigation.navigate('DataListScreen')}
      >
        <Text style={styles.backToListText}>← Retour à la liste</Text>
      </TouchableOpacity>

      <SectionCard>
        {editingName ? (
          <View style={styles.renameWrap}>
            <TextInput
              style={styles.nameInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Nom de la transcription"
              editable={!buttonsDisabled}
            />
            <TouchableOpacity
              style={[styles.smallAction, buttonsDisabled && styles.buttonDisabled]}
              onPress={handleRename}
              disabled={buttonsDisabled}
            >
              {savingRename ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.smallActionText}>Valider</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.title}>{getTranscriptionTitle(data)}</Text>
        )}

        <View style={styles.rowBetween}>
          <Text style={styles.meta}>{formatDate(data?.created_at || data?.createdAt)}</Text>
          <StatusBadge status={data?.status} />
        </View>

        {Number.isFinite(Number(data?.audio_duration_seconds)) ? (
          <Text style={styles.meta}>Duree: {Math.round(Number(data.audio_duration_seconds))}s</Text>
        ) : null}

        {isProcessing ? (
          <View style={styles.processingWrap}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.processingText}>Traitement du vocal en cours...</Text>
          </View>
        ) : null}
      </SectionCard>

      {(normalizedStatus === 'error' || Boolean(appendErrorMessage)) && (
        <SectionCard title="Erreur de transcription">
          <Text style={styles.errorText}>
            {statusErrorMessage || "Le traitement a échoué. Vous pouvez réessayer."}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, (retryingStatus || appendPolling) && styles.buttonDisabled]}
            onPress={handleRetryStatus}
            disabled={retryingStatus || appendPolling}
          >
            {retryingStatus || appendPolling ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.retryButtonText}>{retryLabel}</Text>
            )}
          </TouchableOpacity>
        </SectionCard>
      )}

      <SectionCard title="Audios sources">
        {audioListWithProgress.length === 0 ? (
          <Text style={styles.meta}>Aucun fichier audio lié à cette transcription.</Text>
        ) : (
          <View style={styles.audioWrap}>
            {audioListWithProgress.map((entry) => {
              const isCurrentFile = entry.audioId === playingFileId;
              const fileIsPlaying = isCurrentFile && isAudioPlaying;

              return (
                <View key={entry.audioId} style={styles.audioItemCard}>
                  <View style={styles.audioItemHead}>
                    <Text style={styles.audioFileName} numberOfLines={1}>
                      {getAudioFileLabel(entry.file, entry.index)}
                    </Text>
                    {Number.isFinite(entry.durationSeconds) ? (
                      <Text style={styles.audioDurationTag}>{entry.durationSeconds}s</Text>
                    ) : null}
                  </View>

                  <View style={styles.audioProgressBar}>
                    <View
                      style={[styles.audioProgressFill, { width: `${Math.round(entry.progress * 100)}%` }]}
                    />
                  </View>

                  <Text style={styles.audioTime}>
                    {formatMillis(entry.positionMillis)} / {formatMillis(entry.durationMillis)}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.audioPlayButton,
                      isCurrentFile && styles.audioPlayButtonActive,
                      isProcessing && styles.buttonDisabled,
                    ]}
                    onPress={() => handleToggleAudioPlayback(entry.file, entry.index)}
                    disabled={isProcessing}
                  >
                    <Text
                      style={[
                        styles.audioPlayButtonText,
                        isCurrentFile && styles.audioPlayButtonTextActive,
                      ]}
                    >
                      {fileIsPlaying ? '⏸ Pause' : '▶ Lire'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>

      <SectionCard title="Transcription">
        <TextInput
          style={styles.transcriptionInput}
          multiline
          value={editedText}
          onChangeText={(value) => {
            setEditedText(value);
            setHasTextChanges(value !== String(data?.transcription_text || data?.text || ''));
          }}
          editable={!savingText && !isProcessing}
          textAlignVertical="top"
          placeholder="Aucun texte disponible."
        />
        <TouchableOpacity
          style={[
            styles.saveTextButton,
            (!hasTextChanges || savingText || isProcessing) && styles.saveTextButtonDisabled,
          ]}
          onPress={handleSaveText}
          disabled={!hasTextChanges || savingText || isProcessing}
        >
          {savingText ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveTextButtonText}>Enregistrer le texte</Text>
          )}
        </TouchableOpacity>
      </SectionCard>

      <TouchableOpacity
        style={[styles.primaryButton, isProcessing && styles.buttonDisabled]}
        onPress={() =>
          navigation.navigate('HomeStack', {
            screen: 'FillWizardScreen',
            params: {
              preselectedSourceType: 'transcription',
              preselectedSourceId: Number(data?.id),
            },
          })
        }
        disabled={isProcessing}
      >
        <Text style={styles.primaryButtonText}>✨ Remplir un formulaire</Text>
      </TouchableOpacity>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, buttonsDisabled && styles.buttonDisabled]}
          onPress={handleAddAudio}
          disabled={buttonsDisabled}
        >
          <Text style={styles.secondaryButtonText}>🎤 Ajouter un vocal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, buttonsDisabled && styles.buttonDisabled]}
          onPress={() => setEditingName((prev) => !prev)}
          disabled={buttonsDisabled}
        >
          <Text style={styles.secondaryButtonText}>Renommer</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleCopy} disabled={savingText}>
          <Text style={styles.secondaryButtonText}>Copier le texte</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, styles.deleteButton, buttonsDisabled && styles.buttonDisabled]}
          onPress={handleDelete}
          disabled={buttonsDisabled}
        >
          <Text style={[styles.secondaryButtonText, styles.deleteText]}>Supprimer</Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 120,
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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  renameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: Colors.text,
  },
  smallAction: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  smallActionText: {
    color: Colors.primaryDark,
    fontSize: 13,
    fontWeight: '600',
  },
  rowBetween: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  processingWrap: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
  },
  processingText: {
    color: Colors.primaryDark,
    fontSize: 13,
    fontWeight: '600',
  },
  transcriptionInput: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  saveTextButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveTextButtonDisabled: {
    opacity: 0.6,
  },
  saveTextButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  audioWrap: {
    gap: 10,
  },
  audioItemCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
    gap: 8,
  },
  audioItemHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  audioFileName: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  audioDurationTag: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  audioProgressBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
    overflow: 'hidden',
  },
  audioProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    width: '0%',
  },
  audioTime: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  audioPlayButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingVertical: 10,
    alignItems: 'center',
  },
  audioPlayButtonActive: {
    backgroundColor: Colors.primary,
  },
  audioPlayButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  audioPlayButtonTextActive: {
    color: '#fff',
  },
  retryButton: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  actionsRow: {
    gap: 8,
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
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  deleteText: {
    color: Colors.error,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
