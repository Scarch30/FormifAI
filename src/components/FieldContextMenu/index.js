import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import MoveSubmenu from './submenus/MoveSubmenu';
import ResizeSubmenu from './submenus/ResizeSubmenu';
import TextSubmenu from './submenus/TextSubmenu';
import ConfigSubmenu from './submenus/ConfigSubmenu';
import BackButton from './BackButton';

export const MENU_HEIGHT = 70;
export const SUBMENU_HEIGHTS = {
  move: 180,
  resize: 120,
  text: 200,
  config: 400,
};

const FieldContextMenu = ({
  field,
  imageLayout,
  viewportHeight,
  position,
  containerRef,
  allFields,
  onMove,
  onResize,
  onFontSizeChange,
  onLineCountChange,
  onTextChange,
  onTextCommit,
  labelValue,
  onUpdateField,
  onDelete,
  onDuplicate,
  onSave,
  configScrollMaxHeight,
  onTextSubmenuOpen,
  onTextSubmenuClose,
  onMenuActive,
  onMenuInactive,
  onSubmenuChange,
  forceCloseSubmenu,
  onLayout,
  onSelectGroup,
  onSelectRow,
  onSelectColumn,
  hasGroup = false,
}) => {
  const [activeSubmenu, setActiveSubmenu] = useState(null);

  // Notify parent when menu becomes active (on mount)
  React.useEffect(() => {
    if (onMenuActive) onMenuActive();
    return () => {
      if (onMenuInactive) onMenuInactive();
    };
  }, []);

  // Notify parent when submenu changes
  React.useEffect(() => {
    if (onSubmenuChange) onSubmenuChange(activeSubmenu);
  }, [activeSubmenu, onSubmenuChange]);

  // Close submenu when parent requests it
  React.useEffect(() => {
    if (forceCloseSubmenu && activeSubmenu !== null) {
      setActiveSubmenu(null);
    }
  }, [forceCloseSubmenu]);

  const handleSubmenuOpen = (submenu) => {
    setActiveSubmenu(submenu);
    if (submenu === 'text' && onTextSubmenuOpen) {
      onTextSubmenuOpen();
    }
  };

  const handleBack = () => {
    if (activeSubmenu === 'text' && onTextCommit) {
      onTextCommit();
    }
    if (activeSubmenu === 'text' && onTextSubmenuClose) {
      onTextSubmenuClose();
    }
    setActiveSubmenu(null);
  };

  // Stop event propagation to prevent deselecting the field
  const handleContainerPress = (e) => {
    e.stopPropagation();
  };

  if (!field) return null;

  const renderSubmenu = () => {
    switch (activeSubmenu) {
      case 'move':
        return (
          <MoveSubmenu
            field={field}
            imageLayout={imageLayout}
            onMove={onMove}
            onBack={handleBack}
          />
        );
      case 'resize':
        return (
          <ResizeSubmenu
            field={field}
            onResize={onResize}
            onBack={handleBack}
          />
        );
      case 'text':
        return (
          <TextSubmenu
            field={field}
            labelValue={labelValue}
            onTextChange={onTextChange}
            onTextCommit={onTextCommit}
            onFontSizeChange={onFontSizeChange}
            onLineCountChange={onLineCountChange}
            onUpdateField={onUpdateField}
            onBack={handleBack}
          />
        );
      case 'config':
        return (
          <ConfigSubmenu
            field={field}
            allFields={allFields}
            onUpdateField={onUpdateField}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onSave={onSave}
            scrollMaxHeight={configScrollMaxHeight}
            onBack={handleBack}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Pressable
      ref={containerRef}
      style={styles.container}
      onPress={handleContainerPress}
      onLayout={onLayout}
    >
      {activeSubmenu ? (
        renderSubmenu()
      ) : (
        <View style={styles.mainMenu}>
          <MenuButton
            icon="↕️"
            label="Deplacer"
            onPress={() => handleSubmenuOpen('move')}
          />
          <MenuButton
            icon="⬜"
            label="Taille"
            onPress={() => handleSubmenuOpen('resize')}
          />
          <MenuButton
            icon="⌨️"
            label="Texte"
            onPress={() => handleSubmenuOpen('text')}
          />
          <MenuButton
            icon="⧉"
            label="Copier"
            onPress={onDuplicate}
            color="#4CAF50"
          />
          <MenuButton
            icon="⚙️"
            label="Config"
            onPress={() => handleSubmenuOpen('config')}
          />
          <MenuButton
            icon="🗑️"
            label="Suppr"
            onPress={onDelete}
            color="#f44336"
          />
          {hasGroup && (
            <MenuButton
              icon="📋"
              label="Groupe"
              onPress={onSelectGroup}
              color="#3B82F6"
            />
          )}
          <MenuButton
            icon="↔️"
            label="Ligne"
            onPress={onSelectRow}
            color="#3B82F6"
          />
          <MenuButton
            icon="↕️"
            label="Colonne"
            onPress={onSelectColumn}
            color="#3B82F6"
          />
        </View>
      )}
    </Pressable>
  );
};

const MenuButton = ({ icon, label, onPress, active, disabled, color }) => (
  <TouchableOpacity
    style={[
      styles.menuButton,
      active && styles.menuButtonActive,
      disabled && styles.menuButtonDisabled,
    ]}
    onPress={onPress}
    disabled={disabled}
  >
    <Text style={styles.menuIcon}>{icon}</Text>
    <Text style={[styles.menuLabel, color && { color }]}>{label}</Text>
  </TouchableOpacity>
);

export { BackButton };

const styles = StyleSheet.create({
  container: {
    // No position/left/top - positioned by parent
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  mainMenu: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 4,
  },
  menuButton: {
    minWidth: 52,
    alignItems: 'center',
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
    flexGrow: 1,
  },
  menuButtonActive: {
    backgroundColor: '#3a3a3a',
  },
  menuButtonDisabled: {
    opacity: 0.5,
  },
  menuIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  menuLabel: {
    fontSize: 10,
    color: '#aaa',
  },
});

export default FieldContextMenu;
