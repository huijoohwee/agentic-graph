import { hashSignatureParts } from '@/lib/hash/signature'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import type { Canvas2dRendererId } from '@/lib/config.render'
import { normalizeWorkspaceUrlImportCanvas2dRenderer, normalizeWorkspaceUrlImportDocumentMode } from './canvasPresets'

type WebpageViewMode = 'markdown' | 'json' | 'html'
type FetchMode = 'import' | 'refresh'

const normalizeWebpageViewMode = (value: unknown): WebpageViewMode => {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'markdown') return 'markdown'
  if (v === 'json') return 'json'
  return 'html'
}

const buildUrlContentSemanticKey = (parts: Array<string | number | boolean | null | undefined>): string => {
  const rawKey = hashSignatureParts(parts)
  return buildScopedGraphSemanticKey('workspace-url-content', { graphSemanticKey: rawKey }) || rawKey
}

export const buildWorkspaceUrlContentCacheKey = (args: {
  normalizedUrl: string
  mode: FetchMode
  viewHint: WebpageViewMode | ''
  canvas2dRenderer: Canvas2dRendererId | null
  documentSemanticMode?: unknown
  storeSnapshot?: {
    webpageImportIncludeImages?: unknown
    webpageImportView?: unknown
    /** Legacy settings are accepted for cache-key compatibility but ignored. */
    webpageArtifactFidelityMaxLevel?: unknown
  } | null
}): string => {
  const normalizedUrl = String(args.normalizedUrl || '').trim()
  const canvas2dRenderer = normalizeWorkspaceUrlImportCanvas2dRenderer(args.canvas2dRenderer)
  const documentSemanticMode = normalizeWorkspaceUrlImportDocumentMode(args.documentSemanticMode)
  const mode: FetchMode = args.mode === 'refresh' ? 'refresh' : 'import'
  const viewHint = args.viewHint === 'markdown' ? 'markdown' : args.viewHint === 'json' ? 'json' : args.viewHint === 'html' ? 'html' : ''

  if (canvas2dRenderer) {
    const sig = buildUrlContentSemanticKey(['url', normalizedUrl, 'r2d', canvas2dRenderer, 'doc', documentSemanticMode, 'vh', viewHint])
    return `${mode}:url-import-${canvas2dRenderer}:${sig}`
  }

  const snap = args.storeSnapshot || null
  const includeImages = snap?.webpageImportIncludeImages !== false
  const importView = normalizeWebpageViewMode(snap?.webpageImportView)

  const parts: Array<string | number | boolean | null | undefined> = [
    'url',
    normalizedUrl,
    'r2d',
    canvas2dRenderer || 'default',
    'vh',
    viewHint || 'auto',
    'img',
    includeImages ? '1' : '0',
  ]
  if (mode === 'import' && !viewHint) parts.push('iv', importView)

  const sig = buildUrlContentSemanticKey(parts)
  return `${mode}:${canvas2dRenderer || 'default'}:${sig}`
}
