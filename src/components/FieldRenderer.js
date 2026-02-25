import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, TextInput, Platform, View } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const FIELD_TYPE_CHECKBOX = 'checkbox';
const FIELD_TYPE_RADIO = 'radio';

const normalizeFieldType = (value) => String(value || 'text').trim().toLowerCase();

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

const FieldRenderer = ({
  field,
  state, // 'placed' | 'selected' | 'editing'
  labelOverride,
  imageLayout,
  scale = 1,
  onTextChange,
  onBlur,
  inputRef,
  onPress,
  onDoublePress,
  onDragStart,
  onDragEnd,
  dragGestureRef,
  onAutoSize,
  dragging = false,
  dragPanEnabled = false,
  onDragPanGestureEvent,
  onDragPanStateChange,
  dragPanSimultaneousHandlers,
  dragPanActivateAfterLongPress,
  multiSelected = false, // New prop for multi-selection visual state
}) => {
  const lastTapRef = useRef(null);
  const dragStartRef = useRef({ x: field?.x ?? 0, y: field?.y ?? 0 });
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [isDragging, setIsDragging] = useState(false);
  const lastAutoSizeRef = useRef({ width: 0, height: 0 });
  // Live editing width: when typing expands beyond field width, this tracks
  // the measured text width in pixels so the container grows immediately.
  const [editWidthPx, setEditWidthPx] = useState(null);
  const [editValue, setEditValue] = useState(null);
  const wasEditingRef = useRef(false);
  const panRef = useRef(null);

  // Manual long press implementation (activateAfterLongPress is broken in RNGH 2.28)
  const longPressTimerRef = useRef(null);
  const longPressActiveRef = useRef(false);
  const touchStartPosRef = useRef(null);

  // Reset live width when returning to placed state (deselected)
  useEffect(() => {
    if (state === 'placed') {
      setEditWidthPx(null);
      lastAutoSizeRef.current = { width: 0, height: 0 };
    }
  }, [state]);

  useEffect(() => {
    const isEditing = state === 'editing';
    if (isEditing && !wasEditingRef.current) {
      setEditValue(String(field?.field_label ?? ''));
    }
    if (!isEditing && wasEditingRef.current) {
      setEditValue(null);
    }
    wasEditingRef.current = isEditing;
  }, [state, field]);

  const {
    x,
    y,
    width,
    height,
    font_family,
    font_size,
    text_color,
    text_align,
    line_height,
    line_count,
    next_lines_indent,
    field_label,
    field_type,
    is_checked_default,
  } = field;
  const normalizedFieldType = normalizeFieldType(field_type);
  const isCheckboxType = normalizedFieldType === FIELD_TYPE_CHECKBOX;
  const isRadioType = normalizedFieldType === FIELD_TYPE_RADIO;
  const isBooleanType = isCheckboxType || isRadioType;
  const isChecked = isCheckboxType
    ? coerceBoolean(is_checked_default, false)
    : coerceBoolean(field_label, false);

  const layoutWidth = imageLayout?.width ?? 0;
  const layoutHeight = imageLayout?.height ?? 0;
  const hasLayout = layoutWidth > 0 && layoutHeight > 0;

  // Convertir les positions/dimensions en pixels
  const pixelX = (x / 100) * layoutWidth;
  const pixelY = (y / 100) * layoutHeight;
  const pixelWidth = (width / 100) * layoutWidth;
  const maxMeasureWidth = Math.max(0, layoutWidth - pixelX);
  const safeLineCount = Math.max(1, parseInt(line_count || 1, 10) || 1);
  const lineHeightPx = (font_size || 12) * (line_height || 1.2);
  const fallbackHeight = safeLineCount * lineHeightPx;
  const pixelHeight = Number.isFinite(height) && height > 0 ? height : fallbackHeight;
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const allowMultiline = !isBooleanType;
  const indentWidth = Math.max(0, Number(next_lines_indent) || 0);
  const showIndentOverlay = indentWidth > 0 && lineHeightPx > 0;
  const editingIndentStyle = indentWidth ? { paddingLeft: indentWidth } : null;
  const measureIndentStyle = indentWidth ? { paddingLeft: indentWidth } : null;
  const indentOverlayStyle = showIndentOverlay
    ? {
        position: 'absolute',
        left: 0,
        top: 0,
        width: indentWidth,
        height: Math.min(pixelHeight, lineHeightPx),
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
      }
    : null;

  // Style du conteneur
  const containerStyle = {
    position: 'absolute',
    left: pixelX,
    top: pixelY,
    width: pixelWidth,
    height: pixelHeight,
    backgroundColor:
      multiSelected
        ? 'rgba(59, 130, 246, 0.08)' // Blue for multi-selected
        : state === 'placed'
        ? 'rgba(76, 175, 80, 0.1)'
        : state === 'selected'
        ? 'rgba(33, 150, 243, 0.15)'
        : 'rgba(255, 193, 7, 0.1)',
    borderWidth: multiSelected ? 2 : state === 'placed' ? 1 : 2,
    borderColor: multiSelected
      ? '#3B82F6' // Blue for multi-selected
      : state === 'placed'
      ? '#4CAF50'
      : state === 'selected'
      ? '#2196F3'
      : '#FFC107',
    borderStyle: multiSelected ? 'solid' : state === 'placed' ? 'dashed' : 'solid',
    overflow: 'visible',
    justifyContent: 'center',
  };
  if (dragging) {
    containerStyle.borderWidth = 3;
    containerStyle.borderColor = '#2563eb';
    containerStyle.backgroundColor = 'rgba(37, 99, 235, 0.18)';
  }

  const handlePress = () => {
    if (isDragging || (!onPress && !onDoublePress)) return;
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current < 250) {
      lastTapRef.current = null;
      onDoublePress?.(field);
      return;
    }
    lastTapRef.current = now;
    onPress?.(field);
  };

  const onDragEvent = (event) => {
    const { translationX, translationY } = event.nativeEvent;
    translateX.setValue(translationX / safeScale);
    translateY.setValue(translationY / safeScale);
  };

  const onDragStateChange = (event) => {
    const { state: gestureState, oldState, translationX, translationY } = event.nativeEvent;
    if (gestureState === State.BEGAN) {
      dragStartRef.current = {
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
      };
    }
    if (gestureState === State.ACTIVE) {
      setIsDragging(true);
      onDragStart?.(field);
      return;
    }
    if (oldState === State.ACTIVE) {
      const deltaX = translationX / safeScale;
      const deltaY = translationY / safeScale;
      const start = dragStartRef.current || { x: Number(x) || 0, y: Number(y) || 0 };
      const maxX = 100 - (Number.isFinite(width) ? width : 0);
      const maxY = layoutHeight
        ? 100 - (pixelHeight / layoutHeight) * 100
        : 100;
      const nextX = clamp(
        start.x + (deltaX / layoutWidth) * 100,
        0,
        Math.max(0, maxX)
      );
      const nextY = clamp(
        start.y + (deltaY / layoutHeight) * 100,
        0,
        Math.max(0, maxY)
      );
      onDragEnd?.(field, { x: nextX, y: nextY });
      translateX.setValue(0);
      translateY.setValue(0);
      setIsDragging(false);
      return;
    }
    if (gestureState === State.CANCELLED || gestureState === State.FAILED) {
      translateX.setValue(0);
      translateY.setValue(0);
      setIsDragging(false);
    }
  };

  // Style du texte (identique pour Text et TextInput)
  const textStyle = {
    fontFamily: font_family || 'Helvetica',
    fontSize: font_size || 12,
    color: text_color || '#000000',
    textAlign: text_align || 'left',
    lineHeight: (font_size || 12) * (line_height || 1.2),
    padding: 0,
    margin: 0,
    ...(Platform.OS === 'android' && {
      includeFontPadding: false,
      textAlignVertical: 'center',
    }),
  };
  const measureStyle = {
    ...textStyle,
    textAlign: 'left',
  };

  const renderIndentedLines = (text) => {
    const lines = String(text ?? '').split('\n');
    return lines.map((line, index) => (
      <Text
        key={`line-${index}`}
        style={[
          textStyle,
          index === 0 && indentWidth ? { paddingLeft: indentWidth } : null,
        ]}
      >
        {line || ' '}
      </Text>
    ));
  };

  const renderSpecialIndicator = () => {
    if (!isBooleanType) return null;
    if (isCheckboxType) {
      return (
        <Text
          style={{
            fontSize: Math.max(12, Math.min(pixelWidth, pixelHeight) * 0.62),
            fontWeight: '700',
            color: isChecked ? '#22C55E' : '#9CA3AF',
            textAlign: 'center',
          }}
        >
          {isChecked ? '☑' : '☐'}
        </Text>
      );
    }

    const radioSize = Math.max(10, Math.min(pixelWidth, pixelHeight) * 0.62);
    return (
      <View
        style={{
          width: radioSize,
          height: radioSize,
          borderRadius: 999,
          borderWidth: isChecked ? 0 : 1.5,
          borderColor: '#9CA3AF',
          backgroundColor: isChecked ? '#22C55E' : 'transparent',
        }}
      />
    );
  };

  // Texte à afficher
  const rawText = String(field_label || '');
  const displayText = rawText;
  const selectedText =
    state === 'selected' && labelOverride !== null && labelOverride !== undefined
      ? String(labelOverride)
      : displayText;
  const effectiveText =
    state === 'editing'
      ? editValue === null
        ? displayText
        : editValue
      : selectedText;

  const measureText = useMemo(() => {
    const raw = String(effectiveText ?? '');
    const base = raw.length ? raw : ' ';
    return base
      .split('\n')
      .map((line) => line.replace(/ +$/g, (match) => '\u00A0'.repeat(match.length)))
      .join('\n');
  }, [effectiveText]);

  // Approximate width calculation based on character count and font size.
  // This provides immediate feedback when text changes, without waiting for
  // the hidden <Text> onLayout callback (which can be delayed on Android IME).
  // Average character width is roughly 0.48 * fontSize for proportional fonts.
  const fontSize = font_size || 12;
  const approxCharWidth = fontSize * 0.48;
  const approxTextWidth = useMemo(() => {
    const text = String(effectiveText ?? '');
    if (!text.length) return 0;
    // Find the longest line
    const lines = text.split('\n');
    const maxLineLength = Math.max(...lines.map((line) => line.length));
    return maxLineLength * approxCharWidth + 5; // +5 for padding
  }, [effectiveText, approxCharWidth]);

  // Use approximate width to immediately update editWidthPx when text changes
  useEffect(() => {
    if (isBooleanType) return;
    if (state === 'editing' || state === 'selected') {
      const minWidth = pixelWidth;
      const maxWidth = layoutWidth - pixelX;
      const targetWidth = Math.min(Math.max(approxTextWidth, minWidth), maxWidth);
      setEditWidthPx((prev) => {
        // Only grow, never shrink from approximate calculation
        // (let the precise measurement handle shrinking)
        if (prev !== null && prev >= targetWidth) return prev;
        return targetWidth;
      });
    }
  }, [approxTextWidth, isBooleanType, state, pixelWidth, layoutWidth, pixelX]);

  // Measures the hidden <Text> that renders the same content without any width
  // constraint.  The reported width is the natural (single-line) text width.
  // We use it to:
  //   1. Immediately widen the editing container (via editWidthPx local state)
  //      so the user sees the field grow as they type.
  //   2. Notify the parent (via onAutoSize) so the field model is persisted
  //      with the new dimensions.
  const caretPaddingPx = Math.max(2, Math.round((font_size || 12) * 2));
  const handleMeasureLayout = useCallback(
    (event) => {
      const { width: mw, height: mh } = event.nativeEvent?.layout || {};
      if (!Number.isFinite(mw) || !Number.isFinite(mh)) return;
      const extraWidth = state === 'editing' ? caretPaddingPx : 2;
      const nextSize = { width: mw + extraWidth, height: mh + 2 };
      // Update local width immediately so the container grows in real-time
      // (both in editing mode and in selected mode when editing via menu)
      if (state === 'editing' || state === 'selected') {
        setEditWidthPx((prev) => {
          const next = nextSize.width;
          if (prev !== null && Math.abs(prev - next) < 1) return prev;
          return next;
        });
      }
      if (!onAutoSize) return;
      if (
        Math.abs(lastAutoSizeRef.current.width - nextSize.width) < 0.5 &&
        Math.abs(lastAutoSizeRef.current.height - nextSize.height) < 0.5
      ) {
        return;
      }
      lastAutoSizeRef.current = nextSize;
      onAutoSize(nextSize);
    },
    [onAutoSize, state, caretPaddingPx]
  );

  const shouldMeasure = Boolean(
    onAutoSize &&
      !isBooleanType &&
      (state === 'editing' || state === 'selected')
  );
  const measureNode = shouldMeasure ? (
    <Text
      onLayout={handleMeasureLayout}
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: -9999,
          top: -9999,
          opacity: 0,
          alignSelf: 'flex-start',
          ...(maxMeasureWidth > 0 ? { maxWidth: maxMeasureWidth } : null),
        },
        measureStyle,
        measureIndentStyle,
      ]}
    >
      {measureText}
    </Text>
  ) : null;

  if (!hasLayout) return null;

  // Rendu selon l'état
  if (state === 'editing') {
    if (isBooleanType) {
      return (
        <>
          {measureNode}
          <View style={containerStyle} pointerEvents="box-none">
            <Pressable
              onPress={handlePress}
              style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
            >
              {renderSpecialIndicator()}
            </Pressable>
          </View>
        </>
      );
    }

    const handleEditTextChange = (value) => {
      const nextValue = allowMultiline
        ? String(value ?? '')
        : String(value ?? '').replace(/\n/g, ' ');
      setEditValue(nextValue);
      onTextChange?.(nextValue);
    };

    const handleEditChangeEvent = (event) => {
      const nextText = event?.nativeEvent?.text ?? '';
      handleEditTextChange(nextText);
    };

    // Use the measured text width when it exceeds the field's stored width,
    // clamped to the right edge of the image.
    const maxEditWidth = layoutWidth - pixelX;
    const liveWidth = editWidthPx !== null
      ? Math.min(Math.max(editWidthPx, pixelWidth), maxEditWidth)
      : pixelWidth;

    const editContainerStyle = {
      ...containerStyle,
      width: liveWidth,
    };

    const handleContentSizeChange = (event) => {
      const { width: contentWidth } = event?.nativeEvent?.contentSize || {};
      if (!Number.isFinite(contentWidth)) return;
      const padded = contentWidth + caretPaddingPx;
      const next = Math.min(Math.max(padded, pixelWidth), maxEditWidth);
      setEditWidthPx((prev) => {
        if (prev !== null && Math.abs(prev - next) < 1) return prev;
        return next;
      });
    };

    return (
      <>
        {measureNode}
        <View style={editContainerStyle} pointerEvents="box-none">
          {indentOverlayStyle && <View pointerEvents="none" style={indentOverlayStyle} />}
          <TextInput
            ref={inputRef}
            value={effectiveText}
            onChange={handleEditChangeEvent}
            onContentSizeChange={handleContentSizeChange}
            onBlur={onBlur}
            style={[textStyle, editingIndentStyle, { width: '100%', height: '100%' }]}
            multiline
            autoFocus
            blurOnSubmit={false}
            scrollEnabled={false}
          />
        </View>
      </>
    );
  }

  // État PLACED ou SELECTED : afficher en Text
  // When dragPanEnabled, the PanGestureHandler wrapping this view needs to
  // receive touches, so we must NOT use pointerEvents="box-none" on the
  // Animated.View nor pointerEvents="none" on the Pressable.
  const needsTouchable = dragPanEnabled;

  // In selected state, if editWidthPx is set (from measure callback during
  // menu text editing), use it to widen the container in real-time.
  const maxSelectWidth = layoutWidth - pixelX;
  const selectedContainerStyle =
    state === 'selected' && !isBooleanType && editWidthPx !== null
      ? {
          ...containerStyle,
          width: Math.min(Math.max(editWidthPx, pixelWidth), maxSelectWidth),
        }
      : containerStyle;

  const content = (
    <Animated.View
      pointerEvents={needsTouchable ? 'auto' : 'box-none'}
      style={[
        selectedContainerStyle,
        { transform: [{ translateX }, { translateY }] },
        isDragging && { borderColor: '#2563eb', borderWidth: 2 },
      ]}
    >
      {!isBooleanType && indentOverlayStyle && <View pointerEvents="none" style={indentOverlayStyle} />}
      <Pressable
        onPress={handlePress}
        pointerEvents={needsTouchable ? 'auto' : 'none'}
        style={{
          width: '100%',
          height: '100%',
          justifyContent: 'center',
          alignItems: isBooleanType ? 'center' : 'stretch',
        }}
      >
        {isBooleanType ? (
          renderSpecialIndicator()
        ) : (
          <View style={{ width: '100%' }}>{renderIndentedLines(effectiveText)}</View>
        )}
      </Pressable>
      {multiSelected && (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', top: -3, left: -3, width: 6, height: 6, backgroundColor: '#3B82F6', borderRadius: 1 }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: -3, right: -3, width: 6, height: 6, backgroundColor: '#3B82F6', borderRadius: 1 }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: -3, left: -3, width: 6, height: 6, backgroundColor: '#3B82F6', borderRadius: 1 }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: -3, right: -3, width: 6, height: 6, backgroundColor: '#3B82F6', borderRadius: 1 }} />
        </>
      )}
    </Animated.View>
  );

  if (dragPanEnabled) {
    // Manual long press implementation because activateAfterLongPress is broken in RNGH 2.28
    // We track touch start, wait for the delay, then activate drag mode
    const longPressDelay = dragPanActivateAfterLongPress || 550;
    const maxMoveDuringWait = 15; // pixels - if user moves more, cancel the long press

    const handlePanStateChange = (event) => {
      const { state: gestureState, x, y, absoluteX, absoluteY } = event.nativeEvent;

      if (gestureState === State.BEGAN) {
        // Touch started - begin long press timer
        touchStartPosRef.current = { x: absoluteX, y: absoluteY };
        longPressActiveRef.current = false;

        // Clear any existing timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }

        // Start long press timer
        longPressTimerRef.current = setTimeout(() => {
          // Long press succeeded - activate drag mode
          longPressActiveRef.current = true;
          // Signal to parent that drag is starting
          onDragPanStateChange?.({
            nativeEvent: {
              state: State.ACTIVE,
              x,
              y,
              absoluteX: touchStartPosRef.current?.x || absoluteX,
              absoluteY: touchStartPosRef.current?.y || absoluteY,
              translationX: 0,
              translationY: 0,
            },
          });
        }, longPressDelay);
      } else if (gestureState === State.ACTIVE) {
        // Pan became active (user moved finger)
        // If long press already activated, this is fine - we're dragging
        // If not yet activated, check if we should cancel the timer
        if (!longPressActiveRef.current && touchStartPosRef.current) {
          const dx = Math.abs(absoluteX - touchStartPosRef.current.x);
          const dy = Math.abs(absoluteY - touchStartPosRef.current.y);
          if (dx > maxMoveDuringWait || dy > maxMoveDuringWait) {
            // User moved too much - cancel long press timer
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
          }
        }
      } else if (gestureState === State.END || gestureState === State.CANCELLED || gestureState === State.FAILED) {
        // Gesture ended
        // Clear timer if still running
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        // If we were in drag mode, signal end
        if (longPressActiveRef.current) {
          longPressActiveRef.current = false;
          onDragPanStateChange?.(event);
        }

        touchStartPosRef.current = null;
      }
    };

    const handlePanGestureEvent = (event) => {
      // Check if user moved too much before long press activated
      if (!longPressActiveRef.current && touchStartPosRef.current) {
        const { absoluteX, absoluteY } = event.nativeEvent;
        const dx = Math.abs(absoluteX - touchStartPosRef.current.x);
        const dy = Math.abs(absoluteY - touchStartPosRef.current.y);
        if (dx > maxMoveDuringWait || dy > maxMoveDuringWait) {
          // Cancel long press timer
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          return; // Don't forward event
        }
      }

      // Only forward pan events if long press has activated
      if (longPressActiveRef.current) {
        onDragPanGestureEvent?.(event);
      }
    };

    return (
      <>
        {measureNode}
        <PanGestureHandler
          ref={panRef}
          simultaneousHandlers={dragPanSimultaneousHandlers}
          minDist={0}
          enabled={dragPanEnabled}
          onGestureEvent={handlePanGestureEvent}
          onHandlerStateChange={handlePanStateChange}
        >
          {content}
        </PanGestureHandler>
      </>
    );
  }

  if (state === 'selected' && onDragEnd) {
    return (
      <>
        {measureNode}
        <PanGestureHandler
          ref={dragGestureRef}
          minDist={2}
          onGestureEvent={onDragEvent}
          onHandlerStateChange={onDragStateChange}
        >
          {content}
        </PanGestureHandler>
      </>
    );
  }

  return (
    <>
      {measureNode}
      {content}
    </>
  );
};

export default FieldRenderer;
