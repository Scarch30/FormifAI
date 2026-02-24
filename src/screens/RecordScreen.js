import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { audio, templates } from '../api/client';
import SelectionModal from '../components/SelectionModal';
import { addRecordingToLibrary, persistRecordingFile } from '../storage/audioLibrary';

const extractList = (response) => {
  const payload = response?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const decodeMaybeUriComponent = (value) => {
  const raw = String(value ?? '');
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch (_error) {
    // no-op
  }
  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch (_error) {
    return raw;
  }
};

const getItemName = (item) => {
  const rawName =
    item?.name ||
    item?.title ||
    item?.document_name ||
    item?.documentName ||
    item?.original_name ||
    item?.originalName ||
    item?.filename ||
    item?.file_name ||
    item?.fileName ||
    '';
  const decoded = decodeMaybeUriComponent(rawName);
  if (decoded) return decoded;
  return `Formulaire #${item?.id ?? ''}`;
};

const formatDate = (value) => {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getItemDate = (item) => item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const MIN_PREVIEW_ZOOM_SCALE = 1;
const MAX_PREVIEW_ZOOM_SCALE = 4;

export default function RecordScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formPickerVisible, setFormPickerVisible] = useState(false);
  const [formItems, setFormItems] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState(null);
  const [previewUri, setPreviewUri] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFrameLayout, setPreviewFrameLayout] = useState({ width: 0, height: 0 });
  const [previewZoomScale, setPreviewZoomScale] = useState(MIN_PREVIEW_ZOOM_SCALE);
  const intervalRef = useRef(null);
  const previewPanRef = useRef(null);
  const previewPinchRef = useRef(null);
  const previewZoomScaleRef = useRef(MIN_PREVIEW_ZOOM_SCALE);
  const previewPanOffsetRef = useRef({ x: 0, y: 0 });
  const previewBaseScale = useRef(new Animated.Value(MIN_PREVIEW_ZOOM_SCALE)).current;
  const previewPinchScale = useRef(new Animated.Value(1)).current;
  const previewTranslateX = useRef(new Animated.Value(0)).current;
  const previewTranslateY = useRef(new Animated.Value(0)).current;
  const previewPanX = useRef(new Animated.Value(0)).current;
  const previewPanY = useRef(new Animated.Value(0)).current;
  const previewZoomAnim = Animated.multiply(previewBaseScale, previewPinchScale);
  const previewTranslateXAnim = Animated.add(previewTranslateX, previewPanX);
  const previewTranslateYAnim = Animated.add(previewTranslateY, previewPanY);
  const transcriptionId =
    route?.params?.transcription_id ?? route?.params?.transcriptionId ?? route?.params?.id ?? null;
  const returnToCreate = Boolean(route?.params?.returnToCreate);
  const returnToTranscriptionDetail = Boolean(route?.params?.returnToTranscriptionDetail);
  const returnToGenerationRequest = Boolean(route?.params?.returnToGenerationRequest);
  const prelinkedTranscriptionId =
    transcriptionId !== undefined && transcriptionId !== null ? String(transcriptionId) : null;

  const resolveTranscriptionId = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const direct =
      payload.transcription_id ??
      payload.transcriptionId ??
      payload.id ??
      payload.transcription?.id;
    if (direct !== undefined && direct !== null) return direct;
    if (payload.data) return resolveTranscriptionId(payload.data);
    if (payload.result) return resolveTranscriptionId(payload.result);
    return null;
  };

  const loadForms = useCallback(async () => {
    setFormsLoading(true);
    try {
      const [documentsResponse, templatesResponse] = await Promise.all([
        templates.listDocuments().catch(() => null),
        templates.listTemplates().catch(() => null),
      ]);

      const documents = extractList(documentsResponse).map((item) => ({
        id: Number(item?.id),
        raw: item,
        title: getItemName(item),
        subtitle: formatDate(getItemDate(item)),
        meta: 'Document',
      }));
      const templateFallbacks = extractList(templatesResponse).map((item) => ({
        id: Number(item?.id),
        raw: item,
        title: getItemName(item),
        subtitle: formatDate(getItemDate(item)),
        meta: 'Template',
      }));

      const merged = [];
      const seen = new Set();
      [...documents, ...templateFallbacks].forEach((item) => {
        if (!Number.isFinite(item?.id)) return;
        const key = `${item.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(item);
      });

      setFormItems(merged);
      setSelectedFormId((prev) => {
        if (prev && merged.some((item) => Number(item.id) === Number(prev))) return prev;
        return merged[0]?.id ?? null;
      });
    } catch (error) {
      console.error('Erreur chargement formulaires reference:', error);
      setFormItems([]);
      setSelectedFormId(null);
    } finally {
      setFormsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadForms();
    }, [loadForms])
  );

  useEffect(() => {
    let isMounted = true;
    const resolvePreview = async () => {
      if (!selectedFormId) {
        if (isMounted) {
          setPreviewUri('');
          setPreviewLoading(false);
        }
        return;
      }
      if (isMounted) setPreviewLoading(true);
      try {
        const remoteUrl = await templates.getPageImageUrl(selectedFormId, 1);
        if (!remoteUrl) {
          if (isMounted) setPreviewUri('');
          return;
        }

        const cacheDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!cacheDirectory) {
          if (isMounted) setPreviewUri(remoteUrl);
          return;
        }

        const localUri = `${cacheDirectory}record_preview_${selectedFormId}_p1.png`;
        const downloadResult = await FileSystem.downloadAsync(remoteUrl, localUri);
        const statusCode = Number(downloadResult?.status ?? 0);
        if (statusCode < 200 || statusCode >= 300) {
          throw new Error(`Erreur HTTP ${statusCode}`);
        }

        if (isMounted) setPreviewUri(downloadResult?.uri || localUri);
      } catch (error) {
        console.error('Erreur chargement preview formulaire record:', error);
        if (isMounted) setPreviewUri('');
      } finally {
        if (isMounted) setPreviewLoading(false);
      }
    };
    resolvePreview();
    return () => {
      isMounted = false;
    };
  }, [selectedFormId]);

  const selectedForm = useMemo(
    () => formItems.find((item) => Number(item?.id) === Number(selectedFormId)) || null,
    [formItems, selectedFormId]
  );

  const getPreviewPanBounds = useCallback(
    (scale) => {
      const width = Number(previewFrameLayout?.width) || 0;
      const height = Number(previewFrameLayout?.height) || 0;
      if (scale <= MIN_PREVIEW_ZOOM_SCALE || !width || !height) {
        return { maxX: 0, maxY: 0 };
      }
      return {
        maxX: ((scale - 1) * width) / 2,
        maxY: ((scale - 1) * height) / 2,
      };
    },
    [previewFrameLayout]
  );

  const clampPreviewPan = useCallback(
    (x, y, scale = previewZoomScaleRef.current) => {
      const { maxX, maxY } = getPreviewPanBounds(scale);
      if (!maxX && !maxY) return { x: 0, y: 0 };
      return {
        x: clamp(x, -maxX, maxX),
        y: clamp(y, -maxY, maxY),
      };
    },
    [getPreviewPanBounds]
  );

  const resetPreviewZoom = useCallback(() => {
    previewZoomScaleRef.current = MIN_PREVIEW_ZOOM_SCALE;
    setPreviewZoomScale(MIN_PREVIEW_ZOOM_SCALE);
    previewBaseScale.setValue(MIN_PREVIEW_ZOOM_SCALE);
    previewPinchScale.setValue(1);
    previewPanOffsetRef.current = { x: 0, y: 0 };
    previewTranslateX.setValue(0);
    previewTranslateY.setValue(0);
    previewPanX.setValue(0);
    previewPanY.setValue(0);
  }, [
    previewBaseScale,
    previewPanX,
    previewPanY,
    previewPinchScale,
    previewTranslateX,
    previewTranslateY,
  ]);

  const applyPreviewZoomScale = useCallback(
    (nextScale) => {
      const safeScale = clamp(nextScale, MIN_PREVIEW_ZOOM_SCALE, MAX_PREVIEW_ZOOM_SCALE);
      previewZoomScaleRef.current = safeScale;
      previewBaseScale.setValue(safeScale);
      previewPinchScale.setValue(1);

      if (safeScale <= MIN_PREVIEW_ZOOM_SCALE) {
        previewPanOffsetRef.current = { x: 0, y: 0 };
        previewTranslateX.setValue(0);
        previewTranslateY.setValue(0);
      } else {
        const clampedOffset = clampPreviewPan(
          previewPanOffsetRef.current.x,
          previewPanOffsetRef.current.y,
          safeScale
        );
        previewPanOffsetRef.current = clampedOffset;
        previewTranslateX.setValue(clampedOffset.x);
        previewTranslateY.setValue(clampedOffset.y);
      }
      previewPanX.setValue(0);
      previewPanY.setValue(0);
      setPreviewZoomScale(safeScale);
    },
    [
      clampPreviewPan,
      previewBaseScale,
      previewPanX,
      previewPanY,
      previewPinchScale,
      previewTranslateX,
      previewTranslateY,
    ]
  );

  useEffect(() => {
    resetPreviewZoom();
  }, [previewUri, selectedFormId, resetPreviewZoom]);

  useEffect(() => {
    if (previewZoomScaleRef.current <= MIN_PREVIEW_ZOOM_SCALE) return;
    const clampedOffset = clampPreviewPan(
      previewPanOffsetRef.current.x,
      previewPanOffsetRef.current.y
    );
    previewPanOffsetRef.current = clampedOffset;
    previewTranslateX.setValue(clampedOffset.x);
    previewTranslateY.setValue(clampedOffset.y);
  }, [clampPreviewPan, previewTranslateX, previewTranslateY, previewFrameLayout]);

  const onPreviewFrameLayout = useCallback((event) => {
    const width = Number(event?.nativeEvent?.layout?.width) || 0;
    const height = Number(event?.nativeEvent?.layout?.height) || 0;
    setPreviewFrameLayout((prev) => {
      if (prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

  const onPreviewPanGestureEvent = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { translationX: previewPanX, translationY: previewPanY } }],
        { useNativeDriver: false }
      ),
    [previewPanX, previewPanY]
  );

  const onPreviewPanStateChange = useCallback(
    (event) => {
      const { oldState, translationX, translationY } = event.nativeEvent;
      if (oldState !== State.ACTIVE) return;
      if (previewZoomScaleRef.current <= MIN_PREVIEW_ZOOM_SCALE) {
        previewPanX.setValue(0);
        previewPanY.setValue(0);
        return;
      }

      const nextRawX = previewPanOffsetRef.current.x + (Number(translationX) || 0);
      const nextRawY = previewPanOffsetRef.current.y + (Number(translationY) || 0);
      const nextOffset = clampPreviewPan(nextRawX, nextRawY);
      previewPanOffsetRef.current = nextOffset;
      previewTranslateX.setValue(nextOffset.x);
      previewTranslateY.setValue(nextOffset.y);
      previewPanX.setValue(0);
      previewPanY.setValue(0);
    },
    [clampPreviewPan, previewPanX, previewPanY, previewTranslateX, previewTranslateY]
  );

  const onPreviewPinchGestureEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { scale: previewPinchScale } }], {
        useNativeDriver: false,
      }),
    [previewPinchScale]
  );

  const onPreviewPinchStateChange = useCallback(
    (event) => {
      const { oldState, scale } = event.nativeEvent;
      if (oldState !== State.ACTIVE) return;
      const pinchScale = Number(scale) || 1;
      const nextScale = previewZoomScaleRef.current * pinchScale;
      applyPreviewZoomScale(nextScale);
    },
    [applyPreviewZoomScale]
  );

  const handlePreviewZoomIn = useCallback(() => {
    applyPreviewZoomScale(previewZoomScaleRef.current * 1.25);
  }, [applyPreviewZoomScale]);

  const handlePreviewZoomOut = useCallback(() => {
    applyPreviewZoomScale(previewZoomScaleRef.current / 1.25);
  }, [applyPreviewZoomScale]);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission refusée', 'Autorisez l\'accès au microphone');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setIsRecording(true);
      setDuration(0);

      intervalRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      console.error('Erreur démarrage:', err);
      Alert.alert('Erreur', 'Impossible de démarrer l\'enregistrement');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    clearInterval(intervalRef.current);
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        Alert.alert('Erreur', 'Enregistrement introuvable');
        return;
      }

      const persisted = await persistRecordingFile(uri).catch(() => null);
      const uploadUri = persisted?.uri || uri;
      const createdAt = new Date().toISOString();
      const recordingItem = {
        id: persisted?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        uri: persisted?.uri || uri,
        fileName: persisted?.fileName || null,
        created_at: createdAt,
        duration_seconds: Number.isFinite(duration) ? Math.round(duration) : null,
      };

      if (prelinkedTranscriptionId) {
        await addRecordingToLibrary(prelinkedTranscriptionId, recordingItem);
      }

      // Upload
      await uploadAudio(uploadUri, {
        durationSeconds: duration,
        localRecording: persisted,
        recordingItem,
        prelinkedTranscriptionId,
      });
    } catch (err) {
      console.error('Erreur arrêt:', err);
      Alert.alert('Erreur', 'Erreur lors de l\'arrêt');
    }
  };

  const uploadAudio = async (uri, meta = {}) => {
    setUploading(true);
    try {
      if (!uri) {
        throw new Error('Audio URI manquante');
      }
      const formData = new FormData();
      formData.append('audio', {
        uri,
        type: 'audio/m4a',
        name: `recording_${Date.now()}.m4a`,
      });
      if (prelinkedTranscriptionId) {
        formData.append('transcription_id', prelinkedTranscriptionId);
      }

      const response = await audio.upload(formData);

      const resolvedTranscriptionId =
        prelinkedTranscriptionId || resolveTranscriptionId(response?.data);

      if (resolvedTranscriptionId) {
        const recordingItem = meta?.recordingItem || {
          id: meta?.localRecording?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          uri: meta?.localRecording?.uri || uri,
          fileName: meta?.localRecording?.fileName || null,
          transcription_id: resolvedTranscriptionId,
          created_at: new Date().toISOString(),
          duration_seconds: Number.isFinite(meta?.durationSeconds)
            ? Math.round(meta.durationSeconds)
            : null,
        };
        const resolvedKey = String(resolvedTranscriptionId);
        const prelinkedKey = meta?.prelinkedTranscriptionId
          ? String(meta.prelinkedTranscriptionId)
          : null;
        if (!prelinkedKey || resolvedKey !== prelinkedKey) {
          await addRecordingToLibrary(resolvedKey, recordingItem);
        }
      }
      
      Alert.alert('Envoyé !', 'Votre audio est en cours de transcription', [
        {
          text: 'OK',
          onPress: () => {
            const numericTranscriptionId = Number(resolvedTranscriptionId);
            if (returnToCreate && Number.isFinite(numericTranscriptionId)) {
              navigation.navigate({
                name: 'CreateTranscriptionScreen',
                params: {
                  transcriptionId: numericTranscriptionId,
                  recordUploadAt: Date.now(),
                },
                merge: true,
              });
              return;
            }

            if (returnToTranscriptionDetail && Number.isFinite(numericTranscriptionId)) {
              navigation.navigate({
                name: 'TranscriptionDetailScreen',
                params: {
                  transcriptionId: numericTranscriptionId,
                  recordUploadAt: Date.now(),
                },
                merge: true,
              });
              return;
            }

            if (returnToGenerationRequest && Number.isFinite(numericTranscriptionId)) {
              if (typeof navigation.popTo === 'function') {
                navigation.popTo('GenerationRequestScreen', {
                  transcriptionId: numericTranscriptionId,
                  recordUploadAt: Date.now(),
                });
                return;
              }

              navigation.navigate({
                name: 'GenerationRequestScreen',
                params: {
                  transcriptionId: numericTranscriptionId,
                  recordUploadAt: Date.now(),
                },
                merge: true,
              });
              return;
            }

            navigation.goBack();
          },
        },
      ]);
    } catch (err) {
      console.error('Erreur upload:', err);
      const apiMessage =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Échec de l'envoi du vocal.";
      Alert.alert('Erreur', apiMessage);
    } finally {
      setUploading(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const cancelRecording = async () => {
    if (recording) {
      clearInterval(intervalRef.current);
      await recording.stopAndUnloadAsync();
      setRecording(null);
      setIsRecording(false);
      setDuration(0);
    }
    navigation.goBack();
  };

  if (uploading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.uploadingText}>Envoi en cours...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={[styles.closeButton, { top: Math.max(insets.top, 18) }]} onPress={cancelRecording}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <View style={[styles.content, { paddingTop: Math.max(72, insets.top + 44) }]}>
        <Text style={styles.title}>
          {isRecording ? 'Enregistrement...' : 'Prêt à enregistrer'}
        </Text>

        {transcriptionId && (
          <Text style={styles.contextText}>
            Complément vocal pour la transcription #{transcriptionId}
          </Text>
        )}

        <Text style={styles.duration}>{formatDuration(duration)}</Text>

        <View style={styles.previewCard}>
          <View style={styles.previewHeaderRow}>
            <Text style={styles.previewTitle}>Formulaire sous les yeux</Text>
            <TouchableOpacity
              style={styles.previewPickerButton}
              onPress={() => setFormPickerVisible(true)}
              disabled={formsLoading}
            >
              <Text style={styles.previewPickerButtonText}>
                {selectedForm ? 'Changer' : 'Choisir'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text numberOfLines={1} style={styles.previewName}>
            {selectedForm?.title || 'Aucun formulaire sélectionné'}
          </Text>
          <View style={styles.previewFrame} onLayout={onPreviewFrameLayout}>
            {formsLoading || previewLoading ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : previewUri ? (
              <>
                <PanGestureHandler
                  ref={previewPanRef}
                  simultaneousHandlers={previewPinchRef}
                  enabled={previewZoomScale > MIN_PREVIEW_ZOOM_SCALE + 0.01}
                  onGestureEvent={onPreviewPanGestureEvent}
                  onHandlerStateChange={onPreviewPanStateChange}
                >
                  <Animated.View style={styles.previewGestureHost}>
                    <PinchGestureHandler
                      ref={previewPinchRef}
                      simultaneousHandlers={previewPanRef}
                      onGestureEvent={onPreviewPinchGestureEvent}
                      onHandlerStateChange={onPreviewPinchStateChange}
                    >
                      <Animated.View
                        style={[
                          styles.previewZoomContent,
                          {
                            transform: [
                              { translateX: previewTranslateXAnim },
                              { translateY: previewTranslateYAnim },
                              { scale: previewZoomAnim },
                            ],
                          },
                        ]}
                      >
                        <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
                      </Animated.View>
                    </PinchGestureHandler>
                  </Animated.View>
                </PanGestureHandler>
                <View style={styles.previewZoomControls}>
                  <TouchableOpacity style={styles.previewZoomButton} onPress={handlePreviewZoomOut}>
                    <Text style={styles.previewZoomButtonText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.previewZoomValueButton} onPress={resetPreviewZoom}>
                    <Text style={styles.previewZoomValueText}>{Math.round(previewZoomScale * 100)}%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.previewZoomButton} onPress={handlePreviewZoomIn}>
                    <Text style={styles.previewZoomButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={styles.previewPlaceholder}>
                Importe un formulaire puis sélectionne-le ici pour l’avoir pendant l’enregistrement.
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.controlsArea, { paddingBottom: Math.max(28, insets.bottom + 12) }]}>
        <View style={styles.controls}>
          {!isRecording ? (
            <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
              <View style={styles.recordInner} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
              <View style={styles.stopInner} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.hint}>
          {isRecording
            ? 'Appuyez pour arrêter et envoyer'
            : 'Appuyez pour commencer'}
        </Text>
      </View>

      <SelectionModal
        visible={formPickerVisible}
        title="Choisir un formulaire"
        subtitle="Référence affichée pendant l’enregistrement"
        items={formItems}
        loading={formsLoading}
        onSelect={(item) => {
          const id = Number(item?.id);
          if (Number.isFinite(id)) setSelectedFormId(id);
          setFormPickerVisible(false);
        }}
        onClose={() => setFormPickerVisible(false)}
        searchPlaceholder="Rechercher un formulaire..."
        emptyText="Aucun formulaire disponible"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    padding: 10,
    zIndex: 20,
  },
  closeText: {
    color: '#fff',
    fontSize: 24,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  contextText: {
    color: '#A5B4FC',
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  duration: {
    color: '#4F46E5',
    fontSize: 54,
    fontWeight: '200',
    marginBottom: 12,
    textAlign: 'center',
  },
  previewCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 12,
    minHeight: 250,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '700',
  },
  previewPickerButton: {
    borderWidth: 1,
    borderColor: 'rgba(165,180,252,0.75)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(79,70,229,0.24)',
  },
  previewPickerButtonText: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '700',
  },
  previewName: {
    marginTop: 8,
    marginBottom: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  previewFrame: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 170,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewGestureHost: {
    width: '100%',
    height: '100%',
  },
  previewZoomContent: {
    width: '100%',
    height: '100%',
  },
  previewZoomControls: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.68)',
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  previewZoomButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  previewZoomButtonText: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  previewZoomValueButton: {
    marginHorizontal: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  previewZoomValueText: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '700',
  },
  previewPlaceholder: {
    color: '#4B5563',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 14,
    lineHeight: 18,
  },
  controlsArea: {
    alignItems: 'center',
    paddingTop: 10,
  },
  controls: {
    marginBottom: 16,
  },
  recordButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EF4444',
  },
  stopButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopInner: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EF4444',
  },
  hint: {
    color: '#666',
    fontSize: 15,
    textAlign: 'center',
  },
  uploadingText: {
    color: '#4F46E5',
    fontSize: 18,
    marginTop: 20,
  },
});
