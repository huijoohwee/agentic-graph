import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { matchesMarkdownDocumentPath } from 'grph-shared/markdown/documentPath'
import { getMarkdownXrVariableTarget, getMarkdownXrVariableLabel, getMarkdownXrVariableInvocations } from '@/features/markdown/ui/markdownXrVariableInvocations'
import { MarkdownVariableInvocationChip } from './MarkdownVariableInvocationChip'
import {
  buildMarkdownVariableSsotAnchorId,
  collectMarkdownVariableBrowseRows,
  collectMarkdownVariableSsotEntries,
  parseMarkdownVariableTokens,
} from '@/features/markdown/ui/markdownVariableReferences'
import { DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME } from '@/features/markdown/ui/dataViewChipStyles'
import type { InlineRenderOpts, MarkdownVariablePreview } from '@/features/markdown/ui/MarkdownRendererTypes'
import { isSafeHref, isSafeMediaSrc, resolveHref } from '@/features/markdown/ui/markdownPreviewLinks'
import {
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import { InlineMediaCommandThumbnail } from '@/lib/command-menu/InlineMediaCommandThumbnail'
import type { InlineMediaKind } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { resolveRenderableMediaResource } from '@/lib/graph/mediaUrlKind'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'

const normalizePreviewKey = (key: string): string => String(key || '').trim().toLowerCase()

export const buildMarkdownVariablePreviewByKey = (sourceMarkdownText: string, onInvoke?: (key: string, invocation: string) => Promise<void>): Record<string, MarkdownVariablePreview> => {
  const rows = collectMarkdownVariableBrowseRows({ sourceLines: String(sourceMarkdownText || '').split(/\r?\n/), draftText: '' })
  const ssotByKey = new Map(collectMarkdownVariableSsotEntries(sourceMarkdownText).map(entry => [normalizePreviewKey(entry.key), entry]))
  const out: Record<string, MarkdownVariablePreview> = {}
  for (const row of rows) {
    if (!row?.key) continue
    const ssot = ssotByKey.get(normalizePreviewKey(row.key))
    out[normalizePreviewKey(row.key)] = { value: row.value, source: row.source, line: ssot?.line ?? null }
  }
  for (const [key, preview] of Object.entries(out)) {
    const target = getMarkdownXrVariableTarget(out, key)
    if (!target) continue
    preview.displayValue = getMarkdownXrVariableLabel(target, preview.value)
    preview.invocationTarget = target
    if (onInvoke) preview.onInvoke = invocation => onInvoke(key, invocation)
  }
  return out
}

export function useMarkdownVariablePreviewSource(source: string | undefined, editable: boolean, maxChars: number, activeDocumentPath = '') {
  const latest = React.useRef({ source, editable, activeDocumentPath })
  latest.current = { source, editable, activeDocumentPath }
  const invoke = React.useCallback(async (key: string, invocation: string) => {
    const requested = latest.current
    try {
      // Load the existing MCP/WebMCP controller only for an explicit user action.
      const { controlLocalXrScene } = await import('@/features/three/xrSceneMcpRuntime')
      const current = latest.current, state = useGraphStore.getState()
      if (current.activeDocumentPath !== requested.activeDocumentPath
        || !current.editable || !current.source || !current.activeDocumentPath || !state.markdownDocumentName
        || !matchesMarkdownDocumentPath(current.activeDocumentPath, state.markdownDocumentName)) return
      const target = buildMarkdownVariablePreviewByKey(current.source)[key]?.invocationTarget
      if (!target || !getMarkdownXrVariableInvocations(target).some(item => item.invocation === invocation)) return
      const result = controlLocalXrScene({ invocation })
      if (!result.ok) state.pushUiToast({ id: 'markdown:xr:invoke', kind: 'error', message: result.message })
    } catch {
      useGraphStore.getState().pushUiToast({ id: 'markdown:xr:invoke', kind: 'error', message: 'The XR action could not be loaded or applied. Try again.' })
    }
  }, [])
  return React.useMemo(() => !source || source.length > maxChars
    ? { entries: [], previewByKey: {} }
    : { entries: collectMarkdownVariableSsotEntries(source), previewByKey: buildMarkdownVariablePreviewByKey(source, editable ? invoke : undefined) }, [source, editable, maxChars, invoke])
}

function resolveVariableMediaPreview(
  key: string,
  opts: InlineRenderOpts,
): { kind: InlineMediaKind; sourceUrl: string; thumbnailUrl?: string } | null {
  const preview = opts.markdownVariablePreviewByKey?.[normalizePreviewKey(key)]
  const rawUrl = String(preview?.value || key || '').trim()
  if (!rawUrl) return null
  const resolvedUrl = resolveHref(rawUrl, opts.activeDocumentPath)
  if (!resolvedUrl || !isSafeHref(resolvedUrl) || !isSafeMediaSrc(resolvedUrl)) return null
  const resource = resolveRenderableMediaResource(resolvedUrl)
  if (!resource || (resource.kind !== 'image' && resource.kind !== 'svg' && resource.kind !== 'video' && resource.kind !== 'audio')) return null
  const kind: InlineMediaKind = resource.kind === 'audio' ? 'audio' : resource.kind === 'video' ? 'video' : 'image'
  const thumbnailUrl = resource.thumbnailUrl || (kind === 'image' ? resource.url : '')
  return { kind, sourceUrl: resource.url, thumbnailUrl: thumbnailUrl || undefined }
}

function readVariableSourceText(key: string, opts: InlineRenderOpts, mediaPreview: { sourceUrl?: string } | null): string {
  const preview = opts.markdownVariablePreviewByKey?.[normalizePreviewKey(key)]
  const source = preview?.source || 'unresolved'
  const line = preview?.line ? ` line ${preview.line}` : ''
  return [
    `@${key} - Markdown variable`,
    `Source: ${source}${line}`,
    preview?.value ? `Value: ${preview.value}` : '',
    mediaPreview?.sourceUrl ? `Media: ${mediaPreview.sourceUrl}` : '',
  ].filter(Boolean).join('\n')
}

export function renderMarkdownVariableReferenceChip(args: {
  baseKey: string
  key: string
  raw: string
  opts: InlineRenderOpts
  visited?: string[]
}): React.ReactElement {
  const mediaPreview = resolveVariableMediaPreview(args.key, args.opts)
  const sourceText = readVariableSourceText(args.key, args.opts, mediaPreview)
  const atToken = `@${args.key}`
  const token = parseMarkdownVariableTokens(args.raw)[0]
  const value = args.opts.markdownVariablePreviewByKey?.[normalizePreviewKey(args.key)]?.value
    ?? token?.declaredValue ?? token?.fallback
  const preview = args.opts.markdownVariablePreviewByKey?.[normalizePreviewKey(args.key)]
  if (preview?.invocationTarget) {
    return <MarkdownVariableInvocationChip key={args.baseKey} variableKey={args.key} preview={preview} sourceText={sourceText} />
  }
  const visited = args.visited || []
  const nested = value != null && visited.length < 8 && !visited.includes(args.key.toLowerCase()) ? parseMarkdownVariableTokens(value) : []
  if (value != null && nested.length) {
    const parts: React.ReactNode[] = []
    let cursor = 0
    for (const [index, reference] of nested.entries()) {
      parts.push(value.slice(cursor, reference.start))
      parts.push(renderMarkdownVariableReferenceChip({ baseKey: `${args.baseKey}:${index}`, key: reference.key, raw: reference.raw, opts: args.opts, visited: [...visited, args.key.toLowerCase()] }))
      cursor = reference.end
    }
    parts.push(value.slice(cursor))
    return <span key={args.baseKey} data-kg-var-rendered-value={args.key}>{parts}</span>
  }
  return (
    <a
      key={args.baseKey}
      href={`#${buildMarkdownVariableSsotAnchorId(args.key)}`}
      data-kg-var-key={args.key}
      data-kg-var-raw={args.raw}
      data-kg-var-source={sourceText}
      data-kg-var-token={atToken}
      data-kg-var-value={args.opts.markdownVariablePreviewByKey?.[normalizePreviewKey(args.key)]?.value || undefined}
      className={mediaPreview ? `${CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME} cursor-help no-underline` : 'cursor-help no-underline'}
      title={sourceText}
    >
      {mediaPreview ? (
        <>
          <InlineMediaCommandThumbnail kind={mediaPreview.kind} thumbnailUrl={mediaPreview.thumbnailUrl} variant="inline" />
          <span className={CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME}>{atToken}</span>
        </>
      ) : value != null ? <span data-kg-var-rendered-value={args.key}>{value}</span> : renderMarkdownSigilInlineText(atToken, { keywordChipClassName: DATA_VIEW_INLINE_TEXT_CHIP_ROW_CLASSNAME })}
    </a>
  )
}
