const normalizeFieldType = (value) => String(value || '').trim().toLowerCase();

const hasUsableTag = (field) => {
  const rawTag = field?.tag;
  if (rawTag === null || rawTag === undefined) return false;
  return String(rawTag).trim().length > 0;
};

const shouldKeepField = (field, options = {}) => {
  const type = normalizeFieldType(field?.type);
  if (type === 'group') return false;
  if (hasUsableTag(field)) return true;
  if (options.includeTaglessFields) return true;
  if (options.allowTaglessTable && type === 'table') return true;
  return false;
};

const pushFlattenedField = (field, result, options) => {
  if (!field || typeof field !== 'object') return;

  const type = normalizeFieldType(field.type);
  if (type === 'group') {
    const rows = Array.isArray(field.rows) ? field.rows : [];
    rows.forEach((row) => {
      if (!Array.isArray(row)) return;
      row.forEach((childField) => pushFlattenedField(childField, result, options));
    });
    return;
  }

  if (!shouldKeepField(field, options)) return;
  result.push(field);
};

export const flattenFields = (fields, options = {}) => {
  const result = [];
  (Array.isArray(fields) ? fields : []).forEach((field) => {
    pushFlattenedField(field, result, options);
  });
  return result;
};

export default {
  flattenFields,
};
