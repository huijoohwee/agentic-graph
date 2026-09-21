import React from 'react'
import type { JSONValue } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { matchesMarkdownDocumentPath } from 'grph-shared/markdown/documentPath'
import { buildMarkdownVariableChoicePatch, readMarkdownVariableChoices, type MarkdownVariableChoicePatch } from '@/features/markdown/ui/markdownVariableChoices'
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

export const buildMarkdownVariablePreviewByKey = (sourceMarkdownText: string, onChoiceChange?: (key: string, value: string) => void): Record<string, MarkdownVariablePreview> => {
  const rows = collectMarkdownVariableBrowseRows({ sourceLines: String(sourceMarkdownText || '').split(/\r?\n/), draftText: '' })
  const ssotByKey = new Map(collectMarkdownVariableSsotEntries(sourceMarkdownText).map(entry => [normalizePreviewKey(entry.key), entry]))
  const definitions = readMarkdownVariableChoices(sourceMarkdownText)
  const out: Record<string, MarkdownVariablePreview> = {}
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row?.key) continue
    const ssot = ssotByKey.get(normalizePreviewKey(row.key))
    out[normalizePreviewKey(row.key)] = { value: row.value, source: row.source, line: ssot?.line ?? null,
      ...(definitions[row.key] ? { choices: definitions[row.key], onChoiceChange: onChoiceChange ? (value: string) => onChoiceChange(row.key, value) : undefined } : {}),
    }
  }
  return out
}

export function useMarkdownVariablePreviewSource(source: string | undefined, onReplaceLineRange: ((patch: MarkdownVariableChoicePatch) => void) | undefined, maxChars: number, activeDocumentPath = '') {
  const latest = React.useRef({ source, onReplaceLineRange, activeDocumentPath })
  latest.current = { source, onReplaceLineRange, activeDocumentPath }
  const change = React.useCallback((key: string, value: string) => {
    const current = latest.current
    if (!current.source || !current.onReplaceLineRange) return
    const patch = buildMarkdownVariableChoicePatch(current.source, key, value)
    if (!patch) return
    // Timeline and Media already use this owner to persist scene metadata to source.
    const state = useGraphStore.getState()
    if (!key.startsWith('kgXrMotionReference.') || !current.activeDocumentPath || !state.markdownDocumentName
      || !matchesMarkdownDocumentPath(current.activeDocumentPath, state.markdownDocumentName)) { current.onReplaceLineRange(patch); return }
    state.updateGraphMetadata(patch.frontmatterUpdates as Record<string, JSONValue>)
    if (useGraphStore.getState().graphData?.metadata?.kgXrMotionReference !== patch.frontmatterUpdates.kgXrMotionReference) {
      state.pushUiToast({ id: 'markdown:choice:apply', kind: 'error', message: 'Apply pending source edits before changing the scene choice.' })
      return
    }
    // The workspace observes the canonical saved source; do not start a second editor draft.
  }, [])
  return React.useMemo(() => !source || source.length > maxChars
    ? { entries: [], previewByKey: {} }
    : { entries: collectMarkdownVariableSsotEntries(source), previewByKey: buildMarkdownVariablePreviewByKey(source, onReplaceLineRange ? change : undefined) }, [source, onReplaceLineRange, maxChars, change])
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
  if (preview?.choices) {
    const label = preview.choices.options.find(option => option.value === value)?.label ?? value ?? args.raw
    return preview.onChoiceChange ? <select key={args.baseKey} aria-label={preview.choices.label}
      title={sourceText} data-kg-variable-choice={args.key} value={value ?? ''}
      className="inline max-w-full rounded border-0 border-b border-dotted border-blue-400 bg-blue-50/60 px-0.5 text-inherit dark:bg-blue-950/30"
      style={{ width: `${Math.max(5, label.length + 3)}ch`, font: 'inherit' }}
      onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onChange={event => preview.onChoiceChange?.(event.target.value)}>
      {!preview.choices.options.some(option => option.value === value) ? <option value={value ?? ''}>{label}</option> : null}
      {preview.choices.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select> : <span key={args.baseKey} data-kg-var-rendered-value={args.key} title={sourceText}>{label}</span>
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
