import React, { useCallback, useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { templates } from '../../api/client';
import formsScreenService from '../../api/formsScreenService';
import Colors from '../../constants/Colors';
import SectionCard from '../../components/SectionCard';

const MAX_MULTI_PAGES = 20;
const SUPPORTED_MULTI_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const buildFileFromAsset = (asset, fallbackKind) => {
  if (!asset) return null;
  const uri = asset.uri || asset.fileCopyUri || asset.fileUri;
  if (!uri) return null;
  const rawName = asset.name || asset.fileName || uri.split('/').pop();
  let name = rawName || `template_${Date.now()}`;
  const mimeType = asset.mimeType || asset.type || '';
  const probe = `${mimeType} ${name}`.toLowerCase();
  let kind = fallbackKind;
  if (probe.includes('pdf')) kind = 'pdf';
  if (!kind) kind = probe.match(/(png|jpg|jpeg|gif|webp|heic|image)/) ? 'image' : 'pdf';

  let finalType = mimeType;
  if (!finalType) finalType = kind === 'pdf' ? 'application/pdf' : 'image/jpeg';
  if (!name.includes('.')) name = kind === 'pdf' ? `${name}.pdf` : `${name}.jpg`;

  return { uri, name, mimeType: finalType, kind };
};

const getLowerFileExtension = (value) => {
  const raw = String(value || '');
  const dotIndex = raw.lastIndexOf('.');
  if (dotIndex < 0) return '';
  return raw.slice(dotIndex).toLowerCase();
};

const isSupportedMultiImage = (assetLike) => {
  const rawType = String(assetLike?.mimeType || assetLike?.type || '').toLowerCase();
  if (rawType === 'image/jpeg' || rawType === 'image/jpg' || rawType === 'image/png') {
    return true;
  }
  const ext = getLowerFileExtension(assetLike?.name || assetLike?.fileName || assetLike?.uri);
  return SUPPORTED_MULTI_IMAGE_EXTENSIONS.has(ext);
};

const buildMultiImageFromAsset = (asset, index = 0) => {
  if (!asset) return null;
  const uri = asset.uri || asset.fileCopyUri || asset.fileUri;
  if (!uri) return null;

  const fallbackBaseName = `page-${index + 1}`;
  const rawName = String(asset.name || asset.fileName || `${fallbackBaseName}.jpg`);
  const ext = getLowerFileExtension(rawName || uri);
  const safeExt = ext && SUPPORTED_MULTI_IMAGE_EXTENSIONS.has(ext) ? ext : '.jpg';

  let mimeType = String(asset.mimeType || asset.type || '').toLowerCase();
  if (!mimeType || mimeType === 'image/jpg') {
    mimeType = safeExt === '.png' ? 'image/png' : 'image/jpeg';
  }

  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
    mimeType = safeExt === '.png' ? 'image/png' : 'image/jpeg';
  }

  const baseName = rawName.includes('.') ? rawName.slice(0, rawName.lastIndexOf('.')) : rawName;
  const normalizedName = `${baseName || fallbackBaseName}${safeExt}`;

  return {
    uri,
    name: normalizedName,
    mimeType,
    kind: 'image',
  };
};

const toId = (...candidates) => {
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const extractDocumentId = (payload) => {
  const root = payload || {};
  const doc = root?.document || {};
  const item = root?.item || {};
  const data = root?.data || {};

  const rootKind = String(root?.kind || '').toLowerCase();
  const itemKind = String(item?.kind || '').toLowerCase();
  const dataKind = String(data?.kind || '').toLowerCase();

  return toId(
    doc?.id,
    root?.document_id,
    root?.documentId,
    item?.document_id,
    item?.documentId,
    data?.document_id,
    data?.documentId,
    data?.document?.id,
    rootKind === 'document' ? root?.id : null,
    itemKind === 'document' ? item?.id : null,
    dataKind === 'document' ? data?.id : null
  );
};

const extractTemplateId = (payload) => {
  const root = payload || {};
  const tpl = root?.template || {};
  const item = root?.item || {};
  const data = root?.data || {};

  const rootKind = String(root?.kind || '').toLowerCase();
  const itemKind = String(item?.kind || '').toLowerCase();
  const dataKind = String(data?.kind || '').toLowerCase();

  return toId(
    tpl?.id,
    root?.template_id,
    root?.templateId,
    item?.template_id,
    item?.templateId,
    data?.template_id,
    data?.templateId,
    data?.template?.id,
    rootKind === 'template' ? root?.id : null,
    itemKind === 'template' ? item?.id : null,
    dataKind === 'template' ? data?.id : null
  );
};

const extractAppliedTemplateId = (payload) => {
  const root = payload || {};
  const doc = root?.document || {};
  const item = root?.item || {};
  const data = root?.data || {};

  return toId(
    root?.applied_template_id,
    root?.appliedTemplateId,
    doc?.applied_template_id,
    doc?.appliedTemplateId,
    item?.applied_template_id,
    item?.appliedTemplateId,
    data?.applied_template_id,
    data?.appliedTemplateId,
    data?.document?.applied_template_id,
    data?.document?.appliedTemplateId
  );
};

export default function ImportFormScreen({ navigation }) {
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [multiFiles, setMultiFiles] = useState([]);
  const [multiUploading, setMultiUploading] = useState(false);
  const [multiUploadProgress, setMultiUploadProgress] = useState(0);

  const goToDocumentsList = useCallback(() => {
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'FormsListScreen',
          params: { tab: 'documents' },
        },
      ],
    });
  }, [navigation]);

  const ensureTemplateAssociatedToDocument = useCallback(async (documentId, preferredTemplateId = null) => {
    let templateId = toId(preferredTemplateId);

    if (!templateId) {
      const cloneTemplateResponse = await formsScreenService.cloneAsTemplateFromDocument(documentId);
      const cloneTemplatePayload = cloneTemplateResponse?.data?.data || cloneTemplateResponse?.data || {};
      templateId = extractTemplateId(cloneTemplatePayload);
    }

    if (!templateId) {
      throw new Error('Template introuvable après création depuis le document');
    }

    try {
      await formsScreenService.associateTemplateToDocument(documentId, templateId);
    } catch (associationError) {
      const statusCode = Number(associationError?.response?.status || 0);
      if (statusCode !== 400 && statusCode !== 409) {
        throw associationError;
      }

      const verifyResponse = await templates.get(documentId);
      const verifyPayload = verifyResponse?.data?.data || verifyResponse?.data || {};
      const appliedTemplateId = extractAppliedTemplateId(verifyPayload);
      if (appliedTemplateId !== templateId) {
        throw associationError;
      }
    }

    return templateId;
  }, []);

  const handleCreateTemplateNow = useCallback(async (documentId, preferredTemplateId = null) => {
    if (!documentId || uploading || multiUploading) return;
    setUploading(true);

    try {
      const templateId = await ensureTemplateAssociatedToDocument(documentId, preferredTemplateId);
      navigation.replace('TemplateEditorScreen', {
        templateId,
        autoCreateLinkedDocumentOnFinish: false,
        finishTargetTab: 'ready_forms',
        highlightDescription: true,
      });
    } catch (error) {
      console.error('Erreur creation template apres import:', error);
      Alert.alert('Erreur', 'Document importé, mais impossible de lancer la création du template.');
      goToDocumentsList();
    } finally {
      setUploading(false);
    }
  }, [ensureTemplateAssociatedToDocument, goToDocumentsList, multiUploading, navigation, uploading]);

  const pickCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission requise', "Autorisez l'acces camera.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images,
        quality: 0.8,
      });
      if (result?.canceled || result?.cancelled) return;
      const asset = result?.assets?.[0] || result;
      setFile(buildFileFromAsset(asset, 'image'));
      setMultiFiles([]);
      setMultiUploadProgress(0);
    } catch (error) {
      console.error('Erreur camera import formulaire:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la camera");
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result?.canceled || result?.cancelled || result?.type === 'cancel') return;
      const asset = result?.assets?.[0] || result;
      setFile(buildFileFromAsset(asset));
      setMultiFiles([]);
      setMultiUploadProgress(0);
    } catch (error) {
      console.error('Erreur document import formulaire:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir ce fichier");
    }
  };

  const pickMultiImages = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images,
        allowsMultipleSelection: true,
        selectionLimit: MAX_MULTI_PAGES,
        orderedSelection: true,
        quality: 0.85,
      });
      if (result?.canceled || result?.cancelled) return;

      const assets = Array.isArray(result?.assets) ? result.assets : [];
      if (!assets.length) return;

      const supportedAssets = assets.filter((asset) => isSupportedMultiImage(asset));
      const unsupportedCount = assets.length - supportedAssets.length;

      if (!supportedAssets.length) {
        Alert.alert('Formats non supportés', 'Sélectionnez uniquement des images JPG ou PNG.');
        return;
      }

      if (unsupportedCount > 0) {
        Alert.alert(
          'Formats non supportés',
          `${unsupportedCount} image(s) ignorée(s). Seules les images JPG/PNG sont acceptées.`
        );
      }

      const limitedAssets = supportedAssets.slice(0, MAX_MULTI_PAGES);
      if (supportedAssets.length > MAX_MULTI_PAGES) {
        Alert.alert('Limite atteinte', `Maximum ${MAX_MULTI_PAGES} pages par import.`);
      }

      const normalizedFiles = limitedAssets
        .map((asset, index) => buildMultiImageFromAsset(asset, index))
        .filter(Boolean);

      setMultiFiles(normalizedFiles);
      setMultiUploadProgress(0);
      setFile(null);
    } catch (error) {
      console.error('Erreur sélection multi-images:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir la galerie.");
    }
  };

  const handleRemoveMultiPage = (indexToRemove) => {
    setMultiFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleUpload = async () => {
    if (!file?.uri) {
      Alert.alert('Validation', 'Selectionnez un fichier.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        type: file.mimeType,
        name: file.name,
      });
      if (name.trim()) {
        formData.append('name', name.trim());
        formData.append('document_name', name.trim());
      }
      // Toujours créer/sauvegarder un document en priorité.
      formData.append('kind', 'document');

      const uploadResponse = await templates.upload(formData);
      const uploadPayload = uploadResponse?.data?.data || uploadResponse?.data || {};
      const uploadedDocumentId = extractDocumentId(uploadPayload);
      const uploadedTemplateId = extractTemplateId(uploadPayload);

      if (!uploadedDocumentId && !uploadedTemplateId) {
        throw new Error('ID manquant après import');
      }

      let documentId = uploadedDocumentId;
      const templateId = uploadedTemplateId;

      if (!documentId && templateId) {
        const cloneDocumentResponse = await templates.clone(templateId, { kind: 'document' });
        const cloneDocumentPayload = cloneDocumentResponse?.data?.data || cloneDocumentResponse?.data || {};
        documentId = extractDocumentId(cloneDocumentPayload);
      }

      if (!documentId) {
        throw new Error('Document introuvable après import');
      }

      Alert.alert(
        'Import terminé',
        'Le document est sauvegardé. Voulez-vous créer son template maintenant ?',
        [
          {
            text: 'Plus tard',
            style: 'cancel',
            onPress: goToDocumentsList,
          },
          {
            text: 'Créer maintenant',
            onPress: () => {
              handleCreateTemplateNow(documentId, templateId);
            },
          },
        ],
        { cancelable: false }
      );
    } catch (error) {
      console.error('Erreur import formulaire:', error);
      Alert.alert('Erreur', "Echec de l'import du formulaire");
    } finally {
      setUploading(false);
    }
  };

  const handleUploadMulti = async () => {
    if (multiUploading || uploading) return;
    if (!multiFiles.length) {
      Alert.alert('Validation', 'Sélectionnez au moins une page.');
      return;
    }
    if (multiFiles.length > MAX_MULTI_PAGES) {
      Alert.alert('Validation', `Maximum ${MAX_MULTI_PAGES} pages.`);
      return;
    }

    setMultiUploading(true);
    setMultiUploadProgress(0);
    try {
      const uploadResponse = await templates.uploadMulti(multiFiles, 'document', name.trim(), {
        onUploadProgress: (event) => {
          const loaded = Number(event?.loaded || 0);
          const total = Number(event?.total || 0);
          if (!total) return;
          const progress = Math.max(0, Math.min(1, loaded / total));
          setMultiUploadProgress(progress);
        },
      });

      const uploadPayload = uploadResponse?.data?.data || uploadResponse?.data || {};
      const uploadedDocumentId = extractDocumentId(uploadPayload);
      const uploadedTemplateId = extractTemplateId(uploadPayload);

      if (!uploadedDocumentId && !uploadedTemplateId) {
        throw new Error('ID manquant après import multi-pages');
      }

      let documentId = uploadedDocumentId;
      const templateId = uploadedTemplateId;

      if (!documentId && templateId) {
        const cloneDocumentResponse = await templates.clone(templateId, { kind: 'document' });
        const cloneDocumentPayload = cloneDocumentResponse?.data?.data || cloneDocumentResponse?.data || {};
        documentId = extractDocumentId(cloneDocumentPayload);
      }

      if (!documentId) {
        throw new Error('Document introuvable après import multi-pages');
      }

      setMultiUploadProgress(1);
      Alert.alert(
        'Import terminé',
        'Le document multi-pages est sauvegardé. Voulez-vous créer son template maintenant ?',
        [
          {
            text: 'Plus tard',
            style: 'cancel',
            onPress: goToDocumentsList,
          },
          {
            text: 'Créer maintenant',
            onPress: () => {
              handleCreateTemplateNow(documentId, templateId);
            },
          },
        ],
        { cancelable: false }
      );
    } catch (error) {
      console.error('Erreur import multi-pages formulaire:', error);
      Alert.alert('Erreur', "Échec de l'import multi-pages.");
    } finally {
      setMultiUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionCard title="Importer un formulaire" subtitle="PDF ou image. Vous pourrez créer le template maintenant ou plus tard.">
        <Text style={styles.label}>Nom (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ex: Dossier client 2026"
          placeholderTextColor={Colors.textTertiary}
        />

        <TouchableOpacity style={styles.secondaryButton} onPress={pickCamera}>
          <Text style={styles.secondaryButtonText}>📸 Prendre une photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={pickDocument}>
          <Text style={styles.secondaryButtonText}>🗂️ Choisir un fichier</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={pickMultiImages}>
          <Text style={styles.secondaryButtonText}>📸 Importer plusieurs pages (photos)</Text>
        </TouchableOpacity>

        {file ? (
          <View style={styles.previewWrap}>
            {file.kind === 'image' ? (
              <Image source={{ uri: file.uri }} style={styles.previewImage} />
            ) : (
              <View style={styles.pdfPreview}>
                <Text style={styles.pdfText}>PDF</Text>
              </View>
            )}
            <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
          </View>
        ) : null}

        {multiFiles.length > 0 ? (
          <View style={styles.multiPreviewWrap}>
            <Text style={styles.multiPreviewTitle}>
              {multiFiles.length} page{multiFiles.length > 1 ? 's' : ''} sélectionnée{multiFiles.length > 1 ? 's' : ''}
            </Text>
            <View style={styles.multiPreviewGrid}>
              {multiFiles.map((page, index) => (
                <View key={`${page.uri}-${index}`} style={styles.multiThumbCard}>
                  <Image source={{ uri: page.uri }} style={styles.multiThumbImage} />
                  <Text style={styles.multiThumbLabel}>Page {index + 1}</Text>
                  <TouchableOpacity
                    style={styles.multiThumbRemove}
                    onPress={() => handleRemoveMultiPage(index)}
                  >
                    <Text style={styles.multiThumbRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            <Text style={styles.multiHintText}>
              Ordre des pages: selon l'ordre de sélection (max {MAX_MULTI_PAGES}).
            </Text>
          </View>
        ) : null}
      </SectionCard>

      <TouchableOpacity
        style={[styles.primaryButton, (!file || uploading || multiUploading) && styles.primaryButtonDisabled]}
        onPress={handleUpload}
        disabled={!file || uploading || multiUploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Importer</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          styles.multiPrimaryButton,
          (!multiFiles.length || multiUploading || uploading) && styles.primaryButtonDisabled,
        ]}
        onPress={handleUploadMulti}
        disabled={!multiFiles.length || multiUploading || uploading}
      >
        {multiUploading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {`Importer (${multiFiles.length} page${multiFiles.length > 1 ? 's' : ''})`}
          </Text>
        )}
      </TouchableOpacity>

      {multiUploading ? (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round((multiUploadProgress || 0) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{`${Math.round((multiUploadProgress || 0) * 100)}%`}</Text>
        </View>
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
  secondaryButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  previewWrap: {
    marginTop: 8,
  },
  previewImage: {
    width: '100%',
    height: 280,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F3F4F6',
  },
  pdfPreview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfText: {
    color: Colors.primaryDark,
    fontSize: 22,
    fontWeight: '700',
  },
  fileName: {
    marginTop: 8,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  multiPreviewWrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
  },
  multiPreviewTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  multiPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  multiThumbCard: {
    width: 88,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 6,
    backgroundColor: '#fff',
    position: 'relative',
  },
  multiThumbImage: {
    width: '100%',
    height: 64,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  multiThumbLabel: {
    marginTop: 4,
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  multiThumbRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiThumbRemoveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 11,
  },
  multiHintText: {
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
  multiPrimaryButton: {
    backgroundColor: Colors.primaryDark,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  progressWrap: {
    marginTop: 8,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  progressText: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'right',
  },
});
