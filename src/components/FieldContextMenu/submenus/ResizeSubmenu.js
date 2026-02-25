import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import BackButton from '../BackButton';

const ResizeSubmenu = ({ field, onResize, onBack }) => {
  const handleWidthChange = (delta) => {
    if (onResize) {
      onResize('width', delta);
    }
  };

  const handleHeightChange = (delta) => {
    if (onResize) {
      onResize('height', delta);
    }
  };

  const widthValue = Math.round(field?.width || 0);
  const heightValue = Math.round(field?.height || 0);

  return (
    <View style={styles.container}>
      <BackButton onBack={onBack} />

      {/* Width controls */}
      <View style={styles.row}>
        <Text style={styles.label}>Largeur</Text>
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.buttonLarge}
            onPress={() => handleWidthChange(-10)}
          >
            <Text style={styles.buttonText}>-10</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleWidthChange(-1)}
          >
            <Text style={styles.buttonText}>-</Text>
          </TouchableOpacity>
          <View style={styles.valueContainer}>
            <Text style={styles.value}>{widthValue}%</Text>
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleWidthChange(1)}
          >
            <Text style={styles.buttonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buttonLarge}
            onPress={() => handleWidthChange(10)}
          >
            <Text style={styles.buttonText}>+10</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Height controls */}
      <View style={styles.row}>
        <Text style={styles.label}>Hauteur</Text>
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.buttonLarge}
            onPress={() => handleHeightChange(-10)}
          >
            <Text style={styles.buttonText}>-10</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleHeightChange(-1)}
          >
            <Text style={styles.buttonText}>-</Text>
          </TouchableOpacity>
          <View style={styles.valueContainer}>
            <Text style={styles.value}>{heightValue}px</Text>
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleHeightChange(1)}
          >
            <Text style={styles.buttonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buttonLarge}
            onPress={() => handleHeightChange(10)}
          >
            <Text style={styles.buttonText}>+10</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // Full width - no minWidth
  },
  row: {
    marginBottom: 12,
  },
  label: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: 36,
    height: 36,
    backgroundColor: '#444',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 3,
  },
  buttonLarge: {
    width: 44,
    height: 36,
    backgroundColor: '#444',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  valueContainer: {
    minWidth: 60,
    height: 36,
    backgroundColor: '#333',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  value: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ResizeSubmenu;
