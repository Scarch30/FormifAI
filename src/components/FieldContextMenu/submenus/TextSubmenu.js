import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import BackButton from '../BackButton';

const LINE_COUNT_OPTIONS = [1, 2, 3];
const DEBUG_IME = false;

const TextSubmenu = ({
  field,
  labelValue,
  onTextChange,
  onTextCommit,
  onFontSizeChange,
  onLineCountChange,
  onUpdateField,
  onBack,
}) => {
  const inputRef = useRef(null);

  // Use local state to avoid IME composition conflicts on Android.
  // The TextInput is controlled by localText, and we sync changes to parent.
  const labelText = field?.field_label || '';
  const initialValue = labelValue !== null && labelValue !== undefined ? labelValue : labelText;
  const [localText, setLocalText] = useState(initialValue);
  const isInitializedRef = useRef(false);

  // Initialize local state once when component mounts
  useEffect(() => {
    if (!isInitializedRef.current) {
      setLocalText(initialValue);
      isInitializedRef.current = true;
    }
  }, [initialValue]);

  useEffect(() => {
    // Auto-focus the input when submenu opens
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const logIme = (label, payload) => {
    if (!DEBUG_IME) return;
    console.log(`[IME] ${label}`, payload);
  };

  // Called on every keystroke — update local state immediately,
  // then notify parent asynchronously.
  const handleTextChangeLocal = (text) => {
    const next = String(text ?? '');
    logIme('localChange', next);
    setLocalText(next);
    if (onTextChange) {
      onTextChange(next);
    }
  };

  const handleCommit = () => {
    if (onTextCommit) {
      onTextCommit();
    }
  };

  const handleFontSizeDecrease = () => {
    if (onFontSizeChange) {
      onFontSizeChange(-1);
    }
  };

  const handleFontSizeIncrease = () => {
    if (onFontSizeChange) {
      onFontSizeChange(1);
    }
  };

  const handleIndentDecrease = () => {
    if (onUpdateField) {
      const current = field?.next_lines_indent || 0;
      onUpdateField({ next_lines_indent: Math.max(0, current - 5) });
    }
  };

  const handleIndentIncrease = () => {
    if (onUpdateField) {
      const current = field?.next_lines_indent || 0;
      onUpdateField({ next_lines_indent: current + 5 });
    }
  };

  const handleLineHeightDecrease = () => {
    if (onUpdateField) {
      const current = field?.line_height || 1.2;
      onUpdateField({ line_height: Math.max(0.8, Math.round((current - 0.1) * 10) / 10) });
    }
  };

  const handleLineHeightIncrease = () => {
    if (onUpdateField) {
      const current = field?.line_height || 1.2;
      onUpdateField({ line_height: Math.round((current + 0.1) * 10) / 10 });
    }
  };

  const handleLineCountSelect = (count) => {
    if (onLineCountChange) {
      onLineCountChange(count);
    }
  };

  const handleLineCountAdd = () => {
    const currentCount = field?.line_count || 1;
    if (onLineCountChange) {
      onLineCountChange(currentCount + 1);
    }
  };

  const fontSize = field?.font_size || 12;
  const lineCount = field?.line_count || 1;
  const indent = field?.next_lines_indent || 0;
  const lineHeight = field?.line_height || 1.2;

  return (
    <View style={styles.container}>
      <BackButton onBack={onBack} />

      {/* Label input */}
      <View style={styles.section}>
        <Text style={styles.label}>Label du champ</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={localText}
          onChangeText={handleTextChangeLocal}
          onBlur={handleCommit}
          onEndEditing={handleCommit}
          onSubmitEditing={handleCommit}
          placeholder="Texte du champ..."
          placeholderTextColor="#666"
          multiline={lineCount > 1}
          numberOfLines={Math.min(lineCount, 3)}
          autoCapitalize="sentences"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          disableFullscreenUI
          textAlignVertical="center"
        />
      </View>

      {/* Font size and Indent controls - side by side */}
      <View style={styles.rowSection}>
        {/* Font size */}
        <View style={styles.halfSection}>
          <Text style={styles.label}>Taille police</Text>
          <View style={styles.compactControls}>
            <TouchableOpacity style={styles.smallButton} onPress={handleFontSizeDecrease}>
              <Text style={styles.smallButtonText}>-</Text>
            </TouchableOpacity>
            <View style={styles.compactValueContainer}>
              <Text style={styles.compactValue}>{fontSize}px</Text>
            </View>
            <TouchableOpacity style={styles.smallButton} onPress={handleFontSizeIncrease}>
              <Text style={styles.smallButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Indent */}
        <View style={styles.halfSection}>
          <Text style={styles.label}>Retrait 1re ligne</Text>
          <View style={styles.compactControls}>
            <TouchableOpacity style={styles.smallButton} onPress={handleIndentDecrease}>
              <Text style={styles.smallButtonText}>-</Text>
            </TouchableOpacity>
            <View style={styles.compactValueContainer}>
              <Text style={styles.compactValue}>{indent}px</Text>
            </View>
            <TouchableOpacity style={styles.smallButton} onPress={handleIndentIncrease}>
              <Text style={styles.smallButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Line height controls */}
      <View style={styles.section}>
        <Text style={styles.label}>Interligne</Text>
        <View style={styles.compactControls}>
          <TouchableOpacity style={styles.smallButton} onPress={handleLineHeightDecrease}>
            <Text style={styles.smallButtonText}>-</Text>
          </TouchableOpacity>
          <View style={styles.compactValueContainer}>
            <Text style={styles.compactValue}>{lineHeight.toFixed(1)}</Text>
          </View>
          <TouchableOpacity style={styles.smallButton} onPress={handleLineHeightIncrease}>
            <Text style={styles.smallButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Line count controls */}
      <View style={styles.section}>
        <Text style={styles.label}>Lignes</Text>
        <View style={styles.lineControls}>
          {LINE_COUNT_OPTIONS.map((count) => (
            <TouchableOpacity
              key={count}
              style={[
                styles.lineButton,
                lineCount === count && styles.lineButtonActive,
              ]}
              onPress={() => handleLineCountSelect(count)}
            >
              <Text
                style={[
                  styles.lineButtonText,
                  lineCount === count && styles.lineButtonTextActive,
                ]}
              >
                {count}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.lineButton} onPress={handleLineCountAdd}>
            <Text style={styles.lineButtonText}>+</Text>
          </TouchableOpacity>
          {lineCount > 3 && (
            <View style={styles.lineCountBadge}>
              <Text style={styles.lineCountBadgeText}>{lineCount}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Full width - no minWidth
  },
  section: {
    marginBottom: 12,
  },
  rowSection: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  halfSection: {
    flex: 1,
    marginRight: 8,
  },
  label: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  input: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  compactControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallButton: {
    width: 32,
    height: 32,
    backgroundColor: '#444',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  compactValueContainer: {
    flex: 1,
    height: 32,
    backgroundColor: '#333',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  compactValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  lineControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineButton: {
    width: 40,
    height: 36,
    backgroundColor: '#444',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  lineButtonActive: {
    backgroundColor: '#2196F3',
  },
  lineButtonText: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '500',
  },
  lineButtonTextActive: {
    color: '#fff',
  },
  lineCountBadge: {
    backgroundColor: '#2196F3',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
  },
  lineCountBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default TextSubmenu;
