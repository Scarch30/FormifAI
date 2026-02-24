import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import client, { formFills } from '../api/client';
import { extractItem, toNumber } from '../utils/apiData';

const EXPORT_BASE_PATHS = [
  '/form-fills',
  '/form_fills',
  '/formfills',
  '/api/form-fills',
  '/api/form_fills',
  '/api/formfills',
  '/api/v1/form-fills',
  '/api/v1/form_fills',
  '/api/v1/formfills',
];

const MIME_BY_FORMAT = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
};

const EXT_BY_FORMAT = {
  pdf: 'pdf',
  jpg: 'jpg',
};

const DEFAULT_EXPORT_NAME = 'document';
const EXPORT_DIRECTORY_URI_STORAGE_KEY = '@formvox_export_directory_uri';
const EXPORT_ACTION_CANCEL = 'cancel';
const EXPORT_ACTION_SAVE = 'save';
const EXPORT_ACTION_SHARE = 'share';
const EXPORT_FORMAT_CANCEL = 'cancel';
const EXPORT_FORMAT_PDF = 'pdf';
const EXPORT_FORMAT_JPG = 'jpg';

const sanitizeDocumentName = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_EXPORT_NAME;

  const normalized = typeof raw.normalize === 'function' ? raw.normalize('NFD') : raw;
  const withoutDiacritics = normalized.replace(/[\u0300-\u036f]/g, '');

  const cleaned = withoutDiacritics
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleaned || DEFAULT_EXPORT_NAME;
};

const buildExportFileName = (documentName, format, page) => {
  const normalizedFormat = String(format || '').toLowerCase();
  const extension = EXT_BY_FORMAT[normalizedFormat] || 'bin';
  const normalizedPageParam = normalizePageParam(page);
  const pageSuffix =
    normalizedFormat === 'jpg' && normalizedPageParam && normalizedPageParam !== 'all'
      ? `_page_${normalizedPageParam}`
      : '';
  return `${sanitizeDocumentName(documentName)}${pageSuffix}_rempli.${extension}`;
};

const addNumericSuffixToFileName = (fileName, suffix) => {
  const raw = String(fileName || DEFAULT_EXPORT_NAME);
  const dotIndex = raw.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex >= raw.length - 1) {
    return `${raw}_${suffix}`;
  }
  const baseName = raw.slice(0, dotIndex);
  const extension = raw.slice(dotIndex + 1);
  return `${baseName}_${suffix}.${extension}`;
};

const isAlreadyExistsError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    message.includes('exist') ||
    message.includes('already') ||
    code.includes('exist') ||
    code.includes('already')
  );
};

const isPermissionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    message.includes('permission') ||
    message.includes('denied') ||
    message.includes('security') ||
    code.includes('permission') ||
    code.includes('denied')
  );
};

const normalizePathWithLeadingSlash = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const stripUrlSearchAndHash = (value) => {
  const raw = String(value || '');
  if (!raw) return '';
  return raw.split('?')[0].split('#')[0];
};

const deriveBasePathFromDetailRequestUrl = (requestUrl, formFillId) => {
  const cleanPath = normalizePathWithLeadingSlash(stripUrlSearchAndHash(requestUrl));
  const normalizedId = String(Number(formFillId));
  if (!normalizedId || normalizedId === 'NaN') return '';

  if (cleanPath.endsWith(`/${normalizedId}`)) {
    const withoutId = cleanPath.slice(0, cleanPath.length - normalizedId.length - 1);
    return withoutId || '/';
  }

  const segments = cleanPath.split('/').filter(Boolean);
  if (segments.length && /^\d+$/.test(segments[segments.length - 1])) {
    segments.pop();
  }
  return segments.length ? `/${segments.join('/')}` : '/';
};

const getBaseUrl = () => {
  const fromClient = String(client?.defaults?.baseURL || '').trim();
  if (fromClient) return fromClient.replace(/\/+$/, '');
  const fromEnv = String(process.env.EXPO_PUBLIC_API_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return 'https://api.scarch.cloud';
};

const getErrorMessage = (error, fallback) => {
  const responseData = error?.response?.data || {};
  return (
    responseData?.error ||
    responseData?.message ||
    responseData?.data?.error ||
    error?.message ||
    fallback
  );
};

const getHeaderValue = (headers, targetName) => {
  if (!headers || typeof headers !== 'object') return '';
  const normalizedTarget = String(targetName || '').toLowerCase();
  const entry = Object.entries(headers).find(
    ([key]) => String(key || '').toLowerCase() === normalizedTarget
  );
  return String(entry?.[1] || '').trim();
};

const isCompatibleContentType = (contentType, format) => {
  const normalizedContentType = String(contentType || '').toLowerCase();
  if (!normalizedContentType) return true;
  if (
    normalizedContentType.includes('application/json') ||
    normalizedContentType.includes('text/html') ||
    normalizedContentType.startsWith('text/')
  ) {
    return false;
  }

  if (format === 'pdf') {
    return (
      normalizedContentType.includes('application/pdf') ||
      normalizedContentType.includes('application/octet-stream')
    );
  }

  if (format === 'jpg') {
    return (
      normalizedContentType.includes('image/jpeg') ||
      normalizedContentType.includes('image/jpg') ||
      normalizedContentType.includes('image/png') ||
      normalizedContentType.includes('application/octet-stream')
    );
  }

  return true;
};

const normalizePageParam = (value) => {
  if (value === 'all') return 'all';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 1) return '';
  return String(Math.floor(numericValue));
};

const resolvePageCountFromPayload = (payload) => {
  const values = Array.isArray(payload?.values) ? payload.values : [];
  const maxPageFromValues = values.reduce((acc, valueItem) => {
    const pageNumber = toNumber(valueItem?.page_number ?? valueItem?.pageNumber, 1) || 1;
    return Math.max(acc, Math.floor(pageNumber));
  }, 1);

  const candidates = [
    payload?.page_count,
    payload?.pageCount,
    payload?.pages_count,
    payload?.pagesCount,
    payload?.pages_total,
    payload?.pagesTotal,
    payload?.total_pages,
    payload?.totalPages,
    payload?.document_page_count,
    payload?.documentPageCount,
    maxPageFromValues,
  ];
  const maxPageCount = candidates.reduce((acc, rawValue) => {
    const candidate = toNumber(rawValue, 0);
    if (!Number.isFinite(candidate) || candidate <= 0) return acc;
    return Math.max(acc, Math.floor(candidate));
  }, 1);
  return Math.max(1, maxPageCount);
};

export default function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  const askExportAction = useCallback(
    (label) =>
      new Promise((resolve) => {
        let resolved = false;
        const done = (value) => {
          if (resolved) return;
          resolved = true;
          resolve(value);
        };

        Alert.alert(
          'Exporter',
          `Que faire avec le fichier ${label} ?`,
          [
            { text: 'Annuler', style: 'cancel', onPress: () => done(EXPORT_ACTION_CANCEL) },
            { text: 'Enregistrer', onPress: () => done(EXPORT_ACTION_SAVE) },
            { text: 'Partager', onPress: () => done(EXPORT_ACTION_SHARE) },
          ],
          {
            cancelable: true,
            onDismiss: () => done(EXPORT_ACTION_CANCEL),
          }
        );
      }),
    []
  );

  const askJpgMultiPageSaveOnlyAction = useCallback(
    () =>
      new Promise((resolve) => {
        let resolved = false;
        const done = (value) => {
          if (resolved) return;
          resolved = true;
          resolve(value);
        };

        Alert.alert(
          'JPG multi-pages',
          "Pour un document de plusieurs pages, le format JPG peut seulement etre enregistre sur l'appareil. Pour partager, utilisez le format PDF.",
          [
            { text: 'Annuler', style: 'cancel', onPress: () => done(EXPORT_ACTION_CANCEL) },
            { text: 'Enregistrer', onPress: () => done(EXPORT_ACTION_SAVE) },
          ],
          {
            cancelable: true,
            onDismiss: () => done(EXPORT_ACTION_CANCEL),
          }
        );
      }),
    []
  );

  const askExportFormat = useCallback(
    () =>
      new Promise((resolve) => {
        let resolved = false;
        const done = (value) => {
          if (resolved) return;
          resolved = true;
          resolve(value);
        };

        Alert.alert(
          'Format export',
          'Choisissez le format du fichier.',
          [
            { text: 'Annuler', style: 'cancel', onPress: () => done(EXPORT_FORMAT_CANCEL) },
            { text: 'PDF', onPress: () => done(EXPORT_FORMAT_PDF) },
            { text: 'JPG', onPress: () => done(EXPORT_FORMAT_JPG) },
          ],
          {
            cancelable: true,
            onDismiss: () => done(EXPORT_FORMAT_CANCEL),
          }
        );
      }),
    []
  );

  const shareDownloadedFile = useCallback(async (downloaded, options = {}) => {
    const shareAvailable = await Sharing.isAvailableAsync();
    if (!shareAvailable) {
      throw new Error('Le partage est indisponible sur cet appareil.');
    }
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: downloaded.mimeType,
      dialogTitle: options.dialogTitle || 'Exporter le document',
      UTI: options.UTI,
    });
  }, []);

  const saveFileToDevice = useCallback(async (downloaded) => {
    if (Platform.OS === 'android') {
      const storageAccess = FileSystem.StorageAccessFramework;
      if (!storageAccess?.requestDirectoryPermissionsAsync || !storageAccess?.createFileAsync) {
        throw new Error("L'enregistrement local est indisponible sur cet appareil.");
      }

      const requestDirectory = async () => {
        const permission = await storageAccess.requestDirectoryPermissionsAsync();
        if (!permission?.granted || !permission?.directoryUri) {
          throw new Error('Aucun dossier selectionne.');
        }
        await AsyncStorage.setItem(EXPORT_DIRECTORY_URI_STORAGE_KEY, permission.directoryUri).catch(() => {});
        return permission.directoryUri;
      };

      const sourceBase64 = await FileSystem.readAsStringAsync(downloaded.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const writeToDirectory = async (directoryUri) => {
        for (let suffix = 0; suffix < 50; suffix += 1) {
          const candidateName =
            suffix === 0 ? downloaded.fileName : addNumericSuffixToFileName(downloaded.fileName, suffix);
          try {
            const targetUri = await storageAccess.createFileAsync(
              directoryUri,
              candidateName,
              downloaded.mimeType
            );
            await FileSystem.writeAsStringAsync(targetUri, sourceBase64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            return {
              fileName: candidateName,
              uri: targetUri,
            };
          } catch (error) {
            if (isAlreadyExistsError(error)) {
              continue;
            }
            throw error;
          }
        }
        throw new Error('Impossible de creer un nom de fichier disponible.');
      };

      let directoryUri = await AsyncStorage.getItem(EXPORT_DIRECTORY_URI_STORAGE_KEY);
      if (!directoryUri) {
        directoryUri = await requestDirectory();
      }

      try {
        return await writeToDirectory(directoryUri);
      } catch (error) {
        if (isPermissionError(error)) {
          await AsyncStorage.removeItem(EXPORT_DIRECTORY_URI_STORAGE_KEY).catch(() => {});
          const renewedDirectoryUri = await requestDirectory();
          return writeToDirectory(renewedDirectoryUri);
        }
        throw error;
      }
    }

    const deviceDirectory = FileSystem.documentDirectory;
    if (!deviceDirectory) {
      throw new Error('Stockage local indisponible sur cet appareil.');
    }

    const destinationUri = `${deviceDirectory}${downloaded.fileName}`;
    await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => {});
    await FileSystem.copyAsync({
      from: downloaded.uri,
      to: destinationUri,
    });
    return {
      fileName: downloaded.fileName,
      uri: destinationUri,
    };
  }, []);

  const resolveExportBasePaths = useCallback(async (formFillId) => {
    const seen = new Set();
    const ordered = [];
    const addPath = (path) => {
      const normalized = normalizePathWithLeadingSlash(path);
      if (seen.has(normalized)) return;
      seen.add(normalized);
      ordered.push(normalized);
    };

    try {
      const detailResponse = await formFills.getFormFill(formFillId);
      const requestUrl = detailResponse?.config?.url || '';
      const discovered = deriveBasePathFromDetailRequestUrl(requestUrl, formFillId);
      if (discovered && discovered !== '/') {
        addPath(discovered);
      }
    } catch (_error) {
      // Best effort only.
    }

    EXPORT_BASE_PATHS.forEach(addPath);
    return ordered;
  }, []);

  const resolveFormFillPageCount = useCallback(async (formFillId) => {
    try {
      const response = await formFills.getFormFill(formFillId);
      const payload = extractItem(response) || {};
      return resolvePageCountFromPayload(payload);
    } catch (_error) {
      return 1;
    }
  }, []);

  const downloadFile = useCallback(async (formFillId, format, documentName, page) => {
    const normalizedFormat = String(format || 'pdf').toLowerCase();
    const extension = EXT_BY_FORMAT[normalizedFormat] || 'bin';
    const normalizedPageParam = normalizePageParam(page);
    const targetFileName = buildExportFileName(documentName, normalizedFormat, normalizedPageParam);
    const pageQuery = normalizedPageParam ? `&page=${encodeURIComponent(normalizedPageParam)}` : '';
    const exportId = Number(formFillId);
    if (!Number.isFinite(exportId)) {
      throw new Error('Identifiant de remplissage invalide.');
    }

    const token = await AsyncStorage.getItem('token');
    if (!token) {
      throw new Error('Session invalide. Veuillez vous reconnecter.');
    }

    const baseUrl = getBaseUrl();
    const cacheDirectory = FileSystem.cacheDirectory;
    if (!cacheDirectory) {
      throw new Error('Cache indisponible sur cet appareil.');
    }
    const candidateBasePaths = await resolveExportBasePaths(exportId);
    let lastError = null;
    const retryableStatuses = new Set([404, 405, 409, 500, 501, 502, 503, 504]);
    let notFoundCount = 0;

    for (let attempt = 0; attempt < candidateBasePaths.length; attempt += 1) {
      const basePath = candidateBasePaths[attempt];
      const requestUrl = `${baseUrl}${basePath}/${exportId}/export?format=${normalizedFormat}${pageQuery}`;
      const destinationUri = `${cacheDirectory}form-fill-${exportId}-${Date.now()}-${attempt}.${extension}`;
      const renamedUri = `${cacheDirectory}${targetFileName}`;

      try {
        const result = await FileSystem.downloadAsync(requestUrl, destinationUri, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: MIME_BY_FORMAT[normalizedFormat] || 'application/octet-stream',
          },
        });

        const statusCode = Number(result?.status || 0);
        if (statusCode >= 200 && statusCode < 300) {
          const contentType = getHeaderValue(result?.headers, 'content-type');
          if (!isCompatibleContentType(contentType, normalizedFormat)) {
            await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => {});
            lastError = new Error(
              `Reponse export invalide (${contentType || 'content-type inconnu'}).`
            );
            continue;
          }

          await FileSystem.deleteAsync(renamedUri, { idempotent: true }).catch(() => {});
          await FileSystem.moveAsync({
            from: result.uri,
            to: renamedUri,
          });
          return {
            uri: renamedUri,
            mimeType: MIME_BY_FORMAT[normalizedFormat] || 'application/octet-stream',
            format: normalizedFormat,
            fileName: targetFileName,
          };
        }

        await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => {});

        if (statusCode === 401 || statusCode === 403) {
          throw new Error('Session invalide. Veuillez vous reconnecter.');
        }

        lastError = new Error(`Echec du telechargement (HTTP ${statusCode}).`);
        if (statusCode === 404) {
          notFoundCount += 1;
        }
        if (retryableStatuses.has(statusCode)) {
          continue;
        }
        continue;
      } catch (error) {
        await FileSystem.deleteAsync(destinationUri, { idempotent: true }).catch(() => {});
        const statusCode = Number(error?.status || error?.response?.status || 0);
        if (statusCode === 401 || statusCode === 403) {
          throw new Error('Session invalide. Veuillez vous reconnecter.');
        }
        if (statusCode === 404) {
          notFoundCount += 1;
        }
        if (retryableStatuses.has(statusCode)) {
          lastError = error;
          continue;
        }
        lastError = error;
        continue;
      }
    }

    if (notFoundCount > 0 && notFoundCount === candidateBasePaths.length) {
      throw new Error("Route d'export introuvable sur le backend (HTTP 404).");
    }
    throw lastError || new Error('Aucune route d export disponible.');
  }, [resolveExportBasePaths]);

  const exportPDF = useCallback(
    async (formFillId, documentName) => {
      if (isExporting) return;
      setIsExporting(true);
      setExportProgress('Telechargement du PDF...');
      try {
        const downloaded = await downloadFile(formFillId, 'pdf', documentName);
        setExportProgress("Choix de l'action...");
        const action = await askExportAction('PDF');

        if (action === EXPORT_ACTION_SAVE) {
          setExportProgress("Enregistrement sur l'appareil...");
          const saved = await saveFileToDevice(downloaded);
          const successMessage =
            Platform.OS === 'android'
              ? `${saved.fileName} enregistre dans le dossier selectionne.`
              : `${saved.fileName} enregistre sur l'appareil.`;
          Alert.alert('Export termine', successMessage);
          return;
        }

        if (action === EXPORT_ACTION_SHARE) {
          setExportProgress('Ouverture du partage...');
          await shareDownloadedFile(downloaded, {
            dialogTitle: 'Exporter le document PDF',
            UTI: 'com.adobe.pdf',
          });
        }
      } catch (error) {
        console.error('Erreur export PDF:', error);
        Alert.alert('Erreur', getErrorMessage(error, "Impossible d'exporter le PDF."));
      } finally {
        setIsExporting(false);
        setExportProgress('');
      }
    },
    [askExportAction, downloadFile, isExporting, saveFileToDevice, shareDownloadedFile]
  );

  const exportJPG = useCallback(
    async (formFillId, documentName, page) => {
      if (isExporting) return;
      let normalizedPageParam = normalizePageParam(page);
      let detectedTotalPages = null;
      setIsExporting(true);
      setExportProgress("Preparation de l'export JPG...");
      try {
        if (!normalizedPageParam) {
          detectedTotalPages = await resolveFormFillPageCount(formFillId);
          normalizedPageParam = detectedTotalPages > 1 ? 'all' : '1';
        }

        if (detectedTotalPages === null) {
          detectedTotalPages = await resolveFormFillPageCount(formFillId);
        }
        const isMultiPageDocument = detectedTotalPages > 1;

        if (normalizedPageParam === 'all') {
          const totalPages =
            detectedTotalPages && detectedTotalPages > 0
              ? detectedTotalPages
              : await resolveFormFillPageCount(formFillId);
          setExportProgress("Choix de l'action...");
          const action = isMultiPageDocument
            ? await askJpgMultiPageSaveOnlyAction()
            : await askExportAction(`JPG (${totalPages} pages)`);

          if (action === EXPORT_ACTION_SAVE) {
            for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
              setExportProgress(`Telechargement page ${pageIndex}/${totalPages}...`);
              const downloaded = await downloadFile(formFillId, 'jpg', documentName, pageIndex);
              setExportProgress(`Enregistrement page ${pageIndex}/${totalPages}...`);
              await saveFileToDevice(downloaded);
            }
            Alert.alert('Export termine', `${totalPages} images JPG enregistrees sur l'appareil.`);
            return;
          }

          if (action === EXPORT_ACTION_SHARE) {
            for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
              setExportProgress(`Telechargement page ${pageIndex}/${totalPages}...`);
              const downloaded = await downloadFile(formFillId, 'jpg', documentName, pageIndex);
              setExportProgress(`Partage page ${pageIndex}/${totalPages}...`);
              await shareDownloadedFile(downloaded, {
                dialogTitle: `Exporter en image JPG (Page ${pageIndex}/${totalPages})`,
              });
            }
            return;
          }
          return;
        }

        setExportProgress("Telechargement de l'image JPG...");
        const downloaded = await downloadFile(formFillId, 'jpg', documentName, normalizedPageParam || page);
        setExportProgress("Choix de l'action...");
        const action = isMultiPageDocument
          ? await askJpgMultiPageSaveOnlyAction()
          : await askExportAction('JPG');

        if (action === EXPORT_ACTION_SAVE) {
          setExportProgress("Enregistrement sur l'appareil...");
          const saved = await saveFileToDevice(downloaded);
          const successMessage =
            Platform.OS === 'android'
              ? `${saved.fileName} enregistre dans le dossier selectionne.`
              : `${saved.fileName} enregistre sur l'appareil.`;
          Alert.alert('Export termine', successMessage);
          return;
        }

        if (action === EXPORT_ACTION_SHARE) {
          setExportProgress('Ouverture du partage...');
          await shareDownloadedFile(downloaded, {
            dialogTitle: 'Exporter en image JPG',
          });
        }
      } catch (error) {
        console.error('Erreur export JPG:', error);
        Alert.alert('Erreur', getErrorMessage(error, "Impossible d'exporter l'image JPG."));
      } finally {
        setIsExporting(false);
        setExportProgress('');
      }
    },
    [
      askExportAction,
      askJpgMultiPageSaveOnlyAction,
      downloadFile,
      isExporting,
      resolveFormFillPageCount,
      saveFileToDevice,
      shareDownloadedFile,
    ]
  );

  const printDocument = useCallback(
    async (formFillId, documentName) => {
      if (isExporting) return;
      setIsExporting(true);
      setExportProgress('Telechargement du document...');
      try {
        const downloaded = await downloadFile(formFillId, 'pdf', documentName);
        setExportProgress("Ouverture de l'impression...");
        await Print.printAsync({ uri: downloaded.uri });
      } catch (error) {
        console.error('Erreur impression document:', error);
        Alert.alert('Erreur', getErrorMessage(error, "Impossible d'imprimer ce document."));
      } finally {
        setIsExporting(false);
        setExportProgress('');
      }
    },
    [downloadFile, isExporting]
  );

  const exportWithChoice = useCallback(
    async (formFillId, documentName) => {
      if (isExporting) return;
      const format = await askExportFormat();
      if (format === EXPORT_FORMAT_PDF) {
        await exportPDF(formFillId, documentName);
        return;
      }
      if (format === EXPORT_FORMAT_JPG) {
        await exportJPG(formFillId, documentName);
      }
    },
    [askExportFormat, exportJPG, exportPDF, isExporting]
  );

  return {
    isExporting,
    exportProgress,
    exportPDF,
    exportJPG,
    exportWithChoice,
    printDocument,
  };
}
