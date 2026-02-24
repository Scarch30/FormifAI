import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { getFieldTextStyle } from '../utils/fieldUtils';

const MIN_WIDTH = 50;
const MIN_HEIGHT = 8;
const PADDING_X = 2;
const PADDING_Y = 1;

export default function EditableField({
  initialText,
  position,
  fontSize,
  fontFamily,
  isBold,
  isMultiline = false,
  allowLineBreaks = false,
  onTextChange,
  onSizeChange,
  onPositionChange,
  onBlur,
  onDelete,
  imageLayout,
}) {
  const [text, setText] = useState(initialText ?? '');
  const [contentSize, setContentSize] = useState({ width: MIN_WIDTH, height: MIN_HEIGHT });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastReportedSize = useRef({ width: MIN_WIDTH, height: MIN_HEIGHT });

  const translateX = useMemo(() => new Animated.Value(0), []);
  const translateY = useMemo(() => new Animated.Value(0), []);

  const canInsertLineBreaks = isMultiline || allowLineBreaks;
  const hasLineBreaks = useMemo(() => String(text ?? '').includes('\n'), [text]);
  const useNativeContentSize = isMultiline;
  const maxWidth =
    isMultiline && imageLayout?.width ? imageLayout.width * 0.9 : null;

  useEffect(() => {
    setText((initialText ?? '').replace(/\u00A0/g, ' '));
  }, [initialText]);

  const inputKey = useMemo(
    () => `${fontSize}-${fontFamily || ''}-${isBold ? 'b' : 'n'}`,
    [fontFamily, fontSize, isBold]
  );

  const handleContentSizeChange = useCallback(
    (event) => {
      if (!useNativeContentSize) return;
      const { width, height } = event.nativeEvent.contentSize || {};
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      const rawWidth = width + PADDING_X * 2;
      const rawHeight = height + PADDING_Y * 2;
      const clampedWidth = Math.max(
        MIN_WIDTH,
        maxWidth ? Math.min(rawWidth, maxWidth) : rawWidth
      );
      const clampedHeight = Math.max(MIN_HEIGHT, rawHeight);
      setContentSize((prev) => {
        if (
          Math.abs(prev.width - clampedWidth) < 0.5 &&
          Math.abs(prev.height - clampedHeight) < 0.5
        ) {
          return prev;
        }
        return { width: clampedWidth, height: clampedHeight };
      });
    },
    [maxWidth, useNativeContentSize]
  );

  const measureText = useMemo(() => {
    const safeText = String(text ?? '');
    const base = safeText.length ? safeText : ' ';
    return base
      .split('\n')
      .map((line) => line.replace(/ +$/g, (match) => '\u00A0'.repeat(match.length)))
      .join('\n');
  }, [text]);

  const handleTextLayout = useCallback(
    (event) => {
      if (useNativeContentSize) return;
      const lines = event.nativeEvent?.lines || [];
      if (!lines.length) return;
      const maxLineWidth = lines.reduce((max, line) => {
        const width = Number.isFinite(line?.width) ? line.width : 0;
        return Math.max(max, width);
      }, 0);
      const explicitLineCount = String(text ?? '').split('\n').length;
      const lineCount = Math.max(lines.length, explicitLineCount);
      const lineHeight = fontSize;
      const rawWidth = maxLineWidth + PADDING_X * 2;
      const rawHeight = lineCount * lineHeight + PADDING_Y * 2;
      const clampedWidth = Math.max(
        MIN_WIDTH,
        maxWidth ? Math.min(rawWidth, maxWidth) : rawWidth
      );
      const clampedHeight = Math.max(MIN_HEIGHT, rawHeight);
      setContentSize((prev) => {
        if (
          Math.abs(prev.width - clampedWidth) < 0.5 &&
          Math.abs(prev.height - clampedHeight) < 0.5
        ) {
          return prev;
        }
        return { width: clampedWidth, height: clampedHeight };
      });
    },
    [fontSize, maxWidth, text, useNativeContentSize]
  );

  useEffect(() => {
    const nextSize = contentSize;
    if (
      Math.abs(lastReportedSize.current.width - nextSize.width) < 0.5 &&
      Math.abs(lastReportedSize.current.height - nextSize.height) < 0.5
    ) {
      return;
    }
    lastReportedSize.current = nextSize;
    onSizeChange?.(nextSize);
  }, [contentSize, onSizeChange]);

  const left = useMemo(() => {
    const width = imageLayout?.width || 0;
    return (Number(position?.x ?? 0) / 100) * width;
  }, [imageLayout?.width, position?.x]);

  const top = useMemo(() => {
    const height = imageLayout?.height || 0;
    return (Number(position?.y ?? 0) / 100) * height;
  }, [imageLayout?.height, position?.y]);

  const handleTextChange = (value) => {
    const nextValue = canInsertLineBreaks ? value : value.replace(/\n/g, ' ');
    setText(nextValue);
    onTextChange?.(nextValue);
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
      if (imageLayout?.width && imageLayout?.height) {
        const nextX =
          (position?.x ?? 0) + (translationX / imageLayout.width) * 100;
        const nextY =
          (position?.y ?? 0) + (translationY / imageLayout.height) * 100;
        onPositionChange?.({
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
    const nextX = (position?.x ?? 0) + (dragOffset.x / imageLayout.width) * 100;
    const nextY = (position?.y ?? 0) + (dragOffset.y / imageLayout.height) * 100;
    return {
      x: Math.max(0, Math.min(100, nextX)),
      y: Math.max(0, Math.min(100, nextY)),
    };
  }, [dragOffset.x, dragOffset.y, imageLayout?.height, imageLayout?.width, position?.x, position?.y]);

  const textStyle = useMemo(
    () =>
      getFieldTextStyle({
        fontSize,
        fontFamily,
        isBold,
        color: '#111827',
      }),
    [fontFamily, fontSize, isBold]
  );

  const inputWidth = Math.max(0, contentSize.width - PADDING_X * 2);
  const inputHeight = Math.max(0, contentSize.height - PADDING_Y * 2);

  return (
    <PanGestureHandler
      minDist={4}
      onGestureEvent={onDragEvent}
      onHandlerStateChange={onDragStateChange}
    >
      <Animated.View>
        <Text
          onTextLayout={handleTextLayout}
          pointerEvents="none"
          style={[styles.measureText, textStyle, { maxWidth: maxWidth || undefined }]}
        >
          {measureText}
        </Text>
        <Animated.View
          style={[
            styles.container,
            {
              left,
              top,
              transform: [{ translateX }, { translateY }],
              borderColor: isDragging ? '#2563eb' : '#60a5fa',
              borderWidth: isDragging ? 2 : 1,
              backgroundColor: 'rgba(37, 99, 235, 0.08)',
            },
          ]}
        >
          {isDragging && displayCoords && (
            <View style={styles.coordsBadge}>
              <Text style={styles.coordsText}>
                {displayCoords.x.toFixed(1)}% , {displayCoords.y.toFixed(1)}%
              </Text>
            </View>
          )}
          <TextInput
            key={inputKey}
            autoFocus
            value={text}
            onChangeText={handleTextChange}
            onBlur={onBlur}
            multiline={canInsertLineBreaks}
            numberOfLines={canInsertLineBreaks ? undefined : 1}
            scrollEnabled={false}
          blurOnSubmit={!canInsertLineBreaks}
          onSubmitEditing={!canInsertLineBreaks ? onBlur : undefined}
          onContentSizeChange={useNativeContentSize ? handleContentSizeChange : undefined}
          style={[
              styles.input,
              textStyle,
              {
                width: inputWidth,
                height: inputHeight,
                maxWidth: maxWidth || undefined,
                textAlignVertical: isMultiline || hasLineBreaks ? 'top' : 'center',
              },
            ]}
          />
        </Animated.View>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    borderRadius: 4,
    paddingHorizontal: PADDING_X,
    paddingVertical: PADDING_Y,
    margin: 0,
    alignSelf: 'flex-start',
  },
  input: {
    backgroundColor: 'transparent',
    color: '#111827',
    paddingHorizontal: 0,
    paddingVertical: 0,
    margin: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  measureText: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    opacity: 0,
  },
  coordsBadge: {
    position: 'absolute',
    top: -20,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  coordsText: {
    color: '#fff',
    fontSize: 10,
  },
});
