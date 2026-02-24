import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = String(process.env.EXPO_PUBLIC_API_URL || 'https://api.scarch.cloud').replace(/\/+$/, '');
const DEFAULT_TIMEOUT_MS = 30000;

const getAuthToken = async () => {
  const userToken = await AsyncStorage.getItem('userToken');
  if (userToken) return userToken;
  return AsyncStorage.getItem('token');
};

const extractMessage = (payload, fallback = 'Erreur réseau') => {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (!payload || typeof payload !== 'object') return fallback;
  return (
    payload?.error ||
    payload?.message ||
    payload?.detail ||
    payload?.data?.error ||
    payload?.data?.message ||
    fallback
  );
};

const unwrapPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.data !== undefined) return payload.data;
  if (payload.result !== undefined) return payload.result;
  return payload;
};

const createHttpError = ({ status, payload, fallbackMessage }) => {
  const error = new Error(extractMessage(payload, fallbackMessage));
  error.status = Number(status) || 0;
  error.payload = payload;
  return error;
};

const parseJsonOrText = async (response) => {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return raw;
  }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const timeoutValue = Number(timeoutMs);
  const safeTimeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), safeTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('La requête a expiré.');
      timeoutError.status = 0;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildHeaders = async ({ isMultipart = false, acceptsBinary = false } = {}) => {
  const token = await getAuthToken();
  const headers = {
    Accept: acceptsBinary ? 'application/octet-stream,application/pdf,*/*' : 'application/json',
  };

  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const requestJson = async (path, { method = 'GET', body, isMultipart = false, timeoutMs } = {}) => {
  const headers = await buildHeaders({ isMultipart, acceptsBinary: false });
  const response = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers,
      body: isMultipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
    },
    timeoutMs
  );

  const payload = await parseJsonOrText(response);
  if (!response.ok) {
    throw createHttpError({
      status: response.status,
      payload,
      fallbackMessage: `Erreur HTTP ${response.status}`,
    });
  }
  return unwrapPayload(payload);
};

const requestBinary = async (path, { method = 'GET', body, timeoutMs } = {}) => {
  const headers = await buildHeaders({ isMultipart: false, acceptsBinary: true });
  const response = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    timeoutMs
  );

  if (!response.ok) {
    const payload = await parseJsonOrText(response);
    throw createHttpError({
      status: response.status,
      payload,
      fallbackMessage: `Erreur HTTP ${response.status}`,
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers?.get('content-type') || '';
  const contentDisposition = response.headers?.get('content-disposition') || '';

  return {
    arrayBuffer,
    contentType,
    contentDisposition,
  };
};

export const generationRequestsApi = {
  create: (formData) =>
    requestJson('/api/generation-requests', {
      method: 'POST',
      body: formData,
      isMultipart: true,
      timeoutMs: 600000,
    }),
  get: (id) =>
    requestJson(`/api/generation-requests/${id}`, {
      method: 'GET',
    }),
};

export const documentConfigsApi = {
  create: (payload = {}) =>
    requestJson('/api/document-configs', {
      method: 'POST',
      body: payload,
    }),
  list: () =>
    requestJson('/api/document-configs', {
      method: 'GET',
    }),
  get: (id) =>
    requestJson(`/api/document-configs/${id}`, {
      method: 'GET',
    }),
  update: (id, config) =>
    requestJson(`/api/document-configs/${id}`, {
      method: 'PATCH',
      body: { config },
    }),
  remove: (id) =>
    requestJson(`/api/document-configs/${id}`, {
      method: 'DELETE',
    }),
  build: (id) =>
    requestJson(`/api/document-configs/${id}/build`, {
      method: 'POST',
    }),
  rebuildDocx: (id) =>
    requestJson(`/api/document-configs/${id}/rebuild`, {
      method: 'POST',
    }),
  preview: (id) =>
    requestBinary(`/api/document-configs/${id}/preview`, {
      method: 'GET',
      timeoutMs: 120000,
    }),
  fields: (id) =>
    requestJson(`/api/document-configs/${id}/fields`, {
      method: 'GET',
    }),
  prefill: (id, payload = {}) =>
    requestJson(`/api/document-configs/${id}/prefill`, {
      method: 'POST',
      body: payload,
      timeoutMs: 120000,
    }),
  fill: (id, data) =>
    requestBinary(`/api/document-configs/${id}/fill`, {
      method: 'POST',
      body: { data },
      timeoutMs: 120000,
    }),
  fillWithFillData: (id, fillData) =>
    requestBinary(`/api/document-configs/${id}/fill`, {
      method: 'POST',
      body: { data: fillData },
      timeoutMs: 120000,
    }),
};

export default {
  generationRequestsApi,
  documentConfigsApi,
};
