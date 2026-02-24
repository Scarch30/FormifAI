export const extractList = (response) => {
  const payload = response?.data?.data || response?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export const extractItem = (response) => {
  const payload = response?.data?.data || response?.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload.item || payload.result || payload.data || payload;
};

export const decodeMaybeUriComponent = (value) => {
  const raw = String(value ?? '');
  if (!raw) return '';

  try {
    return decodeURIComponent(raw);
  } catch (_error) {
    // ignore
  }

  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch (_error) {
    return raw;
  }
};

export const formatDate = (value) => {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatRelativeDate = (value) => {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);

  if (abs < 60) return 'à l’instant';
  if (abs < 3600) {
    const mins = Math.round(abs / 60);
    return diffSec >= 0 ? `il y a ${mins} min` : `dans ${mins} min`;
  }
  if (abs < 86400) {
    const hours = Math.round(abs / 3600);
    return diffSec >= 0 ? `il y a ${hours} h` : `dans ${hours} h`;
  }
  if (abs < 86400 * 30) {
    const days = Math.round(abs / 86400);
    return diffSec >= 0 ? `il y a ${days} j` : `dans ${days} j`;
  }

  return formatDate(value);
};

export const sortByCreatedAtDesc = (items = []) => {
  return [...items].sort((a, b) => {
    const aTime = new Date(a?.created_at || a?.createdAt || a?.updated_at || a?.updatedAt || 0).getTime();
    const bTime = new Date(b?.created_at || b?.createdAt || b?.updated_at || b?.updatedAt || 0).getTime();
    return bTime - aTime;
  });
};

export const toNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
