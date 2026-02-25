import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Keyboard,
  Vibration,
  Animated,
  Modal,
  TextInput,
  Platform,
  StatusBar,
} from 'react-native';
import {
  TapGestureHandler,
  PanGestureHandler,
  PinchGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { templates } from '../api/client';
import formsScreenService from '../api/formsScreenService';
import FieldRenderer from '../components/FieldRenderer';
import FieldContextMenu from '../components/FieldContextMenu';
import FieldConfigModal from '../components/FieldConfigModal';
import {
  DEFAULT_FIELD,
  calculateFieldHeight,
  normalizeRepeatCount,
  screenToPercent,
  duplicateFieldSelection,
} from '../utils/fieldUtils';
import {
  fieldsInMarquee,
  selectByGroupId, selectByRow, selectByColumn,
} from '../utils/multiSelectUtils';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const MOVE_STEP = 0.5;
const FONT_SIZE_MIN = 6;
const FONT_SIZE_MAX = 72;
const MIN_WIDTH = 5;
const MIN_HEIGHT = 6;
const NEW_FIELD_WIDTH = 20;
const TOUCH_SLOP = 10;
const LONG_PRESS_MS = 550; // Manual long press delay (activateAfterLongPress broken in RNGH 2.28)
const PERCENT_MIN = 0;
const PERCENT_MAX = 300;
const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 70;
const DEBUG_GESTURES = false;
const DEBUG_SELECTION = false;
const DUPLICATE_GAP_PX = 10;
const MARQUEE_LONG_PRESS_MS = 360;
const MARQUEE_LONG_PRESS_MOVE_TOLERANCE = 30;
const MENU_KEYBOARD_GAP = 25;
const CREATE_FIELD_LABEL = 'exemple';
const FIELD_TYPE_TEXT = 'text';
const FIELD_TYPE_CHECKBOX = 'checkbox';
const FIELD_TYPE_RADIO = 'radio';
// These are no longer used - zoom is now computed dynamically based on field size
const CREATE_FOCUS_MAX_SCALE = 2.5;
const FIELD_HIT_SLOP = 16;
const DRAG_OFFSET_X_PX = 0;
const DRAG_OFFSET_Y_PX = -60;

const DEFAULT_CALIBRATION = {
  top_left_x: 0,
  top_left_y: 0,
  bottom_right_x: 100,
  bottom_right_y: 100,
};

const getGestureStateLabel = (state) => {
  switch (state) {
    case State.BEGAN:
      return 'BEGAN';
    case State.ACTIVE:
      return 'ACTIVE';
    case State.END:
      return 'END';
    case State.FAILED:
      return 'FAILED';
    case State.CANCELLED:
      return 'CANCELLED';
    case State.UNDETERMINED:
      return 'UNDETERMINED';
    default:
      return String(state ?? 'N/A');
  }
};

const roundDebug = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : null);

const normalizeTemplate = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  return payload.template || payload.item || payload.result || payload.data || payload;
};

const getTemplateName = (item, fallbackId = null) => {
  if (!item || typeof item !== 'object') {
    return fallbackId ? `Formulaire #${fallbackId}` : 'Formulaire';
  }
  return (
    item?.name ||
    item?.title ||
    item?.document_name ||
    item?.documentName ||
    item?.original_name ||
    item?.originalName ||
    item?.filename ||
    item?.file_name ||
    item?.fileName ||
    item?.template?.name ||
    item?.template?.title ||
    (fallbackId ? `Formulaire #${fallbackId}` : 'Formulaire')
  );
};

const extractEntity = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  return (
    payload.document ||
    payload.template ||
    payload.item ||
    payload.result ||
    payload.data ||
    payload
  );
};

const resolveTotalPages = (item) => {
  if (!item) return 1;
  if (Array.isArray(item?.pages)) return item.pages.length || 1;
  const candidates = [
    item?.pages_count,
    item?.page_count,
    item?.pagesCount,
    item?.pageCount,
    item?.pages,
  ];
  const found = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
  return found ? Number(found) : 1;
};

const extractFields = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload?.fields)) return payload.fields;
  if (Array.isArray(payload?.template_fields)) return payload.template_fields;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const getFieldPageNumber = (field) => {
  const page = Number(field?.page_number ?? field?.pageNumber ?? field?.page ?? 1);
  return Number.isFinite(page) ? page : 1;
};

const coerceNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

const normalizeFieldType = (value) => {
  const normalized = String(value || FIELD_TYPE_TEXT).trim().toLowerCase();
  if (!normalized) return FIELD_TYPE_TEXT;
  if (normalized === FIELD_TYPE_CHECKBOX) return FIELD_TYPE_CHECKBOX;
  if (normalized === FIELD_TYPE_RADIO) return FIELD_TYPE_RADIO;
  if (normalized === 'select') return 'select';
  return normalized;
};

const isBooleanFieldType = (fieldType) => {
  const normalizedType = normalizeFieldType(fieldType);
  return normalizedType === FIELD_TYPE_CHECKBOX || normalizedType === FIELD_TYPE_RADIO;
};

const normalizeField = (raw) => {
  const field = { ...DEFAULT_FIELD, ...raw };
  field.x = coerceNumber(raw?.x, DEFAULT_FIELD.x || 0);
  field.y = coerceNumber(raw?.y, DEFAULT_FIELD.y || 0);
  field.width = coerceNumber(raw?.width ?? raw?.field_width, DEFAULT_FIELD.width);
  field.height = coerceNumber(raw?.height ?? raw?.field_height, DEFAULT_FIELD.height);
  field.font_size = coerceNumber(raw?.font_size ?? raw?.fontSize, DEFAULT_FIELD.font_size);
  field.font_family = raw?.font_family ?? raw?.fontFamily ?? DEFAULT_FIELD.font_family;
  field.text_color = raw?.text_color ?? DEFAULT_FIELD.text_color;
  field.text_align = raw?.text_align ?? DEFAULT_FIELD.text_align;
  field.line_height = coerceNumber(raw?.line_height, DEFAULT_FIELD.line_height);
  field.line_count = Math.max(1, parseInt(raw?.line_count ?? DEFAULT_FIELD.line_count, 10) || 1);
  field.wrap_mode = 'word';
  field.max_chars = raw?.max_chars ?? DEFAULT_FIELD.max_chars;
  field.next_lines_indent = coerceNumber(
    raw?.next_lines_indent,
    DEFAULT_FIELD.next_lines_indent
  );
  field.field_type = normalizeFieldType(raw?.field_type ?? raw?.type ?? DEFAULT_FIELD.field_type);
  field.field_label = raw?.field_label ?? raw?.label ?? '';
  field.text_example = raw?.text_example ?? raw?.textExample ?? '';
  field.field_name = raw?.field_name ?? raw?.name ?? '';
  field.page_number = coerceNumber(raw?.page_number ?? raw?.pageNumber ?? raw?.page, 1);
  field.group_id = raw?.group_id ?? raw?.groupId ?? '';
  field.option_value = raw?.option_value ?? raw?.optionValue ?? field.option_value ?? '';
  field.format_hint = raw?.format_hint ?? raw?.formatHint ?? field.format_hint ?? '';
  field.is_checked_default = coerceBoolean(
    raw?.is_checked_default ?? raw?.isCheckedDefault ?? field.is_checked_default,
    false
  );
  field.repeat_index = normalizeRepeatCount(raw?.repeat_index ?? raw?.repeatIndex, 1);
  field.category_label =
    raw?.category_label ?? raw?.categoryLabel ?? raw?.category ?? null;
  field.display_name =
    raw?.display_name ?? raw?.displayName ?? raw?.field_hint ?? raw?.fieldHint ?? null;
  field.ai_description = raw?.ai_description ?? raw?.aiDescription ?? null;

  if (!field.height || field.height <= 0) {
    field.height = calculateFieldHeight(field);
  }

  return field;
};

const extractFieldId = (response) => {
  const raw = response?.data?.data || response?.data;
  const resolved = raw?.field || raw?.item || raw?.result || raw?.data || raw;
  return resolved?.id ?? raw?.id ?? null;
};

const extractFieldPayload = (response) => {
  const raw = response?.data?.data || response?.data;
  return raw?.field || raw?.item || raw?.result || raw?.data || raw;
};

const buildPayload = (field) => {
  const payload = {
    field_type: field.field_type,
    type: field.field_type,
    label: field.field_label,
    field_label: field.field_label,
    text_example: field.text_example ?? field.field_label ?? '',
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    field_width: field.width,
    field_height: field.height,
    page_number: field.page_number,
    font_size: field.font_size,
    fontSize: field.font_size,
    font_family: field.font_family,
    fontFamily: field.font_family,
    text_color: field.text_color,
    text_align: field.text_align,
    line_height: field.line_height,
    line_count: field.line_count,
    wrap_mode: 'word',
    max_chars: field.max_chars,
    next_lines_indent: field.next_lines_indent,
    group_id: field.group_id,
    option_value: field.option_value ?? null,
    format_hint: field.format_hint ?? null,
    is_checked_default: Boolean(field.is_checked_default),
    repeat_index: field.repeat_index,
    category_label: field.category_label ?? null,
    display_name: field.display_name ?? null,
    ai_description: field.ai_description ?? null,
  };

  return payload;
};

export default function TemplateEditorScreen({ route, navigation }) {
  const routeParams = route?.params || {};
  const {
    templateId,
    hideDocumentBackground: hideDocumentBackgroundParam,
    autoCreateLinkedDocumentOnFinish = false,
    finishTargetTab = 'templates',
  } = routeParams;
  const hideDocumentBackground = Boolean(hideDocumentBackgroundParam);
  const insets = useSafeAreaInsets();

  const [fields, setFields] = useState([]);
  const [calibrations, setCalibrations] = useState({});
  const [loading, setLoading] = useState(true);
  const [templateName, setTemplateName] = useState('');
  const [templateFileFilename, setTemplateFileFilename] = useState('');
  const [pageImageError, setPageImageError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageImageUrl, setPageImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [frameLayout, setFrameLayout] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState(null);
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 });
  const [imageBaseLayout, setImageBaseLayout] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [selectionDebug, setSelectionDebug] = useState(null);
  const [gestureDebugHud, setGestureDebugHud] = useState({
    pan: 'IDLE',
    tap: 'IDLE',
    pinch: 'IDLE',
    marquee: 'IDLE',
    pointers: 0,
    note: '',
  });
  const zoomContainerRef = useRef(null);
  const zoomContainerOffsetRef = useRef({ x: 0, y: 0 });
  const zoomContainerMeasuredRef = useRef(false);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [configVisible, setConfigVisible] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [menuLabelDraft, setMenuLabelDraft] = useState(null);
  const [menuRevision, setMenuRevision] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [dragMode, setDragMode] = useState(false);
  const [draggingFieldId, setDraggingFieldId] = useState(null);
  const [dragPreviewPct, setDragPreviewPct] = useState(null);
  const [dragFingerLocal, setDragFingerLocal] = useState(null); // { x, y } in fieldsOverlay-local px
  // Multi-selection mode
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiSelectedIds, setMultiSelectedIds] = useState(new Set());
  const [multiDragPreview, setMultiDragPreview] = useState(null); // { deltaX, deltaY } for multi-drag
  // Marquee selection
  const [isMarqueeMode, setIsMarqueeMode] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState(null); // {startX, startY, currentX, currentY} fieldsOverlay-local px
  const marqueeStartRef = useRef(null);
  // Multi-select toolbar panel state: null | 'alignement' | 'taille'
  const [msPanel, setMsPanel] = useState(null);
  // Multi-select adjustment values:
  // - spacing/size sliders are percentages (baseline 100)
  // - font size is an absolute px value
  const [spacingVSlider, setSpacingVSlider] = useState(100);
  const [spacingHSlider, setSpacingHSlider] = useState(100);
  const [sizeWSlider, setSizeWSlider] = useState(100);
  const [sizeHSlider, setSizeHSlider] = useState(100);
  const [multiFontSizeValue, setMultiFontSizeValue] = useState(DEFAULT_FIELD.font_size);
  // Snapshot of initial positions/sizes when selection is made (for slider calculations)
  const multiSelectSnapshotRef = useRef(null); // { fieldsMap, rowGroups, colGroups, hAdjustKeys, vAdjustKeys }
  // Duplicate modal
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState('1');
  // Undo history stack - stores previous field states
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const MAX_UNDO_STACK = 20;
  // AI prefill
  const [aiConfirmVisible, setAiConfirmVisible] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const fieldsRef = useRef([]);
  const updateTimersRef = useRef(new Map());
  const createInFlightRef = useRef(new Map());
  const pendingAfterCreateRef = useRef(new Set());
  const saveTimeoutRef = useRef(null);
  const justDeletedRef = useRef(false);
  const tapTargetRef = useRef(null);
  const gestureDebugHudRef = useRef({
    pan: 'IDLE',
    tap: 'IDLE',
    pinch: 'IDLE',
    marquee: 'IDLE',
    pointers: 0,
    note: '',
  });
  const panBlockedRef = useRef(false);
  const pinchBlockedRef = useRef(false);
  const gestureConsumedRef = useRef(false); // true if a pan/pinch gesture consumed the touch
  const isDraggingFieldRef = useRef(false); // true if dragging the selected field
  const isGesturingRef = useRef(false); // true during active pinch/pan gesture
  const focusDebounceRef = useRef(null); // debounce timer for focusField
  const menuLayoutRef = useRef(null);
  const menuContainerRef = useRef(null);
  const workAreaRef = useRef(null);
  const fieldsOverlayRef = useRef(null);
  const workAreaOffsetRef = useRef({ x: 0, y: 0 });
  const workAreaLayoutRef = useRef({ x: 0, y: 0, width: 0, height: 0, ready: false });
  const fieldsOverlayOffsetRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const lastCreatedFieldIdRef = useRef(null);
  const lastCreatedAtRef = useRef(0);
  const dragStartTouchRef = useRef(null);
  const dragStartFieldPctRef = useRef(null);
  const dragSnapshotRef = useRef(null);
  const dragPreviewRef = useRef(null);
  const dragPreviewRafRef = useRef(null);
  const dragFingerLocalRef = useRef(null);
  const dragFingerLocalRafRef = useRef(null);
  const marqueeLongPressTimeoutRef = useRef(null);
  const marqueeLongPressCandidateRef = useRef(null); // { touch: {x,y}, local: {x,y} }
  const multiDragPreviewRafRef = useRef(null);
  const marqueeRectPreviewRef = useRef(null);
  const marqueeRectRafRef = useRef(null);
  const lastMenuFieldIdRef = useRef(null);
  const dragModeRef = useRef(false);
  const draggingFieldIdRef = useRef(null);
  const focusKeyRef = useRef('');
  // Multi-drag refs
  const multiDragStartTouchRef = useRef(null);
  const multiDragStartPositionsRef = useRef(null); // Map of fieldId -> { x, y }
  const multiDragModeRef = useRef(false);
  const multiDragPreviewRef = useRef(null);
  const msAdjustTimeoutRef = useRef(null);
  const msAdjustIntervalRef = useRef(null);
  const msAdjustCommitRef = useRef(null);

  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const [scaleState, setScaleState] = useState(1);

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const scaleAnim = Animated.multiply(baseScale, pinchScale);
  const translateXAnim = Animated.add(translateX, panX);
  const translateYAnim = Animated.add(translateY, panY);

  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const tapRef = useRef(null);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      updateTimersRef.current.forEach((timer) => clearTimeout(timer));
      updateTimersRef.current.clear();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (dragFingerLocalRafRef.current) {
        cancelAnimationFrame(dragFingerLocalRafRef.current);
        dragFingerLocalRafRef.current = null;
      }
    };
  }, []);

  const targetLayout = useMemo(() => {
    const { width, height } = frameLayout;
    if (!width || !height) return { width: 0, height: 0 };
    if (imageSize?.width && imageSize?.height) {
      const imageRatio = imageSize.width / imageSize.height;
      const frameRatio = width / height;
      if (frameRatio > imageRatio) {
        return { width: height * imageRatio, height };
      }
      return { width, height: width / imageRatio };
    }
    return { width, height };
  }, [frameLayout, imageSize]);

  const calibration = calibrations[currentPage] || DEFAULT_CALIBRATION;

  const pageFields = useMemo(() => {
    return fields.filter(
      (field) =>
        field &&
        ((field.id !== null && field.id !== undefined) || field.localId) &&
        getFieldPageNumber(field) === currentPage
    );
  }, [fields, currentPage]);

  const selectedField = useMemo(() => {
    if (!selectedFieldId) return null;
    return fields.find((field) => field.id === selectedFieldId || field.localId === selectedFieldId);
  }, [fields, selectedFieldId]);

  useEffect(() => {
    if (!selectedFieldId || !isMenuOpen || activeSubmenu !== 'text') {
      setMenuLabelDraft(null);
      lastMenuFieldIdRef.current = null;
      return;
    }
    if (menuLabelDraft === null || lastMenuFieldIdRef.current !== selectedFieldId) {
      const next = String(selectedField?.field_label ?? '');
      setMenuLabelDraft(next);
      lastMenuFieldIdRef.current = selectedFieldId;
    }
  }, [activeSubmenu, isMenuOpen, selectedFieldId, menuLabelDraft, selectedField]);

  const showSaved = useCallback((label = 'Sauvegardé ✓') => {
    setSaveIndicator(label);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveIndicator(null);
    }, 1200);
  }, []);

  // Save current fields state to undo stack
  const pushUndoState = useCallback(() => {
    setRedoStack([]);
    setUndoStack((prev) => {
      // Deep clone fields for undo
      const snapshot = fieldsRef.current.map((f) => ({ ...f }));
      const next = [...prev, snapshot];
      // Limit stack size
      if (next.length > MAX_UNDO_STACK) {
        return next.slice(-MAX_UNDO_STACK);
      }
      return next;
    });
  }, []);

  // Undo last action
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const currentSnapshot = fieldsRef.current.map((f) => ({ ...f }));
    const previousState = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => {
      const next = [...prev, currentSnapshot];
      if (next.length > MAX_UNDO_STACK) return next.slice(-MAX_UNDO_STACK);
      return next;
    });
    setFields(previousState);
    fieldsRef.current = previousState;
    // Persist all changed fields
    previousState.forEach((field) => {
      if (field.id) {
        templates
          .updateField(templateId, field.id, buildPayload(field))
          .catch((error) => console.error('Erreur undo:', error));
      }
    });
    showSaved('Annulé ✓');
  }, [showSaved, templateId, undoStack]);

  // Redo last undone action
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const currentSnapshot = fieldsRef.current.map((f) => ({ ...f }));
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => {
      const next = [...prev, currentSnapshot];
      if (next.length > MAX_UNDO_STACK) return next.slice(-MAX_UNDO_STACK);
      return next;
    });
    setFields(nextState);
    fieldsRef.current = nextState;
    nextState.forEach((field) => {
      if (field.id) {
        templates
          .updateField(templateId, field.id, buildPayload(field))
          .catch((error) => console.error('Erreur redo:', error));
      }
    });
    showSaved('Rétabli ✓');
  }, [redoStack, showSaved, templateId]);

  const logGesture = useCallback((label, payload) => {
    if (!DEBUG_GESTURES) return;
    console.log(`[gesture] ${label}`, payload || '');
  }, []);

  const updateGestureHud = useCallback((patch) => {
    if (!DEBUG_GESTURES) return;
    setGestureDebugHud((prev) => {
      const next = { ...prev, ...patch };
      gestureDebugHudRef.current = next;
      return next;
    });
  }, []);

  const logGestureState = useCallback(
    (name, nativeEvent, extra = {}) => {
      if (!DEBUG_GESTURES) return;
      console.log(`[gesture][${name}]`, {
        state: getGestureStateLabel(nativeEvent?.state),
        oldState: getGestureStateLabel(nativeEvent?.oldState),
        translationX: roundDebug(nativeEvent?.translationX),
        translationY: roundDebug(nativeEvent?.translationY),
        velocityX: roundDebug(nativeEvent?.velocityX),
        velocityY: roundDebug(nativeEvent?.velocityY),
        pointers: Number(nativeEvent?.numberOfPointers || 0),
        x: roundDebug(nativeEvent?.x),
        y: roundDebug(nativeEvent?.y),
        absoluteX: roundDebug(nativeEvent?.absoluteX ?? nativeEvent?.pageX),
        absoluteY: roundDebug(nativeEvent?.absoluteY ?? nativeEvent?.pageY),
        tap: gestureDebugHudRef.current.tap,
        pan: gestureDebugHudRef.current.pan,
        pinch: gestureDebugHudRef.current.pinch,
        marquee: gestureDebugHudRef.current.marquee,
        ...extra,
      });
    },
    []
  );

  const applyFieldResponse = useCallback((fieldKey, response) => {
    const payload = extractFieldPayload(response);
    if (!payload) return;
    const resolvedId = payload?.id ?? fieldKey;
    setFields((prev) =>
      prev.map((field) => {
        const key = field.id || field.localId;
        if (key !== fieldKey && field.id !== resolvedId) return field;
        return normalizeField({ ...field, ...payload, id: resolvedId });
      })
    );
  }, []);

  const schedulePersist = useCallback(
    (fieldKey, delay = 350) => {
      if (!fieldKey) return;
      if (updateTimersRef.current.has(fieldKey)) {
        clearTimeout(updateTimersRef.current.get(fieldKey));
      }
      const timer = setTimeout(() => {
        updateTimersRef.current.delete(fieldKey);
        const target = fieldsRef.current.find(
          (field) => field.id === fieldKey || field.localId === fieldKey
        );
        if (!target) return;
        if (target.localId) {
          pendingAfterCreateRef.current.add(target.localId);
          ensureCreated(target);
          return;
        }
        templates
          .updateField(templateId, target.id, buildPayload(target))
          .then((response) => {
            applyFieldResponse(target.id, response);
            showSaved();
          })
          .catch((error) => {
            console.error('Erreur mise à jour champ:', error);
          });
      }, delay);
      updateTimersRef.current.set(fieldKey, timer);
    },
    [applyFieldResponse, showSaved, templateId]
  );

  const ensureCreated = useCallback(
    async (field) => {
      if (!field?.localId || createInFlightRef.current.has(field.localId)) return;
      createInFlightRef.current.set(field.localId, true);
      try {
        const response = await templates.createField(templateId, buildPayload(field));
        const createdField = extractFieldPayload(response);
        const newId = createdField?.id ?? extractFieldId(response);
        if (!newId) throw new Error('Champ créé sans id');

        setFields((prev) =>
          prev.map((item) =>
            item.localId === field.localId
              ? normalizeField({
                  ...item,
                  ...createdField,
                  id: newId,
                  localId: null,
                })
              : item
          )
        );
        setSelectedFieldId((prev) => (prev === field.localId ? newId : prev));
        setEditingFieldId((prev) => (prev === field.localId ? newId : prev));
        if (lastCreatedFieldIdRef.current === field.localId) {
          lastCreatedFieldIdRef.current = newId;
        }
        showSaved('Créé ✓');

        if (pendingAfterCreateRef.current.has(field.localId)) {
          pendingAfterCreateRef.current.delete(field.localId);
          setTimeout(() => {
            const latest = fieldsRef.current.find((item) => item.id === newId);
            if (!latest) return;
            templates
              .updateField(templateId, newId, buildPayload(latest))
              .then((updateResponse) => {
                applyFieldResponse(newId, updateResponse);
              })
              .catch((error) => {
                console.error('Erreur mise à jour champ:', error);
              });
          }, 0);
        }
      } catch (error) {
        console.error('Erreur création champ:', error);
        Alert.alert('Erreur', 'Impossible de créer le champ');
      } finally {
        createInFlightRef.current.delete(field.localId);
      }
    },
    [applyFieldResponse, showSaved, templateId]
  );

  const updateFieldState = useCallback(
    (fieldKey, patch) => {
      setFields((prev) => {
        const next = prev.map((field) => {
          if (field.id !== fieldKey && field.localId !== fieldKey) return field;
          const updated = { ...field, ...patch };
          if (patch.field_label !== undefined) {
            if (patch.line_count === undefined) {
              const lines = String(patch.field_label ?? '').split('\n').length || 1;
              updated.line_count = Math.max(1, lines);
            }
          }
          if (patch.repeat_index !== undefined) {
            updated.repeat_index = normalizeRepeatCount(patch.repeat_index, 1);
          } else {
            updated.repeat_index = normalizeRepeatCount(updated.repeat_index, 1);
          }
          return normalizeField(updated);
        });
        // Keep ref in sync immediately so handleForceSave reads the latest data
        fieldsRef.current = next;
        return next;
      });
    },
    []
  );

  const applyFieldPatchesBatch = useCallback((patchesByKey) => {
    if (!patchesByKey || patchesByKey.size === 0) return;
    setFields((prev) => {
      let didChange = false;
      const next = prev.map((field) => {
        const key = field.id || field.localId;
        const patch = patchesByKey.get(key);
        if (!patch) return field;
        didChange = true;
        const updated = { ...field, ...patch };
        if (patch.field_label !== undefined && patch.line_count === undefined) {
          const lines = String(patch.field_label ?? '').split('\n').length || 1;
          updated.line_count = Math.max(1, lines);
        }
        if (patch.repeat_index !== undefined) {
          updated.repeat_index = normalizeRepeatCount(patch.repeat_index, 1);
        } else {
          updated.repeat_index = normalizeRepeatCount(updated.repeat_index, 1);
        }
        return normalizeField(updated);
      });
      if (!didChange) return prev;
      fieldsRef.current = next;
      return next;
    });
  }, []);

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const response = await templates.get(templateId);
      const raw = response?.data?.data || response?.data;
      const data = normalizeTemplate(raw);
      const nextFields = extractFields(data)
        .filter(Boolean)
        .map((field) => normalizeField(field))
        .filter(
          (field) =>
            field && ((field.id !== null && field.id !== undefined) || field.localId)
        );
      setFields(nextFields);
      setTotalPages(resolveTotalPages(data));
      setTemplateName(getTemplateName(data, templateId));
      setTemplateFileFilename(
        String(
          data?.file_filename ||
            data?.fileFilename ||
            data?.filename ||
            data?.file_name ||
            data?.fileName ||
            ''
        )
      );
    } catch (error) {
      console.error('Erreur chargement template:', error);
      Alert.alert('Erreur', 'Impossible de charger le formulaire');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, templateId]);

  const loadCalibrations = useCallback(async () => {
    try {
      const response = await templates.getCalibrations(templateId);
      const raw = response?.data?.data || response?.data;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.calibrations)
        ? raw.calibrations
        : Array.isArray(raw?.items)
        ? raw.items
        : [];
      const map = {};
      list.forEach((item) => {
        const pageNumber = Number(item?.page_number ?? item?.pageNumber ?? item?.page ?? 1);
        if (!pageNumber) return;
        map[pageNumber] = {
          top_left_x: Number(item?.top_left_x ?? item?.topLeftX ?? 0),
          top_left_y: Number(item?.top_left_y ?? item?.topLeftY ?? 0),
          bottom_right_x: Number(item?.bottom_right_x ?? item?.bottomRightX ?? 0),
          bottom_right_y: Number(item?.bottom_right_y ?? item?.bottomRightY ?? 0),
        };
      });
      setCalibrations(map);
    } catch (error) {
      console.error('Erreur chargement calibrations:', error);
    }
  }, [templateId]);

  useEffect(() => {
    loadTemplate();
    loadCalibrations();
  }, [loadCalibrations, loadTemplate]);

  useEffect(() => {
    if (!totalPages || !templateId) return;
    const missingPages = [];
    for (let page = 1; page <= totalPages; page += 1) {
      if (!calibrations[page]) missingPages.push(page);
    }
    if (!missingPages.length) return;
    setCalibrations((prev) => {
      const next = { ...prev };
      missingPages.forEach((page) => {
        if (!next[page]) {
          next[page] = { ...DEFAULT_CALIBRATION };
        }
      });
      return next;
    });
    missingPages.forEach((page) => {
      const payload = { page_number: page, ...DEFAULT_CALIBRATION };
      templates.saveCalibration(templateId, payload).catch((error) => {
        console.error('Erreur auto-calibration:', error);
      });
    });
  }, [calibrations, templateId, totalPages]);

  const prefetchImageWithTimeout = useCallback((candidateUrl, timeoutMs = 4500) => {
    if (!candidateUrl) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, timeoutMs);

      Promise.resolve(Image.prefetch(candidateUrl))
        .then((canLoad) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          resolve(Boolean(canLoad));
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          resolve(false);
        });
    });
  }, []);

  const resolveWorkingPageImageUrl = useCallback(
    async (pageNumber) => {
      const candidates = await templates.getPageImageUrlCandidates(
        templateId,
        pageNumber,
        templateFileFilename
      );

      for (const candidateUrl of candidates) {
        const canLoad = await prefetchImageWithTimeout(candidateUrl);
        if (canLoad) {
          return candidateUrl;
        }
      }
      return null;
    },
    [prefetchImageWithTimeout, templateFileFilename, templateId]
  );

  useEffect(() => {
    let isMounted = true;
    const loadImage = async () => {
      if (!templateId) return;
      setImageLoading(true);
      setPageImageError('');
      setPageImageUrl(null);
      try {
        const url = await resolveWorkingPageImageUrl(currentPage);
        if (!isMounted) return;
        if (url) {
          setPageImageUrl(url);
          return;
        }
        setPageImageUrl(null);
        setImageLoading(false);
        setPageImageError(`Impossible de charger la page ${currentPage}.`);
      } catch (error) {
        console.error('Erreur chargement image page:', error);
        if (isMounted) {
          setPageImageUrl(null);
          setImageLoading(false);
          setPageImageError(`Impossible de charger la page ${currentPage}.`);
        }
      }
    };
    loadImage();
    return () => {
      isMounted = false;
    };
  }, [currentPage, resolveWorkingPageImageUrl, templateId]);

  useEffect(() => {
    setSelectedFieldId(null);
    setEditingFieldId(null);
    setIsMenuOpen(false);
    setActiveSubmenu(null);
    menuLayoutRef.current = null;
  }, [currentPage]);

  useEffect(() => {
    if (!pageImageUrl) {
      setImageSize(null);
      return;
    }
    let isActive = true;
    Image.getSize(
      pageImageUrl,
      (width, height) => {
        if (isActive) setImageSize({ width, height });
      },
      () => {
        if (isActive) setImageSize(null);
      }
    );
    return () => {
      isActive = false;
    };
  }, [pageImageUrl]);

  useEffect(() => {
    if (!selectedFieldId) {
      setIsMenuOpen(false);
      setActiveSubmenu(null);
      menuLayoutRef.current = null;
      focusKeyRef.current = '';
      if (dragMode) {
        dragPreviewRef.current = null;
        if (dragPreviewRafRef.current) {
          cancelAnimationFrame(dragPreviewRafRef.current);
          dragPreviewRafRef.current = null;
        }
        dragFingerLocalRef.current = null;
        if (dragFingerLocalRafRef.current) {
          cancelAnimationFrame(dragFingerLocalRafRef.current);
          dragFingerLocalRafRef.current = null;
        }
        setDragFingerLocal(null);
        setDragPreviewPct(null);
        setDragMode(false);
        setDraggingFieldId(null);
        dragModeRef.current = false;
        draggingFieldIdRef.current = null;
        isDraggingFieldRef.current = false;
        isGesturingRef.current = false;
        dragStartTouchRef.current = null;
        dragStartFieldPctRef.current = null;
        dragSnapshotRef.current = null;
        panBlockedRef.current = false;
      }
    }
  }, [selectedFieldId]);

  const findFieldAtPoint = useCallback(
    (tapX, tapY) => {
      if (!imageLayout.width || !imageLayout.height) return null;
      if (tapX < 0 || tapY < 0 || tapX > imageLayout.width || tapY > imageLayout.height) {
        return null;
      }
      const candidates = pageFields;
      for (let idx = candidates.length - 1; idx >= 0; idx -= 1) {
        const field = candidates[idx];
        const fieldWidth = Number.isFinite(field.width) ? field.width : DEFAULT_FIELD.width;
        const left = (field.x / 100) * imageLayout.width;
        const top = (field.y / 100) * imageLayout.height;
        const width = (fieldWidth / 100) * imageLayout.width;
        const height =
          Number.isFinite(field.height) && field.height > 0
            ? field.height
            : calculateFieldHeight(field);
        if (
          tapX >= left &&
          tapX <= left + width &&
          tapY >= top &&
          tapY <= top + height
        ) {
          return field;
        }
      }
      return null;
    },
    [imageLayout.height, imageLayout.width, pageFields]
  );

  // Get point in workArea-local coordinates (relative to workArea, not window)
  const getLocalPoint = useCallback((nativeEvent) => {
    // Use x/y which are relative to the gesture handler's view (workArea)
    const localX = Number(nativeEvent?.x) || 0;
    const localY = Number(nativeEvent?.y) || 0;
    return { x: localX, y: localY };
  }, []);

  // Tap/pinch target resolution uses workArea-local coordinates.
  const getWindowPoint = useCallback((nativeEvent) => {
    return getLocalPoint(nativeEvent);
  }, [getLocalPoint]);

  const measureFieldsOverlay = useCallback((reason = 'unknown') => {
    requestAnimationFrame(() => {
      if (!fieldsOverlayRef.current?.measureInWindow) return;
      fieldsOverlayRef.current.measureInWindow((x, y, w, h) => {
        fieldsOverlayOffsetRef.current = { x, y, w, h };
        if (DEBUG_SELECTION) {
          console.log('[selection] overlay_offset_update', {
            reason,
            x: Math.round(x),
            y: Math.round(y),
            w: Math.round(w),
            h: Math.round(h),
          });
        }
      });
    });
  }, []);

  const getMarqueeWindowPoint = useCallback((nativeEvent) => {
    const absX = Number(nativeEvent?.absoluteX);
    const absY = Number(nativeEvent?.absoluteY);
    if (Number.isFinite(absX) && Number.isFinite(absY)) {
      // On some Android builds, absoluteY includes status bar offset while measureInWindow does not.
      // Normalize absoluteY to the same window space used by measureInWindow.
      const yAdjustment = Platform.OS === 'android' ? Number(StatusBar.currentHeight || 0) : 0;
      return { x: absX, y: absY - yAdjustment, source: 'absolute', yAdjustment };
    }
    const pageX = Number(nativeEvent?.pageX);
    const pageY = Number(nativeEvent?.pageY);
    if (Number.isFinite(pageX) && Number.isFinite(pageY)) {
      return { x: pageX, y: pageY, source: 'page', yAdjustment: 0 };
    }
    return null;
  }, []);

  const getAbsolutePoint = useCallback((nativeEvent) => {
    const absX = Number(nativeEvent?.absoluteX);
    const absY = Number(nativeEvent?.absoluteY);
    if (Number.isFinite(absX) && Number.isFinite(absY)) {
      return { x: absX, y: absY };
    }
    const pageX = Number(nativeEvent?.pageX);
    const pageY = Number(nativeEvent?.pageY);
    if (Number.isFinite(pageX) && Number.isFinite(pageY)) {
      return { x: pageX, y: pageY };
    }
    const x = Number(nativeEvent?.x) || 0;
    const y = Number(nativeEvent?.y) || 0;
    return { x, y };
  }, []);

  const getFieldsOverlayPointFromEvent = useCallback(
    (nativeEvent) => {
      const windowPoint = getMarqueeWindowPoint(nativeEvent);
      if (!windowPoint) return null;
      const overlayOffsetWindow = fieldsOverlayOffsetRef.current || { x: 0, y: 0, w: 0, h: 0 };
      const scale = scaleRef.current || 1;
      const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      return {
        window: windowPoint,
        source: windowPoint.source,
        scale: safeScale,
        overlayOffsetLocal: null,
        local: {
          // `measureInWindow` gives transformed top-left.
          // Undo active zoom to get pre-transform overlay-local coordinates.
          x: (windowPoint.x - overlayOffsetWindow.x) / safeScale,
          y: (windowPoint.y - overlayOffsetWindow.y) / safeScale,
        },
      };
    },
    [getMarqueeWindowPoint]
  );

  const getWorkAreaPoint = useCallback(
    (nativeEvent) => {
      const windowPoint = getMarqueeWindowPoint(nativeEvent);
      const offset = workAreaOffsetRef.current || { x: 0, y: 0 };
      if (windowPoint) {
        return { x: windowPoint.x - offset.x, y: windowPoint.y - offset.y };
      }
      return getLocalPoint(nativeEvent);
    },
    [getLocalPoint, getMarqueeWindowPoint]
  );

  const getWorkAreaPointFromEvent = useCallback(
    (nativeEvent) => {
      const layout = workAreaLayoutRef.current;
      const windowPoint = getMarqueeWindowPoint(nativeEvent);
      if (!layout?.ready || !windowPoint) return null;
      return { x: windowPoint.x - layout.x, y: windowPoint.y - layout.y };
    },
    [getMarqueeWindowPoint]
  );

  const getWorkAreaGesturePoint = useCallback(
    (nativeEvent) => {
      return getWorkAreaPointFromEvent(nativeEvent) || getWorkAreaPoint(nativeEvent);
    },
    [getWorkAreaPointFromEvent, getWorkAreaPoint]
  );

  const computeDragPct = useCallback((startTouch, startField, snapshot, currentTouch) => {
    if (!startTouch || !startField || !snapshot || !currentTouch) return null;
    const scale = snapshot.scale || 1;
    const imgW = snapshot.imageWidth;
    const imgH = snapshot.imageHeight;
    if (!imgW || !imgH) return null;
    const deltaX = currentTouch.x - startTouch.x + DRAG_OFFSET_X_PX;
    const deltaY = currentTouch.y - startTouch.y + DRAG_OFFSET_Y_PX;
    const deltaXPct = (deltaX / scale / imgW) * 100;
    const deltaYPct = (deltaY / scale / imgH) * 100;
    return {
      x: clamp(startField.x + deltaXPct, 0, 100),
      y: clamp(startField.y + deltaYPct, 0, 100),
    };
  }, []);

  const scheduleDragPreview = useCallback((next) => {
    dragPreviewRef.current = next;
    if (dragPreviewRafRef.current) return;
    dragPreviewRafRef.current = requestAnimationFrame(() => {
      dragPreviewRafRef.current = null;
      if (dragPreviewRef.current) {
        setDragPreviewPct(dragPreviewRef.current);
      }
    });
  }, []);

  const scheduleDragFingerLocal = useCallback((next) => {
    dragFingerLocalRef.current = next;
    if (dragFingerLocalRafRef.current) return;
    dragFingerLocalRafRef.current = requestAnimationFrame(() => {
      dragFingerLocalRafRef.current = null;
      setDragFingerLocal(dragFingerLocalRef.current);
    });
  }, []);

  const scheduleMultiDragPreview = useCallback((next) => {
    multiDragPreviewRef.current = next;
    if (multiDragPreviewRafRef.current) return;
    multiDragPreviewRafRef.current = requestAnimationFrame(() => {
      multiDragPreviewRafRef.current = null;
      if (multiDragPreviewRef.current) {
        setMultiDragPreview(multiDragPreviewRef.current);
      }
    });
  }, []);

  const scheduleMarqueeRectUpdate = useCallback((nextRect) => {
    marqueeRectPreviewRef.current = nextRect;
    if (marqueeRectRafRef.current) return;
    marqueeRectRafRef.current = requestAnimationFrame(() => {
      marqueeRectRafRef.current = null;
      const pendingRect = marqueeRectPreviewRef.current;
      if (pendingRect) {
        setMarqueeRect(pendingRect);
      }
    });
  }, []);

  const clearDragPreview = useCallback(() => {
    dragPreviewRef.current = null;
    if (dragPreviewRafRef.current) {
      cancelAnimationFrame(dragPreviewRafRef.current);
      dragPreviewRafRef.current = null;
    }
    setDragPreviewPct(null);
  }, []);

  const clearDragFingerLocal = useCallback(() => {
    dragFingerLocalRef.current = null;
    if (dragFingerLocalRafRef.current) {
      cancelAnimationFrame(dragFingerLocalRafRef.current);
      dragFingerLocalRafRef.current = null;
    }
    setDragFingerLocal(null);
  }, []);

  const updateDragFingerFromNativeEvent = useCallback(
    (nativeEvent) => {
      const point = getFieldsOverlayPointFromEvent(nativeEvent)?.local;
      if (!point) return;
      scheduleDragFingerLocal(point);
    },
    [getFieldsOverlayPointFromEvent, scheduleDragFingerLocal]
  );

  const clearMultiDragPreview = useCallback(() => {
    multiDragPreviewRef.current = null;
    if (multiDragPreviewRafRef.current) {
      cancelAnimationFrame(multiDragPreviewRafRef.current);
      multiDragPreviewRafRef.current = null;
    }
    setMultiDragPreview(null);
  }, []);

  const clearMarqueePreview = useCallback(() => {
    marqueeRectPreviewRef.current = null;
    if (marqueeRectRafRef.current) {
      cancelAnimationFrame(marqueeRectRafRef.current);
      marqueeRectRafRef.current = null;
    }
    setMarqueeRect(null);
  }, []);

  const clearMarqueeLongPress = useCallback(
    (reason = '') => {
      if (marqueeLongPressTimeoutRef.current) {
        clearTimeout(marqueeLongPressTimeoutRef.current);
        marqueeLongPressTimeoutRef.current = null;
      }
      marqueeLongPressCandidateRef.current = null;
      if (DEBUG_GESTURES && reason) {
        updateGestureHud({ note: `marquee-wait:${reason}` });
      }
    },
    [updateGestureHud]
  );

  const armMarqueeLongPress = useCallback(
    (touchPoint, localPoint) => {
      clearMarqueeLongPress();
      marqueeLongPressCandidateRef.current = { touch: touchPoint, local: localPoint };
      if (DEBUG_GESTURES) {
        updateGestureHud({ marquee: 'ARMED', note: 'marquee-wait-longpress' });
      }
      marqueeLongPressTimeoutRef.current = setTimeout(() => {
        marqueeLongPressTimeoutRef.current = null;
        const pending = marqueeLongPressCandidateRef.current;
        if (!pending) return;
        marqueeLongPressCandidateRef.current = null;
        const startLocal = pending.local;
        marqueeStartRef.current = { ...startLocal };
        updateSelectionDebug('start', startLocal, startLocal);
        updateGestureHud({ marquee: 'ACTIVE', note: 'marquee-start-longpress' });
        scheduleMarqueeRectUpdate({
          startX: startLocal.x,
          startY: startLocal.y,
          currentX: startLocal.x,
          currentY: startLocal.y,
        });
        panX.setValue(0);
        panY.setValue(0);
        panBlockedRef.current = true;
        logGesture('MARQUEE_LONGPRESS_TRIGGER', {
          x: roundDebug(startLocal.x),
          y: roundDebug(startLocal.y),
        });
        try {
          Vibration.vibrate(10);
        } catch (error) {
          // ignore if vibration isn't available
        }
      }, MARQUEE_LONG_PRESS_MS);
    },
    [
      clearMarqueeLongPress,
      logGesture,
      panX,
      panY,
      scheduleMarqueeRectUpdate,
      updateGestureHud,
      updateSelectionDebug,
    ]
  );

  const updateSelectionDebug = useCallback((phase, pointLocal, docPoint) => {
    if (!DEBUG_SELECTION) return;
    const scale = scaleRef.current || 1;
    const translate = translateRef.current || { x: 0, y: 0 };
    const workAreaOffset = workAreaOffsetRef.current || { x: 0, y: 0 };
    const fieldsOverlayOffset = fieldsOverlayOffsetRef.current || { x: 0, y: 0, w: 0, h: 0 };
    console.log('[selection]', phase, {
      scale,
      translate: { x: Math.round(translate.x), y: Math.round(translate.y) },
      workAreaOffset: { x: Math.round(workAreaOffset.x), y: Math.round(workAreaOffset.y) },
      fieldsOverlayOffset: {
        x: Math.round(fieldsOverlayOffset.x),
        y: Math.round(fieldsOverlayOffset.y),
        w: Math.round(fieldsOverlayOffset.w),
        h: Math.round(fieldsOverlayOffset.h),
      },
      local: pointLocal ? { x: Math.round(pointLocal.x), y: Math.round(pointLocal.y) } : null,
      doc: docPoint ? { x: Math.round(docPoint.x), y: Math.round(docPoint.y) } : null,
    });
    setSelectionDebug(
      pointLocal && docPoint
        ? { local: pointLocal, doc: docPoint }
        : null
    );
  }, []);

  const selectionLogRef = useRef({ lastMoveLog: 0 });

  const startFieldDrag = useCallback(
    (field, startTouch) => {
      if (!field || dragSnapshotRef.current || dragModeRef.current || editingFieldId) return;
      if (!imageLayout.width || !imageLayout.height) return;
      const fieldId = field.id || field.localId;
      if (!fieldId) return;

      // Check if we're in multi-select mode and the field is part of selection
      const isMultiDrag = multiSelectMode && multiSelectedIds.size > 0 && multiSelectedIds.has(fieldId);

      if (isMultiDrag) {
        // Multi-drag mode: save starting positions of all selected fields
        pushUndoState();
        multiDragStartTouchRef.current = startTouch;
        const startPositions = new Map();
        fieldsRef.current.forEach((f) => {
          const fid = f.id || f.localId;
          if (multiSelectedIds.has(fid)) {
            startPositions.set(fid, { x: f.x, y: f.y });
          }
        });
        multiDragStartPositionsRef.current = startPositions;
        dragSnapshotRef.current = {
          scale: scaleRef.current || 1,
          imageWidth: imageLayout.width,
          imageHeight: imageLayout.height,
        };
        multiDragModeRef.current = true;
        dragModeRef.current = true;
        draggingFieldIdRef.current = fieldId;
        setDragMode(true);
        setDraggingFieldId(fieldId);
        setMultiDragPreview({ deltaX: 0, deltaY: 0 });
        panBlockedRef.current = true;
        isDraggingFieldRef.current = true;
        isGesturingRef.current = true;
        gestureConsumedRef.current = true;
        try {
          Vibration.vibrate(10);
        } catch (error) {
          // ignore if vibration isn't available
        }
        return;
      }

      // Single field drag
      if (selectedFieldId !== fieldId) {
        setSelectedFieldId(fieldId);
        setEditingFieldId(null);
        setActiveSubmenu(null);
        setIsMenuOpen(true);
      }

      dragStartTouchRef.current = startTouch;
      dragStartFieldPctRef.current = { x: field.x, y: field.y };
      dragSnapshotRef.current = {
        scale: scaleRef.current || 1,
        imageWidth: imageLayout.width,
        imageHeight: imageLayout.height,
      };
      const initialPreview = computeDragPct(
        dragStartTouchRef.current,
        dragStartFieldPctRef.current,
        dragSnapshotRef.current,
        startTouch
      );
      scheduleDragPreview(initialPreview || { x: field.x, y: field.y });
      dragModeRef.current = true;
      draggingFieldIdRef.current = fieldId;
      setDragMode(true);
      setDraggingFieldId(fieldId);
      panBlockedRef.current = true;
      isDraggingFieldRef.current = true;
      isGesturingRef.current = true;
      gestureConsumedRef.current = true;
      try {
        Vibration.vibrate(10);
      } catch (error) {
        // ignore if vibration isn't available
      }
    },
    [
      editingFieldId,
      imageLayout.height,
      imageLayout.width,
      multiSelectMode,
      multiSelectedIds,
      computeDragPct,
      pushUndoState,
      scheduleDragPreview,
      selectedFieldId,
    ]
  );

  const updateFieldDrag = useCallback(
    (currentTouch) => {
      if (!dragSnapshotRef.current || !dragModeRef.current || !draggingFieldIdRef.current) return;

      // Multi-drag mode
      if (multiDragModeRef.current && multiDragStartTouchRef.current && multiDragStartPositionsRef.current) {
        const snapshot = dragSnapshotRef.current;
        const scale = snapshot.scale || 1;
        const imgW = snapshot.imageWidth;
        const imgH = snapshot.imageHeight;
        if (!imgW || !imgH) return;

        const deltaX = currentTouch.x - multiDragStartTouchRef.current.x;
        const deltaY = currentTouch.y - multiDragStartTouchRef.current.y;
        const deltaXPct = (deltaX / scale / imgW) * 100;
        const deltaYPct = (deltaY / scale / imgH) * 100;

        scheduleMultiDragPreview({ deltaX: deltaXPct, deltaY: deltaYPct });
        return;
      }

      // Single field drag
      const next = computeDragPct(
        dragStartTouchRef.current,
        dragStartFieldPctRef.current,
        dragSnapshotRef.current,
        currentTouch
      );
      if (!next) return;
      scheduleDragPreview(next);
    },
    [computeDragPct, scheduleDragPreview, scheduleMultiDragPreview]
  );

  const endFieldDrag = useCallback(
    (endTouch, cancelled = false) => {
      if (!dragSnapshotRef.current || !dragModeRef.current || !draggingFieldIdRef.current) return;

      // Multi-drag mode
      if (multiDragModeRef.current && multiDragStartPositionsRef.current) {
        if (!cancelled) {
          const delta = multiDragPreviewRef.current || { deltaX: 0, deltaY: 0 };
          const startPositions = multiDragStartPositionsRef.current;

          // Apply delta to all selected fields
          setFields((prev) => {
            const next = prev.map((field) => {
              const fid = field.id || field.localId;
              const startPos = startPositions.get(fid);
              if (!startPos) return field;
              const newX = clamp(startPos.x + delta.deltaX, 0, 100 - (field.width || 10));
              const newY = clamp(startPos.y + delta.deltaY, 0, 95);
              return normalizeField({ ...field, x: newX, y: newY });
            });
            fieldsRef.current = next;
            return next;
          });

          // Persist all moved fields
          startPositions.forEach((_, fid) => {
            schedulePersist(fid);
          });
        }

        // Clear multi-drag state
        multiDragModeRef.current = false;
        multiDragStartTouchRef.current = null;
        multiDragStartPositionsRef.current = null;
        clearMultiDragPreview();
        clearDragFingerLocal();
        dragModeRef.current = false;
        draggingFieldIdRef.current = null;
        setDragMode(false);
        setDraggingFieldId(null);
        isDraggingFieldRef.current = false;
        isGesturingRef.current = false;
        dragSnapshotRef.current = null;
        panBlockedRef.current = false;
        return;
      }

      // Single field drag
      const activeFieldId = draggingFieldIdRef.current;
      let finalPct = dragPreviewRef.current;
      if (!finalPct) {
        finalPct = computeDragPct(
          dragStartTouchRef.current,
          dragStartFieldPctRef.current,
          dragSnapshotRef.current,
          endTouch
        );
      }
      if (!cancelled && finalPct) {
        updateFieldState(activeFieldId, { x: finalPct.x, y: finalPct.y });
        schedulePersist(activeFieldId);
      }
      clearDragPreview();
      clearDragFingerLocal();
      dragModeRef.current = false;
      draggingFieldIdRef.current = null;
      setDragMode(false);
      setDraggingFieldId(null);
      isDraggingFieldRef.current = false;
      isGesturingRef.current = false;
      dragStartTouchRef.current = null;
      dragStartFieldPctRef.current = null;
      dragSnapshotRef.current = null;
      panBlockedRef.current = false;
    },
    [
      clearDragFingerLocal,
      clearDragPreview,
      clearMultiDragPreview,
      computeDragPct,
      schedulePersist,
      updateFieldState,
    ]
  );

  // Check if a point (in workArea-local coordinates) is inside the menu
  const isPointInMenu = useCallback(
    (pointLocal) => {
      if (!isMenuOpen) return false;
      const frame = menuLayoutRef.current;
      // If menu layout not yet measured, assume point is in menu to be safe
      if (!frame) return true;
      return (
        pointLocal.x >= frame.x &&
        pointLocal.x <= frame.x + frame.width &&
        pointLocal.y >= frame.y &&
        pointLocal.y <= frame.y + frame.height
      );
    },
    [isMenuOpen]
  );

  // Get the origin of the image in workArea-local coordinates (before any transform)
  // The image/zoomContainer is centered in the workArea via flexbox (alignItems/justifyContent: center)
  const getImageBaseOriginLocal = useCallback(() => {
    if (imageBaseLayout.width && imageBaseLayout.height) {
      return { x: imageBaseLayout.x, y: imageBaseLayout.y };
    }
    if (!frameLayout.width || !frameLayout.height) return null;
    if (!targetLayout.width || !targetLayout.height) return null;
    // Calculate the centered position of the image within workArea
    // Flexbox centering places the content exactly at: (container - content) / 2
    const baseX = (frameLayout.width - targetLayout.width) / 2;
    const baseY = (frameLayout.height - targetLayout.height) / 2;
    return { x: baseX, y: baseY };
  }, [frameLayout, imageBaseLayout.height, imageBaseLayout.width, imageBaseLayout.x, imageBaseLayout.y, targetLayout]);

  // Legacy alias
  const getImageBaseOriginWindow = getImageBaseOriginLocal;

  /**
   * Convert a point in workArea-local coordinates to image-local coordinates.
   *
   * RN transform [translateX, translateY, scale] with default origin (center of view):
   *
   * The transform applies around the center of the Animated.View.
   * Let C = center of image = imageSize / 2
   * Let T = translateRef (screen pixels)
   * Let S = scale
   *
   * Forward (image point P_img to screen point P_scr):
   *   P_scr = baseOrigin + C + T + S * (P_img - C)
   *   P_scr = baseOrigin + C + T + S*P_img - S*C
   *   P_scr = baseOrigin + T + S*P_img + C*(1-S)
   *
   * Inverse (screen point to image point):
   *   P_img = (P_scr - baseOrigin - T - C*(1-S)) / S + C - C
   *   P_img = (P_scr - baseOrigin - T - C + S*C) / S
   *   P_img = (P_scr - baseOrigin - T) / S - C/S + C
   *   P_img = (P_scr - baseOrigin - T) / S + C * (1 - 1/S)
   *
   * Simplified:
   *   P_img = (P_scr - baseOrigin - T - C*(1-S)) / S
   */
  const screenPointToImagePoint = useCallback(
    (pointLocal) => {
      if (!imageLayout.width || !imageLayout.height) return null;
      const baseOrigin = getImageBaseOriginLocal();
      if (!baseOrigin) return null;

      const scale = scaleRef.current || 1;
      const translate = translateRef.current || { x: 0, y: 0 };

      const centerX = imageLayout.width / 2;
      const centerY = imageLayout.height / 2;

      // P_img = (P_scr - baseOrigin - T - C*(1-S)) / S
      const imageX = (pointLocal.x - baseOrigin.x - translate.x - centerX * (1 - scale)) / scale;
      const imageY = (pointLocal.y - baseOrigin.y - translate.y - centerY * (1 - scale)) / scale;

      if (DEBUG_GESTURES) {
        const outOfBounds = imageX < -5 || imageX > imageLayout.width + 5 || imageY < -5 || imageY > imageLayout.height + 5;
        if (outOfBounds) {
          console.log('[gesture] COORD_ERROR', {
            tap: { x: Math.round(pointLocal.x), y: Math.round(pointLocal.y) },
            origin: { x: Math.round(baseOrigin.x), y: Math.round(baseOrigin.y) },
            translate: { x: Math.round(translate.x), y: Math.round(translate.y) },
            center: { x: Math.round(centerX), y: Math.round(centerY) },
            scale,
            result: { x: Math.round(imageX), y: Math.round(imageY) },
            bounds: { w: Math.round(imageLayout.width), h: Math.round(imageLayout.height) },
          });
        }
      }

      return { x: imageX, y: imageY };
    },
    [getImageBaseOriginLocal, imageLayout.height, imageLayout.width]
  );

  /**
   * Convert a point in image-local coordinates to workArea-local coordinates.
   *
   * Forward transform:
   *   P_scr = baseOrigin + T + S*P_img + C*(1-S)
   */
  const projectDocPointToWindow = useCallback(
    (docX, docY) => {
      const baseOrigin = getImageBaseOriginWindow();
      if (!baseOrigin) return null;

      const scale = scaleRef.current || 1;
      const translate = translateRef.current || { x: 0, y: 0 };

      const centerX = imageLayout.width / 2;
      const centerY = imageLayout.height / 2;

      // P_scr = baseOrigin + T + S*P_img + C*(1-S)
      return {
        x: baseOrigin.x + translate.x + scale * docX + centerX * (1 - scale),
        y: baseOrigin.y + translate.y + scale * docY + centerY * (1 - scale),
      };
    },
    [getImageBaseOriginWindow, imageLayout.height, imageLayout.width]
  );

  const getFieldWindowRect = useCallback(
    (field) => {
      if (!field || !imageLayout.width || !imageLayout.height) return null;
      const fieldWidth = Number.isFinite(field.width) ? field.width : DEFAULT_FIELD.width;
      const localX = (field.x / 100) * imageLayout.width;
      const localY = (field.y / 100) * imageLayout.height;
      const localWidth = (fieldWidth / 100) * imageLayout.width;
      const localHeight =
        Number.isFinite(field.height) && field.height > 0
          ? field.height
          : calculateFieldHeight(field);
      const topLeft = projectDocPointToWindow(localX, localY);
      if (!topLeft) return null;
      const scale = scaleRef.current || 1;
      return {
        x: topLeft.x,
        y: topLeft.y,
        width: localWidth * scale,
        height: localHeight * scale,
        local: { x: localX, y: localY, width: localWidth, height: localHeight },
      };
    },
    [imageLayout.height, imageLayout.width, projectDocPointToWindow]
  );

  const isPointInFieldRect = useCallback(
    (pointLocal, field, hitSlop = 0) => {
      if (!pointLocal || !field) return false;
      const rect = getFieldWindowRect(field);
      if (!rect) return false;
      const left = rect.x - hitSlop;
      const right = rect.x + rect.width + hitSlop;
      const top = rect.y - hitSlop;
      const bottom = rect.y + rect.height + hitSlop;
      return (
        pointLocal.x >= left &&
        pointLocal.x <= right &&
        pointLocal.y >= top &&
        pointLocal.y <= bottom
      );
    },
    [getFieldWindowRect]
  );

  const resolveGestureTarget = useCallback(
    (point) => {
      if (isPointInMenu(point)) {
        return { type: 'menu' };
      }
      if (selectedField && isPointInFieldRect(point, selectedField, FIELD_HIT_SLOP)) {
        return { type: 'field', field: selectedField };
      }
      const local = screenPointToImagePoint(point);
      if (local) {
        const hitField = findFieldAtPoint(local.x, local.y);
        if (hitField) {
          return { type: 'field', field: hitField };
        }
      }
      return { type: 'document' };
    },
    [findFieldAtPoint, isPointInFieldRect, isPointInMenu, screenPointToImagePoint, selectedField]
  );

  const resolveTapTargetFromEvent = useCallback(
    (nativeEvent) => {
      const pointLocal = getWindowPoint(nativeEvent);
      if (isPointInMenu(pointLocal)) {
        return { type: 'menu' };
      }
      const imagePoint = getFieldsOverlayPointFromEvent(nativeEvent)?.local;
      if (imagePoint) {
        const scale = scaleRef.current || 1;
        const hitSlopImage = FIELD_HIT_SLOP / Math.max(scale, 0.001);
        if (selectedField && imageLayout.width && imageLayout.height) {
          const fieldWidth = Number.isFinite(selectedField.width) ? selectedField.width : DEFAULT_FIELD.width;
          const left = (selectedField.x / 100) * imageLayout.width;
          const top = (selectedField.y / 100) * imageLayout.height;
          const width = (fieldWidth / 100) * imageLayout.width;
          const height =
            Number.isFinite(selectedField.height) && selectedField.height > 0
              ? selectedField.height
              : calculateFieldHeight(selectedField);
          if (
            imagePoint.x >= left - hitSlopImage &&
            imagePoint.x <= left + width + hitSlopImage &&
            imagePoint.y >= top - hitSlopImage &&
            imagePoint.y <= top + height + hitSlopImage
          ) {
            return { type: 'field', field: selectedField };
          }
        }
        const hitField = findFieldAtPoint(imagePoint.x, imagePoint.y);
        if (hitField) {
          return { type: 'field', field: hitField };
        }
      }
      return { type: 'document' };
    },
    [
      findFieldAtPoint,
      getFieldsOverlayPointFromEvent,
      getWindowPoint,
      imageLayout.height,
      imageLayout.width,
      isPointInMenu,
      selectedField,
    ]
  );

  const refreshMenuLayout = useCallback(() => {
    if (!menuContainerRef.current?.measureInWindow) return;
    menuContainerRef.current.measureInWindow((x, y, width, height) => {
      // Convert window coordinates to workArea-local coordinates
      const offset = workAreaOffsetRef.current || { x: 0, y: 0 };
      menuLayoutRef.current = {
        x: x - offset.x,
        y: y - offset.y,
        width,
        height,
      };
    });
  }, []);

  const handleMenuLayout = useCallback(() => {
    refreshMenuLayout();
  }, [refreshMenuLayout]);

  useEffect(() => {
    if (isMenuOpen) {
      refreshMenuLayout();
    }
  }, [
    isMenuOpen,
    refreshMenuLayout,
    scaleState,
    activeSubmenu,
    targetLayout,
    imageLayout,
    frameLayout,
  ]);

  const spawnField = useCallback(
    (partial, options = {}) => {
      const { select = true, edit = true } = options;
      const localId = `local-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      const repeatCount = normalizeRepeatCount(
        partial.repeat_index ?? DEFAULT_FIELD.repeat_index,
        1
      );
      const nextField = normalizeField({
        ...DEFAULT_FIELD,
        ...partial,
        localId,
        repeat_index: repeatCount,
        field_name: '',
      });
      setFields((prev) => [...prev, nextField]);
      if (select) {
        setSelectedFieldId(localId);
        setIsMenuOpen(true);
      }
      if (edit) setEditingFieldId(localId);
      ensureCreated(nextField);
      return localId;
    },
    [ensureCreated]
  );

  const createNewFieldAtPoint = useCallback(
    (imageX, imageY) => {
      if (!imageLayout.width || !imageLayout.height) return;
      if (imageX < 0 || imageY < 0 || imageX > imageLayout.width || imageY > imageLayout.height) {
        return;
      }
      const { x, y } = screenToPercent(imageX, imageY, imageLayout);
      const initialWidth = Math.min(NEW_FIELD_WIDTH, 100);
      const maxX = Math.max(0, 100 - initialWidth);
      const maxY = imageLayout.height
        ? 100 - (DEFAULT_FIELD.height / imageLayout.height) * 100
        : 100;
      const clampedX = clamp(x, 0, maxX);
      const clampedY = clamp(y, 0, Math.max(0, maxY));
      const createdId = spawnField(
        {
          x: clampedX,
          y: clampedY,
          width: initialWidth,
          height: DEFAULT_FIELD.height,
          field_label: CREATE_FIELD_LABEL,
          text_example: '',
          page_number: currentPage,
        },
        { select: true, edit: false }
      );
      lastCreatedFieldIdRef.current = createdId;
      lastCreatedAtRef.current = Date.now();
    },
    [currentPage, imageLayout, spawnField]
  );

  const createNewFieldAtScreenPoint = useCallback(
    (screenX, screenY) => {
      if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;
      const local = screenPointToImagePoint({ x: screenX, y: screenY });
      if (!local) return;
      createNewFieldAtPoint(local.x, local.y);
    },
    [createNewFieldAtPoint, screenPointToImagePoint]
  );

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    setActiveSubmenu(null);
    setSheetHeight(0);
    menuLayoutRef.current = null;
  }, []);

  const handleTapAction = useCallback(
    (target, point, imagePoint = null) => {
      if (!target) return;

      // If a pan/pinch gesture consumed this touch, ignore the tap
      if (gestureConsumedRef.current) {
        logGesture('TAP_IGNORED_GESTURE_CONSUMED', { point });
        gestureConsumedRef.current = false; // Reset for next interaction
        return;
      }

      // Multi-select mode: toggle field selection
      if (multiSelectMode && target.type === 'field') {
        const fieldId = target.field?.id || target.field?.localId;
        if (fieldId) {
          setMultiSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(fieldId)) {
              next.delete(fieldId);
            } else {
              next.add(fieldId);
            }
            return next;
          });
          logGesture('TAP_MULTI_SELECT_TOGGLE', { fieldId, point });
        }
        return;
      }

      // Multi-select mode: tap on document exits multi-select mode
      if (multiSelectMode && target.type === 'document') {
        setMultiSelectMode(false);
        setMultiSelectedIds(new Set());
        logGesture('TAP_EXIT_MULTI_SELECT', { point });
        return;
      }

      if (isMenuOpen && target.type !== 'menu') {
        if (target.type === 'field') {
          const fieldId = target.field?.id || target.field?.localId;
          if (fieldId && fieldId === selectedFieldId && !editingFieldId) {
            setEditingFieldId(fieldId);
            logGesture('TAP_FIELD_EDIT', { fieldId, point, gestureType: 'tap' });
            return;
          }
        }
        closeMenu();
        logGesture('TAP_CLOSE_MENU', { point, target: target.type, gestureType: 'tap' });
        return;
      }

      if (target.type === 'menu') {
        logGesture('TAP_MENU', { point, gestureType: 'tap' });
        return;
      }

      if (target.type === 'field') {
        const fieldId = target.field?.id || target.field?.localId;
        if (editingFieldId && fieldId === editingFieldId) {
          return;
        }
        if (fieldId) {
          setSelectedFieldId(fieldId);
          setEditingFieldId(null);
          setActiveSubmenu(null);
          setIsMenuOpen(true);
          logGesture('TAP_FIELD', { fieldId, point, gestureType: 'tap' });
        }
        return;
      }

      // Document tap
      if (editingFieldId) {
        Keyboard.dismiss();
        setEditingFieldId(null);
        logGesture('TAP_BLUR_EDIT', { point, gestureType: 'tap' });
        return;
      }

      if (selectedFieldId) {
        setSelectedFieldId(null);
        closeMenu();
        logGesture('TAP_DESELECT', { point, gestureType: 'tap' });
        return;
      }

      if (justDeletedRef.current) {
        justDeletedRef.current = false;
        return;
      }

      if (imagePoint) {
        createNewFieldAtPoint(imagePoint.x, imagePoint.y);
        return;
      }
      createNewFieldAtScreenPoint(point.x, point.y);
    },
    [
      closeMenu,
      createNewFieldAtPoint,
      createNewFieldAtScreenPoint,
      editingFieldId,
      isMenuOpen,
      logGesture,
      multiSelectMode,
      selectedFieldId,
    ]
  );

  const handleTapStateChange = useCallback(
    (event) => {
      const { state } = event.nativeEvent;
      const pointWindow = getWindowPoint(event.nativeEvent);
      if (DEBUG_GESTURES) {
        updateGestureHud({
          tap: getGestureStateLabel(state),
          pointers: Number(event?.nativeEvent?.numberOfPointers || 1),
        });
        logGestureState('TAP_STATE', event.nativeEvent, {
          point: { x: roundDebug(pointWindow.x), y: roundDebug(pointWindow.y) },
        });
      }
      if (state === State.BEGAN) {
        // Reset consumed flag at the start of a new tap
        gestureConsumedRef.current = false;
        if (DEBUG_GESTURES) {
          const baseOrigin = getImageBaseOriginWindow();
          const scale = scaleRef.current;
          const translate = translateRef.current;
          const localPoint = screenPointToImagePoint(pointWindow);
          const hit = localPoint ? findFieldAtPoint(localPoint.x, localPoint.y) : null;
          const samples = pageFields.slice(0, 3).map((field) => {
            const leftPx = (field.x / 100) * imageLayout.width;
            const topPx = (field.y / 100) * imageLayout.height;
            const widthPx = (field.width / 100) * imageLayout.width;
            return {
              id: field.id || field.localId,
              pct: { x: Math.round(field.x), y: Math.round(field.y), w: Math.round(field.width) },
              px: { l: Math.round(leftPx), t: Math.round(topPx), w: Math.round(widthPx), h: field.height },
            };
          });
          console.log('[gesture] TAP_DEBUG', {
            tap: { x: Math.round(pointWindow.x), y: Math.round(pointWindow.y) },
            origin: baseOrigin ? { x: Math.round(baseOrigin.x), y: Math.round(baseOrigin.y) } : null,
            transform: { scale, tx: Math.round(translate.x), ty: Math.round(translate.y) },
            imgSize: { w: Math.round(imageLayout.width), h: Math.round(imageLayout.height) },
            tapInImg: localPoint ? { x: Math.round(localPoint.x), y: Math.round(localPoint.y) } : null,
            hit: hit ? (hit.id || hit.localId) : null,
            fields: samples,
          });
        }
        tapTargetRef.current = resolveTapTargetFromEvent(event.nativeEvent);
        logGesture('TAP_START', {
          target: tapTargetRef.current?.type,
          point: pointWindow,
          gestureType: 'tap',
        });
        return;
      }
      if (state === State.END) {
        const target = tapTargetRef.current;
        tapTargetRef.current = null;
        const imagePoint = getFieldsOverlayPointFromEvent(event.nativeEvent)?.local || null;
        logGesture('TAP_END', { target: target?.type, point: pointWindow, gestureType: 'tap' });
        handleTapAction(target, pointWindow, imagePoint);
        return;
      }
      if (state === State.FAILED || state === State.CANCELLED) {
        tapTargetRef.current = null;
      }
    },
    [
      findFieldAtPoint,
      getImageBaseOriginWindow,
      getFieldsOverlayPointFromEvent,
      getWindowPoint,
      handleTapAction,
      logGesture,
      logGestureState,
      pageFields,
      resolveTapTargetFromEvent,
      screenPointToImagePoint,
      updateGestureHud,
    ]
  );

  const handleMove = useCallback(
    (direction, stepPercent) => {
      if (!selectedFieldId) return;
      // Use provided step or default to MOVE_STEP
      const step = stepPercent !== undefined ? stepPercent : MOVE_STEP;
      const delta = {
        left: [-step, 0],
        right: [step, 0],
        up: [0, -step],
        down: [0, step],
      }[direction];
      if (!delta) return;
      const [dx, dy] = delta;

      setFields((prev) =>
        prev.map((field) => {
          const key = field.id || field.localId;
          if (key !== selectedFieldId) return field;
          const maxX = 100 - field.width;
          const maxY = imageLayout.height
            ? 100 - (field.height / imageLayout.height) * 100
            : 100;
          const nextX = clamp(field.x + dx, 0, Math.max(0, maxX));
          const nextY = clamp(field.y + dy, 0, Math.max(0, maxY));
          schedulePersist(key);
          return normalizeField({ ...field, x: nextX, y: nextY });
        })
      );
    },
    [imageLayout.height, schedulePersist, selectedFieldId]
  );

  const handleResize = useCallback(
    (dimension, delta) => {
      if (!selectedField) return;
      const key = selectedField.id || selectedField.localId;
      const selectedType = normalizeFieldType(selectedField.field_type);
      const isBooleanType = isBooleanFieldType(selectedType);
      if (dimension === 'width') {
        const nextWidth = clamp(selectedField.width + delta, MIN_WIDTH, 100);
        const maxWidth = 100 - selectedField.x;
        const clampedWidth = Math.min(nextWidth, maxWidth);
        if (isBooleanType && imageLayout.width > 0) {
          const derivedHeight = clamp((clampedWidth / 100) * imageLayout.width, MIN_HEIGHT, 1000);
          updateFieldState(key, { width: clampedWidth, height: derivedHeight });
        } else {
          updateFieldState(key, { width: clampedWidth });
        }
      } else if (dimension === 'height') {
        const minHeight = (() => {
          if (isBooleanType) return MIN_HEIGHT;
          const fontSize = selectedField.font_size || 12;
          const lineHeight = selectedField.line_height || 1.2;
          const lineCount = selectedField.line_count || 1;
          const minTextHeight = fontSize * lineHeight * lineCount;
          return Math.max(MIN_HEIGHT, minTextHeight);
        })();
        const nextHeight = clamp(selectedField.height + delta, minHeight, 1000);
        if (isBooleanType && imageLayout.width > 0) {
          const maxWidth = 100 - selectedField.x;
          const derivedWidth = clamp((nextHeight / imageLayout.width) * 100, MIN_WIDTH, maxWidth);
          updateFieldState(key, { height: nextHeight, width: derivedWidth });
        } else {
          updateFieldState(key, { height: nextHeight });
        }
      }
      schedulePersist(key);
    },
    [imageLayout.width, selectedField, schedulePersist, updateFieldState]
  );

  const handleFontSizeChange = useCallback(
    (delta) => {
      if (!selectedField) return;
      const key = selectedField.id || selectedField.localId;
      const nextSize = clamp(selectedField.font_size + delta, FONT_SIZE_MIN, FONT_SIZE_MAX);
      updateFieldState(key, { font_size: nextSize });
      schedulePersist(key);
    },
    [selectedField, schedulePersist, updateFieldState]
  );

  const handleTextChange = useCallback(
    (fieldKey, value) => {
      const lines = String(value ?? '').split('\n').length || 1;
      updateFieldState(fieldKey, {
        field_label: value,
        line_count: Math.max(1, lines),
      });
      schedulePersist(fieldKey, 450);
    },
    [schedulePersist, updateFieldState]
  );

  // Handler for context menu text changes (uses selected field)
  // Updates both the draft (for immediate visual feedback in FieldRenderer via
  // labelOverride) AND the field state (so the model stays in sync).
  // Also syncs display_name if user hasn't manually customized it.
  const handleContextMenuTextChange = useCallback(
    (value) => {
      if (!selectedFieldId || !selectedField) return;
      const nextValue = String(value ?? '');
      setMenuLabelDraft(nextValue);

      // Check if display_name should be auto-synced with label:
      // - empty or not set
      // - equals the current field_label (meaning it was auto-synced before)
      // - equals "exemple" (default value)
      const currentLabel = selectedField.field_label || '';
      const currentDisplayName = selectedField.display_name || '';
      const shouldSyncDisplayName =
        !currentDisplayName ||
        currentDisplayName === currentLabel ||
        currentDisplayName.toLowerCase() === 'exemple';

      const patch = {
        field_label: nextValue,
      };
      if (shouldSyncDisplayName) {
        patch.display_name = nextValue;
      }

      updateFieldState(selectedFieldId, patch);
      schedulePersist(selectedFieldId, 450);
    },
    [schedulePersist, selectedField, selectedFieldId, updateFieldState]
  );

  const handleContextMenuTextCommit = useCallback(() => {
    if (!selectedFieldId) return;
    if (menuLabelDraft === null || menuLabelDraft === undefined) return;
    handleTextChange(selectedFieldId, menuLabelDraft);
  }, [handleTextChange, menuLabelDraft, selectedFieldId]);

  // Handler for line count changes
  const handleLineCountChange = useCallback(
    (count) => {
      if (!selectedField) return;
      const key = selectedField.id || selectedField.localId;
      updateFieldState(key, { line_count: Math.max(1, count) });
      schedulePersist(key);
    },
    [selectedField, schedulePersist, updateFieldState]
  );

  // Handler for updating field from context menu config
  const handleContextMenuUpdateField = useCallback(
    (patch) => {
      if (!selectedField) return;
      const key = selectedField.id || selectedField.localId;
      const nextPatch = { ...patch };
      const patchedType = normalizeFieldType(nextPatch.field_type ?? selectedField.field_type);
      const currentType = normalizeFieldType(selectedField.field_type);
      const shouldSquare = isBooleanFieldType(patchedType);

      if (shouldSquare && imageLayout.width > 0) {
        const baseHeight = (() => {
          if (Number.isFinite(Number(nextPatch.height)) && Number(nextPatch.height) > 0) {
            return Number(nextPatch.height);
          }
          if (Number.isFinite(Number(nextPatch.width)) && Number(nextPatch.width) > 0) {
            return (Number(nextPatch.width) / 100) * imageLayout.width;
          }
          if (Number.isFinite(Number(selectedField.height)) && Number(selectedField.height) > 0) {
            return Number(selectedField.height);
          }
          return DEFAULT_FIELD.height;
        })();
        const maxWidth = Math.max(MIN_WIDTH, 100 - (Number(selectedField.x) || 0));
        const squareWidth = clamp((baseHeight / imageLayout.width) * 100, MIN_WIDTH, maxWidth);
        nextPatch.height = baseHeight;
        nextPatch.width = squareWidth;
        nextPatch.line_count = 1;
        nextPatch.wrap_mode = 'word';
        if (patchedType === FIELD_TYPE_CHECKBOX && nextPatch.is_checked_default === undefined) {
          nextPatch.is_checked_default = Boolean(selectedField.is_checked_default);
        }
      }

      if (!shouldSquare && isBooleanFieldType(currentType)) {
        if (nextPatch.field_label === undefined) {
          nextPatch.field_label = '';
        }
      }

      updateFieldState(key, nextPatch);
      schedulePersist(key);
    },
    [imageLayout.width, schedulePersist, selectedField, updateFieldState]
  );

  const handleAutoSize = useCallback(
    (fieldKey, size, field) => {
      if (!field || !size || !imageLayout.width || !imageLayout.height) return;
      if (isBooleanFieldType(field.field_type)) return;
      const widthPx = Number(size.width);
      const heightPx = Number(size.height);
      if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx)) return;

      const maxWidthPercent = Math.max(MIN_WIDTH, 100 - (Number(field.x) || 0));
      const measuredWidth = clamp((widthPx / imageLayout.width) * 100, MIN_WIDTH, maxWidthPercent);
      // Width can only GROW, never shrink — preserve manual sizing
      const currentWidth = field.width || MIN_WIDTH;
      const nextWidth = Math.max(currentWidth, measuredWidth);

      const maxHeightPx = Math.max(
        MIN_HEIGHT,
        Math.min(
          1000,
          imageLayout.height - ((Number(field.y) || 0) / 100) * imageLayout.height
        )
      );
      const nextHeight = clamp(heightPx, MIN_HEIGHT, maxHeightPx);

      if (
        Math.abs(currentWidth - nextWidth) < 0.2 &&
        Math.abs((field.height || 0) - nextHeight) < 0.5
      ) {
        return;
      }

      updateFieldState(fieldKey, { width: nextWidth, height: nextHeight, wrap_mode: 'word' });
      schedulePersist(fieldKey, 450);
    },
    [imageLayout.height, imageLayout.width, schedulePersist, updateFieldState]
  );

  const handleStopEdit = useCallback(() => {
    if (!selectedFieldId) return;
    setEditingFieldId(null);
  }, [selectedFieldId]);

  const handleOpenConfig = useCallback(() => {
    if (!selectedField) return;
    setConfigVisible(true);
  }, [selectedField]);

  const handleSaveConfig = useCallback(
    (config) => {
      handleContextMenuUpdateField(config);
    },
    [handleContextMenuUpdateField]
  );

  const handleForceSave = useCallback(() => {
    if (!selectedField) return;
    const key = selectedField.id || selectedField.localId;
    if (!key) return;
    // Cancel any pending debounced save
    if (updateTimersRef.current.has(key)) {
      clearTimeout(updateTimersRef.current.get(key));
      updateTimersRef.current.delete(key);
    }
    // Read the LATEST field data from the ref (state may be stale in this closure)
    const target = fieldsRef.current.find(
      (f) => f.id === key || f.localId === key
    );
    if (!target) return Promise.resolve();
    // If field hasn't been created on the server yet, create it
    if (target.localId && !target.id) {
      return ensureCreated(target);
    }
    // Immediately persist to API — return the promise so callers can await it
    return templates
      .updateField(templateId, target.id, buildPayload(target))
      .then((response) => {
        applyFieldResponse(target.id, response);
        showSaved('Sauvegardé ✓');
      })
      .catch((error) => {
        console.error('Erreur sauvegarde champ:', error);
        Alert.alert('Erreur', 'Impossible de sauvegarder le champ');
        throw error;
      });
  }, [applyFieldResponse, ensureCreated, selectedField, showSaved, templateId]);

  // Open duplicate modal (for single field from toolbar)
  const openDuplicateModal = useCallback(() => {
    if (!selectedField && !(multiSelectMode && multiSelectedIds.size > 0)) return;
    setDuplicateCount('1');
    setDuplicateModalVisible(true);
  }, [multiSelectMode, multiSelectedIds, selectedField]);

  // Perform duplication with specified count
  const handleDuplicateWithCount = useCallback((count) => {
    const numCopies = Math.max(1, Math.min(99, parseInt(count, 10) || 1));

    // Save state for undo
    pushUndoState();

    // Multi-select mode: duplicate all selected fields
    if (multiSelectMode && multiSelectedIds.size > 0) {
      const selectedFields = fields.filter((f) => {
        const key = f.id || f.localId;
        return multiSelectedIds.has(key);
      });
      if (!selectedFields.length) return;

      let totalCreated = 0;
      let workingFields = [...fields];

      for (let i = 0; i < numCopies; i++) {
        const duplicatedFields = duplicateFieldSelection(
          i === 0 ? selectedFields : workingFields.slice(-selectedFields.length),
          workingFields,
          imageLayout,
          DUPLICATE_GAP_PX // fixed 10px gap between source and duplicate
        );

        if (!duplicatedFields.length) break;

        // Create all duplicated fields
        duplicatedFields.forEach((dupField) => {
          spawnField(
            { ...dupField, page_number: currentPage },
            { select: false, edit: false }
          );
          workingFields.push(dupField);
        });
        totalCreated += duplicatedFields.length;
      }

      // Clear multi-selection and exit multi-select mode
      setMultiSelectedIds(new Set());
      setMultiSelectMode(false);
      showSaved(`${totalCreated} champs dupliqués ✓`);
      return;
    }

    // Single field duplication with count
    if (!selectedField) return;

    let workingFields = [...fields];
    let lastField = selectedField;

    for (let i = 0; i < numCopies; i++) {
      const duplicatedField = duplicateFieldSelection(
        [lastField],
        workingFields,
        imageLayout,
        DUPLICATE_GAP_PX
      )[0];

      if (!duplicatedField) break;

      spawnField(
        { ...duplicatedField, page_number: currentPage },
        { select: i === numCopies - 1, edit: false } // Select only the last one
      );
      workingFields.push(duplicatedField);
      lastField = duplicatedField;
    }

    showSaved(numCopies > 1 ? `${numCopies} copies créées ✓` : 'Dupliqué ✓');
  }, [
    currentPage,
    fields,
    imageLayout,
    multiSelectMode,
    multiSelectedIds,
    pushUndoState,
    selectedField,
    showSaved,
    spawnField,
  ]);

  // Legacy handleDuplicate for context menu (single copy)
  const handleDuplicate = useCallback(() => {
    handleDuplicateWithCount(1);
  }, [handleDuplicateWithCount]);

  const handleDelete = useCallback(async () => {
    if (!selectedField) return;

    // Save state for undo
    pushUndoState();

    // Set guard to prevent creating a new field when tap propagates
    justDeletedRef.current = true;
    // Reset guard after a short delay
    setTimeout(() => {
      justDeletedRef.current = false;
    }, 300);

    const key = selectedField.id || selectedField.localId;
    if (selectedField.id) {
      try {
        await templates.deleteField(templateId, selectedField.id);
        showSaved('Supprimé ✓');
      } catch (error) {
        console.error('Erreur suppression champ:', error);
        Alert.alert('Erreur', 'Impossible de supprimer le champ');
      }
    }
    setFields((prev) => prev.filter((field) => field.id !== key && field.localId !== key));
    setSelectedFieldId(null);
    setEditingFieldId(null);
    setIsMenuOpen(false);
    setActiveSubmenu(null);
    menuLayoutRef.current = null;
  }, [pushUndoState, selectedField, showSaved, templateId]);

  // ---------------------------------------------------------------------------
  // Multi-select batch helpers
  // ---------------------------------------------------------------------------

  const buildMultiSelectSnapshot = useCallback(() => {
    if (multiSelectedIds.size < 2) return null;
    const selected = fieldsRef.current.filter((f) => {
      const key = f.id || f.localId;
      return multiSelectedIds.has(key);
    });
    if (selected.length < 2) return null;

    const imgH = imageLayout.height || 1;
    const fieldsMap = new Map();
    const withMetrics = selected.map((field) => {
      const key = field.id || field.localId;
      const width = Number.isFinite(field.width) ? field.width : DEFAULT_FIELD.width;
      const heightPx =
        Number.isFinite(field.height) && field.height > 0
          ? field.height
          : calculateFieldHeight(field);
      const heightPct = (heightPx / imgH) * 100;
      const fontSize = Number.isFinite(field.font_size) ? field.font_size : DEFAULT_FIELD.font_size;
      const lineHeight = Number.isFinite(field.line_height) ? field.line_height : DEFAULT_FIELD.line_height;
      const lineCount = Math.max(1, parseInt(field.line_count ?? DEFAULT_FIELD.line_count, 10) || 1);
      const fieldType = normalizeFieldType(field.field_type);
      fieldsMap.set(key, {
        x: field.x,
        y: field.y,
        width,
        height: heightPx,
        fontSize,
        lineHeight,
        lineCount,
        fieldType,
      });
      return {
        field,
        key,
        x: field.x,
        y: field.y,
        width,
        heightPx,
        heightPct,
        fontSize,
        centerX: field.x + width / 2,
        centerY: field.y + heightPct / 2,
      };
    });

    const clusterBy = (items, getValue, tolerance) => {
      const sorted = [...items].sort((a, b) => getValue(a) - getValue(b));
      const groups = [];
      sorted.forEach((item) => {
        const value = getValue(item);
        const last = groups[groups.length - 1];
        if (!last || Math.abs(value - last.center) > tolerance) {
          groups.push({ items: [item], center: value });
          return;
        }
        last.items.push(item);
        last.center = last.items.reduce((sum, entry) => sum + getValue(entry), 0) / last.items.length;
      });
      return groups.map((group) => group.items);
    };

    const avgHeightPct = withMetrics.reduce((sum, item) => sum + item.heightPct, 0) / withMetrics.length;
    const avgWidthPct = withMetrics.reduce((sum, item) => sum + item.width, 0) / withMetrics.length;
    const rowTolerance = Math.max(0.8, avgHeightPct * 0.35);
    const colTolerance = Math.max(0.8, avgWidthPct * 0.35);

    const rowGroups = clusterBy(withMetrics, (item) => item.centerY, rowTolerance)
      .map((rowItems) => {
        const sortedRow = [...rowItems].sort((a, b) => a.x - b.x || a.centerY - b.centerY);
        const gaps = [];
        for (let i = 1; i < sortedRow.length; i += 1) {
          const prev = sortedRow[i - 1];
          gaps.push(sortedRow[i].x - (prev.x + prev.width));
        }
        return {
          keys: sortedRow.map((item) => item.key),
          gaps,
        };
      })
      .filter((group) => group.keys.length > 1);

    const colGroups = clusterBy(withMetrics, (item) => item.centerX, colTolerance)
      .map((colItems) => {
        const sortedCol = [...colItems].sort((a, b) => a.y - b.y || a.centerX - b.centerX);
        const gaps = [];
        for (let i = 1; i < sortedCol.length; i += 1) {
          const prev = sortedCol[i - 1];
          gaps.push(sortedCol[i].y - (prev.y + prev.heightPct));
        }
        return {
          keys: sortedCol.map((item) => item.key),
          gaps,
        };
      })
      .filter((group) => group.keys.length > 1);

    return {
      fieldsMap,
      rowGroups,
      colGroups,
      hAdjustKeys: rowGroups.flatMap((group) => group.keys),
      vAdjustKeys: colGroups.flatMap((group) => group.keys),
      maxFontSize: withMetrics.reduce((max, item) => Math.max(max, item.fontSize), FONT_SIZE_MIN),
    };
  }, [imageLayout.height, multiSelectedIds]);

  // --- Snapshot initial positions/sizes when selection changes ---
  useEffect(() => {
    const snap = buildMultiSelectSnapshot();
    if (!snap) {
      multiSelectSnapshotRef.current = null;
      setSpacingVSlider(100);
      setSpacingHSlider(100);
      setSizeWSlider(100);
      setSizeHSlider(100);
      setMultiFontSizeValue(DEFAULT_FIELD.font_size);
      setMsPanel(null);
      return;
    }
    multiSelectSnapshotRef.current = snap;
    setSpacingVSlider(100);
    setSpacingHSlider(100);
    setSizeWSlider(100);
    setSizeHSlider(100);
    setMultiFontSizeValue(clamp(Math.round(snap.maxFontSize || DEFAULT_FIELD.font_size), FONT_SIZE_MIN, FONT_SIZE_MAX));
  }, [buildMultiSelectSnapshot]);

  const commitMultiAdjust = useCallback(
    (keys) => {
      if (!keys || !keys.length) return;
      pushUndoState();
      keys.forEach((key) => schedulePersist(key));
    },
    [pushUndoState, schedulePersist]
  );

  const scaleGapByPercent = useCallback((baseGap, factor) => {
    if (baseGap >= 0) return baseGap * factor;
    // If the baseline gap is negative (overlap), keep intuitive direction:
    // >100 opens spacing, <100 tightens spacing.
    return baseGap + Math.abs(baseGap) * (factor - 1);
  }, []);

  const applySpacingVValue = useCallback(
    (value) => {
      const snap = multiSelectSnapshotRef.current;
      if (!snap || !snap.colGroups?.length) return;
      const factor = value / 100;
      const imgH = imageLayout.height || 1;
      const patches = new Map();
      snap.colGroups.forEach((group) => {
        if (!group.keys?.length) return;
        const anchorKey = group.keys[0];
        const anchorData = snap.fieldsMap.get(anchorKey);
        if (!anchorData) return;
        let currentY = anchorData.y;
        for (let i = 1; i < group.keys.length; i += 1) {
          const key = group.keys[i];
          const prevKey = group.keys[i - 1];
          const prevOriginal = snap.fieldsMap.get(prevKey);
          if (!prevOriginal) continue;
          const prevBottom = i === 1
            ? anchorData.y + (anchorData.height / imgH) * 100
            : currentY + (prevOriginal.height / imgH) * 100;
          const baseGap = group.gaps[i - 1] || 0;
          const newGap = scaleGapByPercent(baseGap, factor);
          const newY = Math.max(0, Math.min(prevBottom + newGap, 95));
          currentY = newY;
          // Keep a strict column alignment while changing vertical spacing.
          patches.set(key, { y: newY, x: anchorData.x });
        }
      });
      applyFieldPatchesBatch(patches);
    },
    [applyFieldPatchesBatch, imageLayout.height, scaleGapByPercent]
  );

  const applySpacingHValue = useCallback(
    (value) => {
      const snap = multiSelectSnapshotRef.current;
      if (!snap || !snap.rowGroups?.length) return;
      const factor = value / 100;
      const patches = new Map();
      snap.rowGroups.forEach((group) => {
        if (!group.keys?.length) return;
        const anchorKey = group.keys[0];
        const anchorData = snap.fieldsMap.get(anchorKey);
        if (!anchorData) return;
        let currentX = anchorData.x;
        for (let i = 1; i < group.keys.length; i += 1) {
          const key = group.keys[i];
          const prevKey = group.keys[i - 1];
          const prevOriginal = snap.fieldsMap.get(prevKey);
          if (!prevOriginal) continue;
          const prevRight = i === 1
            ? anchorData.x + anchorData.width
            : currentX + prevOriginal.width;
          const baseGap = group.gaps[i - 1] || 0;
          const newGap = scaleGapByPercent(baseGap, factor);
          const newX = Math.max(0, Math.min(prevRight + newGap, 95));
          currentX = newX;
          // Keep a strict row alignment while changing horizontal spacing.
          patches.set(key, { x: newX, y: anchorData.y });
        }
      });
      applyFieldPatchesBatch(patches);
    },
    [applyFieldPatchesBatch, scaleGapByPercent]
  );

  const applySizeWValue = useCallback(
    (value) => {
      const snap = multiSelectSnapshotRef.current;
      if (!snap) return;
      const factor = value / 100;
      const patches = new Map();
      snap.fieldsMap.forEach((original, key) => {
        patches.set(key, { width: Math.max(1, original.width * factor) });
      });
      applyFieldPatchesBatch(patches);
    },
    [applyFieldPatchesBatch]
  );

  const applySizeHValue = useCallback(
    (value) => {
      const snap = multiSelectSnapshotRef.current;
      if (!snap) return;
      const factor = value / 100;
      const patches = new Map();
      snap.fieldsMap.forEach((original, key) => {
        patches.set(key, { height: Math.max(4, original.height * factor) });
      });
      applyFieldPatchesBatch(patches);
    },
    [applyFieldPatchesBatch]
  );

  const applyMultiFontSizeValue = useCallback(
    (value) => {
      const snap = multiSelectSnapshotRef.current;
      if (!snap) return;
      const nextFontSize = clamp(Math.round(Number(value) || 0), FONT_SIZE_MIN, FONT_SIZE_MAX);
      const patches = new Map();
      snap.fieldsMap.forEach((original, key) => {
        const patch = { font_size: nextFontSize };
        if (!isBooleanFieldType(original.fieldType)) {
          const lineHeight = Number.isFinite(original.lineHeight) ? original.lineHeight : DEFAULT_FIELD.line_height;
          const lineCount = Math.max(1, parseInt(original.lineCount ?? DEFAULT_FIELD.line_count, 10) || 1);
          const minTextHeight = Math.max(MIN_HEIGHT, nextFontSize * lineHeight * lineCount);
          const currentField = fieldsRef.current.find((field) => {
            const fieldKey = field.id || field.localId;
            return fieldKey === key;
          });
          const currentHeight =
            Number.isFinite(currentField?.height) && currentField.height > 0
              ? currentField.height
              : Number.isFinite(original.height) && original.height > 0
              ? original.height
              : MIN_HEIGHT;
          patch.height = Math.max(currentHeight, minTextHeight);
        }
        patches.set(key, patch);
      });
      applyFieldPatchesBatch(patches);
    },
    [applyFieldPatchesBatch]
  );

  const handleSpacingVChange = useCallback(
    (value) => {
      const next = clamp(Math.round(Number(value) || 0), PERCENT_MIN, PERCENT_MAX);
      setSpacingVSlider(next);
      applySpacingVValue(next);
    },
    [applySpacingVValue]
  );

  const handleSpacingHChange = useCallback(
    (value) => {
      const next = clamp(Math.round(Number(value) || 0), PERCENT_MIN, PERCENT_MAX);
      setSpacingHSlider(next);
      applySpacingHValue(next);
    },
    [applySpacingHValue]
  );

  const handleSizeWChange = useCallback(
    (value) => {
      const next = clamp(Math.round(Number(value) || 0), PERCENT_MIN, PERCENT_MAX);
      setSizeWSlider(next);
      applySizeWValue(next);
    },
    [applySizeWValue]
  );

  const handleSizeHChange = useCallback(
    (value) => {
      const next = clamp(Math.round(Number(value) || 0), PERCENT_MIN, PERCENT_MAX);
      setSizeHSlider(next);
      applySizeHValue(next);
    },
    [applySizeHValue]
  );

  const handleMultiFontSizeChange = useCallback(
    (value) => {
      const next = clamp(Math.round(Number(value) || 0), FONT_SIZE_MIN, FONT_SIZE_MAX);
      setMultiFontSizeValue(next);
      applyMultiFontSizeValue(next);
    },
    [applyMultiFontSizeValue]
  );

  const handleSpacingVComplete = useCallback(() => {
    const snap = multiSelectSnapshotRef.current;
    commitMultiAdjust(snap?.vAdjustKeys || []);
  }, [commitMultiAdjust]);

  const handleSpacingHComplete = useCallback(() => {
    const snap = multiSelectSnapshotRef.current;
    commitMultiAdjust(snap?.hAdjustKeys || []);
  }, [commitMultiAdjust]);

  const handleSizeWComplete = useCallback(() => {
    const snap = multiSelectSnapshotRef.current;
    commitMultiAdjust(snap ? [...snap.fieldsMap.keys()] : []);
  }, [commitMultiAdjust]);

  const handleSizeHComplete = useCallback(() => {
    const snap = multiSelectSnapshotRef.current;
    commitMultiAdjust(snap ? [...snap.fieldsMap.keys()] : []);
  }, [commitMultiAdjust]);

  const handleMultiFontSizeComplete = useCallback(() => {
    const snap = multiSelectSnapshotRef.current;
    commitMultiAdjust(snap ? [...snap.fieldsMap.keys()] : []);
  }, [commitMultiAdjust]);

  const stepSpacingV = useCallback(
    (delta) => {
      setSpacingVSlider((prev) => {
        const next = clamp(prev + delta, PERCENT_MIN, PERCENT_MAX);
        applySpacingVValue(next);
        return next;
      });
    },
    [applySpacingVValue]
  );

  const stepSpacingH = useCallback(
    (delta) => {
      setSpacingHSlider((prev) => {
        const next = clamp(prev + delta, PERCENT_MIN, PERCENT_MAX);
        applySpacingHValue(next);
        return next;
      });
    },
    [applySpacingHValue]
  );

  const stepSizeW = useCallback(
    (delta) => {
      setSizeWSlider((prev) => {
        const next = clamp(prev + delta, PERCENT_MIN, PERCENT_MAX);
        applySizeWValue(next);
        return next;
      });
    },
    [applySizeWValue]
  );

  const stepSizeH = useCallback(
    (delta) => {
      setSizeHSlider((prev) => {
        const next = clamp(prev + delta, PERCENT_MIN, PERCENT_MAX);
        applySizeHValue(next);
        return next;
      });
    },
    [applySizeHValue]
  );

  const stepFontSize = useCallback(
    (delta) => {
      setMultiFontSizeValue((prev) => {
        const next = clamp(prev + delta, FONT_SIZE_MIN, FONT_SIZE_MAX);
        applyMultiFontSizeValue(next);
        return next;
      });
    },
    [applyMultiFontSizeValue]
  );

  const handlePercentInputChange = useCallback((text, onChange) => {
    const sanitized = String(text ?? '').replace(/[^0-9]/g, '');
    if (!sanitized.length) return;
    onChange(Number(sanitized));
  }, []);

  const clearAdjustRepeatTimers = useCallback(() => {
    if (msAdjustTimeoutRef.current) {
      clearTimeout(msAdjustTimeoutRef.current);
      msAdjustTimeoutRef.current = null;
    }
    if (msAdjustIntervalRef.current) {
      clearInterval(msAdjustIntervalRef.current);
      msAdjustIntervalRef.current = null;
    }
  }, []);

  const startAdjustRepeat = useCallback(
    (stepFn, commitFn) => {
      clearAdjustRepeatTimers();
      msAdjustCommitRef.current = commitFn;
      stepFn();
      msAdjustTimeoutRef.current = setTimeout(() => {
        msAdjustIntervalRef.current = setInterval(() => {
          stepFn();
        }, REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS);
    },
    [clearAdjustRepeatTimers]
  );

  const stopAdjustRepeat = useCallback(() => {
    const commitFn = msAdjustCommitRef.current;
    msAdjustCommitRef.current = null;
    clearAdjustRepeatTimers();
    if (commitFn) commitFn();
  }, [clearAdjustRepeatTimers]);

  useEffect(() => {
    return () => {
      msAdjustCommitRef.current = null;
      clearAdjustRepeatTimers();
    };
  }, [clearAdjustRepeatTimers]);

  // --- Select all / deselect / exit ---
  const handleSelectAll = useCallback(() => {
    const allIds = new Set(pageFields.map((f) => f.id || f.localId));
    setMultiSelectedIds(allIds);
  }, [pageFields]);

  const clearMarquee = useCallback(() => {
    clearMarqueePreview();
    clearMarqueeLongPress('clear');
    marqueeStartRef.current = null;
    updateGestureHud({ marquee: 'IDLE', note: 'marquee-clear' });
  }, [clearMarqueeLongPress, clearMarqueePreview, updateGestureHud]);

  const handleDeselectAll = useCallback(() => {
    clearMarquee();
    setMultiSelectMode(false);
    setMultiSelectedIds(new Set());
    setIsMarqueeMode(false);
    setMsPanel(null);
  }, [clearMarquee]);

  const toggleMarqueeMode = useCallback(() => {
    setIsMarqueeMode((prev) => {
      const next = !prev;
      if (!next) {
        clearMarquee();
      }
      return next;
    });
  }, [clearMarquee]);

  useEffect(() => {
    if (!multiSelectMode && isMarqueeMode) {
      setIsMarqueeMode(false);
      clearMarquee();
    }
  }, [clearMarquee, isMarqueeMode, multiSelectMode]);

  // --- Group / Row / Column selection ---
  const handleSelectGroup = useCallback(() => {
    if (!selectedField?.group_id) return;
    const ids = selectByGroupId(pageFields, selectedField.group_id);
    setMultiSelectedIds(ids);
    setMultiSelectMode(true);
    setSelectedFieldId(null);
    setIsMenuOpen(false);
    setActiveSubmenu(null);
  }, [pageFields, selectedField]);

  const handleSelectRow = useCallback(() => {
    if (!selectedField) return;
    const ids = selectByRow(pageFields, selectedField.y, 2);
    setMultiSelectedIds(ids);
    setMultiSelectMode(true);
    setSelectedFieldId(null);
    setIsMenuOpen(false);
    setActiveSubmenu(null);
  }, [pageFields, selectedField]);

  const handleSelectColumn = useCallback(() => {
    if (!selectedField) return;
    const ids = selectByColumn(pageFields, selectedField.x, 2);
    setMultiSelectedIds(ids);
    setMultiSelectMode(true);
    setSelectedFieldId(null);
    setIsMenuOpen(false);
    setActiveSubmenu(null);
  }, [pageFields, selectedField]);

  // --- Batch delete ---
  const handleBatchDelete = useCallback(() => {
    const count = multiSelectedIds.size;
    if (count === 0) return;
    Alert.alert(
      'Confirmer la suppression',
      `Supprimer ${count} champ${count > 1 ? 's' : ''} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            pushUndoState();
            justDeletedRef.current = true;
            setTimeout(() => {
              justDeletedRef.current = false;
            }, 300);

            const idsToDelete = [...multiSelectedIds];
            const apiFields = fieldsRef.current.filter((f) =>
              idsToDelete.includes(f.id || f.localId)
            );

            for (const field of apiFields) {
              if (field.id) {
                try {
                  await templates.deleteField(templateId, field.id);
                } catch (error) {
                  console.error('Erreur suppression champ:', error);
                }
              }
            }

            setFields((prev) => {
              const next = prev.filter((f) => {
                const key = f.id || f.localId;
                return !multiSelectedIds.has(key);
              });
              fieldsRef.current = next;
              return next;
            });

            setMultiSelectedIds(new Set());
            setSelectedFieldId(null);
            setEditingFieldId(null);
            showSaved(`${count} champ${count > 1 ? 's' : ''} supprimé${count > 1 ? 's' : ''} ✓`);
          },
        },
      ]
    );
  }, [multiSelectedIds, pushUndoState, showSaved, templateId]);

  const handleAiPrefill = useCallback(async () => {
    setAiConfirmVisible(false);
    setIsAiLoading(true);
    try {
      const response = await templates.aiPrefill(templateId, currentPage);
      const { new_fields, message } = response.data;
      if (!new_fields || new_fields.length === 0) {
        showSaved('Aucun nouveau champ détecté');
      } else {
        const normalized = new_fields.map(normalizeField);
        setFields((prev) => [...prev, ...normalized]);
        showSaved(message || `${new_fields.length} champs créés par l'IA`);
      }
    } catch (error) {
      console.error('Erreur AI prefill:', error);
      showSaved('Erreur IA ✗');
    } finally {
      setIsAiLoading(false);
    }
  }, [templateId, currentPage, showSaved]);

  const waitForPendingCreates = useCallback(async (timeoutMs = 4000) => {
    const startedAt = Date.now();
    while (createInFlightRef.current.size > 0 && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, 80);
      });
    }
  }, []);

  const flushPendingFieldSaves = useCallback(async () => {
    updateTimersRef.current.forEach((timer) => clearTimeout(timer));
    updateTimersRef.current.clear();

    await waitForPendingCreates();

    const snapshot = [...fieldsRef.current];
    const updates = snapshot
      .filter((field) => Number.isFinite(Number(field?.id)))
      .map((field) =>
        templates
          .updateField(templateId, field.id, buildPayload(field))
          .then((response) => {
            applyFieldResponse(field.id, response);
          })
      );
    if (!updates.length) return;

    const settled = await Promise.allSettled(updates);
    const failed = settled.filter((entry) => entry.status === 'rejected').length;
    if (failed > 0) {
      throw new Error(`${failed} sauvegarde(s) de champ en erreur`);
    }
  }, [applyFieldResponse, templateId, waitForPendingCreates]);

  const createLinkedDocumentFromTemplate = useCallback(async () => {
    const cloneResponse = await templates.clone(templateId, { kind: 'document' });
    const cloneRaw = cloneResponse?.data?.data || cloneResponse?.data;
    const cloneEntity = extractEntity(cloneRaw);
    const documentId = Number(
      cloneEntity?.id ?? cloneEntity?.document_id ?? cloneEntity?.documentId
    );
    if (!Number.isFinite(documentId)) {
      throw new Error('document id manquant après duplication');
    }

    await formsScreenService.associateTemplateToDocument(documentId, templateId);
  }, [templateId]);

  const finalizeTemplate = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await flushPendingFieldSaves();

      // Best effort: some backends expose status transitions on template updates.
      try {
        await templates.update(templateId, { status: 'calibrated' });
      } catch (_error) {
        // Ignore unsupported status patch.
      }

      let targetTab = String(finishTargetTab || 'templates');
      if (autoCreateLinkedDocumentOnFinish) {
        try {
          await createLinkedDocumentFromTemplate();
          targetTab = 'ready_forms';
        } catch (linkError) {
          console.error('Erreur creation document lie:', linkError);
          targetTab = 'templates';
        }
      }

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'FormsListScreen',
            params: { tab: targetTab },
          },
        ],
      });
    } catch (error) {
      console.error('Erreur finalisation template:', error);
      Alert.alert(
        'Erreur',
        'Impossible de finaliser le template. Vérifie la connexion puis réessaie.'
      );
    } finally {
      setFinishing(false);
    }
  }, [
    autoCreateLinkedDocumentOnFinish,
    createLinkedDocumentFromTemplate,
    finishTargetTab,
    finishing,
    flushPendingFieldSaves,
    navigation,
    templateId,
  ]);

  const handleFinish = useCallback(() => {
    if (!fields.length) {
      Alert.alert('Terminer', 'Ajoutez au moins un champ.');
      return;
    }
    const summary = autoCreateLinkedDocumentOnFinish
      ? `${fields.length} champs créés.\n\nUn document lié sera créé automatiquement.`
      : `${fields.length} champs créés`;

    Alert.alert('Terminer ?', summary, [
      {
        text: 'Oui, template complet',
        onPress: () => {
          finalizeTemplate();
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [autoCreateLinkedDocumentOnFinish, fields.length, finalizeTemplate]);

  const changePage = async (direction) => {
    const nextPage = clamp(currentPage + direction, 1, totalPages);
    if (nextPage === currentPage) return;
    setCurrentPage(nextPage);
  };

  const setTransform = (nextScale, nextTranslateX, nextTranslateY) => {
    scaleRef.current = nextScale;
    baseScale.setValue(nextScale);
    pinchScale.setValue(1);
    translateRef.current = { x: nextTranslateX, y: nextTranslateY };
    translateX.setValue(nextTranslateX);
    translateY.setValue(nextTranslateY);
    panX.setValue(0);
    panY.setValue(0);
    setScaleState(nextScale);
    measureFieldsOverlay('set-transform');
  };

  const handleZoomStep = (direction) => {
    const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2];
    const sorted = [...ZOOM_STEPS].sort((a, b) => a - b);
    let index = sorted.findIndex((value) => value >= scaleRef.current - 0.001);
    if (index < 0) index = sorted.length - 1;
    const nextIndex = clamp(index + direction, 0, sorted.length - 1);
    const nextScale = sorted[nextIndex];
    if (nextScale === 1) {
      setTransform(1, 0, 0);
      return;
    }
    setTransform(nextScale, translateRef.current.x, translateRef.current.y);
  };

  const resetTransform = () => {
    setTransform(1, 0, 0);
  };

  /**
   * Focus the view on a field: zoom in so the field fills the visible zone,
   * then translate so it sits at ~35 % from the top.
   *
   * Key rules:
   *  - NEVER auto-dézoom: desiredScale = max(currentScale, computed).
   *  - Target: field width ≈ 70 % of visible width.
   *  - Clamp: [1.2 … 4.0].
   *  - Anti-jitter: skip if field already visible AND scale close enough.
   *
   * Transform math:
   *   P_scr = baseOrigin + T + S * P_img + C * (1 - S)
   *   ⇒ T   = targetScr - baseOrigin - S * P_img - C * (1 - S)
   */
  const focusField = useCallback(
    (field, opts = {}) => {
      if (!field || !imageLayout.width || !imageLayout.height) return;
      if (!frameLayout.width || !frameLayout.height) return;
      if (isGesturingRef.current) return;
      if (isDraggingFieldRef.current) return;
      // Don't reposition the document when the config submenu is open —
      // the user is editing form inputs inside the menu, not the document.
      if (activeSubmenu === 'config') return;

      const baseOrigin = getImageBaseOriginLocal();
      if (!baseOrigin) return;

      // --- A) Safe visible zone (workArea coords) ---
      // When config submenu is active and keyboard is open, the keyboard overlays
      // the menu, so the only obstruction is the keyboard itself.
      // For other submenus (lifted above keyboard), obstructions stack.
      const visibleTop = 0;
      const isConfigOpen = activeSubmenu === 'config';
      const currentSheetH = sheetHeight || 0;
      const currentKbH = keyboardVisible ? keyboardHeight + (isConfigOpen ? 0 : MENU_KEYBOARD_GAP) : 0;

      let obstruction;
      if (isConfigOpen && keyboardVisible) {
        // Keyboard overlays the menu — only keyboard obstructs the visible area
        obstruction = currentKbH;
      } else if (currentSheetH > 0 && currentKbH > 0) {
        // Menu is lifted above keyboard — both obstruct
        obstruction = currentSheetH + currentKbH;
      } else {
        obstruction = Math.max(currentSheetH, currentKbH);
      }

      const visibleBottom = frameLayout.height - obstruction;
      const visibleHeight = visibleBottom - visibleTop;
      const visibleWidth = frameLayout.width;
      if (visibleHeight < 50) return;

      // --- B) Field rect in image-local px ---
      const fw = ((field.width || 20) / 100) * imageLayout.width;
      const fh =
        Number.isFinite(field.height) && field.height > 0
          ? field.height
          : calculateFieldHeight(field);
      const fCx = (field.x / 100) * imageLayout.width + fw / 2;
      const fCy = (field.y / 100) * imageLayout.height + fh / 2;

      // --- C) Desired scale ---
      const currentScale = scaleRef.current || 1;

      const minScale = opts?.minScale ?? 1.0;
      const maxScale = opts?.maxScale ?? 4.0;

      // Calculate how much of the document width should be visible:
      // - Minimum 50% of the document (so zoom doesn't get too close)
      // - If field is wider than ~33% of document, add 25% margin on each side
      //   (visible width = field width * 1.5)
      const fieldWidthRatio = fw / imageLayout.width; // field width as ratio of image
      const minViewportRatio = 0.5; // at least 50% of document visible
      const marginMultiplier = 1.5; // field + 25% margin on each side = 1.5x field width
      const viewportWidthRatio = Math.max(minViewportRatio, fieldWidthRatio * marginMultiplier);

      // Scale so the viewport shows exactly viewportWidthRatio of the document
      const scaleByWidth = visibleWidth / (viewportWidthRatio * imageLayout.width);

      // Also limit by height: ensure field fits vertically with some margin
      const fieldHeightRatio = fh / imageLayout.height;
      const viewportHeightRatio = Math.max(0.3, fieldHeightRatio * 2.0); // field + margin top/bottom
      const scaleByHeight = visibleHeight / (viewportHeightRatio * imageLayout.height);

      // Take the smaller to guarantee both axes fit, then clamp
      const computedScale = clamp(Math.min(scaleByWidth, scaleByHeight), minScale, maxScale);

      // NEVER auto-dézoom: only zoom in more (or keep current if already closer)
      let desiredScale = Math.max(currentScale, computedScale);
      // Re-clamp the upper bound after the max
      desiredScale = Math.min(desiredScale, maxScale);

      const S = desiredScale;
      const centerX = imageLayout.width / 2;
      const centerY = imageLayout.height / 2;

      // --- D) Anti-jitter ---
      const curT = translateRef.current || { x: 0, y: 0 };
      const curS = currentScale;
      // Project field top-left with CURRENT transform
      const projX = baseOrigin.x + curT.x + curS * (fCx - fw / 2) + centerX * (1 - curS);
      const projY = baseOrigin.y + curT.y + curS * (fCy - fh / 2) + centerY * (1 - curS);
      const projW = fw * curS;
      const projH = fh * curS;
      const margin = 30;

      const fieldFullyVisible =
        projX >= margin &&
        projX + projW <= visibleWidth - margin &&
        projY >= visibleTop + margin &&
        projY + projH <= visibleBottom - margin;

      if (fieldFullyVisible && Math.abs(S - curS) < 0.05) {
        return; // already good, skip
      }

      // --- E) Anchor: field center → 35 % from top, centred horizontally ---
      const targetX = visibleWidth / 2;
      const targetY = visibleTop + visibleHeight * 0.35;

      // --- F) Translate ---
      const newTx = targetX - baseOrigin.x - S * fCx - centerX * (1 - S);
      const newTy = targetY - baseOrigin.y - S * fCy - centerY * (1 - S);

      setTransform(S, newTx, newTy);
    },
    [imageLayout, frameLayout, getImageBaseOriginLocal, setTransform, sheetHeight, keyboardVisible, keyboardHeight, activeSubmenu]
  );

  const resolveFocusOptions = useCallback((fieldId) => {
    if (!fieldId) return null;
    if (lastCreatedFieldIdRef.current !== fieldId) return null;
    if (Date.now() - lastCreatedAtRef.current > 8000) return null;
    return {
      maxScale: CREATE_FOCUS_MAX_SCALE,
    };
  }, []);

  const buildFocusKey = useCallback(() => {
    if (!selectedFieldId) return '';
    const sheetKey = Math.round(sheetHeight || 0);
    const keyboardKey = keyboardVisible ? Math.round(keyboardHeight || 0) : 0;
    const menuKey = isMenuOpen ? 1 : 0;
    return `${selectedFieldId}:${menuKey}:${sheetKey}:${keyboardKey}`;
  }, [selectedFieldId, sheetHeight, keyboardVisible, keyboardHeight, isMenuOpen]);

  const requestFocus = useCallback(
    (field, opts = {}) => {
      if (!field || !selectedFieldId) return;
      const key = buildFocusKey();
      if (!key || key === focusKeyRef.current) return;
      focusKeyRef.current = key;
      debouncedFocusField(field, opts);
    },
    [buildFocusKey, debouncedFocusField, selectedFieldId]
  );

  // Debounced focus: waits for layout to settle before repositioning
  const debouncedFocusField = useCallback(
    (field, opts = {}) => {
      if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
      focusDebounceRef.current = setTimeout(() => {
        focusDebounceRef.current = null;
        focusField(field, opts);
      }, 100);
    },
    [focusField]
  );

  // Trigger 1: when selectedFieldId changes (field selected or created)
  useEffect(() => {
    if (!selectedFieldId || !selectedField) return;
    const focusOptions = resolveFocusOptions(selectedFieldId);
    // Small delay to let sheet appear and layout settle
    const timer = setTimeout(() => {
      requestFocus(selectedField, focusOptions || undefined);
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedFieldId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger 2: when sheet opens/closes or submenu changes (sheet height changes)
  useEffect(() => {
    if (!isMenuOpen || !selectedField) return;
    requestFocus(selectedField, resolveFocusOptions(selectedFieldId) || undefined);
  }, [isMenuOpen, activeSubmenu, sheetHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger 3: when keyboard appears/disappears while menu is open
  useEffect(() => {
    if (!isMenuOpen || !selectedField) return;
    requestFocus(selectedField, resolveFocusOptions(selectedFieldId) || undefined);
    refreshMenuLayout();
  }, [keyboardVisible, keyboardHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger 4: when frameLayout changes (orientation change, initial layout)
  useEffect(() => {
    if (!isMenuOpen || !selectedField) return;
    if (!frameLayout.width || !frameLayout.height) return;
    requestFocus(selectedField, resolveFocusOptions(selectedFieldId) || undefined);
  }, [frameLayout.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (dragPreviewRafRef.current) {
        cancelAnimationFrame(dragPreviewRafRef.current);
        dragPreviewRafRef.current = null;
      }
      if (multiDragPreviewRafRef.current) {
        cancelAnimationFrame(multiDragPreviewRafRef.current);
        multiDragPreviewRafRef.current = null;
      }
      if (marqueeRectRafRef.current) {
        cancelAnimationFrame(marqueeRectRafRef.current);
        marqueeRectRafRef.current = null;
      }
      if (marqueeLongPressTimeoutRef.current) {
        clearTimeout(marqueeLongPressTimeoutRef.current);
        marqueeLongPressTimeoutRef.current = null;
      }
      marqueeLongPressCandidateRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!targetLayout.width || !targetLayout.height) return;
    measureFieldsOverlay('target-layout-change');
  }, [measureFieldsOverlay, targetLayout.height, targetLayout.width]);

  const onPanGestureEvent = useCallback(
    (event) => {
      const { translationX, translationY } = event.nativeEvent;
      if (!marqueeStartRef.current && marqueeLongPressCandidateRef.current) {
        const currentTouch = getLocalPoint(event.nativeEvent);
        const startTouch = marqueeLongPressCandidateRef.current?.touch;
        if (currentTouch && startTouch) {
          const distanceFromStart = Math.hypot(
            currentTouch.x - startTouch.x,
            currentTouch.y - startTouch.y
          );
          if (distanceFromStart > MARQUEE_LONG_PRESS_MOVE_TOLERANCE) {
            clearMarqueeLongPress('moved-before-longpress');
          }
        }
      }
      if (DEBUG_GESTURES) {
        updateGestureHud({
          pointers: Number(event?.nativeEvent?.numberOfPointers || 1),
          marquee: marqueeStartRef.current ? 'ACTIVE' : gestureDebugHudRef.current.marquee,
        });
      }

      // === MODE: MARQUEE SELECTION ===
      if (marqueeStartRef.current) {
        const currentPoint = getFieldsOverlayPointFromEvent(event.nativeEvent);
        if (!currentPoint) return;
        const {
          window: windowPoint,
          local: currentLocal,
          source,
          scale,
          overlayOffsetLocal,
        } = currentPoint;
        const layout = workAreaLayoutRef.current || {};
        const fieldsOverlayOffset = fieldsOverlayOffsetRef.current || { x: 0, y: 0, w: 0, h: 0 };
        if (DEBUG_SELECTION) {
          const now = Date.now();
          if (now - selectionLogRef.current.lastMoveLog > 120) {
            selectionLogRef.current.lastMoveLog = now;
            console.log('[selection] move_abs_to_overlay', {
              abs: windowPoint
                ? { x: Math.round(windowPoint.x), y: Math.round(windowPoint.y) }
                : null,
              source,
              scale: Number(scale.toFixed(3)),
              yAdjustment: windowPoint ? Number(windowPoint.yAdjustment || 0) : 0,
              overlayOffsetLocal: overlayOffsetLocal
                ? {
                  x: Math.round(overlayOffsetLocal.x),
                  y: Math.round(overlayOffsetLocal.y),
                }
                : null,
              fieldsOverlayOffset: {
                x: Math.round(fieldsOverlayOffset.x),
                y: Math.round(fieldsOverlayOffset.y),
                w: Math.round(fieldsOverlayOffset.w),
                h: Math.round(fieldsOverlayOffset.h),
              },
              computedLocal: {
                x: Math.round(currentLocal.x),
                y: Math.round(currentLocal.y),
              },
              translation: {
                x: Number.isFinite(translationX) ? Math.round(translationX) : null,
                y: Number.isFinite(translationY) ? Math.round(translationY) : null,
              },
              workAreaLayout: {
                x: Number.isFinite(layout.x) ? Math.round(layout.x) : null,
                y: Number.isFinite(layout.y) ? Math.round(layout.y) : null,
                w: Number.isFinite(layout.width) ? Math.round(layout.width) : null,
                h: Number.isFinite(layout.height) ? Math.round(layout.height) : null,
              },
            });
          }
        }
        updateSelectionDebug('move', currentLocal, currentLocal);
        scheduleMarqueeRectUpdate({
          startX: marqueeStartRef.current.x,
          startY: marqueeStartRef.current.y,
          currentX: currentLocal.x,
          currentY: currentLocal.y,
        });
        // Mark gesture as consumed
        if (!gestureConsumedRef.current) {
          gestureConsumedRef.current = true;
        }
        return;
      }

      if (dragModeRef.current && draggingFieldIdRef.current) {
        updateFieldDrag(getAbsolutePoint(event.nativeEvent));
        return;
      }

      const distance = Math.hypot(translationX, translationY);

      // Mark gesture as consumed after significant movement
      if (!gestureConsumedRef.current && distance > TOUCH_SLOP) {
        gestureConsumedRef.current = true;
        logGesture('PAN_CONSUMED', { distance });
      }

      // === MODE: PAN DOCUMENT ===
      if (panBlockedRef.current) return;

      panX.setValue(translationX);
      panY.setValue(translationY);
    },
    [
      getAbsolutePoint,
      clearMarqueeLongPress,
      getFieldsOverlayPointFromEvent,
      getLocalPoint,
      logGesture,
      panX,
      panY,
      scheduleMarqueeRectUpdate,
      updateGestureHud,
      updateFieldDrag,
      updateSelectionDebug,
    ]
  );

  const onPanStateChange = useCallback(
    (event) => {
      const {
        state,
        oldState,
        translationX,
        translationY,
        velocityX,
        velocityY,
        numberOfPointers,
      } = event.nativeEvent;
      if (DEBUG_GESTURES) {
        updateGestureHud({
          pan: getGestureStateLabel(state),
          pointers: Number(numberOfPointers || 1),
        });
        logGestureState('PAN_STATE', event.nativeEvent, {
          panBlocked: panBlockedRef.current,
          dragMode: dragModeRef.current,
          marqueeMode: isMarqueeMode,
          multiSelectMode,
          velocityX: roundDebug(velocityX),
          velocityY: roundDebug(velocityY),
        });
      }

      if (state === State.BEGAN) {
        isGesturingRef.current = true;
        panBlockedRef.current = false;
        const pointLocal = getLocalPoint(event.nativeEvent);
        const target = resolveGestureTarget(pointLocal);

        // === MARQUEE MODE: arm rectangle creation on long press in empty area ===
        if (isMarqueeMode && multiSelectMode && !editingFieldId) {
          if (target?.type === 'document') {
            const offset = fieldsOverlayOffsetRef.current || { x: 0, y: 0, w: 0, h: 0 };
            if (!offset.w || !offset.h) {
              measureFieldsOverlay('marquee-start-offset-not-ready');
              if (DEBUG_GESTURES) {
                updateGestureHud({ marquee: 'BLOCKED', note: 'overlay-offset-not-ready' });
              }
            } else {
              const startPoint = getFieldsOverlayPointFromEvent(event.nativeEvent);
              if (!startPoint) {
                if (DEBUG_GESTURES) {
                  updateGestureHud({ marquee: 'BLOCKED', note: 'missing-start-point' });
                }
              } else {
                const startLocal = startPoint.local;
                const touchPoint = getLocalPoint(event.nativeEvent);
                if (DEBUG_SELECTION) {
                  console.log('[selection] start_abs_to_overlay', {
                    abs: startPoint.window
                      ? {
                        x: Math.round(startPoint.window.x),
                        y: Math.round(startPoint.window.y),
                      }
                      : null,
                    source: startPoint.source,
                    scale: Number(startPoint.scale.toFixed(3)),
                    yAdjustment: startPoint.window ? Number(startPoint.window.yAdjustment || 0) : 0,
                    overlayOffsetLocal: startPoint.overlayOffsetLocal
                      ? {
                        x: Math.round(startPoint.overlayOffsetLocal.x),
                        y: Math.round(startPoint.overlayOffsetLocal.y),
                      }
                      : null,
                    fieldsOverlayOffset: {
                      x: Math.round(offset.x),
                      y: Math.round(offset.y),
                      w: Math.round(offset.w),
                      h: Math.round(offset.h),
                    },
                    computedLocal: {
                      x: Math.round(startLocal.x),
                      y: Math.round(startLocal.y),
                    },
                  });
                }
                armMarqueeLongPress(touchPoint, startLocal);
              }
            }
          } else {
            clearMarqueeLongPress('touch-not-empty-area');
            if (DEBUG_GESTURES && target?.type === 'field') {
              updateGestureHud({ marquee: 'IDLE', note: 'field-touch:drag-longpress' });
            }
          }
        } else {
          clearMarqueeLongPress('marquee-mode-off');
        }

        if (editingFieldId) {
          panBlockedRef.current = true;
          updateGestureHud({ note: 'pan-blocked:editing' });
          logGesture('PAN_START_BLOCKED', { reason: 'editing' });
        } else {
          // Do not block pan on field touch. Field drag still requires long press
          // inside FieldRenderer and becomes active via dragModeRef.
          if (target?.type === 'field') {
            logGesture('PAN_START_ON_FIELD', { reason: 'field-touch-allowed' });
          }
        }
      }

      if (oldState === State.ACTIVE) {
        clearMarqueeLongPress('pan-oldstate-active');

        // === MARQUEE MODE: finalize selection ===
        if (marqueeStartRef.current) {
          const currentPoint = getFieldsOverlayPointFromEvent(event.nativeEvent);
          const start = marqueeStartRef.current;
          const end = currentPoint?.local || start;
          updateSelectionDebug('end', end, end);

          // Convert from image-local px to percentage
          if (imageLayout.width > 0 && imageLayout.height > 0) {
            const rectPct = {
              x1: (start.x / imageLayout.width) * 100,
              y1: (start.y / imageLayout.height) * 100,
              x2: (end.x / imageLayout.width) * 100,
              y2: (end.y / imageLayout.height) * 100,
            };
            const ids = fieldsInMarquee(pageFields, rectPct, imageLayout.height);
            if (ids.size > 0) {
              setMultiSelectedIds(ids);
              setMultiSelectMode(true);
            }
          }

          // Cleanup marquee
          clearMarqueePreview();
          marqueeStartRef.current = null;
          updateGestureHud({ marquee: 'END', note: 'marquee-end' });
          logGestureState('MARQUEE_END', event.nativeEvent, {
            localX: roundDebug(end.x),
            localY: roundDebug(end.y),
          });
          panX.setValue(0);
          panY.setValue(0);
          panBlockedRef.current = false;
          isGesturingRef.current = false;
          return;
        }

        if (!dragModeRef.current && !panBlockedRef.current) {
          // Allow pan at any zoom level
          translateRef.current = {
            x: translateRef.current.x + translationX,
            y: translateRef.current.y + translationY,
          };
          translateX.setValue(translateRef.current.x);
          translateY.setValue(translateRef.current.y);
          measureFieldsOverlay('pan-commit');
          logGesture('DOC_PAN_COMMIT', { tx: translateRef.current.x.toFixed(0), ty: translateRef.current.y.toFixed(0) });
        }

        panX.setValue(0);
        panY.setValue(0);
        panBlockedRef.current = false;
        // Don't clear isGesturingRef if a field drag is active — it owns the flag now
        if (!dragModeRef.current) {
          isGesturingRef.current = false;
        }

        if (isMenuOpen) {
          refreshMenuLayout();
          setMenuRevision((prev) => prev + 1);
        }
      }

      if (state === State.CANCELLED || state === State.FAILED) {
        clearMarqueeLongPress(`pan-${getGestureStateLabel(state).toLowerCase()}`);
        // Clean up marquee if cancelled
        if (marqueeStartRef.current) {
          clearMarqueePreview();
          marqueeStartRef.current = null;
          updateGestureHud({
            marquee: getGestureStateLabel(state),
            note: `marquee-${getGestureStateLabel(state).toLowerCase()}`,
          });
          logGestureState('MARQUEE_CANCEL', event.nativeEvent, {
            cancelState: getGestureStateLabel(state),
          });
        }
        panX.setValue(0);
        panY.setValue(0);
        panBlockedRef.current = false;
        if (!dragModeRef.current) {
          isGesturingRef.current = false;
        }
      }

      if (state === State.END && !marqueeStartRef.current) {
        clearMarqueeLongPress('pan-end');
      }
    },
    [
      armMarqueeLongPress,
      clearMarqueeLongPress,
      editingFieldId,
      getAbsolutePoint,
      getFieldsOverlayPointFromEvent,
      getLocalPoint,
      imageLayout.height,
      imageLayout.width,
      isMarqueeMode,
      isMenuOpen,
      logGestureState,
      measureFieldsOverlay,
      multiSelectMode,
      logGesture,
      pageFields,
      panX,
      panY,
      clearMarqueePreview,
      refreshMenuLayout,
      resolveGestureTarget,
      setMenuRevision,
      updateGestureHud,
      updateSelectionDebug,
      translateX,
      translateY,
    ]
  );

  const onFieldPanGestureEvent = useCallback(
    (event) => {
      if (!dragModeRef.current || !draggingFieldIdRef.current) return;
      updateDragFingerFromNativeEvent(event.nativeEvent);
      updateFieldDrag(getAbsolutePoint(event.nativeEvent));
    },
    [getAbsolutePoint, updateDragFingerFromNativeEvent, updateFieldDrag]
  );

  const onPinchGestureEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], {
    useNativeDriver: false,
    listener: (event) => {
      if (DEBUG_GESTURES) {
        updateGestureHud({
          pinch: 'ACTIVE',
          pointers: Number(event?.nativeEvent?.numberOfPointers || 2),
        });
      }
      if (pinchBlockedRef.current) {
        pinchScale.setValue(1);
        return;
      }
      // Mark gesture as consumed after significant scale change
      const scale = event?.nativeEvent?.scale || 1;
      if (!gestureConsumedRef.current && Math.abs(scale - 1) > 0.05) {
        gestureConsumedRef.current = true;
      }
    },
  });

  const onPinchStateChange = (event) => {
    const { state, oldState } = event.nativeEvent;
    if (DEBUG_GESTURES) {
      updateGestureHud({
        pinch: getGestureStateLabel(state),
        pointers: Number(event?.nativeEvent?.numberOfPointers || 2),
      });
      logGestureState('PINCH_STATE', event.nativeEvent, {
        pinchBlocked: pinchBlockedRef.current,
      });
    }
    if (state === State.BEGAN) {
      isGesturingRef.current = true;
      const pointWindow = getWindowPoint(event.nativeEvent);
      const target = resolveGestureTarget(pointWindow);
      pinchBlockedRef.current = target?.type === 'menu';
      logGesture('PINCH_START', {
        target: target?.type,
        point: pointWindow,
        gestureType: 'pinch',
      });
    }
    if (oldState === State.ACTIVE) {
      isGesturingRef.current = false;
      if (pinchBlockedRef.current) {
        pinchBlockedRef.current = false;
        pinchScale.setValue(1);
        updateGestureHud({ pinch: 'END', note: 'pinch-blocked' });
        logGesture('PINCH_BLOCKED', { gestureType: 'pinch' });
        return;
      }
      const scaleFactor = Number(event.nativeEvent.scale);
      if (!Number.isFinite(scaleFactor)) return;
      const nextScale = clamp(scaleRef.current * scaleFactor, 0.5, 3);
      setTransform(nextScale, translateRef.current.x, translateRef.current.y);
      if (nextScale === 1) {
        translateRef.current = { x: 0, y: 0 };
        translateX.setValue(0);
        translateY.setValue(0);
        measureFieldsOverlay('pinch-reset-to-identity');
      }
      if (isMenuOpen) {
        refreshMenuLayout();
        setMenuRevision((prev) => prev + 1);
      }
      logGesture('PINCH_END', { scale: nextScale, consumed: gestureConsumedRef.current, gestureType: 'pinch' });
      updateGestureHud({ pinch: 'END', note: 'pinch-end' });
      // gestureConsumedRef stays true until tap handler resets it
    }
    if (state === State.CANCELLED || state === State.FAILED) {
      isGesturingRef.current = false;
      pinchBlockedRef.current = false;
      updateGestureHud({ pinch: getGestureStateLabel(state) });
      // Don't reset gestureConsumedRef here - let tap handler do it
    }
  };

  const zoomLabel = `${Math.round(scaleState * 100)}%`;

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;
  const saveIndicatorBottom = 70 + (insets.bottom || 0);
  const menuKeyboardGap = keyboardVisible ? MENU_KEYBOARD_GAP : 0;
  const menuBottomOffset = keyboardVisible ? keyboardHeight + menuKeyboardGap : 0;
  const menuPaddingBottom = keyboardVisible ? 8 : (insets.bottom || 8);
  // Available height for the config submenu ScrollView content.
  // Subtract bottom offset, padding, BackButton (~44px) and container padding (~16px).
  const configScrollMaxHeight = activeSubmenu === 'config'
    ? Math.max(120, frameLayout.height - menuBottomOffset - menuPaddingBottom - 68)
    : 0;
  const draggedField = useMemo(() => {
    if (!draggingFieldId) return null;
    return pageFields.find((field) => (field.id || field.localId) === draggingFieldId) || null;
  }, [draggingFieldId, pageFields]);
  const isSingleFieldDrag =
    Boolean(dragMode && draggedField && dragPreviewPct && !multiDragModeRef.current && !multiDragPreview);
  const dragVisualRect = useMemo(() => {
    if (!isSingleFieldDrag || !draggedField || !imageLayout.width || !imageLayout.height) return null;
    const fieldWidth = Number.isFinite(draggedField.width) ? draggedField.width : DEFAULT_FIELD.width;
    const left = (dragPreviewPct.x / 100) * imageLayout.width;
    const top = (dragPreviewPct.y / 100) * imageLayout.height;
    const width = (fieldWidth / 100) * imageLayout.width;
    const height =
      Number.isFinite(draggedField.height) && draggedField.height > 0
        ? draggedField.height
        : calculateFieldHeight(draggedField);
    return {
      left,
      top,
      width,
      height,
      centerX: left + width / 2,
      bottomY: top + height,
    };
  }, [dragPreviewPct, draggedField, imageLayout.height, imageLayout.width, isSingleFieldDrag]);
  const dragGuideLine = useMemo(() => {
    if (!isSingleFieldDrag || !dragVisualRect || !dragFingerLocal) return null;
    const x = clamp(dragFingerLocal.x, 0, imageLayout.width);
    const top = Math.min(dragFingerLocal.y, dragVisualRect.bottomY);
    const height = Math.abs(dragFingerLocal.y - dragVisualRect.bottomY);
    if (!Number.isFinite(height) || height < 1) return null;
    return { x, top, height };
  }, [dragFingerLocal, dragVisualRect, imageLayout.width, isSingleFieldDrag]);
  const dragBadgePosition = useMemo(() => {
    if (!isSingleFieldDrag || !dragVisualRect || !imageLayout.width) return null;
    const badgeWidth = 108;
    const left = clamp(
      dragVisualRect.centerX - badgeWidth / 2,
      4,
      Math.max(4, imageLayout.width - badgeWidth - 4)
    );
    const top = Math.max(4, dragVisualRect.top - 24);
    return { left, top };
  }, [dragVisualRect, imageLayout.width, isSingleFieldDrag]);

  const renderedFieldNodes = useMemo(
    () =>
      pageFields.map((field) => {
        const fieldKey = field.id || field.localId;
        const isDragging = dragMode && draggingFieldId === fieldKey;
        const isMultiSelected = multiSelectMode && multiSelectedIds.has(fieldKey);
        // Apply multi-drag preview to all selected fields
        const isBeingMultiDragged = multiDragPreview && isMultiSelected;
        let displayField = field;
        if (isDragging && dragPreviewPct && !multiDragPreview) {
          // Single field drag
          displayField = { ...field, x: dragPreviewPct.x, y: dragPreviewPct.y };
        } else if (isBeingMultiDragged) {
          // Multi-drag: apply delta to all selected fields
          displayField = {
            ...field,
            x: clamp(field.x + multiDragPreview.deltaX, 0, 100 - (field.width || 10)),
            y: clamp(field.y + multiDragPreview.deltaY, 0, 95),
          };
        }
        const state =
          editingFieldId === fieldKey
            ? 'editing'
            : selectedFieldId === fieldKey
            ? 'selected'
            : 'placed';
        const labelOverride =
          selectedFieldId === fieldKey &&
          activeSubmenu === 'text' &&
          menuLabelDraft !== null
            ? menuLabelDraft
            : null;
        const enableFieldDrag = !editingFieldId && (!multiSelectMode || isMultiSelected);
        const handleFieldPanStateChange = (event) => {
          const { state: gestureState } = event.nativeEvent;
          if (gestureState === State.ACTIVE) {
            updateDragFingerFromNativeEvent(event.nativeEvent);
            startFieldDrag(field, getAbsolutePoint(event.nativeEvent));
            return;
          }
          if (gestureState === State.END) {
            updateDragFingerFromNativeEvent(event.nativeEvent);
            endFieldDrag(getAbsolutePoint(event.nativeEvent), false);
            return;
          }
          if (gestureState === State.CANCELLED || gestureState === State.FAILED) {
            updateDragFingerFromNativeEvent(event.nativeEvent);
            endFieldDrag(getAbsolutePoint(event.nativeEvent), true);
          }
        };
        return (
          <FieldRenderer
            key={fieldKey}
            field={displayField}
            state={state}
            dragging={isDragging}
            labelOverride={labelOverride}
            imageLayout={imageLayout}
            scale={scaleState}
            multiSelected={isMultiSelected}
            onTextChange={(value) => handleTextChange(fieldKey, value)}
            onAutoSize={(size) => handleAutoSize(fieldKey, size, field)}
            onBlur={handleStopEdit}
            dragPanEnabled={enableFieldDrag}
            onDragPanGestureEvent={onFieldPanGestureEvent}
            onDragPanStateChange={handleFieldPanStateChange}
            dragPanSimultaneousHandlers={[tapRef, panRef, pinchRef]}
            dragPanActivateAfterLongPress={LONG_PRESS_MS}
          />
        );
      }),
    [
      activeSubmenu,
      dragMode,
      dragPreviewPct,
      draggingFieldId,
      editingFieldId,
      endFieldDrag,
      getAbsolutePoint,
      handleAutoSize,
      handleStopEdit,
      handleTextChange,
      imageLayout,
      menuLabelDraft,
      multiDragPreview,
      multiSelectMode,
      multiSelectedIds,
      onFieldPanGestureEvent,
      pageFields,
      scaleState,
      selectedFieldId,
      startFieldDrag,
      updateDragFingerFromNativeEvent,
    ]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <View style={styles.headerPageControls}>
          <TouchableOpacity
            style={[styles.headerPageBtn, !canGoPrev && styles.headerPageBtnDisabled]}
            onPress={() => changePage(-1)}
            disabled={!canGoPrev}
          >
            <Text style={[styles.headerPageBtnText, !canGoPrev && styles.headerPageBtnTextDisabled]}>◀</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Page {currentPage}/{totalPages}</Text>
          <TouchableOpacity
            style={[styles.headerPageBtn, !canGoNext && styles.headerPageBtnDisabled]}
            onPress={() => changePage(1)}
            disabled={!canGoNext}
          >
            <Text style={[styles.headerPageBtnText, !canGoNext && styles.headerPageBtnTextDisabled]}>▶</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleFinish} disabled={finishing}>
          {finishing ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <Text style={styles.finishButtonText}>Terminer</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.templateMetaSection}>
        <Text style={styles.templateNameText} numberOfLines={1}>
          {templateName || `Formulaire #${templateId}`}
        </Text>
      </View>

      <TapGestureHandler
        ref={tapRef}
        maxDist={TOUCH_SLOP}
        onHandlerStateChange={handleTapStateChange}
        simultaneousHandlers={[panRef, pinchRef]}
      >
        <View
          ref={workAreaRef}
          style={styles.workArea}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setFrameLayout({ width, height });
            measureFieldsOverlay('workArea-onLayout');
            if (workAreaRef.current?.measureInWindow) {
              workAreaRef.current.measureInWindow((x, y) => {
                workAreaOffsetRef.current = { x, y };
                workAreaLayoutRef.current = {
                  x,
                  y,
                  width,
                  height,
                  ready: width > 0 && height > 0,
                };
                if (zoomContainerRef.current?.measureInWindow) {
                  zoomContainerRef.current.measureInWindow((absX, absY) => {
                    zoomContainerOffsetRef.current = {
                      x: absX - x,
                      y: absY - y,
                    };
                    zoomContainerMeasuredRef.current = true;
                  });
                }
              });
            }
          }}
        >
            {pageImageUrl && !loading ? (
              <View style={styles.editorContainer}>
                <PanGestureHandler
                  ref={panRef}
                  simultaneousHandlers={pinchRef}
                  minDist={isMarqueeMode ? 0 : TOUCH_SLOP}
                  enabled={!dragMode && !editingFieldId}
                  onGestureEvent={onPanGestureEvent}
                  onHandlerStateChange={onPanStateChange}
                >
                  <PinchGestureHandler
                    ref={pinchRef}
                    simultaneousHandlers={panRef}
                    enabled={!dragMode}
                    onGestureEvent={onPinchGestureEvent}
                    onHandlerStateChange={onPinchStateChange}
                  >
                    <Animated.View
                      ref={zoomContainerRef}
                      style={[
                        styles.zoomContainer,
                        { width: targetLayout.width, height: targetLayout.height },
                        {
                          transform: [
                            { translateX: translateXAnim },
                            { translateY: translateYAnim },
                            { scale: scaleAnim },
                          ],
                        },
                      ]}
                      onLayout={(event) => {
                        const { x, y, width, height } = event.nativeEvent.layout;
                        if (!width || !height) return;
                        if (
                          width === imageBaseLayout.width &&
                          height === imageBaseLayout.height &&
                          x === imageBaseLayout.x &&
                          y === imageBaseLayout.y
                        ) {
                          return;
                        }
                        setImageBaseLayout({ x, y, width, height });
                        if (zoomContainerRef.current?.measureInWindow) {
                          zoomContainerRef.current.measureInWindow((absX, absY) => {
                            const offset = workAreaOffsetRef.current || { x: 0, y: 0 };
                            zoomContainerOffsetRef.current = {
                              x: absX - offset.x,
                              y: absY - offset.y,
                            };
                            zoomContainerMeasuredRef.current = true;
                          });
                        }
                      }}
                    >
                      <View
                        style={[
                          styles.imageContainer,
                          { width: targetLayout.width, height: targetLayout.height },
                        ]}
                        onLayout={(event) => {
                          const { width, height } = event.nativeEvent.layout;
                          if (!width || !height) return;
                          if (width === imageLayout.width && height === imageLayout.height) return;
                          setImageLayout({ width, height });
                        }}
                      >
                        <Image
                          source={{ uri: pageImageUrl }}
                          style={[styles.pageImage, hideDocumentBackground && styles.pageImageHidden]}
                          resizeMode="contain"
                          onLoad={(event) => {
                            const source = event?.nativeEvent?.source || {};
                            if (source.width && source.height) {
                              setImageSize({ width: source.width, height: source.height });
                            }
                          }}
                          onLoadStart={() => {
                            setPageImageError('');
                            setImageLoading(true);
                          }}
                          onLoadEnd={() => {
                            setImageLoading(false);
                            measureFieldsOverlay('image-onLoadEnd');
                          }}
                          onError={() => {
                            setImageLoading(false);
                            setPageImageUrl(null);
                            setPageImageError(`Impossible de charger la page ${currentPage}.`);
                          }}
                        />
                        <View
                          ref={fieldsOverlayRef}
                          style={styles.fieldsOverlay}
                          pointerEvents="box-none"
                          onLayout={() => {
                            measureFieldsOverlay('fieldsOverlay-onLayout');
                          }}
                        >
                          <View
                            pointerEvents="none"
                            style={[
                              styles.calibrationBox,
                              {
                                left: `${calibration.top_left_x}%`,
                                top: `${calibration.top_left_y}%`,
                                width: `${calibration.bottom_right_x - calibration.top_left_x}%`,
                                height: `${calibration.bottom_right_y - calibration.top_left_y}%`,
                              },
                            ]}
                          />
                          {marqueeRect && (
                            <View
                              pointerEvents="none"
                              style={{
                                position: 'absolute',
                                left: Math.min(marqueeRect.startX, marqueeRect.currentX),
                                top: Math.min(marqueeRect.startY, marqueeRect.currentY),
                                width: Math.abs(marqueeRect.currentX - marqueeRect.startX),
                                height: Math.abs(marqueeRect.currentY - marqueeRect.startY),
                                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                borderWidth: 1,
                                borderColor: '#3B82F6',
                                borderStyle: 'dashed',
                              }}
                            />
                          )}
                          {DEBUG_SELECTION && selectionDebug?.doc && (
                            <View
                              pointerEvents="none"
                              style={{
                                position: 'absolute',
                                left: selectionDebug.doc.x - 3,
                                top: selectionDebug.doc.y - 3,
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: '#EF4444',
                              }}
                            />
                          )}
                          {renderedFieldNodes}
                          {dragGuideLine && (
                            <View
                              pointerEvents="none"
                              style={[
                                styles.dragGuideLine,
                                {
                                  left: dragGuideLine.x,
                                  top: dragGuideLine.top,
                                  height: dragGuideLine.height,
                                },
                              ]}
                            />
                          )}
                          {isSingleFieldDrag && dragBadgePosition && dragPreviewPct && (
                            <View
                              pointerEvents="none"
                              style={[
                                styles.dragCoordsBadge,
                                {
                                  left: dragBadgePosition.left,
                                  top: dragBadgePosition.top,
                                },
                              ]}
                            >
                              <Text style={styles.dragCoordsText}>
                                {`${dragPreviewPct.x.toFixed(1)}% × ${dragPreviewPct.y.toFixed(1)}%`}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </Animated.View>
                  </PinchGestureHandler>
                </PanGestureHandler>
                {imageLoading && (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#4F46E5" />
                  </View>
                )}
              </View>
            ) : (
              pageImageError ? (
                <View style={styles.pageImageErrorCard}>
                  <Text style={styles.pageImageErrorText}>{pageImageError}</Text>
                </View>
              ) : (
                <ActivityIndicator size="large" color="#4F46E5" />
              )
            )}

        </View>
      </TapGestureHandler>

      {/* Bottom-fixed menu when field is selected */}
      {isMenuOpen && selectedField && (
        <View
          style={[
            styles.menuBottomContainer,
            { bottom: menuBottomOffset, paddingBottom: menuPaddingBottom },
            activeSubmenu === 'move' && { height: frameLayout.height * 0.5 },
          ]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (Math.abs(h - sheetHeight) > 2) setSheetHeight(h);
          }}
        >
          <FieldContextMenu
            containerRef={menuContainerRef}
            onLayout={handleMenuLayout}
            field={selectedField}
            imageLayout={imageLayout}
            viewportHeight={frameLayout.height}
            allFields={fields}
            onMove={handleMove}
            onResize={handleResize}
            onFontSizeChange={handleFontSizeChange}
            onLineCountChange={handleLineCountChange}
            onTextChange={handleContextMenuTextChange}
            onTextCommit={handleContextMenuTextCommit}
            labelValue={activeSubmenu === 'text' ? menuLabelDraft : null}
            onUpdateField={handleContextMenuUpdateField}
            onDelete={handleDelete}
            onDuplicate={openDuplicateModal}
            onSave={handleForceSave}
            configScrollMaxHeight={configScrollMaxHeight}
            onSubmenuChange={setActiveSubmenu}
            forceCloseSubmenu={activeSubmenu === null}
            onSelectGroup={handleSelectGroup}
            onSelectRow={handleSelectRow}
            onSelectColumn={handleSelectColumn}
            hasGroup={!!selectedField?.group_id}
          />
        </View>
      )}

      {/* Multi-select toolbar - shown when multi-select mode is active */}
      {multiSelectMode && (
        <View
          style={[
            styles.multiSelectToolbar,
            { paddingBottom: 10 + (insets.bottom || 0) },
          ]}
        >
          {/* Ligne 1 : boutons */}
          <View style={styles.msButtonRow}>
            <TouchableOpacity style={styles.msBtn} onPress={handleSelectAll}>
              <Text style={styles.msBtnText}>Tout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.msBtn, isMarqueeMode && styles.msBtnActive]}
              onPress={toggleMarqueeMode}
            >
              <Text style={[styles.msBtnText, isMarqueeMode && styles.msBtnTextActive]}>
                ⬜ Rect.
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.msBtn, styles.msBtnDanger, multiSelectedIds.size === 0 && styles.msBtnDisabled]}
              onPress={handleBatchDelete}
              disabled={multiSelectedIds.size === 0}
            >
              <Text style={[styles.msBtnText, styles.msBtnTextDanger]}>🗑 Suppr.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.msBtn, multiSelectedIds.size === 0 && styles.msBtnDisabled]}
              onPress={openDuplicateModal}
              disabled={multiSelectedIds.size === 0}
            >
              <Text style={styles.msBtnText}>⧉ Dupl.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.msBtn} onPress={handleDeselectAll}>
              <Text style={styles.msBtnText}>Désélect.</Text>
            </TouchableOpacity>
          </View>
          {/* Ligne 2 : boutons expandable */}
          {multiSelectedIds.size >= 2 && (
            <View>
              <View style={styles.msButtonRow}>
                <TouchableOpacity
                  style={[styles.msBtn, msPanel === 'alignement' && styles.msBtnActive]}
                  onPress={() => setMsPanel(msPanel === 'alignement' ? null : 'alignement')}
                >
                  <Text style={[styles.msBtnText, msPanel === 'alignement' && styles.msBtnTextActive]}>↔ Alignement</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.msBtn, msPanel === 'taille' && styles.msBtnActive]}
                  onPress={() => setMsPanel(msPanel === 'taille' ? null : 'taille')}
                >
                  <Text style={[styles.msBtnText, msPanel === 'taille' && styles.msBtnTextActive]}>📏 Taille</Text>
                </TouchableOpacity>
              </View>
              {msPanel === 'alignement' && (
                <View style={styles.msControlGroup}>
                  <View style={styles.msControlRow}>
                    <Text style={styles.msControlLabel}>↕ Espacement</Text>
                    <View style={styles.msValueEditor}>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepSpacingV(-1), handleSpacingVComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>-</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.msValueInput}
                        value={String(spacingVSlider)}
                        keyboardType="numeric"
                        onChangeText={(text) => handlePercentInputChange(text, handleSpacingVChange)}
                        onEndEditing={handleSpacingVComplete}
                        onSubmitEditing={handleSpacingVComplete}
                        returnKeyType="done"
                        selectTextOnFocus
                      />
                      <Text style={styles.msValueSuffix}>%</Text>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepSpacingV(1), handleSpacingVComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.msControlRow}>
                    <Text style={styles.msControlLabel}>↔ Espacement</Text>
                    <View style={styles.msValueEditor}>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepSpacingH(-1), handleSpacingHComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>-</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.msValueInput}
                        value={String(spacingHSlider)}
                        keyboardType="numeric"
                        onChangeText={(text) => handlePercentInputChange(text, handleSpacingHChange)}
                        onEndEditing={handleSpacingHComplete}
                        onSubmitEditing={handleSpacingHComplete}
                        returnKeyType="done"
                        selectTextOnFocus
                      />
                      <Text style={styles.msValueSuffix}>%</Text>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepSpacingH(1), handleSpacingHComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
              {msPanel === 'taille' && (
                <View style={styles.msControlGroup}>
                  <View style={styles.msControlRow}>
                    <Text style={styles.msControlLabel}>↔ Largeur</Text>
                    <View style={styles.msValueEditor}>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepSizeW(-1), handleSizeWComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>-</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.msValueInput}
                        value={String(sizeWSlider)}
                        keyboardType="numeric"
                        onChangeText={(text) => handlePercentInputChange(text, handleSizeWChange)}
                        onEndEditing={handleSizeWComplete}
                        onSubmitEditing={handleSizeWComplete}
                        returnKeyType="done"
                        selectTextOnFocus
                      />
                      <Text style={styles.msValueSuffix}>%</Text>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepSizeW(1), handleSizeWComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.msControlRow}>
                    <Text style={styles.msControlLabel}>↕ Hauteur</Text>
                    <View style={styles.msValueEditor}>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepSizeH(-1), handleSizeHComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>-</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.msValueInput}
                        value={String(sizeHSlider)}
                        keyboardType="numeric"
                        onChangeText={(text) => handlePercentInputChange(text, handleSizeHChange)}
                        onEndEditing={handleSizeHComplete}
                        onSubmitEditing={handleSizeHComplete}
                        returnKeyType="done"
                        selectTextOnFocus
                      />
                      <Text style={styles.msValueSuffix}>%</Text>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepSizeH(1), handleSizeHComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.msControlRow}>
                    <Text style={styles.msControlLabel}>A Taille police</Text>
                    <View style={styles.msValueEditor}>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepFontSize(-1), handleMultiFontSizeComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>-</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.msValueInput}
                        value={String(multiFontSizeValue)}
                        keyboardType="numeric"
                        onChangeText={(text) => handlePercentInputChange(text, handleMultiFontSizeChange)}
                        onEndEditing={handleMultiFontSizeComplete}
                        onSubmitEditing={handleMultiFontSizeComplete}
                        returnKeyType="done"
                        selectTextOnFocus
                      />
                      <Text style={styles.msValueSuffix}>px</Text>
                      <TouchableOpacity
                        style={styles.msStepBtn}
                        onPressIn={() => startAdjustRepeat(() => stepFontSize(1), handleMultiFontSizeComplete)}
                        onPressOut={stopAdjustRepeat}
                      >
                        <Text style={styles.msStepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Toolbar - hidden when keyboard, menu, or multi-select is active */}
      {!keyboardVisible && !isMenuOpen && !configVisible && !multiSelectMode && (
        <View
          style={[
            styles.toolbar,
            { paddingBottom: 10 + (insets.bottom || 0) },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.toolbarLeftGroup}>
            <TouchableOpacity
              style={styles.aiPrefillButton}
              onPress={() => setAiConfirmVisible(true)}
              disabled={isAiLoading}
            >
              <Text style={styles.aiPrefillButtonText}>✨ IA</Text>
            </TouchableOpacity>
            <View style={styles.zoomControls}>
              <TouchableOpacity style={styles.zoomButton} onPress={() => handleZoomStep(-1)}>
                <Text style={styles.zoomButtonText}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.zoomLabel} onPress={resetTransform}>
                <Text style={styles.zoomLabelText}>{zoomLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.zoomButton} onPress={() => handleZoomStep(1)}>
                <Text style={styles.zoomButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.toolbarCenterGroup}>
            <TouchableOpacity
              style={[styles.undoButton, undoStack.length === 0 && styles.undoButtonDisabled]}
              onPress={handleUndo}
              disabled={undoStack.length === 0}
            >
              <Text style={[styles.undoButtonText, undoStack.length === 0 && styles.undoButtonTextDisabled]}>↩</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.undoButton, redoStack.length === 0 && styles.undoButtonDisabled]}
              onPress={handleRedo}
              disabled={redoStack.length === 0}
            >
              <Text style={[styles.undoButtonText, redoStack.length === 0 && styles.undoButtonTextDisabled]}>↪</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.marqueeToggle, isMarqueeMode && styles.marqueeToggleActive]}
              onPress={() => {
                const next = !isMarqueeMode;
                setIsMarqueeMode(next);
                if (!next) {
                  clearMarquee();
                }
                if (next) {
                  setMultiSelectMode(true);
                  setSelectedFieldId(null);
                  setEditingFieldId(null);
                  closeMenu();
                }
              }}
            >
              <Text style={[styles.marqueeToggleText, isMarqueeMode && styles.marqueeToggleTextActive]}>
                ⬜ Sélect.
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Duplicate count modal */}
      <Modal
        visible={duplicateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDuplicateModalVisible(false)}
      >
        <View style={styles.duplicateModalOverlay}>
          <View style={styles.duplicateModalContent}>
            <Text style={styles.duplicateModalTitle}>Nombre de copies</Text>
            <TextInput
              style={styles.duplicateModalInput}
              value={duplicateCount}
              onChangeText={(text) => setDuplicateCount(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
              maxLength={2}
            />
            <View style={styles.duplicateModalButtons}>
              <TouchableOpacity
                style={styles.duplicateModalCancel}
                onPress={() => setDuplicateModalVisible(false)}
              >
                <Text style={styles.duplicateModalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.duplicateModalConfirm}
                onPress={() => {
                  setDuplicateModalVisible(false);
                  handleDuplicateWithCount(duplicateCount);
                }}
              >
                <Text style={styles.duplicateModalConfirmText}>Dupliquer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI prefill confirmation modal */}
      <Modal
        visible={aiConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAiConfirmVisible(false)}
      >
        <View style={styles.duplicateModalOverlay}>
          <View style={styles.duplicateModalContent}>
            <Text style={styles.duplicateModalTitle}>Pré-remplir par IA</Text>
            <Text style={styles.aiConfirmMessage}>
              L'IA va analyser cette page et créer automatiquement les champs détectés. Les champs existants seront conservés.
            </Text>
            <View style={styles.duplicateModalButtons}>
              <TouchableOpacity
                style={styles.duplicateModalCancel}
                onPress={() => setAiConfirmVisible(false)}
              >
                <Text style={styles.duplicateModalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.aiConfirmButton}
                onPress={handleAiPrefill}
              >
                <Text style={styles.aiConfirmButtonText}>Lancer l'IA</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI loading overlay */}
      {isAiLoading && (
        <View style={styles.aiLoadingOverlay}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.aiLoadingText}>L'IA analyse la page...</Text>
          <Text style={styles.aiLoadingSubtext}>Cela peut prendre quelques secondes</Text>
        </View>
      )}

      {DEBUG_GESTURES && (
        <View pointerEvents="none" style={styles.gestureDebugOverlay}>
          <Text style={styles.gestureDebugLine}>PAN: {gestureDebugHud.pan}</Text>
          <Text style={styles.gestureDebugLine}>TAP: {gestureDebugHud.tap}</Text>
          <Text style={styles.gestureDebugLine}>PINCH: {gestureDebugHud.pinch}</Text>
          <Text style={styles.gestureDebugLine}>MARQUEE: {gestureDebugHud.marquee}</Text>
          <Text style={styles.gestureDebugLine}>PTR: {gestureDebugHud.pointers}</Text>
          <Text style={styles.gestureDebugLine}>NOTE: {gestureDebugHud.note || '-'}</Text>
        </View>
      )}

      <FieldConfigModal
        visible={configVisible}
        field={selectedField}
        onSave={handleSaveConfig}
        onClose={() => setConfigVisible(false)}
      />

      {saveIndicator && (
        <View style={[styles.saveIndicator, { bottom: saveIndicatorBottom }]}
        >
          <Text style={styles.saveIndicatorText}>{saveIndicator}</Text>
        </View>
      )}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  backButton: {
    fontSize: 16,
    color: '#4F46E5',
  },
  headerPageControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerPageBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  headerPageBtnDisabled: {
    opacity: 0.35,
  },
  headerPageBtnText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
  headerPageBtnTextDisabled: {
    color: '#9ca3af',
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  finishButtonText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  templateMetaSection: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  templateNameText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  workArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  pageImage: {
    width: '100%',
    height: '100%',
  },
  pageImageHidden: {
    opacity: 0,
  },
  fieldsOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  dragGuideLine: {
    position: 'absolute',
    width: 1,
    marginLeft: -0.5,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(55, 65, 81, 0.8)',
    zIndex: 60,
  },
  dragCoordsBadge: {
    position: 'absolute',
    width: 108,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    alignItems: 'center',
    zIndex: 70,
  },
  dragCoordsText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  menuBottomContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
  },
  calibrationBox: {
    position: 'absolute',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  pageImageErrorCard: {
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  pageImageErrorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    zIndex: 10,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zoomButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4338ca',
  },
  zoomLabel: {
    marginHorizontal: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  zoomLabelText: {
    fontSize: 13,
    color: '#111827',
  },
  saveIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  saveIndicatorText: {
    fontSize: 12,
    color: '#10b981',
  },
  gestureDebugOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 2000,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  gestureDebugLine: {
    color: '#E5E7EB',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  multiSelectToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 10,
  },
  msButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  msBtn: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  msBtnDisabled: {
    opacity: 0.4,
  },
  msBtnActive: {
    backgroundColor: '#3B82F6',
  },
  msBtnDanger: {
    backgroundColor: '#FEE2E2',
  },
  msBtnText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  msBtnTextActive: {
    color: '#fff',
  },
  msBtnTextDanger: {
    color: '#DC2626',
  },
  msControlGroup: {
    marginBottom: 4,
    gap: 8,
  },
  msControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  msControlLabel: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  msValueEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 6,
    minHeight: 34,
  },
  msStepBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  msStepBtnText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
    color: '#111827',
  },
  msValueInput: {
    minWidth: 56,
    paddingVertical: 4,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  msValueSuffix: {
    fontSize: 13,
    color: '#6B7280',
    marginRight: 6,
    fontWeight: '600',
  },
  // Marquee toggle in main toolbar
  marqueeToggle: {
    backgroundColor: '#e0e7ff',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  marqueeToggleActive: {
    backgroundColor: '#3B82F6',
  },
  marqueeToggleText: {
    fontSize: 12,
    color: '#4338ca',
    fontWeight: '500',
  },
  marqueeToggleTextActive: {
    color: '#fff',
  },
  // Toolbar center group (undo + multi)
  toolbarCenterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  undoButton: {
    backgroundColor: '#e0e7ff',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  undoButtonDisabled: {
    opacity: 0.4,
  },
  undoButtonText: {
    fontSize: 16,
    color: '#4338ca',
    fontWeight: '600',
  },
  undoButtonTextDisabled: {
    color: '#9ca3af',
  },
  // Duplicate modal
  duplicateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  duplicateModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: 280,
    alignItems: 'center',
  },
  duplicateModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  duplicateModalInput: {
    width: 80,
    height: 48,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    color: '#111827',
    marginBottom: 20,
  },
  duplicateModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  duplicateModalCancel: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  duplicateModalCancelText: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
  },
  duplicateModalConfirm: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#4F46E5',
  },
  duplicateModalConfirmText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  // AI prefill styles
  toolbarLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiPrefillButton: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiPrefillButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  aiConfirmMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  aiConfirmButton: {
    flex: 1,
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  aiConfirmButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  aiLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  aiLoadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  aiLoadingSubtext: {
    color: '#aaa',
    marginTop: 8,
    fontSize: 12,
  },
});
