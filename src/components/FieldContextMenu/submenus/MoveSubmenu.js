import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import BackButton from '../BackButton';

const STEP_OPTIONS = [1, 5, 10];
const REPEAT_INTERVAL = 80;
const INITIAL_DELAY = 200;

const MoveSubmenu = ({ field, imageLayout, onMove, onBack }) => {
  const [stepSize, setStepSize] = useState(5);

  const handleMove = useCallback(
    (direction) => {
      if (!onMove || !imageLayout.width || !imageLayout.height) return;

      // Convert pixel step to percentage
      let stepPercent;
      if (direction === 'left' || direction === 'right') {
        stepPercent = (stepSize / imageLayout.width) * 100;
      } else {
        stepPercent = (stepSize / imageLayout.height) * 100;
      }

      onMove(direction, stepPercent);
    },
    [onMove, stepSize, imageLayout]
  );

  return (
    <View style={styles.container}>
      <BackButton onBack={onBack} />

      {/* Step size selector */}
      <View style={styles.stepRow}>
        <Text style={styles.stepLabel}>Pas:</Text>
        {STEP_OPTIONS.map((step) => (
          <TouchableOpacity
            key={step}
            style={[styles.stepButton, stepSize === step && styles.stepButtonActive]}
            onPress={() => setStepSize(step)}
          >
            <Text
              style={[
                styles.stepButtonText,
                stepSize === step && styles.stepButtonTextActive,
              ]}
            >
              {step}px
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Arrow grid */}
      <View style={styles.arrowGrid}>
        <View style={styles.arrowRow}>
          <View style={styles.arrowSpacer} />
          <ArrowButton direction="up" onMove={handleMove} />
          <View style={styles.arrowSpacer} />
        </View>
        <View style={styles.arrowRow}>
          <ArrowButton direction="left" onMove={handleMove} />
          <View style={styles.arrowCenter}>
            <Text style={styles.arrowCenterText}>{stepSize}px</Text>
          </View>
          <ArrowButton direction="right" onMove={handleMove} />
        </View>
        <View style={styles.arrowRow}>
          <View style={styles.arrowSpacer} />
          <ArrowButton direction="down" onMove={handleMove} />
          <View style={styles.arrowSpacer} />
        </View>
      </View>
    </View>
  );
};

const ArrowButton = ({ direction, onMove }) => {
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  const arrows = {
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
  };

  const startRepeating = useCallback(() => {
    // Initial move
    onMove(direction);

    // Start repeating after initial delay
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onMove(direction);
      }, REPEAT_INTERVAL);
    }, INITIAL_DELAY);
  }, [direction, onMove]);

  const stopRepeating = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return (
    <Pressable
      style={({ pressed }) => [styles.arrowButton, pressed && styles.arrowButtonPressed]}
      onPressIn={startRepeating}
      onPressOut={stopRepeating}
    >
      <Text style={styles.arrowButtonText}>{arrows[direction]}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    // Full width - no minWidth
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  stepLabel: {
    color: '#aaa',
    fontSize: 13,
    marginRight: 10,
  },
  stepButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#333',
    borderRadius: 6,
    marginHorizontal: 4,
  },
  stepButtonActive: {
    backgroundColor: '#2196F3',
  },
  stepButtonText: {
    color: '#aaa',
    fontSize: 12,
  },
  stepButtonTextActive: {
    color: '#fff',
  },
  arrowGrid: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowSpacer: {
    width: 50,
    height: 50,
  },
  arrowButton: {
    width: 50,
    height: 50,
    backgroundColor: '#444',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
  },
  arrowButtonPressed: {
    backgroundColor: '#555',
  },
  arrowButtonText: {
    fontSize: 24,
    color: '#fff',
  },
  arrowCenter: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowCenterText: {
    color: '#666',
    fontSize: 11,
  },
});

export default MoveSubmenu;
