import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const FieldToolbar = ({
  field,
  isEditing,
  onStartEdit,
  onStopEdit,
  onMove,
  onResize,
  onFontSizeChange,
  onOpenConfig,
  onConfirm,
  onDelete,
  onDuplicate,
}) => {
  const [activeSubmenu, setActiveSubmenu] = useState(null);

  const toggleSubmenu = (menu) => {
    setActiveSubmenu(activeSubmenu === menu ? null : menu);
  };

  return (
    <View style={styles.container}>
      {/* Barre principale */}
      <View style={styles.mainBar}>
        {/* Éditer / Terminer */}
        {!isEditing ? (
          <ToolButton icon="✏️" label="Éditer" onPress={onStartEdit} />
        ) : (
          <ToolButton icon="✓" label="OK" onPress={onStopEdit} color="#4CAF50" />
        )}

        {/* Déplacer */}
        <ToolButton
          icon="↕️"
          label="Position"
          onPress={() => toggleSubmenu('move')}
          active={activeSubmenu === 'move'}
        />

        {/* Taille */}
        <ToolButton
          icon="⬜"
          label="Taille"
          onPress={() => toggleSubmenu('resize')}
          active={activeSubmenu === 'resize'}
        />

        {/* Police */}
        <ToolButton
          icon="A"
          label={`${field.font_size}px`}
          onPress={() => toggleSubmenu('font')}
          active={activeSubmenu === 'font'}
        />

        {/* Config */}
        <ToolButton icon="⚙️" label="Config" onPress={onOpenConfig} />

        {/* Dupliquer */}
        <ToolButton icon="📋" label="Copier" onPress={onDuplicate} />

        {/* Supprimer */}
        <ToolButton icon="🗑️" label="Suppr" onPress={onDelete} color="#f44336" />
      </View>

      {/* Sous-menu Déplacement */}
      {activeSubmenu === 'move' && (
        <View style={styles.submenu}>
          <View style={styles.arrowGrid}>
            <View style={styles.arrowRow}>
              <View style={styles.arrowSpacer} />
              <ArrowButton direction="up" onPress={() => onMove('up')} />
              <View style={styles.arrowSpacer} />
            </View>
            <View style={styles.arrowRow}>
              <ArrowButton direction="left" onPress={() => onMove('left')} />
              <View style={styles.arrowCenter}>
                <Text style={styles.arrowCenterText}>0.5%</Text>
              </View>
              <ArrowButton direction="right" onPress={() => onMove('right')} />
            </View>
            <View style={styles.arrowRow}>
              <View style={styles.arrowSpacer} />
              <ArrowButton direction="down" onPress={() => onMove('down')} />
              <View style={styles.arrowSpacer} />
            </View>
          </View>
        </View>
      )}

      {/* Sous-menu Taille */}
      {activeSubmenu === 'resize' && (
        <View style={styles.submenu}>
          <View style={styles.resizeRow}>
            <Text style={styles.resizeLabel}>Largeur</Text>
            <TouchableOpacity style={styles.resizeBtn} onPress={() => onResize('width', 10)}>
              <Text style={styles.resizeBtnText}>+10</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resizeBtn} onPress={() => onResize('width', -1)}>
              <Text style={styles.resizeBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.resizeValue}>{Math.round(field.width)}%</Text>
            <TouchableOpacity style={styles.resizeBtn} onPress={() => onResize('width', 1)}>
              <Text style={styles.resizeBtnText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resizeBtn} onPress={() => onResize('width', -10)}>
              <Text style={styles.resizeBtnText}>−10</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.resizeRow}>
            <Text style={styles.resizeLabel}>Hauteur</Text>
            <TouchableOpacity style={styles.resizeBtn} onPress={() => onResize('height', 5)}>
              <Text style={styles.resizeBtnText}>+5</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resizeBtn} onPress={() => onResize('height', -1)}>
              <Text style={styles.resizeBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.resizeValue}>{Math.round(field.height)}px</Text>
            <TouchableOpacity style={styles.resizeBtn} onPress={() => onResize('height', 1)}>
              <Text style={styles.resizeBtnText}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resizeBtn} onPress={() => onResize('height', -5)}>
              <Text style={styles.resizeBtnText}>−5</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Sous-menu Police */}
      {activeSubmenu === 'font' && (
        <View style={styles.submenu}>
          <View style={styles.fontRow}>
            <TouchableOpacity style={styles.fontBtn} onPress={() => onFontSizeChange(-1)}>
              <Text style={styles.fontBtnText}>A−</Text>
            </TouchableOpacity>
            <Text style={styles.fontValue}>{field.font_size}px</Text>
            <TouchableOpacity style={styles.fontBtn} onPress={() => onFontSizeChange(1)}>
              <Text style={styles.fontBtnText}>A+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.fontPresets}>
            {[8, 10, 12, 14, 16, 20, 24].map((size) => (
              <TouchableOpacity
                key={size}
                style={[styles.fontPreset, field.font_size === size && styles.fontPresetActive]}
                onPress={() => onFontSizeChange(size - field.font_size)}
              >
                <Text style={styles.fontPresetText}>{size}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

// Composants internes
const ToolButton = ({ icon, label, onPress, active, color }) => (
  <TouchableOpacity style={[styles.toolBtn, active && styles.toolBtnActive]} onPress={onPress}>
    <Text style={[styles.toolIcon, color && { color }]}>{icon}</Text>
    <Text style={[styles.toolLabel, color && { color }]}>{label}</Text>
  </TouchableOpacity>
);

const ArrowButton = ({ direction, onPress }) => {
  const arrows = { up: '↑', down: '↓', left: '←', right: '→' };
  return (
    <TouchableOpacity style={styles.arrowBtn} onPress={onPress}>
      <Text style={styles.arrowBtnText}>{arrows[direction]}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#1a1a1a',
  },
  mainBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  toolBtn: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  toolBtnActive: {
    backgroundColor: '#333',
  },
  toolIcon: {
    fontSize: 18,
    color: '#fff',
  },
  toolLabel: {
    fontSize: 9,
    color: '#aaa',
    marginTop: 2,
  },
  submenu: {
    backgroundColor: '#2a2a2a',
    padding: 12,
  },
  arrowGrid: {
    alignItems: 'center',
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowSpacer: {
    width: 50,
    height: 50,
  },
  arrowBtn: {
    width: 50,
    height: 50,
    backgroundColor: '#444',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 2,
  },
  arrowBtnText: {
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
    fontSize: 10,
  },
  resizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  resizeLabel: {
    color: '#aaa',
    width: 54,
  },
  resizeBtn: {
    width: 34,
    height: 34,
    backgroundColor: '#444',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  resizeBtnText: {
    color: '#fff',
    fontSize: 14,
  },
  resizeValue: {
    color: '#fff',
    minWidth: 48,
    textAlign: 'center',
    fontSize: 13,
  },
  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  fontBtn: {
    width: 50,
    height: 40,
    backgroundColor: '#444',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontBtnText: {
    color: '#fff',
    fontSize: 16,
  },
  fontValue: {
    color: '#fff',
    marginHorizontal: 16,
    fontSize: 18,
  },
  fontPresets: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  fontPreset: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#444',
    borderRadius: 4,
    marginHorizontal: 2,
  },
  fontPresetActive: {
    backgroundColor: '#2196F3',
  },
  fontPresetText: {
    color: '#fff',
    fontSize: 12,
  },
});

export default FieldToolbar;
