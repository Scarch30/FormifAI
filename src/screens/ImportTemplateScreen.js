import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { templates } from '../api/client';

const buildFileFromAsset = (asset, fallbackKind) => {
  if (!asset) return null;
  const uri = asset.uri || asset.fileCopyUri || asset.fileUri;
  if (!uri) return null;
  const rawName = asset.name || asset.fileName || uri.split('/').pop();
  let name = rawName || `template_${Date.now()}`;
  const mimeType = asset.mimeType || asset.type || '';
  const probe = `${mimeType} ${name}`.toLowerCase();
  let kind = fallbackKind;
  if (probe.includes('pdf')) {
    kind = 'pdf';
  } else if (!kind && probe.match(/(png|jpg|jpeg|gif|webp|heic|image)/)) {
    kind = 'image';
  }
  if (!kind) kind = 'image';

  let finalType = mimeType;
  if (!finalType) {
    finalType = kind === 'pdf' ? 'application/pdf' : 'image/jpeg';
  }
  if (!name.includes('.')) {
    name = kind === 'pdf' ? `${name}.pdf` : `${name}.jpg`;
  }

  return {
    uri,
    name,
    mimeType: finalType,
    kind,
  };
};

export default function ImportTemplateScreen({ navigation }) {
  const [templateName, setTemplateName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handlePickCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission refusee', 'Autorisez l\'acces a la camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images,
        quality: 0.8,
      });

      if (result.canceled || result.cancelled) return;
      const asset = result.assets?.[0] || result;
      const file = buildFileFromAsset(asset, 'image');
      if (!file) {
        Alert.alert('Erreur', 'Fichier introuvable');
        return;
      }
      setSelectedFile(file);
    } catch (error) {
      console.error('Erreur camera:', error);
      Alert.alert('Erreur', 'Impossible d\'ouvrir la camera');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.cancelled) return;
      if (result.type === 'cancel') return;

      const asset = result.assets?.[0] || result;
      const file = buildFileFromAsset(asset);
      if (!file) {
        Alert.alert('Erreur', 'Fichier introuvable');
        return;
      }
      setSelectedFile(file);
    } catch (error) {
      console.error('Erreur fichier:', error);
      Alert.alert('Erreur', 'Impossible d\'ouvrir le fichier');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert('Erreur', 'Veuillez choisir un fichier');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: selectedFile.uri,
        type: selectedFile.mimeType,
        name: selectedFile.name,
      });

      if (templateName.trim()) {
        formData.append('name', templateName.trim());
      }

      await templates.upload(formData);
      Alert.alert('Importe', 'Formulaire importe avec succes', [
        { text: 'OK', onPress: () => navigation.navigate('TemplatesScreen', { tab: 'templates' }) },
      ]);
    } catch (error) {
      console.error('Erreur upload:', error);
      Alert.alert('Erreur', 'Echec de l\'import');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Importer un formulaire</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Nom du formulaire (optionnel)</Text>
        <TextInput
          style={styles.input}
          placeholder="Nom du formulaire"
          value={templateName}
          onChangeText={setTemplateName}
        />

        <TouchableOpacity style={styles.actionButton} onPress={handlePickCamera}>
          <Text style={styles.actionButtonText}>Prendre une photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handlePickDocument}>
          <Text style={styles.actionButtonText}>Choisir un fichier</Text>
        </TouchableOpacity>

        {selectedFile && (
          <View style={styles.preview}>
            {selectedFile.kind === 'image' ? (
              <Image source={{ uri: selectedFile.uri }} style={styles.previewImage} />
            ) : (
              <View style={styles.pdfPreview}>
                <Text style={styles.pdfIcon}>PDF</Text>
              </View>
            )}
            <Text style={styles.previewName} numberOfLines={1}>
              {selectedFile.name}
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.importButton, (!selectedFile || uploading) && styles.importButtonDisabled]}
        onPress={handleUpload}
        disabled={!selectedFile || uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.importButtonText}>Importer</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#4F46E5',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    color: '#fff',
    fontSize: 22,
  },
  content: {
    padding: 20,
  },
  label: {
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7FF',
  },
  actionButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  preview: {
    marginTop: 10,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#E5E7FF',
  },
  pdfPreview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#E5E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4F46E5',
  },
  previewName: {
    marginTop: 10,
    color: '#555',
  },
  importButton: {
    margin: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  importButtonDisabled: {
    backgroundColor: '#A5B4FC',
  },
  importButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
