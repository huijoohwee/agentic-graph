import React from 'react'
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

export const buildMarkdownVariablePreviewByKey = (sourceMarkdownText: string): Record<string, MarkdownVariablePreview> => {
  const rows = collectMarkdownVariableBrowseRows({ sourceLines: String(sourceMarkdownText || '').split(/\r?\n/), draftText: '' })
  const ssotByKey = new Map(collectMarkdownVariableSsotEntries(sourceMarkdownText).map(entry => [normalizePreviewKey(entry.key), entry]))
  const out: Record<string, MarkdownVariablePreview> = {}
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row?.key) continue
    const ssot = ssotByKey.get(normalizePreviewKey(row.key))
    out[normalizePreviewKey(row.key)] = { value: row.value, source: row.source, line: ssot?.line ?? null }
  }
  return out
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
}): React.ReactElement {
  const mediaPreview = resolveVariableMediaPreview(args.key, args.opts)
  const sourceText = readVariableSourceText(args.key, args.opts, mediaPreview)
  const atToken = `@${args.key}`
  const token = parseMarkdownVariableTokens(args.raw)[0]
  const value = args.opts.markdownVariablePreviewByKey?.[normalizePreviewKey(args.key)]?.value
    ?? token?.declaredValue ?? token?.fallback
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
