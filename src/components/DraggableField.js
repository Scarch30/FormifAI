import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { formatFieldLabel } from '../utils/fieldUtils';

const DEFAULT_WIDTH = 20;
const DEFAULT_HEIGHT = 8;
const MIN_SIZE = 1;

const isNumber = (value) => typeof value === 'number' && !Number.isNaN(value);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeField = (field) => {
  const width = isNumber(field?.width) ? field.width : DEFAULT_WIDTH;
  const height = isNumber(field?.height) ? field.height : DEFAULT_HEIGHT;
  const x = isNumber(field?.x) ? field.x : (100 - width) / 2;
  const y = isNumber(field?.y) ? field.y : (100 - height) / 2;
  return {
    x: clamp(x, 0, 100 - width),
    y: clamp(y, 0, 100 - height),
    width: clamp(width, MIN_SIZE, 100),
    height: clamp(height, MIN_SIZE, 100),
  };
};

const applyResize = (start, deltaX, deltaY, handle) => {
  let { x, y, width, height } = start;

  if (handle.includes('left')) {
    x += deltaX;
    width -= deltaX;
  }
  if (handle.includes('right')) {
    width += deltaX;
  }
  if (handle.includes('top')) {
    y += deltaY;
    height -= deltaY;
  }
  if (handle.includes('bottom')) {
    height += deltaY;
  }

  width = Math.max(MIN_SIZE, width);
  height = Math.max(MIN_SIZE, height);

  x = clamp(x, 0, 100 - width);
  y = clamp(y, 0, 100 - height);

  return { x, y, width, height };
};

export default function DraggableField({
  field,
  onPositionChange,
  onPositionCommit,
  onInteractionStateChange,
  editable,
  variant = 'placed',
  onPress,
  scale = 1,
  containerSize,
}) {
  const safeScale = scale || 1;
  const containerWidth = containerSize?.width || 0;
  const containerHeight = containerSize?.height || 0;

  const normalized = useMemo(() => normalizeField(field), [field]);

  const dragStart = useRef(normalized);
  const resizeStart = useRef(normalized);

  if (!containerWidth || !containerHeight) {
    return null;
  }

  const left = (normalized.x / 100) * containerWidth;
  const top = (normalized.y / 100) * containerHeight;
  const width = (normalized.width / 100) * containerWidth;
  const height = (normalized.height / 100) * containerHeight;
  const minDimension = Math.max(1, Math.min(width, height));
  const labelFontSize = Math.max(6, Math.min(12, minDimension * 0.45));
  const labelLineHeight = Math.max(8, labelFontSize + 2);
  const fieldPadding = Math.max(2, Math.min(6, minDimension * 0.2));

  const label = formatFieldLabel(
    field?.field_name || field?.name || '',
    field?.field_label || field?.label || field?.field_name || field?.name || 'Champ'
  );

  const handleDragStateChange = (event) => {
    if (!editable) return;
    const { state, translationX, translationY } = event.nativeEvent;
    if (state === State.BEGAN) {
      dragStart.current = normalized;
      onInteractionStateChange?.(true);
    }
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      const deltaX = (translationX / safeScale / containerWidth) * 100;
      const deltaY = (translationY / safeScale / containerHeight) * 100;
      const start = dragStart.current || normalized;
      const nextX = clamp(start.x + deltaX, 0, 100 - normalized.width);
      const nextY = clamp(start.y + deltaY, 0, 100 - normalized.height);
      onPositionCommit?.(nextX, nextY, normalized.width, normalized.height);
      onInteractionStateChange?.(false);
    }
  };

  const handleDragEvent = (event) => {
    if (!editable) return;
    const { translationX, translationY } = event.nativeEvent;
    const deltaX = (translationX / safeScale / containerWidth) * 100;
    const deltaY = (translationY / safeScale / containerHeight) * 100;
    const start = dragStart.current || normalized;
    const nextX = clamp(start.x + deltaX, 0, 100 - normalized.width);
    const nextY = clamp(start.y + deltaY, 0, 100 - normalized.height);
    onPositionChange?.(nextX, nextY, normalized.width, normalized.height);
  };

  const handleResizeStateChange = (handle) => (event) => {
    if (!editable) return;
    const { state, translationX, translationY } = event.nativeEvent;
    if (state === State.BEGAN) {
      resizeStart.current = normalized;
      onInteractionStateChange?.(true);
    }
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      const deltaX = (translationX / safeScale / containerWidth) * 100;
      const deltaY = (translationY / safeScale / containerHeight) * 100;
      const start = resizeStart.current || normalized;
      const next = applyResize(start, deltaX, deltaY, handle);
      onPositionCommit?.(next.x, next.y, next.width, next.height);
      onInteractionStateChange?.(false);
    }
  };

  const handleResizeEvent = (handle) => (event) => {
    if (!editable) return;
    const { translationX, translationY } = event.nativeEvent;
    const deltaX = (translationX / safeScale / containerWidth) * 100;
    const deltaY = (translationY / safeScale / containerHeight) * 100;
    const start = resizeStart.current || normalized;
    const next = applyResize(start, deltaX, deltaY, handle);
    onPositionChange?.(next.x, next.y, next.width, next.height);
  };

  const VARIANT_STYLES = {
    selected: {
      color: '#2563EB',
      background: 'rgba(37, 99, 235, 0.2)',
      borderWidth: 2,
    },
    placed: {
      color: '#10B981',
      background: 'rgba(16, 185, 129, 0.15)',
      borderWidth: 1,
    },
    unplaced: {
      color: '#111827',
      background: 'rgba(17, 24, 39, 0.12)',
      borderWidth: 1,
    },
  };
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.placed;
  const handleColor = variantStyle.color;

  const pressHandlers =
    onPress && !editable
      ? {
          onStartShouldSetResponder: () => true,
          onResponderRelease: onPress,
        }
      : null;

  const content = (
    <View
      style={[
        styles.field,
        {
          left,
          top,
          width,
          height,
          borderColor: handleColor,
          borderWidth: variantStyle.borderWidth,
          backgroundColor: variantStyle.background,
          padding: fieldPadding,
        },
      ]}
      {...pressHandlers}
    >
      <Text
        style={[
          styles.label,
          { color: handleColor, fontSize: labelFontSize, lineHeight: labelLineHeight },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {label}
      </Text>
      {editable && (
        <>
          {HANDLE_CONFIGS.map((handle) => (
            <PanGestureHandler
              key={handle.key}
              onGestureEvent={handleResizeEvent(handle.key)}
              onHandlerStateChange={handleResizeStateChange(handle.key)}
            >
              <View
                style={[
                  styles.handle,
                  { backgroundColor: handleColor, borderColor: '#fff' },
                  handle.style,
                ]}
              />
            </PanGestureHandler>
          ))}
        </>
      )}
    </View>
  );

  if (!editable) {
    return content;
  }

  return (
    <PanGestureHandler onGestureEvent={handleDragEvent} onHandlerStateChange={handleDragStateChange}>
      {content}
    </PanGestureHandler>
  );
}

const HANDLE_SIZE = 14;
const HANDLE_OFFSET = HANDLE_SIZE / 2;

const HANDLE_CONFIGS = [
  {
    key: 'topLeft',
    style: { left: -HANDLE_OFFSET, top: -HANDLE_OFFSET },
  },
  {
    key: 'top',
    style: { left: '50%', top: -HANDLE_OFFSET, marginLeft: -HANDLE_OFFSET },
  },
  {
    key: 'topRight',
    style: { right: -HANDLE_OFFSET, top: -HANDLE_OFFSET },
  },
  {
    key: 'right',
    style: { right: -HANDLE_OFFSET, top: '50%', marginTop: -HANDLE_OFFSET },
  },
  {
    key: 'bottomRight',
    style: { right: -HANDLE_OFFSET, bottom: -HANDLE_OFFSET },
  },
  {
    key: 'bottom',
    style: { left: '50%', bottom: -HANDLE_OFFSET, marginLeft: -HANDLE_OFFSET },
  },
  {
    key: 'bottomLeft',
    style: { left: -HANDLE_OFFSET, bottom: -HANDLE_OFFSET },
  },
  {
    key: 'left',
    style: { left: -HANDLE_OFFSET, top: '50%', marginTop: -HANDLE_OFFSET },
  },
];

const styles = StyleSheet.create({
  field: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 6,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: 3,
    borderWidth: 1,
  },
});
