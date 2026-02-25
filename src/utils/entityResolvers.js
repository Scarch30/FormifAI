import { decodeMaybeUriComponent, toNumber } from './apiData';

export const getTranscriptionTitle = (item) =>
  decodeMaybeUriComponent(
    item?.title ||
      item?.document_name ||
      item?.documentName ||
      item?.session_name ||
      item?.sessionName ||
      `Transcription #${item?.id ?? ''}`
  );

export const getDocumentName = (item) =>
  decodeMaybeUriComponent(
    item?.name ||
      item?.title ||
      item?.document_name ||
      item?.documentName ||
      item?.original_name ||
      item?.originalName ||
      item?.filename ||
      item?.file_name ||
      item?.fileName ||
      `Document #${item?.id ?? ''}`
  );

export const resolveSourceType = (item) => {
  const explicitType = String(item?.source_type || item?.sourceType || '').toLowerCase();
  if (explicitType) return explicitType;
  if (item?.transcription_id || item?.transcriptionId) return 'transcription';
  if (item?.ocr_document_id || item?.ocrDocumentId) return 'ocr';
  if (item?.source_form_fill_id || item?.sourceFormFillId) return 'form_fill';
  return 'transcription';
};

export const resolveSourceId = (item, sourceType) => {
  const explicit = item?.source_id ?? item?.sourceId;
  if (explicit !== null && explicit !== undefined) return explicit;
  if (sourceType === 'transcription') return item?.transcription_id ?? item?.transcriptionId ?? null;
  if (sourceType === 'ocr') return item?.ocr_document_id ?? item?.ocrDocumentId ?? null;
  if (sourceType === 'form_fill') return item?.source_form_fill_id ?? item?.sourceFormFillId ?? null;
  return null;
};

export const getSourceName = (item, sourceType, sourceId) => {
  if (sourceType === 'transcription') {
    return decodeMaybeUriComponent(
      item?.transcription_title || item?.transcriptionTitle || `Transcription #${sourceId ?? ''}`
    );
  }
  if (sourceType === 'ocr') {
    return decodeMaybeUriComponent(
      item?.ocr_document_title ||
        item?.ocrDocumentTitle ||
        item?.ocr_title ||
        item?.ocrTitle ||
        item?.source_title ||
        item?.sourceTitle ||
        `Scan OCR #${sourceId ?? ''}`
    );
  }
  if (sourceType === 'form_fill') {
    return decodeMaybeUriComponent(
      item?.source_form_fill_name ||
        item?.sourceFormFillName ||
        item?.source_form_fill_title ||
        item?.sourceFormFillTitle ||
        item?.source_form_fill_document_name ||
        item?.sourceFormFillDocumentName ||
        `Remplissage #${sourceId ?? ''}`
    );
  }
  return decodeMaybeUriComponent(item?.source_title || item?.sourceTitle || `Source #${sourceId ?? ''}`);
};

export const getFieldsCount = (item) => {
  if (!item || typeof item !== 'object') return 0;
  if (Array.isArray(item.fields)) return item.fields.length;
  if (Array.isArray(item.template_fields)) return item.template_fields.length;
  if (Array.isArray(item.values)) return item.values.length;
  const fromCount = toNumber(item?.fields_count ?? item?.fieldsCount, null);
  if (fromCount !== null) return fromCount;
  return 0;
};

export const getPagesCount = (item) => {
  const count = toNumber(item?.pages_count ?? item?.pagesCount ?? item?.total_pages ?? item?.totalPages, null);
  if (count !== null) return count;
  if (Array.isArray(item?.pages)) return item.pages.length;
  return 0;
};
