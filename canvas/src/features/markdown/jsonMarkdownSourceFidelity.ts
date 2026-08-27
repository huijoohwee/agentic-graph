export const MARKDOWN_SOURCE_FIDELITY_METADATA_KEY = 'markdownSource'

const MARKDOWN_SOURCE_FIDELITY_KIND = 'agenticgraph.markdown-source'
const MARKDOWN_SOURCE_FIDELITY_VERSION = 1

type JsonObject = Record<string, unknown>

function asJsonObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}

export function attachMarkdownSourceFidelityPayload(args: {
  jsonValue: JsonObject
  documentName: string
  markdownText: string
}): JsonObject {
  const base = asJsonObject(args.jsonValue) || {}
  const metadata = asJsonObject(base.metadata) || {}
  return {
    ...base,
    metadata: {
      ...metadata,
      [MARKDOWN_SOURCE_FIDELITY_METADATA_KEY]: {
        kind: MARKDOWN_SOURCE_FIDELITY_KIND,
        version: MARKDOWN_SOURCE_FIDELITY_VERSION,
        documentName: String(args.documentName || '').trim() || 'workspace.md',
        text: String(args.markdownText || ''),
      },
    },
  }
}

export function readMarkdownSourceFidelityTextFromValue(value: unknown): string | null {
  const root = asJsonObject(value)
  if (!root) return null
  const metadata = asJsonObject(root.metadata)
  const source = asJsonObject(metadata?.[MARKDOWN_SOURCE_FIDELITY_METADATA_KEY])
  if (!source) return null
  if (source.kind !== MARKDOWN_SOURCE_FIDELITY_KIND) return null
  if (source.version !== MARKDOWN_SOURCE_FIDELITY_VERSION) return null
  return typeof source.text === 'string' ? source.text : null
}

export function readMarkdownSourceFidelityTextFromJsonText(text: string): string | null {
  const trimmed = String(text || '').trim()
  if (!trimmed.startsWith('{')) return null
  try {
    return readMarkdownSourceFidelityTextFromValue(JSON.parse(trimmed) as unknown)
  } catch {
    return null
  }
}
