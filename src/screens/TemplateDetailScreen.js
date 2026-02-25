import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  ScrollView,
  Switch,
  Modal,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { templates, workProfiles } from '../api/client';

const DEFAULT_PAGE_ASPECT_RATIO = 1 / Math.sqrt(2); // A4 portrait fallback
const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 4;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const extractWorkProfilesList = (response) => {
  const payload = response?.data?.data || response?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export default function TemplateDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [template, setTemplate] = useState(null);
  const [rawTemplate, setRawTemplate] = useState(null);
  const [appliedTemplate, setAppliedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fileUrl, setFileUrl] = useState(null);
  const [pageImageUrl, setPageImageUrl] = useState(null);
  const [pageSize, setPageSize] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageImageResolving, setPageImageResolving] = useState(false);
  const [fileStatus, setFileStatus] = useState('idle');
  const [fileError, setFileError] = useState('');
  const [previewKind, setPreviewKind] = useState('image');
  const [imageLoading, setImageLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [zoomScaleValue, setZoomScaleValue] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const [isFieldsExpanded, setIsFieldsExpanded] = useState(false);
  const [showDocumentBackground, setShowDocumentBackground] = useState(true);
  const [showTemplateOverlay, setShowTemplateOverlay] = useState(false);
  const [previewSurfaceLayout, setPreviewSurfaceLayout] = useState({ width: 0, height: 0 });
  const [workProfilesList, setWorkProfilesList] = useState([]);
  const [workProfilesLoading, setWorkProfilesLoading] = useState(false);
  const [workProfilePickerVisible, setWorkProfilePickerVisible] = useState(false);
  const [workProfileSaving, setWorkProfileSaving] = useState(false);

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

  const normalizeTemplate = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;
    return payload.item || payload.result || payload.data || payload;
  };

  const getNestedTemplate = (item) => {
    if (!item || typeof item !== 'object') return null;
    if (item.template && typeof item.template === 'object' && !Array.isArray(item.template)) {
      return item.template;
    }
    return null;
  };

  const extractFields = (item) => {
    const nested = getNestedTemplate(item);
    if (Array.isArray(nested?.fields)) return nested.fields;
    if (Array.isArray(item?.fields)) return item.fields;
    if (Array.isArray(item?.template_fields)) return item.template_fields;
    return [];
  };

  const getFieldPageNumber = (field) => {
    const page = Number(field?.page_number ?? field?.pageNumber ?? field?.page ?? 1);
    return Number.isFinite(page) ? page : 1;
  };

  const resolveTotalPages = (item) => {
    if (!item) return 1;
    const nested = getNestedTemplate(item);
    const nestedPages = Array.isArray(nested?.pages) ? nested.pages.length : null;
    const itemPages = Array.isArray(item?.pages) ? item.pages.length : null;
    const candidates = [
      item?.page_count,
      item?.pages_count,
      item?.pageCount,
      item?.pagesCount,
      nested?.page_count,
      nested?.pages_count,
      nested?.pageCount,
      nested?.pagesCount,
      itemPages,
      nestedPages,
    ];
    const found = candidates.find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
    return found ? Number(found) : 1;
  };

  const loadTemplate = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await templates.get(id);
      const raw = response?.data?.data || response?.data;
      setRawTemplate(response?.data || null);
      const data = normalizeTemplate(raw);
      setTemplate(data || null);
      return data || null;
    } catch (error) {
      console.error('Erreur chargement template:', error);
      Alert.alert('Erreur', 'Impossible de charger le formulaire');
      navigation.goBack();
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, navigation]);

  useFocusEffect(
    useCallback(() => {
      loadTemplate();
    }, [loadTemplate])
  );

  const getTemplateName = (item) => {
    const nestedTemplate = getNestedTemplate(item);
    return (
      item?.name ||
      item?.title ||
      item?.document_name ||
      item?.documentName ||
      item?.original_name ||
      item?.originalName ||
      item?.filename ||
      item?.file_filename ||
      item?.fileFilename ||
      item?.file_name ||
      item?.fileName ||
      nestedTemplate?.name ||
      nestedTemplate?.title ||
      `Formulaire #${item?.id ?? ''}`
    );
  };

  const getFileObject = (item) => {
    if (!item || typeof item !== 'object') return null;
    if (item.file && typeof item.file === 'object') return item.file;
    if (item.asset && typeof item.asset === 'object') return item.asset;
    if (item.document && typeof item.document === 'object') return item.document;
    return null;
  };

  const getTemplateFilename = (item) => {
    const fileObject = getFileObject(item);
    return (
      item?.file_filename ||
      item?.fileFilename ||
      item?.filename ||
      item?.file_name ||
      item?.fileName ||
      item?.original_name ||
      item?.originalName ||
      item?.file_path ||
      item?.path ||
      item?.key ||
      item?.storage_key ||
      fileObject?.filename ||
      fileObject?.file_filename ||
      fileObject?.fileFilename ||
      fileObject?.file_name ||
      fileObject?.fileName ||
      fileObject?.original_name ||
      fileObject?.originalName ||
      fileObject?.path ||
      fileObject?.key ||
      fileObject?.storage_key ||
      fileObject?.name ||
      item?.file ||
      ''
    );
  };

  const getTemplateFileUrl = async (item) => {
    const fileObject = getFileObject(item);
    const directUrl =
      item?.file_url ||
      item?.fileUrl ||
      item?.url ||
      item?.download_url ||
      item?.downloadUrl ||
      fileObject?.file_url ||
      fileObject?.fileUrl ||
      fileObject?.url ||
      fileObject?.download_url ||
      fileObject?.downloadUrl;
    const resolveUrlString = (value) => {
      if (!value || typeof value !== 'string') return null;
      if (value.startsWith('http')) return value;
      return `https://api.scarch.cloud${value.startsWith('/') ? '' : '/'}${value}`;
    };
    if (directUrl) return resolveUrlString(directUrl);
    if (typeof item?.file === 'string') {
      const maybeUrl = resolveUrlString(item.file);
      if (maybeUrl) return maybeUrl;
    }
    return null;
  };

  const getFileKind = (item) => {
    const fileObject = getFileObject(item);
    const fileType = `${item?.file_type || item?.fileType || item?.mime_type || item?.mimeType || fileObject?.mime_type || fileObject?.mimeType || fileObject?.type || ''}`;
    const filename = getTemplateFilename(item);
    const probe = `${fileType} ${filename}`.toLowerCase();
    if (probe.includes('pdf')) return 'pdf';
    if (probe.match(/(png|jpg|jpeg|gif|webp|heic|image)/)) return 'image';
    return 'image';
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'uploaded':
        return 'Nouveau template, configuration requise';
      case 'calibrated':
        return 'Calibré, prêt à remplir';
      case 'editing':
        return 'En cours d’édition';
      case 'enriching':
        return 'Enrichissement IA en cours';
      case 'ready':
        return 'Template prêt à l’emploi';
      default:
        return status || 'Inconnu';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'uploaded':
        return '#3B82F6';
      case 'calibrated':
      case 'ready':
        return '#10B981';
      case 'editing':
        return '#F59E0B';
      case 'enriching':
        return '#F97316';
      case 'error':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const resolvedTemplate = template || rawTemplate;
  const nestedTemplate = getNestedTemplate(resolvedTemplate);
  const templateFilename = getTemplateFilename(resolvedTemplate || nestedTemplate);
  const fileKind = getFileKind(resolvedTemplate || nestedTemplate);
  const kind = resolvedTemplate?.kind || nestedTemplate?.kind || 'template';
  const isDocument = kind === 'document';
  const status = resolvedTemplate?.status || nestedTemplate?.status || 'inconnu';
  const workProfileId = toNumber(
    resolvedTemplate?.work_profile_id ??
      resolvedTemplate?.workProfileId ??
      nestedTemplate?.work_profile_id ??
      nestedTemplate?.workProfileId,
    null
  );
  const linkedWorkProfile = resolvedTemplate?.work_profile ||
    resolvedTemplate?.workProfile ||
    nestedTemplate?.work_profile ||
    nestedTemplate?.workProfile ||
    null;
  const linkedWorkProfileFromList = workProfilesList.find(
    (item) => toNumber(item?.id, null) === workProfileId
  );
  const linkedWorkProfileName =
    linkedWorkProfile?.name || linkedWorkProfileFromList?.name || null;
  const appliedTemplateId =
    resolvedTemplate?.applied_template_id || resolvedTemplate?.appliedTemplateId || null;
  const appliedTemplateNameFallback =
    resolvedTemplate?.applied_template_name ||
    resolvedTemplate?.appliedTemplateName ||
    resolvedTemplate?.applied_template_label ||
    resolvedTemplate?.appliedTemplateLabel ||
    (appliedTemplateId ? `Template #${appliedTemplateId}` : '');
  const appliedTemplateLabel = appliedTemplate
    ? getTemplateName(appliedTemplate)
    : appliedTemplateNameFallback;
  const resolvedFields = extractFields(resolvedTemplate);
  const appliedTemplateFields = extractFields(appliedTemplate);
  const fields = isDocument && appliedTemplateId ? appliedTemplateFields : resolvedFields;
  const hasValue = (value) => value !== null && value !== undefined && value !== '';
  const maxFieldPage = useMemo(
    () =>
      fields.reduce((acc, field) => {
        if (!field) return acc;
        return Math.max(acc, getFieldPageNumber(field));
      }, 1),
    [fields]
  );
  const totalPages = Math.max(1, resolveTotalPages(resolvedTemplate || nestedTemplate), maxFieldPage);
  const currentPageFields = useMemo(
    () =>
      fields.filter((field) => {
        if (!hasValue(field?.x) || !hasValue(field?.y)) return false;
        return getFieldPageNumber(field) === currentPage;
      }),
    [currentPage, fields]
  );
  const placedFieldsCount = fields.filter((field) => hasValue(field?.x)).length;
  const totalFields = fields.length;

  useEffect(() => {
    setShowDocumentBackground(true);
    setShowTemplateOverlay(false);
    setCurrentPage(1);
  }, [id]);

  useEffect(() => {
    if (appliedTemplateId) return;
    setShowTemplateOverlay(false);
  }, [appliedTemplateId]);

  useEffect(() => {
    if (currentPage <= totalPages) return;
    setCurrentPage(1);
  }, [currentPage, totalPages]);

  const loadWorkProfiles = useCallback(async ({ showError } = {}) => {
    setWorkProfilesLoading(true);
    try {
      const response = await workProfiles.list();
      const list = extractWorkProfilesList(response);
      setWorkProfilesList(list);
      return list;
    } catch (error) {
      console.error('Erreur chargement work profiles:', error);
      setWorkProfilesList([]);
      if (showError) {
        Alert.alert('Erreur', 'Impossible de charger les profils métier');
      }
      return [];
    } finally {
      setWorkProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDocument) return;
    loadWorkProfiles();
  }, [isDocument, loadWorkProfiles]);

  useEffect(() => {
    let isMounted = true;

    const resolveAppliedTemplate = async () => {
      if (!isDocument || !appliedTemplateId) {
        if (isMounted) setAppliedTemplate(null);
        return;
      }

      try {
        const response = await templates.get(appliedTemplateId);
        const raw = response?.data?.data || response?.data;
        const data = normalizeTemplate(raw);
        if (isMounted) {
          setAppliedTemplate(data || null);
        }
      } catch (error) {
        console.error('Erreur chargement template applique:', error);
        if (isMounted) {
          setAppliedTemplate(null);
        }
      }
    };

    resolveAppliedTemplate();
    return () => {
      isMounted = false;
    };
  }, [appliedTemplateId, isDocument]);

  useEffect(() => {
    let isMounted = true;
    const resolveUrl = async () => {
      if (!resolvedTemplate) {
        if (isMounted) setFileUrl(null);
        return;
      }
      if (isMounted) {
        setFileStatus('loading');
        setFileError('');
      }
      try {
        let url = await getTemplateFileUrl(resolvedTemplate);
        if (!url && nestedTemplate) {
          url = await getTemplateFileUrl(nestedTemplate);
        }
        if (isMounted && url) {
          setFileUrl(url);
          setFileStatus('ready');
          setPreviewKind(getFileKind(resolvedTemplate || nestedTemplate));
          return;
        }
        const pageUrl = await templates.getPageImageUrl(id, 1);
        if (isMounted && pageUrl) {
          setFileUrl(pageUrl);
          setFileStatus('ready');
          setPreviewKind('image');
          return;
        }
        if (isMounted) {
          setFileStatus('missing');
        }
      } catch (error) {
        console.error('Erreur URL template:', error);
        if (isMounted) {
          setFileStatus('error');
          setFileError('Impossible de charger le fichier');
        }
      }
    };

    resolveUrl();
    return () => {
      isMounted = false;
    };
  }, [id, nestedTemplate, resolvedTemplate]);

  useEffect(() => {
    let isMounted = true;
    const resolvePageImage = async () => {
      if (isMounted) setPageImageResolving(true);
      try {
        const candidates = await templates.getPageImageUrlCandidates(
          id,
          currentPage,
          templateFilename
        );
        let resolvedUrl = null;
        for (const candidateUrl of candidates) {
          try {
            const canLoad = await Promise.race([
              Image.prefetch(candidateUrl),
              new Promise((resolve) => setTimeout(() => resolve(false), 4500)),
            ]);
            if (canLoad) {
              resolvedUrl = candidateUrl;
              break;
            }
          } catch {
            // Try next candidate.
          }
        }
        if (isMounted) {
          setPageImageUrl(resolvedUrl);
        }
      } catch (error) {
        if (isMounted) {
          setPageImageUrl(null);
        }
      } finally {
        if (isMounted) {
          setPageImageResolving(false);
        }
      }
    };

    resolvePageImage();
    return () => {
      isMounted = false;
    };
  }, [currentPage, id, templateFilename]);

  const pageSizeProbeUrl = useMemo(() => {
    if (pageImageUrl) return pageImageUrl;
    if (previewKind === 'image' && fileUrl) return fileUrl;
    return null;
  }, [fileUrl, pageImageUrl, previewKind]);

  useEffect(() => {
    if (!pageSizeProbeUrl) {
      setPageSize(null);
      return;
    }

    let isCancelled = false;
    Image.getSize(
      pageSizeProbeUrl,
      (width, height) => {
        if (isCancelled) return;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          setPageSize({ width, height });
          return;
        }
        setPageSize(null);
      },
      () => {
        if (!isCancelled) setPageSize(null);
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [pageSizeProbeUrl]);

  const pageAspectRatio =
    Number(pageSize?.width) > 0 && Number(pageSize?.height) > 0
      ? Number(pageSize.width) / Number(pageSize.height)
      : DEFAULT_PAGE_ASPECT_RATIO;

  const previewImageLayout = useMemo(() => {
    const width = Number(previewSurfaceLayout?.width) || 0;
    const height = Number(previewSurfaceLayout?.height) || 0;
    if (!width || !height) return null;

    const safeRatio =
      Number.isFinite(pageAspectRatio) && pageAspectRatio > 0
        ? pageAspectRatio
        : DEFAULT_PAGE_ASPECT_RATIO;
    let frameWidth = width;
    let frameHeight = frameWidth / safeRatio;
    if (frameHeight > height) {
      frameHeight = height;
      frameWidth = frameHeight * safeRatio;
    }

    return { width: frameWidth, height: frameHeight };
  }, [pageAspectRatio, previewSurfaceLayout]);

  const handleDelete = () => {
    Alert.alert('Supprimer', 'Voulez-vous supprimer ce formulaire ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await templates.delete(id);
            Alert.alert('Supprimé', 'Formulaire supprimé', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          } catch (error) {
            console.error('Erreur suppression:', error);
            Alert.alert('Erreur', 'Impossible de supprimer le formulaire');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };
  const showPreviewBackground = isDocument ? true : showDocumentBackground;
  const showTemplateFields = isDocument ? showTemplateOverlay : true;
  const hasConfiguredFields = totalFields > 0 || placedFieldsCount > 0;
  const showSetupButton = !isDocument && status === 'uploaded' && !hasConfiguredFields;
  const showEditButton = !isDocument && !showSetupButton;
  const previewImageUrl = useMemo(() => {
    if (!showPreviewBackground) return null;
    if (isDocument) return pageImageUrl || null;
    if (previewKind === 'pdf') return pageImageUrl || null;
    return fileUrl || pageImageUrl || null;
  }, [fileUrl, isDocument, pageImageUrl, previewKind, showPreviewBackground]);
  const showFileMissingMessage =
    showPreviewBackground &&
    (isDocument
      ? !previewImageUrl && !pageImageResolving
      : !previewImageUrl && (fileStatus === 'missing' || (fileStatus === 'error' && !fileUrl)));

  const handleDebug = async () => {
    let resolvedUrl = null;
    try {
      resolvedUrl = resolvedTemplate ? await getTemplateFileUrl(resolvedTemplate) : null;
    } catch (error) {
      console.error('Erreur debug URL:', error);
    }
    const filename = resolvedTemplate ? getTemplateFilename(resolvedTemplate) : null;
    const payload = rawTemplate || template;
    const json = payload ? JSON.stringify(payload, null, 2) : 'null';
    console.log('TEMPLATE_DEBUG payload:', payload);
    console.log('TEMPLATE_DEBUG url:', resolvedUrl);
    Alert.alert(
      'Debug template',
      `ID: ${id}\nFilename: ${filename || 'null'}\nURL: ${resolvedUrl || 'null'}\nKind: ${fileKind}\nStatus: ${status}\n\nJSON (complet dans les logs):\n${json.slice(0, 1200)}`
    );
  };

  const handleOpenInBrowser = async () => {
    if (!fileUrl) return;
    try {
      await WebBrowser.openBrowserAsync(fileUrl);
    } catch (error) {
      console.error('Erreur ouverture navigateur:', error);
      Alert.alert('Erreur', "Impossible d'ouvrir le navigateur");
    }
  };

  const handleSetup = () => {
    navigation.navigate('TemplateSetupScreen', { templateId: id });
  };

  const handleEditTemplate = () => {
    navigation.navigate('TemplateEditorScreen', {
      templateId: id,
    });
  };

  const handleOpenWorkProfilePicker = async () => {
    setWorkProfilePickerVisible(true);
    await loadWorkProfiles();
  };

  const handleAssignWorkProfile = async (nextWorkProfileId) => {
    setWorkProfileSaving(true);
    try {
      await templates.update(id, { work_profile_id: nextWorkProfileId });
      await loadTemplate({ silent: true });
      setWorkProfilePickerVisible(false);
    } catch (error) {
      console.error('Erreur association profil metier:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le profil métier');
    } finally {
      setWorkProfileSaving(false);
    }
  };

  const handleDetachWorkProfile = async () => {
    setWorkProfileSaving(true);
    try {
      await templates.update(id, { work_profile_id: null });
      await loadTemplate({ silent: true });
    } catch (error) {
      console.error('Erreur dissociation profil metier:', error);
      Alert.alert('Erreur', 'Impossible de dissocier le profil métier');
    } finally {
      setWorkProfileSaving(false);
    }
  };

  const handlePreviewSurfaceLayout = useCallback((event) => {
    const nextWidth = Number(event?.nativeEvent?.layout?.width) || 0;
    const nextHeight = Number(event?.nativeEvent?.layout?.height) || 0;
    setPreviewSurfaceLayout((prev) => {
      if (prev.width === nextWidth && prev.height === nextHeight) return prev;
      return { width: nextWidth, height: nextHeight };
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
  }, [currentPage, isDocument, pageImageUrl, resetZoom]);

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
      applyZoomScale(zoomScaleRef.current * pinchValue);
    },
    [applyZoomScale]
  );

  const handleZoomIn = useCallback(() => {
    applyZoomScale(zoomScaleRef.current * 1.25);
  }, [applyZoomScale]);

  const handleZoomOut = useCallback(() => {
    applyZoomScale(zoomScaleRef.current / 1.25);
  }, [applyZoomScale]);

  const renderFieldsOverlay = () => {
    if (!showTemplateFields || !previewImageLayout || currentPageFields.length === 0) return null;

    return (
      <View pointerEvents="none" style={styles.fieldsOverlay}>
        {currentPageFields.map((field, index) => {
          const xPercent = clamp(toNumber(field?.x, 0), 0, 100);
          const yPercent = clamp(toNumber(field?.y, 0), 0, 100);
          const widthPercent = clamp(toNumber(field?.width ?? field?.field_width, 20), 2, 100);
          const leftPercent = clamp(xPercent, 0, Math.max(0, 100 - widthPercent));
          const leftPx = (leftPercent / 100) * previewImageLayout.width;
          const topPx = (yPercent / 100) * previewImageLayout.height;
          const widthPx = (widthPercent / 100) * previewImageLayout.width;
          const fontSize = toNumber(field?.font_size ?? field?.fontSize, 12);
          const lineHeight = toNumber(field?.line_height ?? field?.lineHeight, 1.2);
          const lineCount = Math.max(
            1,
            parseInt(field?.line_count ?? field?.lineCount ?? 1, 10) || 1
          );
          const fallbackHeight = Math.max(14, fontSize * lineHeight * lineCount);
          const rawHeightPx = toNumber(field?.height ?? field?.field_height, null);
          const baseHeightPx =
            rawHeightPx !== null && rawHeightPx > 0 ? rawHeightPx : fallbackHeight;
          const heightPx = clamp(baseHeightPx, 8, Math.max(8, previewImageLayout.height - topPx));
          const label =
            field?.field_label ||
            field?.label ||
            field?.field_name ||
            field?.name ||
            `Champ ${index + 1}`;

          return (
            <View
              key={field?.id ? `${field.id}` : `${label}-${index}`}
              style={[
                styles.fieldOverlayItem,
                {
                  left: leftPx,
                  top: topPx,
                  width: widthPx,
                  height: heightPx,
                },
              ]}
            >
              <Text numberOfLines={1} style={styles.fieldOverlayLabel}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const canGoPrevPage = currentPage > 1;
  const canGoNextPage = currentPage < totalPages;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {resolvedTemplate ? getTemplateName(resolvedTemplate) : 'Formulaire'}
        </Text>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
          <Text style={styles.statusBadgeText}>{getStatusLabel(status)}</Text>
        </View>
        <TouchableOpacity style={styles.debugButton} onPress={handleDebug}>
          <Text style={styles.debugButtonText}>Debug</Text>
        </TouchableOpacity>
      </View>

      {isDocument && !!appliedTemplateId && (
        <View style={styles.appliedTemplateRow}>
          <Text style={styles.appliedTemplateText}>
            Template appliqué: {appliedTemplateLabel || `Template #${appliedTemplateId}`}
          </Text>
        </View>
      )}

      {isDocument && !!appliedTemplateId && (
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Afficher le template</Text>
          <Switch
            value={showTemplateOverlay}
            onValueChange={setShowTemplateOverlay}
            trackColor={{ false: '#D1D5DB', true: '#A5B4FC' }}
            thumbColor={showTemplateOverlay ? '#4F46E5' : '#F9FAFB'}
          />
        </View>
      )}

      {!isDocument && (
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Fond du document</Text>
          <Switch
            value={showDocumentBackground}
            onValueChange={setShowDocumentBackground}
            trackColor={{ false: '#D1D5DB', true: '#A5B4FC' }}
            thumbColor={showDocumentBackground ? '#4F46E5' : '#F9FAFB'}
          />
        </View>
      )}

      {!isDocument && (
        <View style={styles.profileRow}>
          <View style={styles.profileInfo}>
            <Text style={styles.profileLabel}>Profil métier</Text>
            <Text style={styles.profileValue} numberOfLines={1}>
              {linkedWorkProfileName || 'Aucun profil'}
            </Text>
          </View>
          <View style={styles.profileActions}>
            <TouchableOpacity
              style={[styles.profileButton, (workProfileSaving || workProfilesLoading) && styles.actionButtonDisabled]}
              onPress={handleOpenWorkProfilePicker}
              disabled={workProfileSaving || workProfilesLoading}
            >
              <Text style={styles.profileButtonText}>Choisir un profil</Text>
            </TouchableOpacity>
            {workProfileId !== null && (
              <TouchableOpacity
                style={[styles.profileDetachButton, workProfileSaving && styles.actionButtonDisabled]}
                onPress={handleDetachWorkProfile}
                disabled={workProfileSaving}
              >
                <Text style={styles.profileDetachButtonText}>Dissocier</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {(showSetupButton || showEditButton) && (
        <View style={styles.actionRow}>
          {showSetupButton && (
            <TouchableOpacity style={styles.actionButton} onPress={handleSetup}>
              <Text style={styles.actionButtonText}>Configurer le template</Text>
            </TouchableOpacity>
          )}
          {showEditButton && (
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={handleEditTemplate}
            >
              <Text style={styles.secondaryButtonText}>Modifier le template</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.content}>
        {totalPages > 1 && (
          <View style={styles.pageControlsRow}>
            <TouchableOpacity
              style={[styles.pageControlButton, !canGoPrevPage && styles.pageControlButtonDisabled]}
              onPress={() => canGoPrevPage && setCurrentPage((prev) => prev - 1)}
              disabled={!canGoPrevPage}
            >
              <Text style={styles.pageControlButtonText}>◀</Text>
            </TouchableOpacity>
            <Text style={styles.pageIndicatorText}>Page {currentPage}/{totalPages}</Text>
            <TouchableOpacity
              style={[styles.pageControlButton, !canGoNextPage && styles.pageControlButtonDisabled]}
              onPress={() => canGoNextPage && setCurrentPage((prev) => prev + 1)}
              disabled={!canGoNextPage}
            >
              <Text style={styles.pageControlButtonText}>▶</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.previewContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#4F46E5" />
          ) : !showPreviewBackground ? (
            <View style={styles.previewSurface} onLayout={handlePreviewSurfaceLayout}>
              {previewImageLayout && (
                <View
                  style={[
                    styles.imageWrapper,
                    {
                      width: previewImageLayout.width,
                      height: previewImageLayout.height,
                    },
                  ]}
                >
                  <View style={styles.blankPage} />
                  {renderFieldsOverlay()}
                </View>
              )}
            </View>
          ) : previewImageUrl ? (
            <View style={styles.previewSurface} onLayout={handlePreviewSurfaceLayout}>
              {previewImageLayout && (
                <PanGestureHandler
                  ref={panRef}
                  simultaneousHandlers={pinchRef}
                  enabled={isDocument && zoomScaleValue > 1.01}
                  onGestureEvent={onPanGestureEvent}
                  onHandlerStateChange={onPanStateChange}
                >
                  <Animated.View style={styles.zoomGestureHost}>
                    <PinchGestureHandler
                      ref={pinchRef}
                      simultaneousHandlers={panRef}
                      enabled={isDocument}
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
                            styles.imageWrapper,
                            {
                              width: previewImageLayout.width,
                              height: previewImageLayout.height,
                            },
                          ]}
                        >
                          <Image
                            source={{ uri: previewImageUrl }}
                            style={styles.previewImage}
                            resizeMode="contain"
                            onLoadStart={() => setImageLoading(true)}
                            onLoadEnd={() => setImageLoading(false)}
                            onError={(event) => {
                              console.error('Erreur chargement image:', event?.nativeEvent);
                              setImageLoading(false);
                              if (previewKind === 'pdf' || isDocument) {
                                setPageImageUrl(null);
                                return;
                              }
                              setFileStatus('error');
                              setFileError('Image indisponible');
                            }}
                          />
                          {renderFieldsOverlay()}
                        </View>
                      </Animated.View>
                    </PinchGestureHandler>
                  </Animated.View>
                </PanGestureHandler>
              )}
              {imageLoading && (
                <View style={styles.imageLoader}>
                  <ActivityIndicator size="small" color="#4F46E5" />
                </View>
              )}
              {isDocument && previewImageUrl && (
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
            </View>
          ) : previewKind === 'pdf' && fileUrl ? (
            <>
              <View style={styles.pdfViewer}>
                <View style={styles.webViewWrapper} onLayout={handlePreviewSurfaceLayout}>
                  <WebView
                    source={{
                      uri: `https://docs.google.com/viewer?url=${encodeURIComponent(
                        fileUrl
                      )}&embedded=true`,
                    }}
                    style={styles.webView}
                    onLoadStart={() => setPdfLoading(true)}
                    onLoadEnd={() => setPdfLoading(false)}
                  />
                  {pdfLoading && (
                    <View style={styles.webViewLoader}>
                      <ActivityIndicator size="small" color="#4F46E5" />
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity style={styles.openBrowserButton} onPress={handleOpenInBrowser}>
                <Text style={styles.openBrowserButtonText}>Ouvrir dans le navigateur</Text>
              </TouchableOpacity>
            </>
          ) : showFileMissingMessage ? (
            <View style={styles.pdfContainer}>
              <Text style={styles.pdfText}>
                {status === 'processing' ? 'Fichier en cours de préparation' : fileError || 'Fichier indisponible'}
              </Text>
            </View>
          ) : (
            <ActivityIndicator size="small" color="#4F46E5" />
          )}
        </View>

        {fields.length > 0 && (
          <View style={styles.fieldsList}>
            <TouchableOpacity
              style={styles.fieldsHeader}
              onPress={() => setIsFieldsExpanded((prev) => !prev)}
            >
              <Text style={styles.fieldsTitle}>Champs détectés ({totalFields})</Text>
              <Text style={styles.fieldsToggleIcon}>
                {isFieldsExpanded ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.fieldsSummary}>
              {totalFields} champs détectés, {placedFieldsCount} positionnés
            </Text>
            {isFieldsExpanded && (
              <ScrollView style={styles.fieldsScroll} contentContainerStyle={styles.fieldsScrollContent}>
                {fields.map((field) => (
                  <Text key={field.id || field.field_name} style={styles.fieldItem}>
                    - {field?.field_label || field?.label || field?.field_name || field?.name || 'Champ'}
                  </Text>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
        onPress={handleDelete}
        disabled={deleting}
      >
        {deleting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.deleteButtonText}>Supprimer</Text>
        )}
      </TouchableOpacity>

      <Modal
        visible={workProfilePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!workProfileSaving) setWorkProfilePickerVisible(false);
        }}
      >
        <View style={styles.profileModalBackdrop}>
          <View style={styles.profileModalCard}>
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalTitle}>Choisir un profil métier</Text>
              <TouchableOpacity
                onPress={() => setWorkProfilePickerVisible(false)}
                disabled={workProfileSaving}
              >
                <Text style={styles.profileModalClose}>Fermer</Text>
              </TouchableOpacity>
            </View>

            {workProfilesLoading ? (
              <View style={styles.profileModalLoading}>
                <ActivityIndicator size="small" color="#4F46E5" />
              </View>
            ) : workProfilesList.length === 0 ? (
              <View style={styles.profileModalEmpty}>
                <Text style={styles.profileModalEmptyText}>Aucun profil disponible</Text>
              </View>
            ) : (
              <ScrollView style={styles.profileModalList}>
                {workProfilesList.map((profileItem) => {
                  const profileItemId = toNumber(profileItem?.id, null);
                  const isSelected = profileItemId === workProfileId;
                  return (
                    <TouchableOpacity
                      key={String(profileItem?.id || `${profileItem?.name || ''}-${profileItem?.sector || ''}`)}
                      style={[styles.profileModalItem, isSelected && styles.profileModalItemSelected]}
                      onPress={() => handleAssignWorkProfile(profileItemId)}
                      disabled={workProfileSaving || profileItemId === null}
                    >
                      <Text style={styles.profileModalItemTitle} numberOfLines={1}>
                        {profileItem?.name || `Profil #${profileItem?.id ?? ''}`}
                      </Text>
                      {!!profileItem?.sector && (
                        <Text style={styles.profileModalItemSector} numberOfLines={1}>
                          {profileItem.sector}
                        </Text>
                      )}
                      {!!profileItem?.context && (
                        <Text style={styles.profileModalItemContext} numberOfLines={2}>
                          {profileItem.context}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.profileModalManageButton}
              onPress={() => {
                setWorkProfilePickerVisible(false);
                navigation.navigate('WorkProfilesScreen');
              }}
            >
              <Text style={styles.profileModalManageButtonText}>Gérer les profils</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#4F46E5',
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
    marginRight: 10,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  debugButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#111827',
  },
  debugButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  appliedTemplateRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  appliedTemplateText: {
    fontSize: 12,
    color: '#1F2937',
    fontWeight: '600',
  },
  toggleRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  profileRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  profileInfo: {
    marginBottom: 8,
  },
  profileLabel: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  profileValue: {
    marginTop: 3,
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  profileActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#111827',
  },
  profileButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  profileDetachButton: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  profileDetachButtonText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  actionButtonSpacing: {
    marginRight: 12,
  },
  secondaryButton: {
    backgroundColor: '#111827',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  pageControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 12,
  },
  pageControlButton: {
    minWidth: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageControlButtonDisabled: {
    opacity: 0.4,
  },
  pageControlButtonText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
  },
  pageIndicatorText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  previewContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  previewSurface: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blankPage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  blankPageFallback: {
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
  },
  fieldsOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    overflow: 'hidden',
  },
  fieldOverlayItem: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    borderRadius: 4,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  fieldOverlayLabel: {
    fontSize: 10,
    color: '#111827',
    fontWeight: '500',
  },
  fieldsList: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  fieldsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  fieldsToggleIcon: {
    fontSize: 12,
    color: '#6B7280',
  },
  fieldsSummary: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
  fieldsScroll: {
    marginTop: 8,
    maxHeight: 200,
  },
  fieldsScrollContent: {
    paddingBottom: 4,
  },
  fieldItem: {
    fontSize: 12,
    color: '#374151',
    marginBottom: 4,
  },
  imageWrapper: {
    alignSelf: 'center',
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  zoomGestureHost: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageLoader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
  },
  previewImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#E5E7FF',
  },
  zoomControls: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  zoomButton: {
    minWidth: 34,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  zoomButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  zoomValueText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  pdfContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#E5E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pdfIcon: {
    fontSize: 30,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 10,
  },
  pdfText: {
    color: '#4F46E5',
    fontWeight: '600',
    textAlign: 'center',
  },
  pdfViewer: {
    width: '100%',
    height: '100%',
  },
  webViewWrapper: {
    flex: 1,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7FF',
  },
  webView: {
    flex: 1,
  },
  webViewLoader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
  },
  openBrowserButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  openBrowserButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    margin: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#EF4444',
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: '#FCA5A5',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  profileModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  profileModalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    maxHeight: '72%',
  },
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileModalTitle: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  profileModalClose: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '600',
  },
  profileModalLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  profileModalEmpty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  profileModalEmptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
  profileModalList: {
    marginTop: 10,
    maxHeight: 320,
  },
  profileModalItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  profileModalItemSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  profileModalItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  profileModalItemSector: {
    marginTop: 3,
    fontSize: 11,
    color: '#4B5563',
  },
  profileModalItemContext: {
    marginTop: 4,
    fontSize: 11,
    color: '#6B7280',
  },
  profileModalManageButton: {
    marginTop: 6,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  profileModalManageButtonText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
});
