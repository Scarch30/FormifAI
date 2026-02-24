import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';
import { ocrDocuments } from '../../api/client';

const buildImageAsset = (asset, index = 0) => {
  if (!asset?.uri) return null;
  return {
    uri: asset.uri,
    type: asset.type || asset.mimeType || 'image/jpeg',
    fileName: asset.fileName || asset.name || `photo-${index}.jpg`,
  };
};

const defaultTitle = () => {
  const date = new Date();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `Scan du ${dd}/${mm}/${yyyy}`;
};

export default function CreateOcrScreen({ navigation }) {
  const [title, setTitle] = useState(defaultTitle());
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const canSubmit = useMemo(() => images.length > 0, [images.length]);

  const addCameraImage = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission requise', "Autorisez l'acces camera pour continuer.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images,
        quality: 0.8,
      });

      if (result?.canceled || result?.cancelled) return;
      const assets = result?.assets || [result];
      const next = assets.map((asset, index) => buildImageAsset(asset, images.length + index)).filter(Boolean);
      setImages((prev) => [...prev, ...next]);
    } catch (error) {
      console.error('Erreur camera OCR:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la camera");
    }
  };

  const addGalleryImages = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission requise', "Autorisez l'acces galerie pour continuer.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
      });

      if (result?.canceled || result?.cancelled) return;
      const assets = result?.assets || [result];
      const next = assets.map((asset, index) => buildImageAsset(asset, images.length + index)).filter(Boolean);
      setImages((prev) => [...prev, ...next]);
    } catch (error) {
      console.error('Erreur galerie OCR:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie");
    }
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!canSubmit) return;

    setSaving(true);
    try {
      const response = await ocrDocuments.createOcrDocument(title.trim() || defaultTitle(), images);
      const created = response?.data?.data || response?.data?.item || response?.data;
      const createdId = Number(created?.id);

      if (!Number.isFinite(createdId)) {
        Alert.alert('Info', 'Scan envoye, mais identifiant indisponible.');
        navigation.goBack();
        return;
      }

      const status = String(created?.status || '').toLowerCase();
      if (status === 'done' || status === 'completed') {
        navigation.replace('OcrDetailScreen', { ocrId: createdId });
        return;
      }

      setProcessingId(createdId);
    } catch (error) {
      console.error('Erreur creation OCR:', error);
      Alert.alert('Erreur', "Impossible d'analyser ce document");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!processingId) return undefined;

    const interval = setInterval(async () => {
      try {
        const response = await ocrDocuments.getOcrDocument(processingId);
        const item = response?.data?.data || response?.data?.item || response?.data;
        const status = String(item?.status || '').toLowerCase();
        if (status === 'done' || status === 'completed') {
          clearInterval(interval);
          setProcessingId(null);
          navigation.replace('OcrDetailScreen', { ocrId: Number(item?.id || processingId) });
          return;
        }
        if (status === 'error') {
          clearInterval(interval);
          setProcessingId(null);
          Alert.alert('Erreur', "Le traitement OCR a echoue.");
        }
      } catch (error) {
        console.error('Erreur polling OCR creation:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [navigation, processingId]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionCard title="Nouveau scan OCR" subtitle="Photographiez un document pour extraire automatiquement son texte.">
        <Text style={styles.label}>Titre</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={defaultTitle()}
          placeholderTextColor={Colors.textTertiary}
        />

        <View style={styles.captureRow}>
          <TouchableOpacity style={styles.captureButton} onPress={addCameraImage}>
            <Text style={styles.captureButtonText}>📸 Prendre une photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureButton} onPress={addGalleryImages}>
            <Text style={styles.captureButtonText}>🖼️ Importer depuis la galerie</Text>
          </TouchableOpacity>
        </View>

        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagesRow}>
            {images.map((img, index) => (
              <View key={`${img.uri}-${index}`} style={styles.thumbWrap}>
                <Image source={{ uri: img.uri }} style={styles.thumbnail} />
                <TouchableOpacity style={styles.removeButton} onPress={() => removeImage(index)}>
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addMoreButton} onPress={addGalleryImages}>
              <Text style={styles.addMoreText}>+</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <Text style={styles.hintText}>Aucune image ajoutee.</Text>
        )}
      </SectionCard>

      {processingId ? (
        <SectionCard>
          <View style={styles.processingWrap}>
            <ActivityIndicator color={Colors.warning} />
            <Text style={styles.processingText}>Analyse OCR en cours...</Text>
          </View>
        </SectionCard>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryButton, (!canSubmit || saving || Boolean(processingId)) && styles.primaryButtonDisabled]}
        onPress={submit}
        disabled={!canSubmit || saving || Boolean(processingId)}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Analyser le document</Text>
        )}
      </TouchableOpacity>
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
  label: {
    marginBottom: 6,
    color: Colors.text,
    fontSize: 13,
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
  captureRow: {
    gap: 8,
  },
  captureButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  captureButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  hintText: {
    marginTop: 10,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  imagesRow: {
    marginTop: 12,
    gap: 8,
    alignItems: 'center',
  },
  thumbWrap: {
    position: 'relative',
  },
  thumbnail: {
    width: 90,
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F3F4F6',
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 14,
  },
  addMoreButton: {
    width: 90,
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreText: {
    color: Colors.primary,
    fontSize: 28,
    lineHeight: 28,
  },
  processingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  processingText: {
    color: Colors.textSecondary,
    fontSize: 14,
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
});
