import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { transcriptions, documents, audio } from '../api/client';

export default function TranscriptionScreen({ route, navigation }) {
  const { id } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [documentName, setDocumentName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [audioFiles, setAudioFiles] = useState([]);
  const [playingFileId, setPlayingFileId] = useState(null);
  const [isFilePlaying, setIsFilePlaying] = useState(false);
  const [filePlayback, setFilePlayback] = useState({
    fileId: null,
    positionMillis: 0,
    durationMillis: 0,
    isSeeking: false,
  });
  const [audioFileBarWidths, setAudioFileBarWidths] = useState({});
  const fileSoundRef = useRef(null);
  const filePlaybackRef = useRef(filePlayback);

  useEffect(() => {
    filePlaybackRef.current = filePlayback;
  }, [filePlayback]);

  const loadTranscription = useCallback(async () => {
    try {
      const response = await transcriptions.get(id);
      setData(response.data);
      setEditedText(response.data?.transcription_text || '');
      setHasChanges(false);
      try {
        const audioResponse = await audio.listByTranscription(id);
        const files = Array.isArray(audioResponse?.data)
          ? audioResponse.data
          : audioResponse?.data?.data || [];
        setAudioFiles(Array.isArray(files) ? files : []);
      } catch (error) {
        console.error('Erreur chargement fichiers audio:', error);
        setAudioFiles([]);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger la transcription');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [id, navigation]);

  useFocusEffect(
    useCallback(() => {
      loadTranscription();
    }, [loadTranscription])
  );

  useEffect(() => {
    return () => {
      if (fileSoundRef.current) {
        fileSoundRef.current.unloadAsync();
        fileSoundRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (data?.status !== 'transcribing') return undefined;
    const intervalId = setInterval(() => {
      loadTranscription();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [data?.status, loadTranscription]);

  const stopAudioFilePlayback = async () => {
    if (!fileSoundRef.current) {
      setPlayingFileId(null);
      setIsFilePlaying(false);
      setFilePlayback({ fileId: null, positionMillis: 0, durationMillis: 0, isSeeking: false });
      return;
    }
    try {
      await fileSoundRef.current.stopAsync();
      await fileSoundRef.current.unloadAsync();
    } catch (error) {
      console.error('Erreur arrêt fichier audio:', error);
    } finally {
      fileSoundRef.current = null;
      setPlayingFileId(null);
      setIsFilePlaying(false);
      setFilePlayback({ fileId: null, positionMillis: 0, durationMillis: 0, isSeeking: false });
    }
  };

  const getAudioFileLabel = (file, index) => {
    return (
      file?.original_name ||
      file?.originalName ||
      file?.name ||
      file?.filename ||
      `Audio ${index + 1}`
    );
  };

  const getAudioFileDate = (file) => {
    const value = file?.created_at || file?.createdAt || file?.uploaded_at || file?.uploadedAt;
    if (!value) return 'Date inconnue';
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAudioFileFilename = (file) => {
    return file?.filename || file?.file_name || file?.fileName || file?.name || null;
  };

  const getAudioFileDurationMillis = (file) => {
    const seconds = file?.duration_seconds ?? file?.durationSeconds;
    if (!Number.isFinite(seconds)) return 0;
    return Math.max(0, Math.round(seconds * 1000));
  };

  const formatMillis = (millis) => {
    if (!Number.isFinite(millis) || millis <= 0) return '00:00';
    const totalSeconds = Math.floor(millis / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const updateAudioFileSeek = (fileId, locationX) => {
    const width = audioFileBarWidths[fileId] || 0;
    const durationMillis = filePlaybackRef.current.durationMillis || 0;
    if (!width || !durationMillis) return;
    const ratio = clamp(locationX / width, 0, 1);
    const positionMillis = Math.round(ratio * durationMillis);
    setFilePlayback((prev) =>
      prev.fileId === fileId
        ? { ...prev, positionMillis, isSeeking: true }
        : prev
    );
  };

  const handleSeekStart = (fileId, locationX) => {
    if (playingFileId !== fileId) return;
    updateAudioFileSeek(fileId, locationX);
  };

  const handleSeekMove = (fileId, locationX) => {
    if (playingFileId !== fileId) return;
    if (!filePlaybackRef.current.isSeeking) return;
    updateAudioFileSeek(fileId, locationX);
  };

  const handleSeekEnd = async (fileId) => {
    if (playingFileId !== fileId) return;
    const target = filePlaybackRef.current.positionMillis || 0;
    setFilePlayback((prev) =>
      prev.fileId === fileId ? { ...prev, isSeeking: false } : prev
    );
    if (!fileSoundRef.current) return;
    try {
      await fileSoundRef.current.setPositionAsync(target);
    } catch (error) {
      console.error('Erreur déplacement audio:', error);
    }
  };

  const handleToggleAudioFilePlayback = async (file) => {
    const filename = getAudioFileFilename(file);
    if (!filename) {
      Alert.alert('Erreur', 'Fichier audio introuvable');
      return;
    }
    const fileId = file?.id || filename;

    try {
      if (playingFileId === fileId && fileSoundRef.current) {
        const status = await fileSoundRef.current.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await fileSoundRef.current.pauseAsync();
          setIsFilePlaying(false);
        } else if (status.isLoaded) {
          await fileSoundRef.current.playAsync();
          setIsFilePlaying(true);
        }
        return;
      }

      await stopAudioFilePlayback();

      const url = await audio.getFileUrl(filename);
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setIsFilePlaying(status.isPlaying);
          setFilePlayback((prev) => {
            if (prev.isSeeking && prev.fileId === fileId) {
              return {
                ...prev,
                durationMillis: status.durationMillis || prev.durationMillis,
              };
            }
            return {
              fileId,
              positionMillis: status.positionMillis || 0,
              durationMillis: status.durationMillis || getAudioFileDurationMillis(file),
              isSeeking: false,
            };
          });
          if (status.didJustFinish) {
            setPlayingFileId(null);
            setIsFilePlaying(false);
            fileSoundRef.current?.unloadAsync();
            fileSoundRef.current = null;
            setFilePlayback({ fileId: null, positionMillis: 0, durationMillis: 0, isSeeking: false });
          }
        }
      );
      await sound.setProgressUpdateIntervalAsync(500);
      fileSoundRef.current = sound;
      setPlayingFileId(fileId);
      setIsFilePlaying(true);
      setFilePlayback({
        fileId,
        positionMillis: 0,
        durationMillis: getAudioFileDurationMillis(file),
        isSeeking: false,
      });
    } catch (error) {
      console.error('Erreur lecture fichier audio:', error);
      Alert.alert('Erreur', 'Impossible de lire ce fichier audio');
      setPlayingFileId(null);
      setIsFilePlaying(false);
      setFilePlayback({ fileId: null, positionMillis: 0, durationMillis: 0, isSeeking: false });
    }
  };

  const getAudioFilePlaybackLabel = (file) => {
    const fileId = file?.id || file?.filename || file?.name;
    if (playingFileId !== fileId) return '▶️';
    return isFilePlaying ? '⏸' : '▶️';
  };

  const handleValidate = async () => {
    setActionLoading(true);
    try {
      await transcriptions.validate(id);
      Alert.alert('Validé', 'Transcription ajoutée au document');
      loadTranscription();
    } catch (error) {
      Alert.alert('Erreur', error.response?.data?.error || 'Échec de la validation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!documentName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom pour le document');
      return;
    }
    setActionLoading(true);
    try {
      await transcriptions.complete(id, documentName);
      Alert.alert('Terminé', 'Document prêt pour extraction');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Erreur', error.response?.data?.error || 'Échec');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtract = async () => {
    setActionLoading(true);
    try {
      await documents.extract(id);
      Alert.alert('Extraction lancée', 'Le document CGP est en cours de génération');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Erreur', error.response?.data?.error || 'Échec de l\'extraction');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdits = async () => {
    setActionLoading(true);
    try {
      await transcriptions.update(id, editedText);
      Alert.alert('Enregistré', 'Transcription mise à jour');
      await loadTranscription();
    } catch (error) {
      Alert.alert('Erreur', error.response?.data?.error || 'Échec de la sauvegarde');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending':
        return 'En attente';
      case 'transcribing':
        return 'Transcription...';
      case 'ready':
        return 'Prêt à valider';
      case 'validated':
        return 'Validé';
      case 'completed':
        return 'Terminé';
      case 'error':
        return 'Erreur';
      default:
        return status;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready':
        return '#10B981';
      case 'transcribing':
        return '#F59E0B';
      case 'completed':
        return '#3B82F6';
      case 'error':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!data) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <View style={[styles.badge, { backgroundColor: getStatusColor(data.status) }]}>
          <Text style={styles.badgeText}>{getStatusLabel(data.status)}</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.title}>
          {data.document_name || `Transcription #${data.id}`}
        </Text>

        <Text style={styles.date}>
          {new Date(data.created_at).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>

        {data.audio_duration_seconds && (
          <Text style={styles.duration}>
            Durée audio : {Math.round(data.audio_duration_seconds)}s
          </Text>
        )}

        <View style={styles.textContainer}>
          <Text style={styles.sectionTitle}>Transcription</Text>
          {data.status === 'transcribing' ? (
            <View style={styles.transcribingContainer}>
              <ActivityIndicator size="small" color="#4F46E5" />
              <Text style={styles.transcribingText}>Transcription en cours...</Text>
            </View>
          ) : (
            <TextInput
              style={styles.transcriptionInput}
              multiline
              placeholder="Aucun texte disponible"
              value={editedText}
              onChangeText={(text) => {
                setEditedText(text);
                setHasChanges(text !== (data?.transcription_text || ''));
              }}
            />
          )}
        </View>

        {!!audioFiles.length && (
          <View style={[styles.textContainer, styles.audioFilesSection]}>
            <Text style={styles.sectionTitle}>Fichiers audio</Text>
            {audioFiles.map((file, index) => {
              const fileId = file?.id || file?.filename || file?.name || index;
              const isActive = playingFileId === fileId;
              const durationMillis = isActive
                ? filePlayback.durationMillis
                : getAudioFileDurationMillis(file);
              const positionMillis = isActive ? filePlayback.positionMillis : 0;
              const progress =
                durationMillis > 0 ? Math.min(positionMillis / durationMillis, 1) : 0;
              return (
                <View key={fileId} style={styles.audioFileCard}>
                  <View style={styles.audioFileInfo}>
                    <Text style={styles.audioFileTitle}>{getAudioFileLabel(file, index)}</Text>
                    <Text style={styles.audioFileMeta}>{getAudioFileDate(file)}</Text>
                    <View style={styles.audioFileProgressRow}>
                      <View
                        style={styles.audioFileProgressBar}
                        onLayout={(event) => {
                          const width = event.nativeEvent.layout.width;
                          setAudioFileBarWidths((prev) =>
                            prev[fileId] === width ? prev : { ...prev, [fileId]: width }
                          );
                        }}
                        onStartShouldSetResponder={() => isActive && durationMillis > 0}
                        onMoveShouldSetResponder={() => isActive && durationMillis > 0}
                        onResponderGrant={(event) =>
                          handleSeekStart(fileId, event.nativeEvent.locationX)
                        }
                        onResponderMove={(event) =>
                          handleSeekMove(fileId, event.nativeEvent.locationX)
                        }
                        onResponderRelease={() => handleSeekEnd(fileId)}
                        onResponderTerminate={() => handleSeekEnd(fileId)}
                      >
                        <View
                          style={[
                            styles.audioFileProgressFill,
                            { width: `${Math.round(progress * 100)}%` },
                          ]}
                        />
                        {isActive && durationMillis > 0 && (
                          <View
                            style={[
                              styles.audioFileProgressHandle,
                              { left: `${Math.round(progress * 100)}%` },
                            ]}
                          />
                        )}
                      </View>
                      <Text style={styles.audioFileTime}>
                        {formatMillis(positionMillis)} / {formatMillis(durationMillis)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.audioFileButton,
                      isActive && styles.audioFileButtonActive,
                    ]}
                    onPress={() => handleToggleAudioFilePlayback(file)}
                  >
                    <Text
                      style={[
                        styles.audioFileButtonText,
                        isActive && styles.audioFileButtonTextActive,
                      ]}
                    >
                      {getAudioFilePlaybackLabel(file)}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {data.accumulated_text && data.accumulated_text !== data.transcription_text && (
          <View style={styles.textContainer}>
            <Text style={styles.sectionTitle}>Texte accumulé</Text>
            <Text style={styles.transcriptionText}>{data.accumulated_text}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        {hasChanges && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSaveEdits}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sauvegarder les modifications</Text>
            )}
          </TouchableOpacity>
        )}

        {data.status === 'ready' && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleValidate}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>✓ Valider la transcription</Text>
            )}
          </TouchableOpacity>
        )}

        {data.status === 'validated' && !showNameInput && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setShowNameInput(true)}
          >
            <Text style={styles.buttonText}>Terminer et nommer</Text>
          </TouchableOpacity>
        )}

        {showNameInput && (
          <View style={styles.nameInputContainer}>
            <TextInput
              style={styles.nameInput}
              placeholder="Nom du document (ex: Entretien Martin)"
              value={documentName}
              onChangeText={setDocumentName}
            />
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleComplete}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Confirmer</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {data.status === 'completed' && (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: '#10B981' }]}
            onPress={handleExtract}
            disabled={actionLoading}
          >
            {actionLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>🚀 Extraire données CGP</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            data.status === 'transcribing' && styles.secondaryButtonDisabled,
          ]}
          onPress={() => navigation.navigate('Record', { transcription_id: data.id })}
          disabled={actionLoading || data.status === 'transcribing'}
        >
          <Text style={styles.secondaryButtonText}>🎤 Ajouter un complément vocal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#4F46E5',
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  date: {
    color: '#666',
    marginBottom: 4,
  },
  duration: {
    color: '#666',
    marginBottom: 20,
  },
  textContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  audioFilesSection: {
    backgroundColor: '#F5F7FF',
    borderWidth: 1,
    borderColor: '#E5E7FF',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
    marginBottom: 10,
  },
  transcriptionInput: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    minHeight: 140,
    textAlignVertical: 'top',
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  transcribingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  transcribingText: {
    color: '#666',
    fontSize: 14,
  },
  audioFileCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  audioFileInfo: {
    flex: 1,
    paddingRight: 12,
  },
  audioFileTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  audioFileMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  audioFileProgressRow: {
    marginTop: 8,
  },
  audioFileProgressBar: {
    height: 6,
    backgroundColor: '#E5E7FF',
    borderRadius: 999,
    overflow: 'hidden',
  },
  audioFileProgressFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
    width: '0%',
  },
  audioFileProgressHandle: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4F46E5',
    borderWidth: 2,
    borderColor: '#fff',
    transform: [{ translateX: -7 }],
  },
  audioFileTime: {
    marginTop: 6,
    fontSize: 11,
    color: '#6B7280',
  },
  audioFileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioFileButtonActive: {
    backgroundColor: '#4F46E5',
  },
  audioFileButtonText: {
    color: '#4F46E5',
    fontSize: 16,
  },
  audioFileButtonTextActive: {
    color: '#fff',
  },
  actions: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  secondaryButtonText: {
    color: '#4F46E5',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  nameInputContainer: {
    gap: 12,
  },
  nameInput: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
});
