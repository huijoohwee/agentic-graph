export const KNOWGRPH_AGENT_READY_RESOURCE_TEMPLATE_NAMES = Object.freeze({
  sourceFileById: 'knowgrph_source_file_by_id',
})

export const KNOWGRPH_SOURCE_FILE_RESOURCE_URI_TEMPLATE = 'kgdoc://source-file/{id}'
export const KNOWGRPH_SOURCE_FILE_RESOURCE_URI_PREFIX = 'kgdoc://source-file/'
export const KNOWGRPH_SOURCE_FILE_RESOURCE_MIME_TYPE = 'text/markdown'

const normalizeString = (value) => String(value || '').trim()

export const buildKnowgrphAgentReadyResourceTemplateContracts = () => [
  {
    uriTemplate: KNOWGRPH_SOURCE_FILE_RESOURCE_URI_TEMPLATE,
    name: KNOWGRPH_AGENT_READY_RESOURCE_TEMPLATE_NAMES.sourceFileById,
    title: 'Knowgrph Source File By ID',
    description: 'Read a complete published Knowgrph Source File markdown document using a stable kgdoc id returned by search.',
    mimeType: KNOWGRPH_SOURCE_FILE_RESOURCE_MIME_TYPE,
    annotations: {
      audience: ['user', 'assistant'],
      priority: 0.8,
    },
    _meta: {
      readOnly: true,
      source: 'knowgrph-source-files',
      tool: 'fetch',
    },
  },
]

export const buildKnowgrphSourceFileResourceUri = (id) => {
  const normalizedId = normalizeString(id)
  if (!normalizedId) return ''
  return `${KNOWGRPH_SOURCE_FILE_RESOURCE_URI_PREFIX}${encodeURIComponent(normalizedId)}`
}

export const parseKnowgrphSourceFileResourceUri = (uri) => {
  const normalizedUri = normalizeString(uri)
  if (!normalizedUri.startsWith(KNOWGRPH_SOURCE_FILE_RESOURCE_URI_PREFIX)) return ''
  const encodedId = normalizedUri.slice(KNOWGRPH_SOURCE_FILE_RESOURCE_URI_PREFIX.length)
  if (!encodedId) return ''
  try {
    return decodeURIComponent(encodedId)
  } catch {
    return encodedId
  }
}

export const buildKnowgrphSourceFileResourceReadResult = ({ uri, sourceFile } = {}) => {
  const content = typeof sourceFile?.content === 'string'
    ? sourceFile.content
    : String(sourceFile?.text || '')
  return {
    contents: [
      {
        uri: normalizeString(uri),
        mimeType: KNOWGRPH_SOURCE_FILE_RESOURCE_MIME_TYPE,
        text: content,
        _meta: {
          id: normalizeString(sourceFile?.id),
          title: normalizeString(sourceFile?.title),
          url: normalizeString(sourceFile?.url),
          metadata: sourceFile?.metadata && typeof sourceFile.metadata === 'object'
            ? { ...sourceFile.metadata }
            : {},
        },
      },
    ],
  }
}
