import client from './client';

const withOptionalParams = (params = {}) => {
  const filtered = Object.entries(params).filter(([, value]) => value !== undefined);
  if (filtered.length === 0) return undefined;
  return { params: Object.fromEntries(filtered) };
};

const isNotFound = (error) => Number(error?.response?.status || 0) === 404;

const with404Fallback = async (primaryRequest, fallbackRequest) => {
  try {
    return await primaryRequest();
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return fallbackRequest();
  }
};

export const formsScreenService = {
  listDocumentsView: () =>
    with404Fallback(
      () => client.get('/templates/view/documents'),
      () =>
        with404Fallback(
          () => client.get('/templates', { params: { kind: 'document' } }),
          () => client.get('/documents')
        )
    ),
  listTemplatesView: () =>
    with404Fallback(
      () => client.get('/templates/view/templates'),
      () =>
        with404Fallback(
          () => client.get('/templates', { params: { kind: 'template' } }),
          () => client.get('/templates')
        )
    ),
  listReadyFormsView: () =>
    with404Fallback(
      () => client.get('/templates/view/ready-forms'),
      () =>
        with404Fallback(
          () => client.get('/form-fills'),
          () => client.get('/form_fills')
        )
    ),

  cloneAsTemplateFromDocument: (documentId) =>
    client.post(`/templates/${documentId}/clone`, { kind: 'template' }),

  duplicateDocument: (documentId) =>
    client.post(`/templates/${documentId}/clone`, { kind: 'document' }),

  duplicateTemplate: (templateId) =>
    client.post(`/templates/${templateId}/clone`, { kind: 'template' }),

  associateTemplateToDocument: (documentId, templateId) =>
    client.patch(`/templates/${documentId}`, { applied_template_id: templateId }),

  applyTemplateToDocument: (documentId, templateId, mode = 'clone') =>
    client.post(`/templates/${documentId}/apply-template`, { template_id: templateId, mode }),

  dissociateTemplateFromDocument: (documentId) =>
    client.post(`/templates/documents/${documentId}/dissociate-template`),

  deleteDocument: (documentId, { dissociate } = {}) =>
    client.delete(
      `/templates/documents/${documentId}`,
      withOptionalParams({ dissociate: dissociate ? true : undefined })
    ),

  deleteTemplate: (templateId, { force } = {}) =>
    client.delete(
      `/templates/${templateId}`,
      withOptionalParams({ force: force ? true : undefined })
    ),
};

export default formsScreenService;
