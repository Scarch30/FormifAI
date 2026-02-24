import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';

const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 4;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function ZoomableImageViewer({
  uri,
  loading = false,
  placeholder = 'Aucun aperçu disponible.',
  frameStyle,
  placeholderStyle,
  onImageError,
}) {
  const [frameLayout, setFrameLayout] = useState({ width: 0, height: 0 });
  const [zoomScale, setZoomScale] = useState(MIN_ZOOM_SCALE);

  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const zoomScaleRef = useRef(MIN_ZOOM_SCALE);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const baseScale = useRef(new Animated.Value(MIN_ZOOM_SCALE)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;

  const zoomAnim = Animated.multiply(baseScale, pinchScale);
  const translateXAnim = Animated.add(translateX, panX);
  const translateYAnim = Animated.add(translateY, panY);

  const getPanBounds = useCallback(
    (scale) => {
      const width = Number(frameLayout?.width) || 0;
      const height = Number(frameLayout?.height) || 0;
      if (scale <= MIN_ZOOM_SCALE || !width || !height) {
        return { maxX: 0, maxY: 0 };
      }
      return {
        maxX: ((scale - 1) * width) / 2,
        maxY: ((scale - 1) * height) / 2,
      };
    },
    [frameLayout]
  );

  const clampPan = useCallback(
    (x, y, scale = zoomScaleRef.current) => {
      const { maxX, maxY } = getPanBounds(scale);
      if (!maxX && !maxY) return { x: 0, y: 0 };
      return {
        x: clamp(x, -maxX, maxX),
        y: clamp(y, -maxY, maxY),
      };
    },
    [getPanBounds]
  );

  const resetZoom = useCallback(() => {
    zoomScaleRef.current = MIN_ZOOM_SCALE;
    setZoomScale(MIN_ZOOM_SCALE);
    baseScale.setValue(MIN_ZOOM_SCALE);
    pinchScale.setValue(1);
    panOffsetRef.current = { x: 0, y: 0 };
    translateX.setValue(0);
    translateY.setValue(0);
    panX.setValue(0);
    panY.setValue(0);
  }, [baseScale, panX, panY, pinchScale, translateX, translateY]);

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
      } else {
        const clampedOffset = clampPan(
          panOffsetRef.current.x,
          panOffsetRef.current.y,
          safeScale
        );
        panOffsetRef.current = clampedOffset;
        translateX.setValue(clampedOffset.x);
        translateY.setValue(clampedOffset.y);
      }

      panX.setValue(0);
      panY.setValue(0);
      setZoomScale(safeScale);
    },
    [baseScale, clampPan, panX, panY, pinchScale, translateX, translateY]
  );

  useEffect(() => {
    resetZoom();
  }, [resetZoom, uri]);

  useEffect(() => {
    if (zoomScaleRef.current <= MIN_ZOOM_SCALE) return;
    const clampedOffset = clampPan(panOffsetRef.current.x, panOffsetRef.current.y);
    panOffsetRef.current = clampedOffset;
    translateX.setValue(clampedOffset.x);
    translateY.setValue(clampedOffset.y);
  }, [clampPan, frameLayout, translateX, translateY]);

  const onFrameLayout = useCallback((event) => {
    const width = Number(event?.nativeEvent?.layout?.width) || 0;
    const height = Number(event?.nativeEvent?.layout?.height) || 0;
    setFrameLayout((prev) => {
      if (prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

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

      const nextRawX = panOffsetRef.current.x + (Number(translationX) || 0);
      const nextRawY = panOffsetRef.current.y + (Number(translationY) || 0);
      const nextOffset = clampPan(nextRawX, nextRawY);
      panOffsetRef.current = nextOffset;
      translateX.setValue(nextOffset.x);
      translateY.setValue(nextOffset.y);
      panX.setValue(0);
      panY.setValue(0);
    },
    [clampPan, panX, panY, translateX, translateY]
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

  return (
    <View style={[styles.frame, frameStyle]} onLayout={onFrameLayout}>
      {loading ? (
        <ActivityIndicator size="small" color="#4F46E5" />
      ) : uri ? (
        <>
          <PanGestureHandler
            ref={panRef}
            simultaneousHandlers={pinchRef}
            enabled={zoomScale > MIN_ZOOM_SCALE + 0.01}
            onGestureEvent={onPanGestureEvent}
            onHandlerStateChange={onPanStateChange}
          >
            <Animated.View style={styles.gestureHost}>
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
                        { scale: zoomAnim },
                      ],
                    },
                  ]}
                >
                  <Image
                    source={{ uri }}
                    style={styles.image}
                    resizeMode="contain"
                    onError={onImageError}
                  />
                </Animated.View>
              </PinchGestureHandler>
            </Animated.View>
          </PanGestureHandler>

          <View style={styles.zoomControls}>
            <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut}>
              <Text style={styles.zoomButtonText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomValueButton} onPress={resetZoom}>
              <Text style={styles.zoomValueText}>{Math.round(zoomScale * 100)}%</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomButton} onPress={handleZoomIn}>
              <Text style={styles.zoomButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <Text style={[styles.placeholder, placeholderStyle]}>{placeholder}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minHeight: 220,
    width: '100%',
  },
  gestureHost: {
    width: '100%',
    height: '100%',
  },
  zoomContent: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  zoomControls: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.68)',
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  zoomButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  zoomButtonText: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  zoomValueButton: {
    marginHorizontal: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  zoomValueText: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '700',
  },
  placeholder: {
    color: '#4B5563',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 14,
    lineHeight: 18,
  },
});
