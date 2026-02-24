import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { getFieldTextStyle } from '../utils/fieldUtils';

export default function PlacedField({
  field,
  imageLayout,
  getFieldMetrics,
  isSelected,
  onTap,
  onDoubleTap,
  onLongPress,
  onPositionChange,
  onMeasure,
}) {
  const lastTapRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastSizeRef = useRef({ width: 0, height: 0 });

  const metrics = useMemo(() => {
    return getFieldMetrics ? getFieldMetrics(field) : null;
  }, [field, getFieldMetrics]);

  const displayText = useMemo(() => {
    const rawText = metrics?.text ?? '';
    if (!rawText.length) return '';
    return rawText
      .split('\n')
      .map((line) => line.replace(/ +$/g, (match) => '\u00A0'.repeat(match.length)))
      .join('\n');
  }, [metrics?.text]);
  const isMultiline = useMemo(
    () =>
      field?.field_type === 'text_multiline' ||
      field?.type === 'text_multiline' ||
      displayText.includes('\n'),
    [displayText, field?.field_type, field?.type]
  );

  const style = useMemo(() => {
    if (!metrics || !imageLayout?.width || !imageLayout?.height) return null;
    const left = (Number(field?.x ?? 0) / 100) * imageLayout.width;
    const top = (Number(field?.y ?? 0) / 100) * imageLayout.height;
    return { left, top };
  }, [field?.x, field?.y, imageLayout?.height, imageLayout?.width, metrics]);

  const textStyle = useMemo(
    () =>
      getFieldTextStyle({
        fontSize: metrics?.fontSize,
        fontFamily: metrics?.fontFamily,
        isBold: metrics?.isBold,
        color: '#111827',
      }),
    [metrics?.fontFamily, metrics?.fontSize, metrics?.isBold]
  );

  const handleLayout = useCallback(
    (event) => {
      if (field?.id === null || field?.id === undefined || !onMeasure) return;
      const { width, height } = event.nativeEvent.layout || {};
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      if (
        Math.abs(lastSizeRef.current.width - width) < 0.5 &&
        Math.abs(lastSizeRef.current.height - height) < 0.5
      ) {
        return;
      }
      lastSizeRef.current = { width, height };
      onMeasure(field.id, { width, height });
    },
    [field?.id, onMeasure]
  );

  const handlePress = () => {
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current < 300) {
      onDoubleTap?.(field);
      lastTapRef.current = null;
      return;
    }
    lastTapRef.current = now;
    onTap?.(field);
  };

  const onDragEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    {
      useNativeDriver: false,
      listener: (event) => {
        const { translationX, translationY } = event.nativeEvent;
        setDragOffset({ x: translationX, y: translationY });
        if (!isDragging) setIsDragging(true);
      },
    }
  );

  const onDragStateChange = (event) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      setIsDragging(true);
      return;
    }
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationX, translationY } = event.nativeEvent;
      if (imageLayout?.width && imageLayout?.height && onPositionChange) {
        const nextX = (Number(field?.x ?? 0) + (translationX / imageLayout.width) * 100);
        const nextY = (Number(field?.y ?? 0) + (translationY / imageLayout.height) * 100);
        onPositionChange({
          x: Math.max(0, Math.min(100, nextX)),
          y: Math.max(0, Math.min(100, nextY)),
        });
      }
      translateX.setValue(0);
      translateY.setValue(0);
      setDragOffset({ x: 0, y: 0 });
      setIsDragging(false);
    }
  };

  const displayCoords = useMemo(() => {
    if (!imageLayout?.width || !imageLayout?.height) return null;
    const nextX = (Number(field?.x ?? 0) + (dragOffset.x / imageLayout.width) * 100);
    const nextY = (Number(field?.y ?? 0) + (dragOffset.y / imageLayout.height) * 100);
    return {
      x: Math.max(0, Math.min(100, nextX)),
      y: Math.max(0, Math.min(100, nextY)),
    };
  }, [dragOffset.x, dragOffset.y, field?.x, field?.y, imageLayout?.height, imageLayout?.width]);

  if (!style || !metrics) return null;

  return (
    <PanGestureHandler
      minDist={4}
      enabled={Boolean(onPositionChange)}
      onGestureEvent={onDragEvent}
      onHandlerStateChange={onDragStateChange}
    >
      <Animated.View
        style={[
          styles.container,
          style,
          {
            transform: [{ translateX }, { translateY }],
            borderColor: isDragging || isSelected ? '#2196F3' : '#4CAF50',
            borderWidth: isDragging || isSelected ? 2 : 1,
            borderStyle: isDragging || isSelected ? 'solid' : 'dashed',
            backgroundColor: isDragging || isSelected ? 'rgba(33, 150, 243, 0.15)' : 'rgba(76, 175, 80, 0.15)',
          },
        ]}
        onLayout={handleLayout}
      >
        {isDragging && displayCoords && (
          <View style={styles.coordsBadge}>
            <Text style={styles.coordsText}>
              {displayCoords.x.toFixed(1)}% , {displayCoords.y.toFixed(1)}%
            </Text>
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handlePress}
          onLongPress={() => onLongPress?.(field)}
          style={styles.touchArea}
        >
          <Text
            style={textStyle}
            numberOfLines={isMultiline ? undefined : 1}
            ellipsizeMode={isMultiline ? undefined : 'clip'}
          >
            {displayText}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    borderRadius: 4,
    alignSelf: 'flex-start',
    margin: 0,
  },
  touchArea: {
    alignSelf: 'flex-start',
    paddingHorizontal: 2,
    paddingVertical: 1,
    margin: 0,
  },
  coordsBadge: {
    position: 'absolute',
    top: -20,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#2563eb',
    borderRadius: 4,
    zIndex: 2,
  },
  coordsText: {
    color: '#fff',
    fontSize: 10,
  },
});
