import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.scarch.cloud';
let resolvedApiPrefix = '';
const API_PREFIX_NONE = '';
const API_PREFIX_API = '/api';
const API_PREFIX_API_V1 = '/api/v1';

const normalizePathWithLeadingSlash = (value) => {
  const raw = String(value || '');
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
};

const detectApiPrefix = (url) => {
  const normalized = normalizePathWithLeadingSlash(url);
  if (normalized === API_PREFIX_API_V1 || normalized.startsWith(`${API_PREFIX_API_V1}/`)) {
    return API_PREFIX_API_V1;
  }
  if (normalized === API_PREFIX_API || normalized.startsWith(`${API_PREFIX_API}/`)) {
    return API_PREFIX_API;
  }
  return API_PREFIX_NONE;
};

const stripKnownApiPrefix = (url) => {
  const normalized = normalizePathWithLeadingSlash(url);
  if (normalized === API_PREFIX_API_V1) return '/';
  if (normalized.startsWith(`${API_PREFIX_API_V1}/`)) {
    return normalized.slice(API_PREFIX_API_V1.length);
  }
  if (normalized === API_PREFIX_API) return '/';
  if (normalized.startsWith(`${API_PREFIX_API}/`)) {
    return normalized.slice(API_PREFIX_API.length);
  }
  return normalized;
};

const buildUrlWithPrefix = (basePath, prefix) => {
  const cleanBasePath = normalizePathWithLeadingSlash(basePath);
  if (!prefix) return cleanBasePath;
  if (cleanBasePath === '/') return `${prefix}/`;
  return `${prefix}${cleanBasePath}`;
};

const getPrefixRetryOrder = (prefix) => {
  if (prefix === API_PREFIX_API_V1) return [API_PREFIX_API, API_PREFIX_NONE];
  if (prefix === API_PREFIX_API) return [API_PREFIX_API_V1, API_PREFIX_NONE];
  return [API_PREFIX_API, API_PREFIX_API_V1];
};

const client = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor pour ajouter le token
client.interceptors.request.use(
  async (config) => {
    if (
      resolvedApiPrefix &&
      typeof config?.url === 'string' &&
      config.url.startsWith('/') &&
      detectApiPrefix(config.url) === API_PREFIX_NONE
    ) {
      config.url = `${resolvedApiPrefix}${config.url}`;
    }

    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor pour gérer les erreurs 401
client.interceptors.response.use(
  (response) => {
    const requestUrl = `${response?.config?.url || ''}`;
    if (requestUrl.startsWith('/')) {
      resolvedApiPrefix = detectApiPrefix(requestUrl);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error?.config;

    if (
      error?.response?.status === 404 &&
      originalRequest &&
      typeof originalRequest.url === 'string' &&
      originalRequest.url.startsWith('/')
    ) {
      const currentPrefix = detectApiPrefix(originalRequest.url);
      const alreadyTried = Array.isArray(originalRequest.__apiPrefixTried)
        ? originalRequest.__apiPrefixTried
        : [currentPrefix];
      const retryOrder = getPrefixRetryOrder(currentPrefix);
      const nextPrefix = retryOrder.find((candidate) => !alreadyTried.includes(candidate));

      if (!nextPrefix && alreadyTried.includes(API_PREFIX_NONE) && alreadyTried.includes(API_PREFIX_API) && alreadyTried.includes(API_PREFIX_API_V1)) {
        return Promise.reject(error);
      }

      if (!nextPrefix) {
        return Promise.reject(error);
      }

      const basePath = stripKnownApiPrefix(originalRequest.url);
      return client.request({
        ...originalRequest,
        __apiPrefixTried: [...alreadyTried, nextPrefix],
        url: buildUrlWithPrefix(basePath, nextPrefix),
      });
    }

    if (error.response?.status === 401) {
      console.log('[Auth] 401 intercepted, logging out');
      await AsyncStorage.removeItem('token');
      // On pourrait déclencher un logout global ici
    }
    return Promise.reject(error);
  }
);

export default client;

// API Functions
export const auth = {
  login: (email, password) => client.post('/auth/login', { email, password }),
  register: (email, password, name) => client.post('/auth/register', { email, password, name }),
};

export const transcriptions = {
  list: (params = {}) => client.get('/transcriptions', { params }),
  get: (id) => client.get(`/transcriptions/${id}`),
  create: (payload = {}) =>
    client.post('/transcriptions', {
      title: payload?.title,
      transcription_text: payload?.transcription_text || payload?.text || '',
      text: payload?.text || payload?.transcription_text || '',
    }),
  validate: (id) => client.post(`/transcriptions/${id}/validate`),
  complete: (id, documentName) => client.post(`/transcriptions/${id}/complete`, { document_name: documentName }),
  update: (id, text) => client.patch(`/transcriptions/${id}`, { transcription_text: text }),
  rename: (id, title) =>
    client.patch(`/transcriptions/${id}`, {
      document_name: String(title || '').trim(),
    }),
  delete: (id) => client.delete(`/transcriptions/${id}`),
};

export const audio = {
  upload: (formData) => client.post('/audio/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // 2 min pour gros fichiers
  }),
  listByTranscription: (transcriptionId) => client.get(`/audio/transcription/${transcriptionId}`),
  getFileUrl: async (filename) => {
    const token = await AsyncStorage.getItem('token');
    return `${API_URL}${resolvedApiPrefix}/audio/file/${filename}?token=${token}`;
  },
};

export const templates = {
  list: (params = {}) => client.get('/templates', { params }),
  listByKind: (kind, params = {}) => client.get('/templates', { params: { kind, ...params } }),
  listDocuments: (params = {}) => client.get('/templates', { params: { kind: 'document', ...params } }),
  listTemplates: (params = {}) => client.get('/templates', { params: { kind: 'template', ...params } }),
  get: (id) => client.get(`/templates/${id}`),
  clone: (id, data) => client.post(`/templates/${id}/clone`, data),
  applyTemplate: (documentId, templateId, mode = 'clone') =>
    client.post(`/templates/${documentId}/apply-template`, { template_id: templateId, mode }),
  clearAppliedTemplate: (documentId) =>
    client.patch(`/templates/${documentId}`, { applied_template_id: null }),
  upload: (formData) => client.post('/templates/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }),
  uploadMulti: (files = [], kind = 'document', name = '', options = {}) => {
    const formData = new FormData();
    const safeFiles = Array.isArray(files) ? files.slice(0, 20) : [];

    safeFiles.forEach((file, index) => {
      if (!file?.uri) return;
      const rawName = String(file?.name || file?.fileName || `page-${index + 1}.jpg`);
      const lowerName = rawName.toLowerCase();
      const rawType = String(file?.mimeType || file?.type || '');
      const inferredType = lowerName.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const mimeType = rawType.includes('/') ? rawType : inferredType;
      const normalizedName = rawName.includes('.')
        ? rawName
        : mimeType === 'image/png'
          ? `${rawName}.png`
          : `${rawName}.jpg`;

      formData.append('files', {
        uri: file.uri,
        type: mimeType,
        name: normalizedName,
      });
    });

    formData.append('kind', kind || 'document');
    const trimmedName = String(name || '').trim();
    if (trimmedName) {
      formData.append('name', trimmedName);
    }

    return client.post('/templates/upload-multi', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
      onUploadProgress: options?.onUploadProgress,
    });
  },
  update: (id, data) => client.patch(`/templates/${id}`, data),
  updateTemplate: (id, data) => client.patch(`/templates/${id}`, data),
  delete: (id) => client.delete(`/templates/${id}`),

  // Calibration
  saveCalibration: (templateId, data) =>
    client.post(`/templates/${templateId}/calibration`, data),
  getCalibrations: (templateId) => client.get(`/templates/${templateId}/calibrations`),

  // Champs
  createField: (templateId, data) => client.post(`/templates/${templateId}/fields`, data),
  updateField: (templateId, fieldId, data) =>
    client.patch(`/templates/${templateId}/fields/${fieldId}`, data),
  deleteField: (templateId, fieldId) =>
    client.delete(`/templates/${templateId}/fields/${fieldId}`),

  // Enrichissement IA
  enrich: (templateId) => client.post(`/templates/${templateId}/enrich`),

  // Pré-remplissage IA
  aiPrefill: (templateId, pageNumber) =>
    client.post(`/templates/${templateId}/ai-prefill`, { page_number: pageNumber }, { timeout: 180000 }),

  // Images des pages
  getPageImageUrl: async (templateId, pageNumber) => {
    const token = await AsyncStorage.getItem('token');
    return `${API_URL}${resolvedApiPrefix}/templates/${templateId}/page/${pageNumber}/image?token=${token}`;
  },
  getPageImageUrlCandidates: async (templateId, pageNumber, fileFilename = '') => {
    const token = await AsyncStorage.getItem('token');
    const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : '';
    const uniqueUrls = new Set();

    const addPath = (path, { withPrefix = false } = {}) => {
      const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
      if (!normalizedPath || normalizedPath === '/') return;

      if (withPrefix && resolvedApiPrefix) {
        uniqueUrls.add(`${API_URL}${resolvedApiPrefix}${normalizedPath}${tokenSuffix}`);
      } else {
        uniqueUrls.add(`${API_URL}${normalizedPath}${tokenSuffix}`);
      }
    };

    const rawFilename = String(fileFilename || '');
    const baseName = rawFilename.includes('.')
      ? rawFilename.slice(0, rawFilename.lastIndexOf('.'))
      : rawFilename;

    const candidateNames = [];
    if (baseName) {
      candidateNames.push(`${baseName}_page_${pageNumber}.png`);
      candidateNames.push(`${baseName}_page_${pageNumber}-1.png`);
      candidateNames.push(`${baseName}_page_${pageNumber}-${pageNumber}.png`);
    }
    candidateNames.push(`${templateId}_page-${pageNumber}.png`);

    candidateNames.forEach((file) => {
      addPath(`/uploads/templates/cache/${file}`);
      addPath(`/uploads/templates/cache/${file}`, { withPrefix: true });
      addPath(`/templates/cache/${file}`);
      addPath(`/templates/cache/${file}`, { withPrefix: true });
    });

    // Keep API endpoint candidates last: for some multi-page uploads
    // the endpoint can stall while direct cache files are already available.
    addPath(`/templates/${templateId}/page/${pageNumber}/image`);
    addPath(`/templates/${templateId}/page/${pageNumber}/image`, { withPrefix: true });

    return Array.from(uniqueUrls);
  },
};

const FORM_FILL_BASE_PATHS = [
  '/form-fills',
  '/form_fills',
  '/formfills',
  '/api/form-fills',
  '/api/form_fills',
  '/api/formfills',
];
const WORK_PROFILE_BASE_PATHS = [
  '/work-profiles',
  '/work_profiles',
  '/api/work-profiles',
  '/api/work_profiles',
];
const OCR_DOCUMENT_BASE_PATHS = [
  '/ocr-documents',
  '/ocr_documents',
  '/api/ocr-documents',
  '/api/ocr_documents',
];

const requestFormFillWithFallback = async (requestBuilder) => {
  let notFoundError = null;

  for (const basePath of FORM_FILL_BASE_PATHS) {
    try {
      return await requestBuilder(basePath);
    } catch (error) {
      if (error?.response?.status === 404) {
        notFoundError = error;
        continue;
      }
      throw error;
    }
  }

  throw notFoundError || new Error('Aucune route form-fills disponible');
};

const requestWorkProfileWithFallback = async (requestBuilder) => {
  let notFoundError = null;

  for (const basePath of WORK_PROFILE_BASE_PATHS) {
    try {
      return await requestBuilder(basePath);
    } catch (error) {
      if (error?.response?.status === 404) {
        notFoundError = error;
        continue;
      }
      throw error;
    }
  }

  throw notFoundError || new Error('Aucune route work-profiles disponible');
};

const requestOcrDocumentWithFallback = async (requestBuilder) => {
  let notFoundError = null;

  for (const basePath of OCR_DOCUMENT_BASE_PATHS) {
    try {
      return await requestBuilder(basePath);
    } catch (error) {
      if (error?.response?.status === 404) {
        notFoundError = error;
        continue;
      }
      throw error;
    }
  }

  throw notFoundError || new Error('Aucune route ocr-documents disponible');
};

export const formFills = {
  createFormFill: (documentId, sourceTypeOrLegacyId, sourceId) =>
    requestFormFillWithFallback((basePath) => {
      const hasExplicitSourceType =
        typeof sourceTypeOrLegacyId === 'string' && String(sourceTypeOrLegacyId).trim().length > 0;
      const normalizedSourceType = hasExplicitSourceType ? sourceTypeOrLegacyId : 'transcription';
      const normalizedSourceId = hasExplicitSourceType ? sourceId : sourceTypeOrLegacyId;

      return client.post(basePath, {
        document_id: documentId,
        source_type: normalizedSourceType,
        source_id: normalizedSourceId,
      });
    }),
  listFormFills: (params = {}) =>
    requestFormFillWithFallback((basePath) =>
      client.get(basePath, { params })
    ),
  getFormFill: (id) =>
    requestFormFillWithFallback((basePath) =>
      client.get(`${basePath}/${id}`)
    ),
  updateFormFill: async (id, payload = {}) => {
    try {
      return await requestFormFillWithFallback((basePath) =>
        client.patch(`${basePath}/${id}`, payload)
      );
    } catch (error) {
      if (error?.response?.status !== 404) throw error;
    }

    const nestedRoutes = ['fill-data', 'fill_data', 'data'];
    let notFoundError = null;

    for (const routeSuffix of nestedRoutes) {
      try {
        return await requestFormFillWithFallback((basePath) =>
          client.patch(`${basePath}/${id}/${routeSuffix}`, payload)
        );
      } catch (error) {
        if (error?.response?.status === 404) {
          notFoundError = error;
          continue;
        }
        throw error;
      }
    }

    throw notFoundError || new Error('Aucune route de mise a jour form-fill disponible');
  },
  deleteFormFill: (id) =>
    requestFormFillWithFallback((basePath) =>
      client.delete(`${basePath}/${id}`)
    ),
  patchFieldOverride: (formFillId, templateFieldId, payload) =>
    requestFormFillWithFallback((basePath) =>
      client.patch(`${basePath}/${formFillId}/fields/${templateFieldId}`, payload)
    ),
  deleteFieldOverride: (formFillId, templateFieldId) =>
    requestFormFillWithFallback((basePath) =>
      client.delete(`${basePath}/${formFillId}/fields/${templateFieldId}`)
    ),
  updateFilledValue: async (id, value) => {
    try {
      return await client.patch(`/filled-values/${id}`, { value });
    } catch (error) {
      if (error?.response?.status !== 404) {
        throw error;
      }

      try {
        return await client.patch(`/api/filled-values/${id}`, { value });
      } catch (fallbackError) {
        if (fallbackError?.response?.status !== 404) {
          throw fallbackError;
        }
      }

      return requestFormFillWithFallback((basePath) =>
        client.patch(`${basePath}/values/${id}`, { value })
      );
    }
  },
};

export const ocrDocuments = {
  createOcrDocument: (title, files = []) =>
    requestOcrDocumentWithFallback((basePath) => {
      const formData = new FormData();
      formData.append('title', title || `OCR ${Date.now()}`);
      files.forEach((file, index) => {
        if (!file?.uri) return;
        const filename = file.fileName || file.name || `page-${index + 1}`;
        const lowerName = String(filename).toLowerCase();
        const rawType = String(file.type || file.mimeType || '');
        const inferredMimeType = lowerName.endsWith('.pdf')
          ? 'application/pdf'
          : lowerName.endsWith('.png')
            ? 'image/png'
            : lowerName.endsWith('.webp')
              ? 'image/webp'
              : lowerName.endsWith('.heic')
                ? 'image/heic'
                : 'image/jpeg';
        const mimeType = rawType.includes('/') ? rawType : inferredMimeType;
        const normalizedName = String(filename).includes('.')
          ? filename
          : mimeType === 'application/pdf'
            ? `${filename}.pdf`
            : `${filename}.jpg`;
        formData.append('images', {
          uri: file.uri,
          type: mimeType,
          name: normalizedName,
        });
      });

      return client.post(basePath, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
    }),
  listOcrDocuments: (params = {}) =>
    requestOcrDocumentWithFallback((basePath) =>
      client.get(basePath, { params })
    ),
  getOcrDocument: (id) =>
    requestOcrDocumentWithFallback((basePath) =>
      client.get(`${basePath}/${id}`)
    ),
  updateTitle: (id, title) =>
    requestOcrDocumentWithFallback(async (basePath) => {
      const route = `${basePath}/${id}`;
      try {
        return await client.patch(route, { title });
      } catch (error) {
        if (error?.response?.status !== 400) throw error;
        return client.patch(route, {
          title,
          name: title,
          document_name: title,
        });
      }
    }),
  updateText: (id, text) =>
    requestOcrDocumentWithFallback(async (basePath) => {
      const route = `${basePath}/${id}`;
      const value = String(text ?? '');
      try {
        return await client.patch(route, { full_text: value });
      } catch (error) {
        const status = error?.response?.status;
        if (status !== 400 && status !== 422) throw error;
        return client.patch(route, {
          text: value,
          full_text: value,
          fullText: value,
          extracted_text: value,
          extractedText: value,
          ocr_text: value,
          ocrText: value,
        });
      }
    }),
  updateOcrPageText: (id, pageId, text) =>
    requestOcrDocumentWithFallback(async (basePath) => {
      const route = `${basePath}/${id}/pages/${pageId}`;
      try {
        return await client.patch(route, { extracted_text: String(text ?? '') });
      } catch (error) {
        if (error?.response?.status !== 400 && error?.response?.status !== 422) throw error;
        return client.patch(route, {
          extracted_text: String(text ?? ''),
          text: String(text ?? ''),
          page_text: String(text ?? ''),
          full_text: String(text ?? ''),
        });
      }
    }),
  clearOcrPageText: (id, pageId) =>
    requestOcrDocumentWithFallback((basePath) =>
      client.delete(`${basePath}/${id}/pages/${pageId}/text`)
    ),
  deleteOcrDocument: (id) =>
    requestOcrDocumentWithFallback((basePath) =>
      client.delete(`${basePath}/${id}`)
    ),
};

export const workProfiles = {
  list: () =>
    requestWorkProfileWithFallback((basePath) =>
      client.get(basePath)
    ),
  listWorkProfiles: () =>
    requestWorkProfileWithFallback((basePath) =>
      client.get(basePath)
    ),
  getOne: (id) =>
    requestWorkProfileWithFallback((basePath) =>
      client.get(`${basePath}/${id}`)
    ),
  getWorkProfile: (id) =>
    requestWorkProfileWithFallback((basePath) =>
      client.get(`${basePath}/${id}`)
    ),
  create: (payload) =>
    requestWorkProfileWithFallback((basePath) =>
      client.post(basePath, payload)
    ),
  createWorkProfile: (payload) =>
    requestWorkProfileWithFallback((basePath) =>
      client.post(basePath, payload)
    ),
  update: (id, payload) =>
    requestWorkProfileWithFallback((basePath) =>
      client.patch(`${basePath}/${id}`, payload)
    ),
  updateWorkProfile: (id, payload) =>
    requestWorkProfileWithFallback((basePath) =>
      client.patch(`${basePath}/${id}`, payload)
    ),
  remove: (id) =>
    requestWorkProfileWithFallback((basePath) =>
      client.delete(`${basePath}/${id}`)
    ),
  deleteWorkProfile: (id) =>
    requestWorkProfileWithFallback((basePath) =>
      client.delete(`${basePath}/${id}`)
    ),
};

export const documents = {
  list: () => client.get('/documents'),
  get: (id) => client.get(`/documents/${id}`),
  extract: (transcriptionId) => client.post(`/documents/${transcriptionId}/extract`),
};
