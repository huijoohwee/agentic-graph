export const AGENTICGRAPH_AGENT_READY_RESOURCE_TEMPLATE_NAMES = Object.freeze({
  sourceFileById: 'agenticgraph_source_file_by_id',
})

export const AGENTICGRAPH_SOURCE_FILE_RESOURCE_URI_TEMPLATE = 'kgdoc://source-file/{id}'
export const AGENTICGRAPH_SOURCE_FILE_RESOURCE_URI_PREFIX = 'kgdoc://source-file/'
export const AGENTICGRAPH_SOURCE_FILE_RESOURCE_MIME_TYPE = 'text/markdown'

const normalizeString = (value) => String(value || '').trim()

export const buildAgenticGraphAgentReadyResourceTemplateContracts = () => [
  {
    uriTemplate: AGENTICGRAPH_SOURCE_FILE_RESOURCE_URI_TEMPLATE,
    name: AGENTICGRAPH_AGENT_READY_RESOURCE_TEMPLATE_NAMES.sourceFileById,
    title: 'AgenticGraph Source File By ID',
    description: 'Read a complete published AgenticGraph Source File markdown document using a stable kgdoc id returned by search.',
    mimeType: AGENTICGRAPH_SOURCE_FILE_RESOURCE_MIME_TYPE,
    annotations: {
      audience: ['user', 'assistant'],
      priority: 0.8,
    },
    _meta: {
      readOnly: true,
      source: 'agenticgraph-source-files',
      tool: 'fetch',
    },
  },
]

export const buildAgenticGraphSourceFileResourceUri = (id) => {
  const normalizedId = normalizeString(id)
  if (!normalizedId) return ''
  return `${AGENTICGRAPH_SOURCE_FILE_RESOURCE_URI_PREFIX}${encodeURIComponent(normalizedId)}`
}

export const parseAgenticGraphSourceFileResourceUri = (uri) => {
  const normalizedUri = normalizeString(uri)
  if (!normalizedUri.startsWith(AGENTICGRAPH_SOURCE_FILE_RESOURCE_URI_PREFIX)) return ''
  const encodedId = normalizedUri.slice(AGENTICGRAPH_SOURCE_FILE_RESOURCE_URI_PREFIX.length)
  if (!encodedId) return ''
  try {
    return decodeURIComponent(encodedId)
  } catch {
    return encodedId
  }
}

export const buildAgenticGraphSourceFileResourceReadResult = ({ uri, sourceFile } = {}) => {
  const content = typeof sourceFile?.content === 'string'
    ? sourceFile.content
    : String(sourceFile?.text || '')
  return {
    contents: [
      {
        uri: normalizeString(uri),
        mimeType: AGENTICGRAPH_SOURCE_FILE_RESOURCE_MIME_TYPE,
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
