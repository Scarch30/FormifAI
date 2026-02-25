import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { audio, templates } from '../../api/client';
import ZoomableImageViewer from '../../components/ZoomableImageViewer';

const buildSupportFromAsset = (asset, fallbackKind = 'image') => {
  const uri = asset?.uri || asset?.fileCopyUri || asset?.fileUri || '';
  if (!uri) return null;

  const rawName = String(asset?.name || asset?.fileName || uri.split('/').pop() || '').trim();
  const mimeType = String(asset?.mimeType || asset?.type || '').toLowerCase();
  const probe = `${mimeType} ${rawName}`.toLowerCase();

  const kind = probe.includes('pdf') ? 'pdf' : fallbackKind;

  const name = rawName || `support-${Date.now()}${kind === 'pdf' ? '.pdf' : '.jpg'}`;
  const safeType = mimeType || (kind === 'pdf' ? 'application/pdf' : 'image/jpeg');

  return {
    uri,
    name,
    kind,
    mimeType: safeType,
  };
};

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

const toNumericId = (...candidates) => {
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const extractPreviewTemplateId = (payload) => {
  const root = payload || {};
  const documentItem = root?.document || {};
  const templateItem = root?.template || {};
  const nestedData = root?.data || {};
  const nestedItem = root?.item || {};

  const rootKind = String(root?.kind || '').toLowerCase();
  const nestedKind = String(nestedData?.kind || nestedItem?.kind || '').toLowerCase();

  return toNumericId(
    documentItem?.id,
    templateItem?.id,
    root?.document_id,
    root?.documentId,
    root?.template_id,
    root?.templateId,
    nestedData?.document_id,
    nestedData?.documentId,
    nestedData?.template_id,
    nestedData?.templateId,
    nestedData?.document?.id,
    nestedData?.template?.id,
    nestedItem?.document_id,
    nestedItem?.documentId,
    nestedItem?.template_id,
    nestedItem?.templateId,
    nestedItem?.document?.id,
    nestedItem?.template?.id,
    rootKind === 'document' || rootKind === 'template' ? root?.id : null,
    nestedKind === 'document' || nestedKind === 'template' ? nestedData?.id || nestedItem?.id : null
  );
};

const formatDuration = (seconds) => {
  const safeSeconds = Number(seconds);
  if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) return '00:00';
  const minutes = Math.floor(safeSeconds / 60);
  const remain = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
};

const PREVIEW_IMAGE_RETRY_COUNT = 6;
const PREVIEW_IMAGE_RETRY_DELAY_MS = 900;
const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

export default function GenerationRecordScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [supportFile, setSupportFile] = useState(null);
  const [supportPreviewUri, setSupportPreviewUri] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  const intervalRef = useRef(null);
  const recordingRef = useRef(null);

  const supportLabel = useMemo(() => {
    if (!supportFile) return 'Aucun support sélectionné';
    return supportFile?.name || 'Support importé';
  }, [supportFile]);

  useEffect(
    () => () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (recordingRef.current) {
        recordingRef.current
          .stopAndUnloadAsync()
          .then(() => Audio.setAudioModeAsync({ allowsRecordingIOS: false }))
          .catch(() => {});
        recordingRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    const resolveSupportPreview = async () => {
      if (!supportFile) {
        if (isMounted) {
          setSupportPreviewUri('');
          setPdfLoading(false);
          setPdfError(false);
        }
        return;
      }

      setSupportPreviewUri('');
      setPdfError(false);

      if (supportFile.kind === 'image') {
        if (isMounted) {
          setSupportPreviewUri(supportFile.uri);
          setPdfLoading(false);
        }
        return;
      }

      if (supportFile.kind !== 'pdf') {
        if (isMounted) setPdfLoading(false);
        return;
      }

      setPdfLoading(true);
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: supportFile.uri,
          type: supportFile.mimeType || 'application/pdf',
          name: supportFile.name || `support_${Date.now()}.pdf`,
        });
        formData.append('kind', 'document');

        const uploadResponse = await templates.upload(formData);
        const uploadPayload = uploadResponse?.data?.data || uploadResponse?.data || {};
        const previewTemplateId = extractPreviewTemplateId(uploadPayload);
        if (!Number.isFinite(previewTemplateId)) {
          throw new Error("Impossible de récupérer l'identifiant de prévisualisation.");
        }

        const cacheDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!cacheDirectory) {
          throw new Error('Stockage local indisponible.');
        }

        const localPreviewUri = `${cacheDirectory}generation_support_${previewTemplateId}_p1.png`;
        let resolvedLocalUri = '';

        for (let attempt = 1; attempt <= PREVIEW_IMAGE_RETRY_COUNT && !resolvedLocalUri; attempt += 1) {
          const candidateList = await templates.getPageImageUrlCandidates(
            previewTemplateId,
            1,
            supportFile.name || ''
          );
          const fallbackCandidate = await templates.getPageImageUrl(previewTemplateId, 1);
          if (fallbackCandidate) candidateList.push(fallbackCandidate);

          for (const candidate of candidateList) {
            const cacheBustedCandidate = `${candidate}${candidate.includes('?') ? '&' : '?'}_ts=${Date.now()}`;
            try {
              const downloadResult = await FileSystem.downloadAsync(cacheBustedCandidate, localPreviewUri);
              const statusCode = Number(downloadResult?.status ?? 0);
              if (statusCode >= 200 && statusCode < 300) {
                resolvedLocalUri = downloadResult?.uri || localPreviewUri;
                break;
              }
            } catch (_downloadError) {
              // try next candidate
            }
          }

          if (!resolvedLocalUri && attempt < PREVIEW_IMAGE_RETRY_COUNT) {
            await wait(PREVIEW_IMAGE_RETRY_DELAY_MS);
          }
        }

        if (!resolvedLocalUri) {
          throw new Error("L'image PNG d'aperçu n'est pas encore disponible.");
        }

        if (isMounted) {
          setSupportPreviewUri(resolvedLocalUri);
        }
      } catch (error) {
        console.error('Erreur conversion aperçu PDF génération:', error);
        if (isMounted) {
          setPdfError(true);
          setSupportPreviewUri('');
        }
      } finally {
        if (isMounted) setPdfLoading(false);
      }
    };

    resolveSupportPreview();
    return () => {
      isMounted = false;
    };
  }, [supportFile]);

  const closeScreen = async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch (_error) {
        // no-op
      }
      recordingRef.current = null;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsRecording(false);
    navigation.goBack();
  };

  const pickFromCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission requise', "Autorisez l'accès caméra.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });

      if (result?.canceled) return;
      const asset = result?.assets?.[0] || null;
      const parsed = buildSupportFromAsset(asset, 'image');
      if (!parsed) return;
      setPdfError(false);
      setSupportFile(parsed);
    } catch (error) {
      console.error('Erreur caméra support dictée:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la caméra.");
    }
  };

  const pickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission requise', "Autorisez l'accès galerie.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsMultipleSelection: false,
      });

      if (result?.canceled) return;
      const asset = result?.assets?.[0] || null;
      const parsed = buildSupportFromAsset(asset, 'image');
      if (!parsed) return;
      setPdfError(false);
      setSupportFile(parsed);
    } catch (error) {
      console.error('Erreur galerie support dictée:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie.");
    }
  };

  const pickPdfOrImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result?.canceled) return;

      const asset = result?.assets?.[0] || null;
      const parsed = buildSupportFromAsset(asset, 'image');
      if (!parsed) return;
      setPdfError(false);
      setSupportFile(parsed);
    } catch (error) {
      console.error('Erreur import support dictée:', error);
      Alert.alert('Erreur', "Impossible d'importer ce support.");
    }
  };

  const openSupportPicker = () => {
    Alert.alert(
      'Choisir un support visuel',
      '',
      [
        { text: '📸 Caméra', onPress: pickFromCamera },
        { text: '🖼️ Galerie', onPress: pickFromGallery },
        { text: '📄 PDF / Fichier', onPress: pickPdfOrImage },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission refusée', "L'accès au microphone est requis.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: nextRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = nextRecording;
      setIsRecording(true);
      setDurationSec(0);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        setDurationSec((value) => value + 1);
      }, 1000);
    } catch (error) {
      console.error('Erreur démarrage enregistrement génération:', error);
      Alert.alert('Erreur', "Impossible de démarrer l'enregistrement.");
    }
  };

  const navigateBackWithTranscription = (transcriptionId) => {
    const numericTranscriptionId = Number(transcriptionId);
    if (!Number.isFinite(numericTranscriptionId)) {
      navigation.goBack();
      return;
    }

    const params = {
      transcriptionId: numericTranscriptionId,
      recordUploadAt: Date.now(),
    };

    if (typeof navigation.popTo === 'function') {
      navigation.popTo('GenerationRequestScreen', params);
      return;
    }

    navigation.navigate({
      name: 'GenerationRequestScreen',
      params,
      merge: true,
    });
  };

  const uploadRecording = async (uri) => {
    if (!uri) {
      Alert.alert('Erreur', 'Enregistrement introuvable.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('audio', {
        uri,
        type: 'audio/m4a',
        name: `generation_recording_${Date.now()}.m4a`,
      });

      const response = await audio.upload(formData);
      const resolvedTranscriptionId = resolveTranscriptionId(response?.data);

      Alert.alert('Envoyé', 'Votre audio est en cours de transcription.', [
        {
          text: 'OK',
          onPress: () => navigateBackWithTranscription(resolvedTranscriptionId),
        },
      ]);
    } catch (error) {
      console.error('Erreur upload audio génération:', error);
      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "Échec de l'envoi du vocal.";
      Alert.alert('Erreur', apiMessage);
    } finally {
      setUploading(false);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsRecording(false);

    try {
      const activeRecording = recordingRef.current;
      recordingRef.current = null;
      await activeRecording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = activeRecording.getURI();
      await uploadRecording(uri);
    } catch (error) {
      console.error('Erreur arrêt enregistrement génération:', error);
      Alert.alert('Erreur', "Impossible d'arrêter l'enregistrement.");
      recordingRef.current = null;
    }
  };

  const renderSupportPreview = () => {
    if (!supportFile) {
      return (
        <Text style={styles.previewPlaceholder}>
          Importez une image ou un PDF pour l'avoir sous les yeux pendant la dictée.
        </Text>
      );
    }

    if (supportPreviewUri) {
      return (
        <ZoomableImageViewer
          uri={supportPreviewUri}
          frameStyle={styles.previewZoomViewer}
          placeholder="Aperçu indisponible."
          onImageError={() => {
            setSupportPreviewUri('');
            if (supportFile?.kind === 'pdf') {
              setPdfError(true);
            }
          }}
        />
      );
    }

    if (supportFile.kind === 'pdf') {
      if (pdfLoading) {
        return (
          <View style={styles.pdfLoadingState}>
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text style={styles.pdfLoaderText}>Conversion PDF en image...</Text>
          </View>
        );
      }

      if (pdfError) {
        return (
          <View style={styles.pdfFallback}>
            <Text style={styles.pdfFallbackIcon}>PDF</Text>
            <Text numberOfLines={2} style={styles.pdfFallbackText}>
              {supportFile.name}
            </Text>
            <Text style={styles.pdfFallbackHint}>Aperçu indisponible sur cet appareil.</Text>
          </View>
        );
      }
    }

    return null;
  };

  if (uploading) {
    return (
      <View style={styles.uploadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.uploadingText}>Envoi en cours...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={[styles.closeButton, { top: Math.max(insets.top, 18) }]} onPress={closeScreen}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <View style={[styles.content, { paddingTop: Math.max(72, insets.top + 44) }]}>
        <Text style={styles.title}>{isRecording ? 'Enregistrement...' : 'Dictée formulaire'}</Text>
        <Text style={styles.duration}>{formatDuration(durationSec)}</Text>

        <View style={styles.previewCard}>
          <View style={styles.previewHeaderRow}>
            <Text style={styles.previewTitle}>Support visuel</Text>
            <TouchableOpacity style={styles.previewPickerButton} onPress={openSupportPicker}>
              <Text style={styles.previewPickerButtonText}>{supportFile ? 'Changer' : 'Importer'}</Text>
            </TouchableOpacity>
          </View>
          <Text numberOfLines={1} style={styles.previewName}>
            {supportLabel}
          </Text>
          <View style={styles.previewFrame}>{renderSupportPreview()}</View>
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
          {isRecording ? 'Appuyez pour arrêter et envoyer' : 'Appuyez pour commencer'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  uploadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingText: {
    marginTop: 12,
    color: '#fff',
    fontSize: 16,
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
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
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
    marginTop: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  previewFrame: {
    marginTop: 10,
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.45)',
    minHeight: 210,
  },
  previewZoomViewer: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 0,
    backgroundColor: 'transparent',
  },
  previewPlaceholder: {
    color: '#CBD5E1',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 18,
  },
  pdfLoadingState: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    gap: 8,
  },
  pdfLoaderText: {
    color: '#E2E8F0',
    fontSize: 12,
  },
  pdfFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pdfFallbackIcon: {
    color: '#E2E8F0',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  pdfFallbackText: {
    color: '#E2E8F0',
    fontSize: 13,
    textAlign: 'center',
  },
  pdfFallbackHint: {
    marginTop: 8,
    color: '#94A3B8',
    fontSize: 12,
  },
  controlsArea: {
    paddingHorizontal: 24,
  },
  controls: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  recordInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  stopButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  stopInner: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  hint: {
    marginTop: 14,
    color: '#CBD5E1',
    textAlign: 'center',
    fontSize: 14,
  },
});
