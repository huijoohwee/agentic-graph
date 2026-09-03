import { resolveLiveCanvasHeroEmbedUrl } from '@/features/canvas/liveCanvasHeroEmbed'
import { resolvePublishedDocIdentity } from '@/features/canvas/canvasDocShareToken.mjs'
import type { LiveCanvasHeroSourceSelection } from '@/features/canvas/liveCanvasHeroSourceSelection'
import {
  resolveLiveCanvasHeroSourceSelection,
  selectLiveCanvasHeroSource,
} from '@/features/canvas/liveCanvasHeroSourceSelection'
export { CANONICAL_STARTUP_CANVAS_EMBED_URL } from '@/features/canvas/canvasEmbedPresets'

export const AGENTIC_OS_CANVAS_EMBED_SELECT_MESSAGE = 'agentic-graph.canvas-embed.select'
export const AGENTIC_OS_CANVAS_EMBED_MESSAGE_VERSION = 1
export type AgenticGraphCanvasEmbedSelectMessage = {
  type: typeof AGENTIC_OS_CANVAS_EMBED_SELECT_MESSAGE
  version: typeof AGENTIC_OS_CANVAS_EMBED_MESSAGE_VERSION
  sourcePath?: string
  embedUrl?: string
  iframe?: string
}

const decodeHtmlAttribute = (value: string): string => value
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')

export function readCanvasEmbedIframeSrc(markup: string): string | null {
  const value = String(markup || '').trim()
  if (!value) return null
  const match = value.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/is)
  return match?.[2] ? decodeHtmlAttribute(match[2].trim()) : null
}

function readMessageRecord(value: unknown): AgenticGraphCanvasEmbedSelectMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<AgenticGraphCanvasEmbedSelectMessage>
  if (record.type !== AGENTIC_OS_CANVAS_EMBED_SELECT_MESSAGE) return null
  if (record.version !== AGENTIC_OS_CANVAS_EMBED_MESSAGE_VERSION) return null
  return record as AgenticGraphCanvasEmbedSelectMessage
}

function inferSourcePath(url: URL, sourcePath: unknown): string {
  const explicitPath = String(sourcePath || '').trim()
  if (explicitPath) return explicitPath
  const documentPath = String(url.searchParams.get('kgDoc') || '').trim()
  if (documentPath) return `/${documentPath.replace(/^\/+/, '')}`
  const publishedIdentity = resolvePublishedDocIdentity({
    shareUrl: url.toString(),
    appBasePath: '/agentic-graph',
  })
  if (publishedIdentity?.canonicalPath) return publishedIdentity.canonicalPath
  return url.pathname || '/shared-canvas'
}

type CanvasEmbedImportOptions = Readonly<{
  liveHeroPreview?: boolean
}>

function resolveSelection(args: { embedUrl: string; sourcePath?: unknown; options?: CanvasEmbedImportOptions }): LiveCanvasHeroSourceSelection | null {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(String(args.embedUrl || '').trim())
  } catch {
    return null
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return null
  const sourcePath = inferSourcePath(parsedUrl, args.sourcePath)
  const embedUrl = args.options?.liveHeroPreview === false
    ? parsedUrl.toString()
    : resolveLiveCanvasHeroEmbedUrl({ sourcePath, selectedEmbedUrl: parsedUrl.toString() })
  return embedUrl ? resolveLiveCanvasHeroSourceSelection({ sourcePath, embedUrl }) : null
}

export function resolveCanvasEmbedImport(value: unknown, options?: CanvasEmbedImportOptions): LiveCanvasHeroSourceSelection | null {
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return null
    const iframeSrc = readCanvasEmbedIframeSrc(raw)
    if (iframeSrc) return resolveSelection({ embedUrl: iframeSrc, options })
    try {
      return resolveCanvasEmbedImport(JSON.parse(raw) as unknown, options)
    } catch {
      return resolveSelection({ embedUrl: raw, options })
    }
  }

  const message = readMessageRecord(value)
  if (!message) return null
  const embedUrl = String(message.embedUrl || '').trim() || readCanvasEmbedIframeSrc(String(message.iframe || ''))
  return embedUrl ? resolveSelection({ embedUrl, sourcePath: message.sourcePath, options }) : null
}

export function selectCanvasEmbedImport(value: unknown, options?: CanvasEmbedImportOptions): LiveCanvasHeroSourceSelection | null {
  const selection = resolveCanvasEmbedImport(value, options)
  return selection && selectLiveCanvasHeroSource(selection) ? selection : null
}

export function isTrustedCanvasEmbedMessageSource(event: MessageEvent, runtimeWindow: Window = window): boolean {
  const parent = runtimeWindow.parent
  if (parent && parent !== runtimeWindow && event.source === parent) return true
  return Boolean(runtimeWindow.opener && event.source === runtimeWindow.opener)
}
