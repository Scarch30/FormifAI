// Valeurs par défaut pour un nouveau champ
export const DEFAULT_FIELD = {
  field_type: 'text',
  option_value: '',
  format_hint: '',
  is_checked_default: false,
  font_family: 'Helvetica',
  font_size: 12,
  text_color: '#000000',
  text_align: 'left',
  line_height: 1.2,
  line_count: 1,
  wrap_mode: 'word',
  max_chars: null,
  next_lines_indent: 0,
  width: 100,
  height: 20,
  repeat_index: 1,
  group_id: '',
  field_hint: '',
  category_label: null,
  display_name: null,
  ai_description: null,
};

// Calculer la hauteur basée sur les propriétés
export const calculateFieldHeight = (field) => {
  const { font_size = 12, line_height = 1.2, line_count = 1 } = field || {};
  return line_count * font_size * line_height;
};

// Convertir les coordonnées écran → pourcentage
export const screenToPercent = (screenX, screenY, imageLayout) => ({
  x: (screenX / imageLayout.width) * 100,
  y: (screenY / imageLayout.height) * 100,
});

// Convertir les coordonnées pourcentage → écran
export const percentToScreen = (percentX, percentY, imageLayout) => ({
  x: (percentX / 100) * imageLayout.width,
  y: (percentY / 100) * imageLayout.height,
});

// Convertir les dimensions
export const percentToScreenSize = (percentW, percentH, imageLayout) => ({
  width: (percentW / 100) * imageLayout.width,
  height: (percentH / 100) * imageLayout.height,
});

// Générer un field_name à partir du label
export const generateFieldName = (label) => {
  return (label || 'champ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

export const getGroupInitials = (groupId) => {
  const normalized = generateFieldName(groupId || '');
  if (!normalized) return '';
  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => part[0])
    .join('');
};

export const normalizeRepeatCount = (value, fallback = 1) => {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
};

export const buildTechnicalFieldName = ({ groupId, explicitName, repeatCount }) => {
  const group = getGroupInitials(groupId);
  const base = generateFieldName(explicitName || 'champ') || 'champ';
  const repeat = normalizeRepeatCount(repeatCount, 1);
  return [group, base, String(repeat)].filter(Boolean).join('_');
};

export const deriveExplicitName = ({ fieldName, groupId, repeatCount }) => {
  if (!fieldName) return '';
  let name = String(fieldName);
  const group = getGroupInitials(groupId);
  if (group && name.startsWith(`${group}_`)) {
    name = name.slice(group.length + 1);
  }
  const repeat = normalizeRepeatCount(repeatCount, 0);
  if (repeat > 0 && name.endsWith(`_${repeat}`)) {
    name = name.slice(0, -(`_${repeat}`).length);
  } else {
    const match = name.match(/^(.*)_\d+$/);
    if (match) name = match[1];
  }
  return name.replace(/_/g, ' ').trim();
};

export function formatFieldLabel(fieldName, originalLabel) {
  const fallbackLabel = originalLabel || fieldName || 'Champ';

  if (!fieldName || typeof fieldName !== 'string') {
    return fallbackLabel;
  }

  const normalizedLabel = (originalLabel || '').toLowerCase();

  const sectionPrefixes = {
    vous_: 'Vous: ',
    conjoint_: 'Conjoint: ',
    proche_: 'Proche: ',
    enfant_: 'Enfant: ',
    bien_usage_: 'Bien usage: ',
    bien_pro_: 'Bien pro: ',
    immo_rapport_: 'Immo rapport: ',
    assurance_: 'Assurance: ',
    epargne_: 'Épargne: ',
    valeurs_mobilieres_: 'Valeurs mob: ',
    disponibilites_: 'Disponibilités: ',
    passif_: 'Passif: ',
    budget_revenu_: 'Revenu: ',
    budget_charge_: 'Charge: ',
    objectif_: 'Objectif: ',
  };

  for (const [prefix, sectionLabel] of Object.entries(sectionPrefixes)) {
    if (fieldName.startsWith(prefix)) {
      const sectionToken = sectionLabel.toLowerCase().replace(': ', '');
      if (!normalizedLabel.includes(sectionToken)) {
        return `${sectionLabel}${fallbackLabel}`;
      }
      break;
    }
  }

  return fallbackLabel;
}

export const DEFAULT_FONT_FAMILY = DEFAULT_FIELD.font_family;
export const DEFAULT_FONT_SIZE = DEFAULT_FIELD.font_size;

export function getFieldTextStyle({
  fontSize = DEFAULT_FONT_SIZE,
  fontFamily = DEFAULT_FONT_FAMILY,
  isBold = false,
  color = '#111827',
} = {}) {
  return {
    fontSize,
    lineHeight: fontSize,
    fontFamily,
    fontWeight: isBold ? '700' : '400',
    color,
    includeFontPadding: false,
    padding: 0,
    margin: 0,
  };
}

// Category suggestions for the config submenu
export const CATEGORY_SUGGESTIONS = [
  'Vous',
  'Conjoint',
  'Proches',
  'Enfant',
  'Bien usage',
  'Bien pro',
  'Immo rapport',
  'Assurance',
  'Epargne',
  'Valeurs mobilieres',
  'Disponibilites',
  'Passif',
  'Budget revenu',
  'Budget charge',
  'Objectif',
];

/**
 * Generate a technical field name with category prefix and group suffix
 * Format: {CAT}_{nom_simplifie} or {CAT}_{nom_simplifie}_{GROUPE}{rang}
 *
 * Examples:
 * - Category "Vous", name "Nom de famille", no group -> "vou_nom_de_famille"
 * - Category "Proches", name "Prenom", group "Proche", rank 1 -> "pro_prenom_p1"
 * - No category, name "Date entretien" -> "date_entretien"
 */
export const generateFieldNameV2 = ({ category, explicitName, groupId, rankInGroup }) => {
  let result = '';

  // Category prefix (3 first letters, lowercase, no accents)
  if (category && category.trim()) {
    const catClean = category
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 3);
    if (catClean) {
      result += catClean + '_';
    }
  }

  // Simplified name (max 20 characters, snake_case, no accents)
  const nameClean = (explicitName || 'champ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 20);
  result += nameClean || 'champ';

  // Group suffix + rank (only if group is specified)
  if (groupId && groupId.trim() && rankInGroup) {
    const groupInitial = groupId
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '')
      .charAt(0);
    if (groupInitial) {
      result += '_' + groupInitial + rankInGroup;
    }
  }

  return result;
};

// ============================================================================
// INCREMENTAL NAMING UTILITIES FOR DUPLICATION
// ============================================================================

/**
 * Extract the base name and numeric suffix from a technical field_name.
 * Pattern: base_<n> where <n> is a positive integer
 *
 * Examples:
 *   "pro_telephone_2" => { base: "pro_telephone", suffix: 2 }
 *   "pro_telephone" => { base: "pro_telephone", suffix: null }
 *   "nom_3_test" => { base: "nom_3_test", suffix: null }
 */
export const parseFieldNameSuffix = (fieldName) => {
  if (!fieldName || typeof fieldName !== 'string') {
    return { base: fieldName || '', suffix: null };
  }
  const match = fieldName.match(/^(.+)_(\d+)$/);
  if (match) {
    return { base: match[1], suffix: parseInt(match[2], 10) };
  }
  return { base: fieldName, suffix: null };
};

/**
 * Extract the base label and numeric suffix from a display label.
 * Pattern: base <n> or base (<n>) where <n> is a positive integer
 *
 * Examples:
 *   "Téléphone 2" => { base: "Téléphone", suffix: 2 }
 *   "Nom (3)" => { base: "Nom", suffix: 3 }
 *   "Téléphone" => { base: "Téléphone", suffix: null }
 */
export const parseLabelSuffix = (label) => {
  if (!label || typeof label !== 'string') {
    return { base: label || '', suffix: null };
  }
  // Try pattern: "base <n>"
  let match = label.match(/^(.+)\s+(\d+)$/);
  if (match) {
    return { base: match[1].trim(), suffix: parseInt(match[2], 10) };
  }
  // Try pattern: "base (<n>)"
  match = label.match(/^(.+)\s*\((\d+)\)$/);
  if (match) {
    return { base: match[1].trim(), suffix: parseInt(match[2], 10) };
  }
  return { base: label, suffix: null };
};

/**
 * Find the next available suffix for a field_name in a list of fields.
 * Anti-collision: scans all fields with the same base and returns max + 1.
 *
 * @param {string} baseName - The base field_name without suffix
 * @param {Array} allFields - All fields in the template
 * @returns {number} - The next available suffix (at least 2)
 */
export const findNextFieldNameSuffix = (baseName, allFields) => {
  if (!baseName || !Array.isArray(allFields)) return 2;

  let maxSuffix = 1; // Base field is implicitly "1"
  const baseNormalized = baseName.toLowerCase();

  allFields.forEach((field) => {
    const { base, suffix } = parseFieldNameSuffix(field?.field_name);
    if (base && base.toLowerCase() === baseNormalized) {
      // Exact match without suffix counts as 1
      if (suffix === null) {
        maxSuffix = Math.max(maxSuffix, 1);
      } else {
        maxSuffix = Math.max(maxSuffix, suffix);
      }
    }
  });

  return maxSuffix + 1;
};

/**
 * Find the next available suffix for a label within the same category.
 * Anti-collision: scans all fields with the same base label and category.
 *
 * @param {string} baseLabel - The base label without suffix
 * @param {string|null} categoryLabel - The category to search within
 * @param {Array} allFields - All fields in the template
 * @param {Function} getLabel - Extract label from a field (default: field_label)
 * @returns {number} - The next available suffix (at least 2)
 */
export const findNextLabelSuffix = (
  baseLabel,
  categoryLabel,
  allFields,
  getLabel = (field) => field?.field_label
) => {
  if (!baseLabel || !Array.isArray(allFields)) return 2;

  let maxSuffix = 1;
  const baseNormalized = baseLabel.toLowerCase().trim();
  const categoryNormalized = (categoryLabel || '').toLowerCase().trim();

  allFields.forEach((field) => {
    // Only check within the same category
    const fieldCategory = (field?.category_label || '').toLowerCase().trim();
    if (fieldCategory !== categoryNormalized) return;

    const { base, suffix } = parseLabelSuffix(getLabel(field));
    if (base && base.toLowerCase().trim() === baseNormalized) {
      if (suffix === null) {
        maxSuffix = Math.max(maxSuffix, 1);
      } else {
        maxSuffix = Math.max(maxSuffix, suffix);
      }
    }
  });

  return maxSuffix + 1;
};

/**
 * Increment a field_name for duplication.
 * If ends with _<n>, increments to _<n+1>. Otherwise adds _2.
 * Uses anti-collision to find the next available suffix.
 *
 * @param {string} fieldName - Original field_name
 * @param {Array} allFields - All fields for anti-collision check
 * @returns {string} - Incremented field_name
 */
export const incrementFieldName = (fieldName, allFields) => {
  const { base } = parseFieldNameSuffix(fieldName);
  const nextSuffix = findNextFieldNameSuffix(base, allFields);
  return `${base}_${nextSuffix}`;
};

/**
 * Increment a label (field_label or display_name) for duplication.
 * If ends with " <n>", increments to " <n+1>". Otherwise adds " 2".
 * Uses anti-collision within the same category.
 *
 * @param {string} label - Original label
 * @param {string|null} categoryLabel - Category for anti-collision
 * @param {Array} allFields - All fields for anti-collision check
 * @param {Function} getLabel - Extract label from a field for anti-collision
 * @returns {string} - Incremented label
 */
export const incrementLabel = (
  label,
  categoryLabel,
  allFields,
  getLabel = (field) => field?.field_label
) => {
  const { base } = parseLabelSuffix(label);
  const nextSuffix = findNextLabelSuffix(base, categoryLabel, allFields, getLabel);
  return `${base} ${nextSuffix}`;
};

/**
 * Create a duplicated field with incremented names.
 * - field_name: incremented with _<n> suffix
 * - field_label: kept unchanged
 * - display_name: incremented with " <n>" suffix
 * - category_label: kept as-is
 * - ai_description: kept as-is
 *
 * @param {Object} field - Original field to duplicate
 * @param {Array} allFields - All fields for anti-collision
 * @param {Object} positionOverride - Optional { x, y } to override position
 * @returns {Object} - New field object ready for creation
 */
export const createDuplicatedField = (field, allFields, positionOverride = {}) => {
  if (!field) return null;

  const newFieldName = incrementFieldName(field.field_name, allFields);
  const displayNameBase = field.display_name ?? field.field_label;
  const newDisplayName = displayNameBase
    ? incrementLabel(
      displayNameBase,
      field.category_label,
      allFields,
      (candidate) => candidate?.display_name ?? candidate?.field_hint ?? candidate?.field_label
    )
    : null;

  return {
    ...field,
    id: null,
    localId: null,
    field_name: newFieldName,
    field_label: field.field_label,
    text_example: field.text_example || '',
    display_name: newDisplayName,
    // Keep category_label and ai_description unchanged
    category_label: field.category_label,
    ai_description: field.ai_description,
    // Apply position override if provided
    x: positionOverride.x !== undefined ? positionOverride.x : field.x,
    y: positionOverride.y !== undefined ? positionOverride.y : field.y,
  };
};

/**
 * Calculate the bounding box of a selection of fields.
 *
 * @param {Array} fields - Array of field objects with x, y, width, height
 * @param {Object} imageLayout - { width, height } of the image
 * @returns {Object} - { minX, minY, maxX, maxY, height } in percent coordinates
 */
export const getSelectionBoundingBox = (fields, imageLayout) => {
  if (!fields || !fields.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  fields.forEach((field) => {
    const x = field.x || 0;
    const y = field.y || 0;
    const w = field.width || 10;
    // Height can be in pixels, convert to percent
    const hPx = field.height || 20;
    const hPct = imageLayout?.height ? (hPx / imageLayout.height) * 100 : 2;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + hPct);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    height: maxY - minY,
  };
};

/**
 * Duplicate a selection of fields with smart naming and positioning.
 * - All fields are duplicated with incremented names
 * - Position offset is applied to create a new "row" below the selection
 *
 * @param {Array} selectedFields - Fields to duplicate
 * @param {Array} allFields - All fields in the template for anti-collision
 * @param {Object} imageLayout - { width, height } for bounding box calculation
 * @param {number} gapPx - Extra gap in pixels below the selection (default 10px)
 * @returns {Array} - Array of new field objects ready for creation
 */
export const duplicateFieldSelection = (
  selectedFields,
  allFields,
  imageLayout,
  gapPx = 10
) => {
  if (!selectedFields || !selectedFields.length) return [];

  // Calculate bounding box of selection
  const bbox = getSelectionBoundingBox(selectedFields, imageLayout);
  if (!bbox) return [];

  // Offset Y: place duplicates below the selection with a fixed pixel gap.
  const gapPercent = imageLayout?.height ? (gapPx / imageLayout.height) * 100 : 0;
  const deltaY = bbox.height + gapPercent;

  // We need to track newly created fields to avoid name collisions within the batch
  const workingAllFields = [...allFields];
  const duplicatedFields = [];

  selectedFields.forEach((field) => {
    // Calculate new Y position
    const newY = Math.min(field.y + deltaY, 95); // Clamp to stay on page

    // Create duplicated field
    const duplicated = createDuplicatedField(field, workingAllFields, { y: newY });

    if (duplicated) {
      duplicatedFields.push(duplicated);
      // Add to working list so next field in batch avoids this name
      workingAllFields.push(duplicated);
    }
  });

  return duplicatedFields;
};
