import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Alert,
  Pressable,
  Animated,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { formFills, templates } from '../api/client';

const DEFAULT_PAGE_ASPECT_RATIO = 1 / Math.sqrt(2);
const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 4;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const decodeURIComponentSafe = (value = '') => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
const FIELD_TYPE_TEXT = 'text';
const FIELD_TYPE_CHECKBOX = 'checkbox';
const FIELD_TYPE_RADIO = 'radio';
const FIELD_TYPE_SELECT = 'select';
const BOOLEAN_MARK_COLOR = '#111111';
const BOOLEAN_MARK_CHAR = 'X';

const normalizeFieldType = (value) => {
  const normalized = String(value || FIELD_TYPE_TEXT).trim().toLowerCase();
  if (!normalized) return FIELD_TYPE_TEXT;
  return normalized;
};

const coerceBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'oui') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'non' || normalized === '') {
      return false;
    }
  }
  return fallback;
};

const getTemplateField = (valueItem) =>
  valueItem?.template_field ||
  valueItem?.templateField ||
  valueItem?.field ||
  {};

const getFieldType = (valueItem) =>
  normalizeFieldType(valueItem?.field_type ?? getTemplateField(valueItem)?.field_type);

const getGroupId = (valueItem) =>
  String(
    valueItem?.group_id ??
      valueItem?.groupId ??
      getTemplateField(valueItem)?.group_id ??
      getTemplateField(valueItem)?.groupId ??
      ''
  ).trim();

const getOptionValue = (valueItem) =>
  valueItem?.option_value ??
  valueItem?.optionValue ??
  getTemplateField(valueItem)?.option_value ??
  getTemplateField(valueItem)?.optionValue ??
  valueItem?.display_name ??
  valueItem?.field_label ??
  valueItem?.field_name ??
  '';

const getFormatHint = (valueItem) =>
  String(
    valueItem?.format_hint ??
      valueItem?.formatHint ??
      getTemplateField(valueItem)?.format_hint ??
      getTemplateField(valueItem)?.formatHint ??
      ''
  ).trim();

const getCheckedDefault = (valueItem) =>
  coerceBoolean(
    valueItem?.is_checked_default ??
      valueItem?.isCheckedDefault ??
      getTemplateField(valueItem)?.is_checked_default ??
      getTemplateField(valueItem)?.isCheckedDefault,
    false
  );

const parseHintOptions = (formatHint) =>
  String(formatHint || '')
    .split('|')
    .map((option) => option.trim())
    .filter(Boolean);

const estimateTextLayout = ({ text, fontSize, boxWidthPx, numberOfLinesLimit }) => {
  const normalizedText = String(text ?? '');
  if (!normalizedText.length) {
    return { fits: true, requiredLines: 1, charsPerLine: Number.MAX_SAFE_INTEGER };
  }
  const safeFontSize = Math.max(1, toNumber(fontSize, 10) || 10);
  const safeWidth = Math.max(1, toNumber(boxWidthPx, 1) || 1);
  const safeLines = Math.max(1, parseInt(numberOfLinesLimit, 10) || 1);
  const charsPerLine = Math.max(1, Math.floor(safeWidth / (safeFontSize * 0.55)));
  const requiredLines = Math.max(1, Math.ceil(normalizedText.length / charsPerLine));
  return { fits: requiredLines <= safeLines, requiredLines, charsPerLine };
};

const computeFittedTextStyle = ({
  text,
  baseFontSize,
  boxWidthPx,
  boxHeightPx,
  lineHeight,
  allowWrap,
}) => {
  const normalizedText = String(text ?? '');
  const safeWidth = Math.max(1, toNumber(boxWidthPx, 1) || 1);
  const safeHeight = Math.max(1, toNumber(boxHeightPx, 1) || 1);
  const baseFont = Math.max(6, toNumber(baseFontSize, 10) || 10);
  const safeLineHeight = Math.max(1, toNumber(lineHeight, 1.2) || 1.2);
  const minFont = Math.max(6, baseFont * 0.65);
  const fitsSingleLine = (fontSize) =>
    estimateTextLayout({
      text: normalizedText,
      fontSize,
      boxWidthPx: safeWidth,
      numberOfLinesLimit: 1,
    }).fits;

  if (fitsSingleLine(baseFont)) {
    return { fontSize: baseFont, numberOfLines: 1, wrap: false, overflowed: false };
  }

  for (let font = baseFont - 0.5; font >= minFont; font -= 0.5) {
    if (fitsSingleLine(font)) {
      return { fontSize: font, numberOfLines: 1, wrap: false, overflowed: false };
    }
  }

  if (allowWrap) {
    for (let font = baseFont; font >= minFont; font -= 0.5) {
      const maxLinesPossible = Math.floor(safeHeight / (font * safeLineHeight));
      if (maxLinesPossible < 2) continue;
      const lineLimit = maxLinesPossible <= 2 ? 2 : 3;
      const numberOfLines = Math.min(lineLimit, maxLinesPossible);
      const wrapAttempt = estimateTextLayout({
        text: normalizedText,
        fontSize: font,
        boxWidthPx: safeWidth,
        numberOfLinesLimit: numberOfLines,
      });
      if (wrapAttempt.fits) {
        return { fontSize: font, numberOfLines, wrap: true, overflowed: false };
      }
    }
  }

  const overflowFont = minFont;
  const maxLinesPossible = Math.max(1, Math.floor(safeHeight / (overflowFont * safeLineHeight)));
  const lineLimit = maxLinesPossible <= 2 ? 2 : 3;
  const numberOfLines = Math.max(1, Math.min(lineLimit, maxLinesPossible));
  return {
    fontSize: overflowFont,
    numberOfLines,
    wrap: numberOfLines > 1,
    overflowed: true,
  };
};

const LAYOUT_KEYS = ['x', 'y', 'width', 'height', 'font_size', 'line_count', 'line_height'];
const LAYOUT_CONTROL_CONFIG = [
  { key: 'x', label: 'X', step: 0.2, precision: 1 },
  { key: 'y', label: 'Y', step: 0.2, precision: 1 },
  { key: 'width', label: 'Largeur', step: 0.5, precision: 1 },
  { key: 'height', label: 'Hauteur', step: 0.5, precision: 1 },
  { key: 'font_size', label: 'Police', step: 1, precision: 0 },
  { key: 'line_count', label: 'Lignes', step: 1, precision: 0 },
  { key: 'line_height', label: 'Interligne', step: 0.1, precision: 1 },
];

const resolveTemplateFieldId = (valueItem) =>
  valueItem?.template_field_id ||
  valueItem?.templateFieldId ||
  valueItem?.template_field?.id ||
  valueItem?.templateField?.id ||
  valueItem?.field?.id ||
  null;

const normalizeLayoutDraft = (draft = {}) => {
  const normalized = {
    x: clamp(toNumber(draft.x, 0) || 0, 0, 100),
    y: clamp(toNumber(draft.y, 0) || 0, 0, 100),
    width: clamp(toNumber(draft.width, 20) || 20, 2, 100),
    height: Math.max(8, toNumber(draft.height, 20) || 20),
    font_size: clamp(toNumber(draft.font_size, 8) || 8, 6, 72),
    line_count: Math.max(1, parseInt(draft.line_count ?? 1, 10) || 1),
    line_height: clamp(toNumber(draft.line_height, 1.2) || 1.2, 0.8, 3),
  };
  normalized.x = clamp(normalized.x, 0, Math.max(0, 100 - normalized.width));
  normalized.width = clamp(normalized.width, 2, Math.max(2, 100 - normalized.x));
  return normalized;
};

const pickLayoutFromValueItem = (valueItem, fromTemplate = false) => {
  const templateField =
    valueItem?.template_field ||
    valueItem?.templateField ||
    valueItem?.field ||
    {};
  const source = fromTemplate ? templateField : valueItem || {};
  const fallback = valueItem || {};
  return normalizeLayoutDraft({
    x: toNumber(source?.x, toNumber(fallback?.x, 0) || 0),
    y: toNumber(source?.y, toNumber(fallback?.y, 0) || 0),
    width: toNumber(source?.width, toNumber(fallback?.width, 20) || 20),
    height: toNumber(source?.height, toNumber(fallback?.height, 20) || 20),
    font_size: toNumber(
      source?.font_size ?? source?.fontSize,
      toNumber(fallback?.font_size ?? fallback?.fontSize, 8) || 8
    ),
    line_count: parseInt(
      source?.line_count ?? source?.lineCount ?? fallback?.line_count ?? fallback?.lineCount ?? 1,
      10
    ),
    line_height: toNumber(
      source?.line_height ?? source?.lineHeight,
      toNumber(fallback?.line_height ?? fallback?.lineHeight, 1.2) || 1.2
    ),
  });
};

const hasLayoutChanges = (nextLayout, prevLayout) => {
  if (!nextLayout || !prevLayout) return false;
  return LAYOUT_KEYS.some((key) => {
    const nextValue = toNumber(nextLayout[key], null);
    const prevValue = toNumber(prevLayout[key], null);
    if (nextValue === null || prevValue === null) return nextLayout[key] !== prevLayout[key];
    return Math.abs(nextValue - prevValue) > 0.001;
  });
};

const extractResponseItem = (response) => {
  const payload = response?.data?.data || response?.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload.item || payload.result || payload.data || payload;
};

const getFillStatusLabel = (status) => {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'processing':
      return 'En cours';
    case 'done':
      return 'Termine';
    case 'error':
      return 'Erreur';
    default:
      return status || 'Inconnu';
  }
};

const resolveFillSourceType = (fill) => {
  const explicitType = String(fill?.source_type || fill?.sourceType || '').toLowerCase();
  if (explicitType) return explicitType;
  if (fill?.transcription_id || fill?.transcriptionId) return 'transcription';
  if (fill?.ocr_document_id || fill?.ocrDocumentId) return 'ocr';
  if (fill?.source_form_fill_id || fill?.sourceFormFillId) return 'form_fill';
  return null;
};

const resolveFillSourceId = (fill, sourceType) => {
  const explicitSourceId = fill?.source_id ?? fill?.sourceId;
  if (explicitSourceId !== null && explicitSourceId !== undefined) return explicitSourceId;
  if (sourceType === 'transcription') return fill?.transcription_id ?? fill?.transcriptionId ?? null;
  if (sourceType === 'ocr') return fill?.ocr_document_id ?? fill?.ocrDocumentId ?? null;
  if (sourceType === 'form_fill') return fill?.source_form_fill_id ?? fill?.sourceFormFillId ?? null;
  return null;
};

const getFillSourceIcon = (sourceType) => {
  switch (sourceType) {
    case 'transcription':
      return '🎤';
    case 'ocr':
      return '📷';
    case 'form_fill':
      return '📋';
    default:
      return '•';
  }
};

const getFillSourceLabel = (sourceType) => {
  switch (sourceType) {
    case 'transcription':
      return 'Transcription';
    case 'ocr':
      return 'OCR';
    case 'form_fill':
      return 'Formulaire';
    default:
      return 'Source';
  }
};

const getFillSourceDisplayName = (fill, sourceType, sourceId) => {
  if (sourceType === 'transcription') {
    return fill?.transcription_title || fill?.transcriptionTitle || `Transcription #${sourceId ?? ''}`;
  }
  if (sourceType === 'ocr') {
    return (
      fill?.ocr_document_title ||
      fill?.ocrDocumentTitle ||
      fill?.ocr_title ||
      fill?.ocrTitle ||
      fill?.source_title ||
      fill?.sourceTitle ||
      `Document OCR #${sourceId ?? ''}`
    );
  }
  if (sourceType === 'form_fill') {
    return (
      fill?.source_form_fill_name ||
      fill?.sourceFormFillName ||
      fill?.source_form_fill_title ||
      fill?.sourceFormFillTitle ||
      fill?.source_form_fill_document_name ||
      fill?.sourceFormFillDocumentName ||
      `Formulaire #${sourceId ?? ''}`
    );
  }
  return fill?.source_title || fill?.sourceTitle || `Source #${sourceId ?? ''}`;
};

export default function FormFillScreen({ route, navigation }) {
  const formFillId = route?.params?.formFillId;
  const [formFill, setFormFill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screenError, setScreenError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageImageUrl, setPageImageUrl] = useState(null);
  const [pageImageSize, setPageImageSize] = useState(null);
  const [previewSurfaceLayout, setPreviewSurfaceLayout] = useState({ width: 0, height: 0 });
  const [imageLoading, setImageLoading] = useState(false);
  const [editingValue, setEditingValue] = useState(null);
  const [editValueDraft, setEditValueDraft] = useState('');
  const [layoutDraft, setLayoutDraft] = useState(null);
  const [layoutOriginal, setLayoutOriginal] = useState(null);
  const [layoutExpanded, setLayoutExpanded] = useState(false);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [savingValueId, setSavingValueId] = useState(null);
  const [savingForm, setSavingForm] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [zoomScaleValue, setZoomScaleValue] = useState(1);

  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const zoomScaleRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;

  const zoomScaleAnim = Animated.multiply(baseScale, pinchScale);
  const translateXAnim = Animated.add(translateX, panX);
  const translateYAnim = Animated.add(translateY, panY);

  const loadFormFill = useCallback(
    async ({ silent } = {}) => {
      if (!formFillId) return null;
      if (!silent) {
        setLoading(true);
        setScreenError('');
      }

      try {
        const response = await formFills.getFormFill(formFillId);
        const payload = extractResponseItem(response) || null;
        setFormFill(payload);
        return payload;
      } catch (error) {
        console.error('Erreur chargement form fill:', error);
        setScreenError('Impossible de charger ce remplissage');
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [formFillId]
  );

  useEffect(() => {
    loadFormFill();
  }, [loadFormFill]);

  useEffect(() => {
    if (!formFill?.id) return;
    if (formFill.status !== 'pending' && formFill.status !== 'processing') return;

    const interval = setInterval(async () => {
      try {
        const response = await formFills.getFormFill(formFill.id);
        const payload = extractResponseItem(response);
        if (!payload) return;
        setFormFill(payload);
      } catch (error) {
        console.error('Erreur polling form fill:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [formFill?.id, formFill?.status]);

  const values = useMemo(
    () => (Array.isArray(formFill?.values) ? formFill.values : []),
    [formFill?.values]
  );
  const maxPageFromValues = useMemo(
    () =>
      values.reduce((acc, valueItem) => {
        const pageNumber = toNumber(valueItem?.page_number, 1) || 1;
        return Math.max(acc, pageNumber);
      }, 1),
    [values]
  );
  const pagesTotal = Math.max(
    1,
    toNumber(formFill?.pages_total, null) || maxPageFromValues || 1
  );
  const pagesProcessed = clamp(
    toNumber(formFill?.pages_processed, 0) || 0,
    0,
    pagesTotal
  );

  useEffect(() => {
    if (currentPage <= pagesTotal) return;
    setCurrentPage(1);
  }, [currentPage, pagesTotal]);

  const loadPageImage = useCallback(async () => {
    if (!formFill?.document_id || !currentPage) {
      setPageImageUrl(null);
      return;
    }
    try {
      const url = await templates.getPageImageUrl(formFill.document_id, currentPage);
      setPageImageUrl(url || null);
    } catch (error) {
      console.error('Erreur image page form fill:', error);
      setPageImageUrl(null);
    }
  }, [formFill?.document_id, currentPage]);

  useEffect(() => {
    loadPageImage();
  }, [loadPageImage]);

  useEffect(() => {
    if (!pageImageUrl) {
      setPageImageSize(null);
      return;
    }

    let canceled = false;
    Image.getSize(
      pageImageUrl,
      (width, height) => {
        if (canceled) return;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          setPageImageSize({ width, height });
          return;
        }
        setPageImageSize(null);
      },
      () => {
        if (!canceled) setPageImageSize(null);
      }
    );

    return () => {
      canceled = true;
    };
  }, [pageImageUrl]);

  const pageAspectRatio =
    Number(pageImageSize?.width) > 0 && Number(pageImageSize?.height) > 0
      ? Number(pageImageSize.width) / Number(pageImageSize.height)
      : DEFAULT_PAGE_ASPECT_RATIO;

  const previewImageLayout = useMemo(() => {
    const surfaceWidth = Number(previewSurfaceLayout?.width) || 0;
    const surfaceHeight = Number(previewSurfaceLayout?.height) || 0;
    if (!surfaceWidth || !surfaceHeight) return null;

    const safeRatio =
      Number.isFinite(pageAspectRatio) && pageAspectRatio > 0
        ? pageAspectRatio
        : DEFAULT_PAGE_ASPECT_RATIO;

    let frameWidth = surfaceWidth;
    let frameHeight = frameWidth / safeRatio;
    if (frameHeight > surfaceHeight) {
      frameHeight = surfaceHeight;
      frameWidth = frameHeight * safeRatio;
    }

    return { width: frameWidth, height: frameHeight };
  }, [pageAspectRatio, previewSurfaceLayout]);

  const pageValues = useMemo(
    () =>
      values.filter((valueItem) => {
        const pageNumber = toNumber(valueItem?.page_number, 1) || 1;
        return pageNumber === currentPage;
      }),
    [values, currentPage]
  );
  const editingFieldType = useMemo(
    () => getFieldType(editingValue),
    [editingValue]
  );
  const editingGroupId = useMemo(
    () => getGroupId(editingValue),
    [editingValue]
  );
  const radioGroupValues = useMemo(() => {
    if (editingFieldType !== FIELD_TYPE_RADIO || !editingGroupId) return [];
    return pageValues.filter(
      (valueItem) =>
        getFieldType(valueItem) === FIELD_TYPE_RADIO &&
        getGroupId(valueItem) === editingGroupId
    );
  }, [editingFieldType, editingGroupId, pageValues]);
  const selectOptions = useMemo(() => {
    if (editingFieldType !== FIELD_TYPE_SELECT) return [];
    const hintOptions = parseHintOptions(getFormatHint(editingValue));
    if (hintOptions.length) return hintOptions;
    if (!editingGroupId) return [];
    const fromRadio = pageValues
      .filter(
        (valueItem) =>
          getFieldType(valueItem) === FIELD_TYPE_RADIO &&
          getGroupId(valueItem) === editingGroupId
      )
      .map((valueItem) => String(getOptionValue(valueItem) || '').trim())
      .filter(Boolean);
    return Array.from(new Set(fromRadio));
  }, [editingFieldType, editingGroupId, editingValue, pageValues]);

  const { filledCount, reviewCount, emptyCount } = useMemo(() => {
    const counters = { filledCount: 0, reviewCount: 0, emptyCount: 0 };
    values.forEach((valueItem) => {
      const normalizedValue = valueItem?.value ?? null;
      if (normalizedValue === null) {
        counters.emptyCount += 1;
        return;
      }
      if (valueItem?.needs_review === true) {
        counters.reviewCount += 1;
        return;
      }
      counters.filledCount += 1;
    });
    return counters;
  }, [values]);

  const documentName = useMemo(
    () => decodeURIComponentSafe(formFill?.document_name || ''),
    [formFill?.document_name]
  );

  const applyLocalLayoutPatch = useCallback((valueId, patch) => {
    if (!valueId || !patch) return;
    setFormFill((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        values: (prev.values || []).map((item) =>
          item.id === valueId
            ? {
                ...item,
                ...patch,
              }
            : item
        ),
      };
    });
  }, []);

  const openEditValue = (valueItem) => {
    const fieldType = getFieldType(valueItem);
    const rawValue = valueItem?.value;
    const nextDraft = (() => {
      if (fieldType === FIELD_TYPE_CHECKBOX || fieldType === FIELD_TYPE_RADIO) {
        if (rawValue === null || rawValue === undefined || rawValue === '') {
          const defaultChecked = fieldType === FIELD_TYPE_CHECKBOX ? getCheckedDefault(valueItem) : false;
          return defaultChecked ? 'true' : 'false';
        }
        return coerceBoolean(rawValue, false) ? 'true' : 'false';
      }
      return rawValue === null || rawValue === undefined ? '' : String(rawValue);
    })();

    setEditingValue(valueItem);
    setEditValueDraft(nextDraft);
    const nextLayout = pickLayoutFromValueItem(valueItem, false);
    setLayoutDraft(nextLayout);
    setLayoutOriginal(nextLayout);
    setLayoutExpanded(false);
    setLayoutDirty(false);
  };

  const closeEditValue = ({ keepLayoutPreview = false } = {}) => {
    if (!keepLayoutPreview && editingValue?.id && layoutOriginal) {
      applyLocalLayoutPatch(editingValue.id, layoutOriginal);
    }
    setEditingValue(null);
    setEditValueDraft('');
    setLayoutDraft(null);
    setLayoutOriginal(null);
    setLayoutExpanded(false);
    setLayoutDirty(false);
  };

  const applyLayoutDelta = useCallback(
    (key, delta) => {
      if (!editingValue?.id || !layoutDraft) return;
      const currentValue = toNumber(layoutDraft[key], 0) || 0;
      const nextRaw = key === 'line_count' ? currentValue + Math.round(delta) : currentValue + delta;
      const nextDraft = normalizeLayoutDraft({
        ...layoutDraft,
        [key]: nextRaw,
      });
      setLayoutDraft(nextDraft);
      setLayoutDirty(hasLayoutChanges(nextDraft, layoutOriginal));
      applyLocalLayoutPatch(editingValue.id, nextDraft);
    },
    [applyLocalLayoutPatch, editingValue?.id, layoutDraft, layoutOriginal]
  );

  const handleResetLayoutOverride = useCallback(async () => {
    const activeFormFillId = formFill?.id || formFillId;
    if (!editingValue?.id || !activeFormFillId) return;
    const templateFieldId = resolveTemplateFieldId(editingValue);
    if (!templateFieldId) {
      Alert.alert('Info', 'Override indisponible pour ce champ');
      return;
    }

    setSavingValueId(editingValue.id);
    try {
      await formFills.deleteFieldOverride(activeFormFillId, templateFieldId);
      const resetLayout = pickLayoutFromValueItem(editingValue, true);
      setLayoutDraft(resetLayout);
      setLayoutOriginal(resetLayout);
      setLayoutDirty(false);
      applyLocalLayoutPatch(editingValue.id, resetLayout);
    } catch (error) {
      console.error('Erreur reset override layout:', error);
      Alert.alert('Info', 'Mise en page non reinitialisee');
    } finally {
      setSavingValueId(null);
    }
  }, [applyLocalLayoutPatch, editingValue, formFill?.id, formFillId]);

  const selectRadioOption = useCallback(
    async (selectedValueId, groupId) => {
      const normalizedGroupId = String(groupId || '').trim();
      if (!selectedValueId || !normalizedGroupId) return;
      const radioItems = pageValues.filter(
        (valueItem) =>
          getFieldType(valueItem) === FIELD_TYPE_RADIO &&
          getGroupId(valueItem) === normalizedGroupId
      );
      if (!radioItems.length) return;

      setSavingValueId(selectedValueId);
      try {
        await formFills.updateFilledValue(selectedValueId, 'true');
        const others = radioItems.filter((valueItem) => valueItem.id !== selectedValueId);
        for (const other of others) {
          if (!other?.id) continue;
          await formFills.updateFilledValue(other.id, 'false');
        }

        const radioIdSet = new Set(radioItems.map((valueItem) => valueItem.id));
        setFormFill((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            values: (prev.values || []).map((valueItem) => {
              if (!radioIdSet.has(valueItem.id)) return valueItem;
              return {
                ...valueItem,
                value: valueItem.id === selectedValueId ? 'true' : 'false',
                needs_review: false,
              };
            }),
          };
        });

        setEditingValue((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            value: prev.id === selectedValueId ? 'true' : 'false',
          };
        });
        setEditValueDraft(editingValue?.id === selectedValueId ? 'true' : 'false');
      } catch (error) {
        console.error('Erreur sélection radio:', error);
        Alert.alert('Erreur', 'Impossible de mettre à jour cette option radio');
      } finally {
        setSavingValueId(null);
      }
    },
    [editingValue?.id, pageValues]
  );

  const handleSaveValue = async () => {
    if (!editingValue?.id) return;
    const fieldType = getFieldType(editingValue);
    const isBooleanField = fieldType === FIELD_TYPE_CHECKBOX || fieldType === FIELD_TYPE_RADIO;
    const isRadioField = fieldType === FIELD_TYPE_RADIO;
    const valueId = editingValue.id;
    const originalValue =
      editingValue?.value === null || editingValue?.value === undefined
        ? isBooleanField
          ? 'false'
          : ''
        : String(editingValue.value);
    const nextValuePayload = isBooleanField
      ? coerceBoolean(editValueDraft, false)
        ? 'true'
        : 'false'
      : editValueDraft;
    const valueChanged = nextValuePayload !== originalValue;
    const shouldClearReview = editingValue?.needs_review === true;
    const shouldPersistValue = valueChanged || shouldClearReview;
    const activeFormFillId = formFill?.id || formFillId;
    const nextLayout = normalizeLayoutDraft(layoutDraft || pickLayoutFromValueItem(editingValue, false));
    const prevLayout = normalizeLayoutDraft(layoutOriginal || pickLayoutFromValueItem(editingValue, false));
    const layoutChanged = hasLayoutChanges(nextLayout, prevLayout);
    const templateFieldId = resolveTemplateFieldId(editingValue);

    setSavingValueId(editingValue.id);
    try {
      if (shouldPersistValue) {
        const response = await formFills.updateFilledValue(editingValue.id, nextValuePayload);
        const updated = extractResponseItem(response);
        setFormFill((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            values: (prev.values || []).map((item) =>
              item.id === editingValue.id
                ? {
                    ...item,
                    ...(updated || {}),
                    value: nextValuePayload,
                    needs_review: false,
                  }
                : item
            ),
          };
        });
        setEditingValue((prev) =>
          prev
            ? {
                ...prev,
                ...(updated || {}),
                value: nextValuePayload,
                needs_review: false,
              }
            : prev
        );
      }

      let layoutSaveFailed = false;
      if (layoutChanged) {
        if (activeFormFillId && templateFieldId) {
          try {
            await formFills.patchFieldOverride(activeFormFillId, templateFieldId, nextLayout);
            applyLocalLayoutPatch(valueId, nextLayout);
            setLayoutOriginal(nextLayout);
            setLayoutDirty(false);
          } catch (layoutError) {
            layoutSaveFailed = true;
            console.error('Erreur sauvegarde mise en page override:', layoutError);
          }
        } else {
          layoutSaveFailed = true;
        }
      }

      if (layoutSaveFailed) {
        Alert.alert('Info', 'Mise en page non sauvegardee');
      }

      closeEditValue({ keepLayoutPreview: !layoutSaveFailed });
    } catch (error) {
      console.error('Erreur mise a jour valeur:', error);
      Alert.alert('Erreur', 'Impossible de mettre a jour cette valeur');
    } finally {
      setSavingValueId(null);
    }
  };

  const handleRetry = async () => {
    const sourceType = resolveFillSourceType(formFill) || 'transcription';
    const sourceId = resolveFillSourceId(formFill, sourceType);
    if (!formFill?.document_id || sourceId === null || sourceId === undefined) {
      Alert.alert('Erreur', 'Source du remplissage introuvable');
      return;
    }
    setRetrying(true);
    try {
      const response = await formFills.createFormFill(
        formFill.document_id,
        sourceType,
        sourceId
      );
      const next = extractResponseItem(response);
      if (!next?.id) {
        Alert.alert('Erreur', 'Relance impossible, reessayez plus tard');
        return;
      }
      navigation.replace('FormFill', { formFillId: next.id });
    } catch (error) {
      console.error('Erreur relance form fill:', error);
      Alert.alert('Erreur', 'Impossible de relancer le remplissage');
    } finally {
      setRetrying(false);
    }
  };

  const closeResultDocument = useCallback(() => {
    const stackState = navigation?.getState?.();
    const hasResultsListRoute = Array.isArray(stackState?.routes)
      ? stackState.routes.some((routeItem) => routeItem?.name === 'ResultsListScreen')
      : false;

    if (hasResultsListRoute && typeof navigation?.navigate === 'function') {
      navigation.navigate('ResultsListScreen');
      return;
    }

    if (typeof navigation?.goBack === 'function' && navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    const parentNavigation = navigation?.getParent?.();
    if (typeof parentNavigation?.navigate === 'function') {
      parentNavigation.navigate('ResultsStack', { screen: 'ResultsListScreen' });
      return;
    }
  }, [navigation]);

  const handleSaveFormFill = useCallback(async () => {
    if (!formFill?.id) return;
    if (savingForm || savingValueId) return;

    const reviewItems = values.filter((valueItem) => valueItem?.id && valueItem?.needs_review === true);
    if (!reviewItems.length) {
      closeResultDocument();
      return;
    }

    setSavingForm(true);
    try {
      for (const valueItem of reviewItems) {
        const fieldType = getFieldType(valueItem);
        const isBooleanField = fieldType === FIELD_TYPE_CHECKBOX || fieldType === FIELD_TYPE_RADIO;
        const normalizedValue = isBooleanField
          ? coerceBoolean(
              valueItem?.value,
              fieldType === FIELD_TYPE_CHECKBOX ? getCheckedDefault(valueItem) : false
            )
            ? 'true'
            : 'false'
          : valueItem?.value === null || valueItem?.value === undefined
            ? ''
            : String(valueItem.value);
        await formFills.updateFilledValue(valueItem.id, normalizedValue);
      }

      const reviewedIds = new Set(reviewItems.map((valueItem) => valueItem.id));
      setFormFill((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          values: (prev.values || []).map((valueItem) =>
            reviewedIds.has(valueItem.id)
              ? {
                  ...valueItem,
                  needs_review: false,
                }
              : valueItem
          ),
        };
      });

      closeResultDocument();
    } catch (error) {
      console.error('Erreur enregistrement form fill:', error);
      Alert.alert('Erreur', "Impossible d'enregistrer ce formulaire pour le moment.");
    } finally {
      setSavingForm(false);
    }
  }, [closeResultDocument, formFill?.id, savingForm, savingValueId, values]);

  const onPreviewSurfaceLayout = useCallback((event) => {
    const width = Number(event?.nativeEvent?.layout?.width) || 0;
    const height = Number(event?.nativeEvent?.layout?.height) || 0;
    setPreviewSurfaceLayout((prev) => {
      if (prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

  const applyZoomScale = useCallback(
    (nextScale) => {
      const safeScale = clamp(nextScale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
      zoomScaleRef.current = safeScale;
      baseScale.setValue(safeScale);
      pinchScale.setValue(1);
      if (safeScale <= MIN_ZOOM_SCALE) {
        panOffsetRef.current = { x: 0, y: 0 };
        translateX.setValue(0);
        translateY.setValue(0);
        panX.setValue(0);
        panY.setValue(0);
      }
      setZoomScaleValue(safeScale);
    },
    [baseScale, panX, panY, pinchScale, translateX, translateY]
  );

  const resetZoom = useCallback(() => {
    applyZoomScale(MIN_ZOOM_SCALE);
  }, [applyZoomScale]);

  useEffect(() => {
    resetZoom();
  }, [currentPage, pageImageUrl, resetZoom]);

  const onPanGestureEvent = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { translationX: panX, translationY: panY } }],
        { useNativeDriver: false }
      ),
    [panX, panY]
  );

  const onPanStateChange = useCallback(
    (event) => {
      const { oldState, translationX, translationY } = event.nativeEvent;
      if (oldState !== State.ACTIVE) return;
      if (zoomScaleRef.current <= MIN_ZOOM_SCALE) {
        panX.setValue(0);
        panY.setValue(0);
        return;
      }
      const nextX = panOffsetRef.current.x + (Number(translationX) || 0);
      const nextY = panOffsetRef.current.y + (Number(translationY) || 0);
      panOffsetRef.current = { x: nextX, y: nextY };
      translateX.setValue(nextX);
      translateY.setValue(nextY);
      panX.setValue(0);
      panY.setValue(0);
    },
    [panX, panY, translateX, translateY]
  );

  const onPinchGestureEvent = useMemo(
    () =>
      Animated.event([{ nativeEvent: { scale: pinchScale } }], {
        useNativeDriver: false,
      }),
    [pinchScale]
  );

  const onPinchStateChange = useCallback(
    (event) => {
      const { oldState, scale } = event.nativeEvent;
      if (oldState !== State.ACTIVE) return;
      const pinchValue = Number(scale) || 1;
      const nextScale = zoomScaleRef.current * pinchValue;
      applyZoomScale(nextScale);
    },
    [applyZoomScale]
  );

  const handleZoomIn = useCallback(() => {
    applyZoomScale(zoomScaleRef.current * 1.25);
  }, [applyZoomScale]);

  const handleZoomOut = useCallback(() => {
    applyZoomScale(zoomScaleRef.current / 1.25);
  }, [applyZoomScale]);

  const renderOverlay = () => {
    if (!previewImageLayout || pageValues.length === 0) return null;

    return (
      <View pointerEvents="box-none" style={styles.overlayLayer}>
        {pageValues.map((valueItem, index) => {
          const fieldConfig =
            valueItem?.template_field ||
            valueItem?.templateField ||
            valueItem?.field ||
            {};
          const fieldType = getFieldType(valueItem);
          const isCheckboxField = fieldType === FIELD_TYPE_CHECKBOX;
          const isRadioField = fieldType === FIELD_TYPE_RADIO;
          const xPercent = clamp(toNumber(valueItem?.x, 0) || 0, 0, 100);
          const yPercent = clamp(toNumber(valueItem?.y, 0) || 0, 0, 100);
          const widthPercent = clamp(toNumber(valueItem?.width, 20) || 20, 2, 100);
          const leftPercent = clamp(xPercent, 0, Math.max(0, 100 - widthPercent));
          const leftPx = (leftPercent / 100) * previewImageLayout.width;
          const topPx = (yPercent / 100) * previewImageLayout.height;
          const widthPx = (widthPercent / 100) * previewImageLayout.width;
          const overlayFieldKey = valueItem?.id ? String(valueItem.id) : `${index}-${leftPercent}-${yPercent}`;
          const configuredFontSize = toNumber(
            valueItem?.font_size ??
              valueItem?.fontSize ??
              fieldConfig?.font_size ??
              fieldConfig?.fontSize,
            null
          );
          const configuredLineHeight = Math.max(
            0.8,
            toNumber(
              valueItem?.line_height ??
                valueItem?.lineHeight ??
                fieldConfig?.line_height ??
                fieldConfig?.lineHeight,
              1.2
            ) || 1.2
          );
          const parsedLineCount = parseInt(
            valueItem?.lines ??
              valueItem?.line_count ??
              valueItem?.lineCount ??
              fieldConfig?.lines ??
              fieldConfig?.line_count ??
              fieldConfig?.lineCount ??
              1,
            10
          );
          const configuredLineCount =
            Number.isFinite(parsedLineCount) && parsedLineCount > 0 ? parsedLineCount : 1;
          const isMultiLineField = configuredLineCount > 1;
          const fallbackHeightPx = Math.max(
            14,
            (configuredFontSize || 8) * configuredLineHeight * configuredLineCount
          );
          const rawHeightPx = toNumber(valueItem?.height ?? fieldConfig?.height, null);
          const baseHeightPx =
            rawHeightPx !== null && rawHeightPx > 0 ? rawHeightPx : fallbackHeightPx;
          const fieldHeightPx = clamp(
            baseHeightPx,
            8,
            Math.max(8, previewImageLayout.height - topPx)
          );

          const normalizedValue = valueItem?.value ?? null;
          const boolValue = coerceBoolean(
            normalizedValue,
            isCheckboxField ? getCheckedDefault(valueItem) : false
          );
          const isEmpty = normalizedValue === null;
          const needsReview = valueItem?.needs_review === true && !isEmpty;
          const confidence = toNumber(valueItem?.confidence, null);
          const isHighConfidence =
            typeof confidence === 'number' && confidence >= 0.8 && !needsReview && !isEmpty;
          const baseFontForFit =
            configuredFontSize !== null
              ? configuredFontSize
              : Math.max(6, Math.min(fieldHeightPx * 0.65, 14));
          const fittedTextStyle = computeFittedTextStyle({
            text: normalizedValue ?? '',
            baseFontSize: baseFontForFit,
            boxWidthPx: widthPx,
            boxHeightPx: fieldHeightPx,
            lineHeight: configuredLineHeight,
            allowWrap: isMultiLineField,
          });
          const fontSize = clamp(fittedTextStyle.fontSize, 6, 14);
          const fittedNumberOfLines = Math.max(1, fittedTextStyle.numberOfLines);
          const renderedNumberOfLines = isMultiLineField ? undefined : 1;
          const overflowed = !isEmpty && fittedTextStyle.overflowed;
          const uiNeedsReview = needsReview || overflowed;
          const valueText = (() => {
            if (isEmpty) return '—';
            if (isMultiLineField) return String(normalizedValue);
            if (!overflowed) return String(normalizedValue);
            const charsPerLine = Math.max(1, Math.floor(widthPx / Math.max(fontSize * 0.55, 1)));
            const visibleChars = Math.max(12, charsPerLine * fittedNumberOfLines - 2);
            const snippet = String(normalizedValue).slice(0, Math.min(30, visibleChars)).trimEnd();
            return `${snippet} ↗`;
          })();

          let fieldStyle = styles.overlayFieldFilled;
          let textStyle = styles.overlayFieldTextFilled;
          if (isEmpty) {
            fieldStyle = styles.overlayFieldEmpty;
            textStyle = styles.overlayFieldTextEmpty;
          } else if (uiNeedsReview) {
            fieldStyle = styles.overlayFieldReview;
            textStyle = styles.overlayFieldTextReview;
          } else if (isHighConfidence) {
            fieldStyle = styles.overlayFieldFilled;
            textStyle = styles.overlayFieldTextFilled;
          }

          if (isCheckboxField || isRadioField) {
            const markSide = Math.max(8, Math.min(widthPx, fieldHeightPx));
            const boolFontSize = clamp(
              configuredFontSize !== null ? configuredFontSize * 0.72 : markSide * 0.48,
              6,
              11
            );
            return (
              <Pressable
                key={overlayFieldKey}
                style={[
                  styles.overlayFieldBase,
                  {
                    left: leftPx,
                    top: topPx,
                    width: widthPx,
                    height: fieldHeightPx,
                    backgroundColor: 'transparent',
                    paddingHorizontal: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'visible',
                  },
                ]}
                onPress={() => openEditValue(valueItem)}
              >
                <Text
                  style={{
                    fontSize: boolFontSize,
                    lineHeight: boolFontSize,
                    color: BOOLEAN_MARK_COLOR,
                    fontWeight: Platform.OS === 'ios' ? '700' : '600',
                    textAlign: 'center',
                    textAlignVertical: 'center',
                    includeFontPadding: false,
                  }}
                >
                  {boolValue ? BOOLEAN_MARK_CHAR : ''}
                </Text>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={overlayFieldKey}
              style={[
                styles.overlayFieldBase,
                fieldStyle,
                {
                  left: leftPx,
                  top: topPx,
                  width: widthPx,
                  height: fieldHeightPx,
                },
              ]}
              onPress={() => openEditValue(valueItem)}
            >
              <Text
                numberOfLines={renderedNumberOfLines}
                ellipsizeMode={isMultiLineField ? undefined : 'tail'}
                style={[
                  styles.overlayFieldTextBase,
                  textStyle,
                  { fontSize, lineHeight: fontSize * configuredLineHeight },
                ]}
              >
                {valueText}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderProcessing = () => (
    <View style={styles.stateWrap}>
      <Text style={styles.stateTitle}>Remplissage en cours...</Text>
      <Text style={styles.stateSubtitle}>
        {documentName || `Document #${formFill?.document_id ?? ''}`}
      </Text>
      <Text style={styles.stateSubtitle}>
        {sourceLine}
      </Text>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round((pagesProcessed / pagesTotal) * 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          Page {Math.max(1, pagesProcessed)}/{pagesTotal} en cours de traitement...
        </Text>
      </View>

      <ActivityIndicator size="large" color="#4F46E5" />
    </View>
  );

  const renderError = () => (
    <View style={styles.stateWrap}>
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.stateTitle}>Une erreur est survenue</Text>
      <Text style={styles.errorText}>{formFill?.error_message || 'Erreur inconnue'}</Text>

      <TouchableOpacity
        style={[styles.stateButton, retrying && styles.stateButtonDisabled]}
        onPress={handleRetry}
        disabled={retrying}
      >
        {retrying ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.stateButtonText}>Reessayer</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.stateBackButton} onPress={() => navigation.goBack()}>
        <Text style={styles.stateBackButtonText}>Retour</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Form Fill</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </View>
    );
  }

  if (screenError || !formFill) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Form Fill</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{screenError || 'Remplissage introuvable'}</Text>
          <TouchableOpacity style={styles.stateButton} onPress={() => loadFormFill()}>
            <Text style={styles.stateButtonText}>Recharger</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const status = formFill?.status || 'pending';
  const canGoPreviousPage = currentPage > 1;
  const canGoNextPage = currentPage < pagesTotal;
  const confidenceRatio = toNumber(editingValue?.confidence, null);
  const sourceType = resolveFillSourceType(formFill) || 'transcription';
  const sourceId = resolveFillSourceId(formFill, sourceType);
  const sourceIcon = getFillSourceIcon(sourceType);
  const sourceLabel = getFillSourceLabel(sourceType);
  const sourceDisplayName = getFillSourceDisplayName(formFill, sourceType, sourceId);
  const sourceLine = `${sourceIcon} ${sourceLabel}: ${sourceDisplayName}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Remplissage {getFillStatusLabel(status)}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {status === 'pending' || status === 'processing' ? (
        renderProcessing()
      ) : status === 'error' ? (
        renderError()
      ) : (
        <View style={styles.doneWrap}>
          <View style={styles.docInfoCard}>
            <Text style={styles.docInfoTitle} numberOfLines={1}>
              {documentName || `Document #${formFill?.document_id ?? ''}`}
            </Text>
            <Text style={styles.docInfoSubtitle} numberOfLines={1}>
              {sourceLine}
            </Text>
          </View>

          <View style={styles.pageBar}>
            <TouchableOpacity
              style={[styles.pageNavButton, !canGoPreviousPage && styles.pageNavButtonDisabled]}
              onPress={() => canGoPreviousPage && setCurrentPage((prev) => prev - 1)}
              disabled={!canGoPreviousPage}
            >
              <Text style={styles.pageNavButtonText}>◄</Text>
            </TouchableOpacity>
            <Text style={styles.pageIndicator}>
              Page {currentPage}/{pagesTotal}
            </Text>
            <TouchableOpacity
              style={[styles.pageNavButton, !canGoNextPage && styles.pageNavButtonDisabled]}
              onPress={() => canGoNextPage && setCurrentPage((prev) => prev + 1)}
              disabled={!canGoNextPage}
            >
              <Text style={styles.pageNavButtonText}>►</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.previewContainer} onLayout={onPreviewSurfaceLayout}>
            {!pageImageUrl ? (
              <View style={styles.previewEmpty}>
                <Text style={styles.previewEmptyText}>Image de page indisponible</Text>
              </View>
            ) : (
              <>
                {previewImageLayout && (
                  <PanGestureHandler
                    ref={panRef}
                    simultaneousHandlers={pinchRef}
                    enabled={zoomScaleValue > 1.01}
                    onGestureEvent={onPanGestureEvent}
                    onHandlerStateChange={onPanStateChange}
                  >
                    <Animated.View style={styles.zoomGestureHost}>
                      <PinchGestureHandler
                        ref={pinchRef}
                        simultaneousHandlers={panRef}
                        onGestureEvent={onPinchGestureEvent}
                        onHandlerStateChange={onPinchStateChange}
                      >
                        <Animated.View
                          style={[
                            styles.zoomContent,
                            {
                              transform: [
                                { translateX: translateXAnim },
                                { translateY: translateYAnim },
                                { scale: zoomScaleAnim },
                              ],
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.previewImageFrame,
                              {
                                width: previewImageLayout.width,
                                height: previewImageLayout.height,
                              },
                            ]}
                          >
                            <Image
                              source={{ uri: pageImageUrl }}
                              style={styles.pageImage}
                              resizeMode="cover"
                              onLoadStart={() => setImageLoading(true)}
                              onLoadEnd={() => setImageLoading(false)}
                              onError={() => setImageLoading(false)}
                            />
                            {renderOverlay()}
                          </View>
                        </Animated.View>
                      </PinchGestureHandler>
                    </Animated.View>
                  </PanGestureHandler>
                )}
                {imageLoading && (
                  <View style={styles.pageLoader}>
                    <ActivityIndicator size="small" color="#4F46E5" />
                  </View>
                )}
                {pageImageUrl && (
                  <View style={styles.zoomControls}>
                    <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut}>
                      <Text style={styles.zoomButtonText}>−</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.zoomButton} onPress={resetZoom}>
                      <Text style={styles.zoomValueText}>{Math.round(zoomScaleValue * 100)}%</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.zoomButton} onPress={handleZoomIn}>
                      <Text style={styles.zoomButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>

          <View style={styles.summaryBar}>
            <Text style={styles.summaryGreen}>✅ {filledCount} remplis</Text>
            <Text style={styles.summaryOrange}>⚠️ {reviewCount} a verifier</Text>
            <Text style={styles.summaryRed}>❌ {emptyCount} vides</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.saveFormButton,
              (savingForm || Boolean(savingValueId)) && styles.saveFormButtonDisabled,
            ]}
            onPress={handleSaveFormFill}
            disabled={savingForm || Boolean(savingValueId)}
          >
            {savingForm ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveFormButtonText}>Valider et enregistrer le formulaire</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={Boolean(editingValue)} transparent animationType="slide" onRequestClose={closeEditValue}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => {
              if (!savingValueId) closeEditValue();
            }}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>
                {editingValue?.display_name || editingValue?.field_label || editingValue?.field_name || 'Champ'}
              </Text>
              <Text style={styles.modalSubTitle}>
                {(editingValue?.field_label || 'Champ') +
                  (editingValue?.category_label ? ` • ${editingValue.category_label}` : '')}
              </Text>

              {typeof confidenceRatio === 'number' && (
                <Text
                  style={[
                    styles.confidenceText,
                    confidenceRatio >= 0.8 ? styles.confidenceHigh : styles.confidenceLow,
                  ]}
                >
                  Confiance : {Math.round(confidenceRatio * 100)}%
                </Text>
              )}

              {!!editingValue?.ai_description && (
                <Text style={styles.hintText}>{editingValue.ai_description}</Text>
              )}

              <TouchableOpacity
                style={styles.layoutHeader}
                onPress={() => setLayoutExpanded((prev) => !prev)}
                disabled={Boolean(savingValueId)}
              >
                <Text style={styles.layoutHeaderText}>Mise en page</Text>
                <Text style={styles.layoutHeaderIcon}>{layoutExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {layoutExpanded && layoutDraft && (
                <View style={styles.layoutPanel}>
                  {LAYOUT_CONTROL_CONFIG.map((control) => {
                    const rawValue = toNumber(layoutDraft[control.key], 0) || 0;
                    const displayValue =
                      control.precision === 0 ? `${Math.round(rawValue)}` : rawValue.toFixed(control.precision);
                    return (
                      <View key={control.key} style={styles.layoutRow}>
                        <Text style={styles.layoutRowLabel}>{control.label}</Text>
                        <View style={styles.layoutRowControls}>
                          <TouchableOpacity
                            style={styles.layoutStepButton}
                            onPress={() => applyLayoutDelta(control.key, -control.step)}
                            disabled={Boolean(savingValueId)}
                          >
                            <Text style={styles.layoutStepText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.layoutValueText}>{displayValue}</Text>
                          <TouchableOpacity
                            style={styles.layoutStepButton}
                            onPress={() => applyLayoutDelta(control.key, control.step)}
                            disabled={Boolean(savingValueId)}
                          >
                            <Text style={styles.layoutStepText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}

                  <TouchableOpacity
                    style={[
                      styles.resetLayoutButton,
                      (!editingValue || !resolveTemplateFieldId(editingValue) || Boolean(savingValueId)) &&
                        styles.resetLayoutButtonDisabled,
                    ]}
                    onPress={handleResetLayoutOverride}
                    disabled={!editingValue || !resolveTemplateFieldId(editingValue) || Boolean(savingValueId)}
                  >
                    <Text style={styles.resetLayoutButtonText}>Reinitialiser mise en page</Text>
                  </TouchableOpacity>
                </View>
              )}

              {editingFieldType === FIELD_TYPE_CHECKBOX ? (
                <View style={styles.checkboxEditorRow}>
                  <Text style={styles.checkboxEditorLabel}>
                    {editingValue?.display_name || editingValue?.field_label || 'Coché'}
                  </Text>
                  <Switch
                    value={coerceBoolean(editValueDraft, false)}
                    onValueChange={(nextValue) => setEditValueDraft(nextValue ? 'true' : 'false')}
                    disabled={Boolean(savingValueId)}
                  />
                </View>
              ) : editingFieldType === FIELD_TYPE_RADIO ? (
                <View style={styles.radioEditorWrap}>
                  <Text style={styles.radioEditorTitle}>
                    {editingValue?.category_label || editingValue?.display_name || 'Choix'}
                  </Text>
                  {radioGroupValues.map((radioItem) => {
                    const isSelected = coerceBoolean(radioItem?.value, false);
                    return (
                      <TouchableOpacity
                        key={radioItem?.id ? String(radioItem.id) : String(getOptionValue(radioItem))}
                        style={styles.radioOptionRow}
                        onPress={() => selectRadioOption(radioItem?.id, editingGroupId)}
                        disabled={Boolean(savingValueId)}
                      >
                        <View
                          style={[
                            styles.radioOptionCircle,
                            isSelected && styles.radioOptionCircleSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioOptionDot} />}
                        </View>
                        <Text style={styles.radioOptionLabel}>
                          {String(getOptionValue(radioItem) || 'Option')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {radioGroupValues.length === 0 && (
                    <Text style={styles.radioEditorEmpty}>Aucune option radio trouvée pour ce groupe.</Text>
                  )}
                </View>
              ) : (
                <>
                  {editingFieldType === FIELD_TYPE_SELECT && selectOptions.length > 0 && (
                    <View style={styles.selectOptionsWrap}>
                      {selectOptions.map((option) => {
                        const selected = String(editValueDraft || '') === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            style={[styles.selectOptionChip, selected && styles.selectOptionChipActive]}
                            onPress={() => setEditValueDraft(option)}
                            disabled={Boolean(savingValueId)}
                          >
                            <Text
                              style={[styles.selectOptionChipText, selected && styles.selectOptionChipTextActive]}
                            >
                              {option}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  <TextInput
                    style={styles.valueInput}
                    value={editValueDraft}
                    onChangeText={setEditValueDraft}
                    placeholder={getFormatHint(editingValue) || 'Saisir la valeur'}
                  />
                </>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalActionButton, styles.modalCancelButton]}
                  onPress={closeEditValue}
                  disabled={Boolean(savingValueId)}
                >
                  <Text style={styles.modalCancelButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalActionButton, styles.modalSaveButton]}
                  onPress={handleSaveValue}
                  disabled={Boolean(savingValueId)}
                >
                  {savingValueId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalSaveButtonText}>Valider</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#4F46E5',
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 60,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  stateSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'center',
  },
  progressWrap: {
    width: '100%',
    marginTop: 20,
    marginBottom: 20,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
  },
  progressText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 44,
    marginBottom: 8,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#B91C1C',
    textAlign: 'center',
  },
  stateButton: {
    marginTop: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  stateButtonDisabled: {
    opacity: 0.7,
  },
  stateButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  stateBackButton: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stateBackButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
  doneWrap: {
    flex: 1,
    padding: 16,
    paddingBottom: 12,
  },
  docInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  docInfoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  docInfoSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#4B5563',
  },
  pageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pageNavButton: {
    width: 38,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageNavButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  pageNavButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  pageIndicator: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  previewContainer: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmptyText: {
    color: '#6B7280',
    fontSize: 13,
  },
  pageImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
  previewImageFrame: {
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
  },
  zoomGestureHost: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageLoader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
  },
  zoomControls: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  zoomButton: {
    backgroundColor: 'rgba(17, 24, 39, 0.75)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 34,
    alignItems: 'center',
  },
  zoomButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  zoomValueText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayFieldBase: {
    position: 'absolute',
    borderRadius: 4,
    paddingHorizontal: 3,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  overlayFieldFilled: {
    backgroundColor: 'rgba(0, 200, 0, 0.08)',
    borderWidth: 0,
  },
  overlayFieldReview: {
    backgroundColor: 'rgba(255, 165, 0, 0.12)',
    borderColor: '#F59E0B',
    borderWidth: 0.5,
  },
  overlayFieldEmpty: {
    backgroundColor: 'rgba(255, 0, 0, 0.06)',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayFieldTextBase: {
    fontWeight: '500',
  },
  overlayFieldTextFilled: {
    color: '#111827',
  },
  overlayFieldTextReview: {
    color: '#7C2D12',
  },
  overlayFieldTextEmpty: {
    color: '#9CA3AF',
    textAlign: 'center',
  },
  summaryBar: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryGreen: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryOrange: {
    color: '#C2410C',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryRed: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },
  saveFormButton: {
    marginTop: 10,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveFormButtonDisabled: {
    opacity: 0.7,
  },
  saveFormButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: '#fff',
    width: '100%',
    maxHeight: '55%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    marginBottom: 8,
  },
  modalScroll: {
    width: '100%',
  },
  modalScrollContent: {
    paddingBottom: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  modalSubTitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#4B5563',
  },
  confidenceText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
  },
  confidenceHigh: {
    color: '#047857',
  },
  confidenceLow: {
    color: '#C2410C',
  },
  hintText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
  },
  layoutHeader: {
    marginTop: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  layoutHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  layoutHeaderIcon: {
    fontSize: 12,
    color: '#6B7280',
  },
  layoutPanel: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  layoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  layoutRowLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  layoutRowControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  layoutStepButton: {
    minWidth: 28,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  layoutStepText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  layoutValueText: {
    minWidth: 58,
    textAlign: 'center',
    fontSize: 12,
    color: '#111827',
    fontWeight: '700',
    marginHorizontal: 8,
  },
  resetLayoutButton: {
    marginTop: 4,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
  },
  resetLayoutButtonDisabled: {
    opacity: 0.5,
  },
  resetLayoutButtonText: {
    color: '#9A3412',
    fontSize: 12,
    fontWeight: '700',
  },
  valueInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  checkboxEditorRow: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkboxEditorLabel: {
    flex: 1,
    marginRight: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  radioEditorWrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
  },
  radioEditorTitle: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '700',
    marginBottom: 6,
  },
  radioOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  radioOptionCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#5B4CFF',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  radioOptionCircleSelected: {
    backgroundColor: '#EEF2FF',
  },
  radioOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#5B4CFF',
  },
  radioOptionLabel: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
  },
  radioEditorEmpty: {
    color: '#6B7280',
    fontSize: 12,
  },
  selectOptionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  selectOptionChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  selectOptionChipActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  selectOptionChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  selectOptionChipTextActive: {
    color: '#312E81',
  },
  modalActions: {
    marginTop: 14,
    flexDirection: 'row',
  },
  modalActionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginRight: 8,
  },
  modalCancelButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
  modalSaveButton: {
    backgroundColor: '#4F46E5',
  },
  modalSaveButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
