import { toMetadataRecord } from '@/lib/graph/documentMetadata'

function normalizeGraphDocumentSource(rawSource: unknown): string {
  const source = String(rawSource ?? '').trim()
  const workspaceMarkdownPrefix = 'markdown:workspace:/'
  if (source.startsWith(workspaceMarkdownPrefix)) {
    return `markdown:${source.slice(workspaceMarkdownPrefix.length)}`
  }
  return source
}

export function buildGraphMetaKey(graph: { metadata?: unknown } | null): string {
  const rec = toMetadataRecord(graph?.metadata)
  const kind = String(rec.kind ?? '')
  const source = String(rec.source ?? '')
  const layerHash = typeof rec.sourceLayerHash === 'string' ? rec.sourceLayerHash.trim() : ''
  const pending = rec.pending === true
  const base = `${kind}:${source}${pending ? ':pending' : ''}`
  return layerHash ? `${base}:${layerHash}` : base
}

export function buildGraphMetaKeyIgnoringPending(graph: { metadata?: unknown } | null): string {
  const rec = toMetadataRecord(graph?.metadata)
  const kind = String(rec.kind ?? '')
  const source = String(rec.source ?? '')
  const layerHash = typeof rec.sourceLayerHash === 'string' ? rec.sourceLayerHash.trim() : ''
  const base = `${kind}:${source}`
  return layerHash ? `${base}:${layerHash}` : base
}

export function buildGraphDocumentMetaKey(graph: { metadata?: unknown } | null): string {
  const rec = toMetadataRecord(graph?.metadata)
  const kind = String(rec.kind ?? '')
  const source = normalizeGraphDocumentSource(rec.source)
  if (!kind && !source) return ''
  return `${kind}:${source}`
}

export function readBaselineGraphMetaKey(
  graph: { metadata?: unknown } | null | undefined,
  fallbackGraphMetaKey: string,
): string {
  const meta = toMetadataRecord(graph?.metadata)
  const raw = typeof meta.baselineGraphMetaKey === 'string'
    ? String(meta.baselineGraphMetaKey || '').trim()
    : ''
  return raw || fallbackGraphMetaKey
}
