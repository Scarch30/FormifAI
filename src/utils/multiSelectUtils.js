/**
 * Multi-selection utility functions for TemplateEditorScreen.
 *
 * Coordinate system:
 *   field.x, field.y, field.width  → percentage (0-100) of image
 *   field.height                   → pixels
 *   imgH = imageLayout.height      → pixels (total image height)
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fieldKey = (f) => f.id || f.localId;

/** Height in percentage */
const heightPct = (f, imgH) => (f.height / imgH) * 100;

/** Center X in percentage */
const centerX = (f) => f.x + f.width / 2;

/** Center Y in percentage */
const centerYPct = (f, imgH) => f.y + heightPct(f, imgH) / 2;

// ---------------------------------------------------------------------------
// MARQUEE HIT TEST
// ---------------------------------------------------------------------------

/**
 * Find fields whose center is inside the marquee rectangle.
 * @param {Array} fields - all page fields
 * @param {{ x1: number, y1: number, x2: number, y2: number }} rect - in percentage
 * @param {number} imgH - imageLayout.height in pixels
 * @returns {Set<string>} field keys inside the marquee
 */
export function fieldsInMarquee(fields, rect, imgH) {
  if (!fields || !rect || !imgH) return new Set();
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  const result = new Set();
  for (const f of fields) {
    const cx = centerX(f);
    const cy = centerYPct(f, imgH);
    if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
      result.add(fieldKey(f));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// GROUP / ROW / COLUMN SELECTION
// ---------------------------------------------------------------------------

/**
 * Select all fields with the same group_id on the current page.
 */
export function selectByGroupId(allPageFields, groupId) {
  if (!groupId) return new Set();
  const result = new Set();
  for (const f of allPageFields) {
    if (f.group_id === groupId) {
      result.add(fieldKey(f));
    }
  }
  return result;
}

/**
 * Select all fields on the page whose y is within ±tolerance of targetY.
 */
export function selectByRow(allPageFields, targetY, tolerancePct = 2) {
  const result = new Set();
  for (const f of allPageFields) {
    if (Math.abs(f.y - targetY) <= tolerancePct) {
      result.add(fieldKey(f));
    }
  }
  return result;
}

/**
 * Select all fields on the page whose x is within ±tolerance of targetX.
 */
export function selectByColumn(allPageFields, targetX, tolerancePct = 2) {
  const result = new Set();
  for (const f of allPageFields) {
    if (Math.abs(f.x - targetX) <= tolerancePct) {
      result.add(fieldKey(f));
    }
  }
  return result;
}
