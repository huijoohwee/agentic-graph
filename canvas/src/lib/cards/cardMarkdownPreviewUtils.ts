import {
  UI_INLINE_CHIP_LABEL_15CH_CLASSNAME,
  UI_INLINE_CHIP_SHELL_15CH_CLASSNAME,
  UI_INLINE_MEDIA_CHIP_SHELL_15CH_CLASSNAME,
  UI_INLINE_TEXT_PILL_HEIGHT_CLASSNAME,
} from '@/lib/ui/textLayout'
import { UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
export { normalizeCardInlineMediaSoftLineBreaks } from '@/lib/cards/cardInlineTextViewerDraftProjection'

const CARD_MARKDOWN_STRUCTURAL_PATTERN = /`[^`\n]+`|(^|\n)\s*(?:>+|```|\|[^\n]*\|)|!\[[^\]]*]\([^)]+?\)|(?<!!)\[[^\]]+]\([^)]+?\)|(^|[^\\])\$[^$\n]+\$|<\s*(?:iframe|img|video|audio)\b/i

export const CARD_MARKDOWN_PREVIEW_FRAME_CLASS_NAME = 'overflow-y-auto overflow-x-hidden max-h-full'
export const CARD_MARKDOWN_PREVIEW_BLOCK_SPACING_CLASS_NAME = 'm-0'
export const CARD_MARKDOWN_PREVIEW_MEDIA_CLASS_NAME = 'max-w-full h-auto object-contain'
export const CARD_MARKDOWN_PREVIEW_CHIP_CLASS_NAME =
  `${UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME} ${UI_INLINE_CHIP_SHELL_15CH_CLASSNAME} ${UI_INLINE_MEDIA_CHIP_SHELL_15CH_CLASSNAME} align-baseline gap-0.5 rounded-full border border-[color:var(--kg-border)] pl-1 pr-1.5 ${UI_INLINE_TEXT_PILL_HEIGHT_CLASSNAME} [font-size:inherit] text-[color:var(--kg-text-secondary)]`
export const CARD_MARKDOWN_PREVIEW_INLINE_TEXT_TOKEN_CHIP_CLASS_NAME =
  'inline rounded-[0.35em] bg-[color:var(--kg-panel-action-bg)] text-[color:var(--kg-text-secondary)] shadow-[inset_0_0_0_1px_var(--kg-border)] box-decoration-clone [-webkit-box-decoration-break:clone] [font-size:inherit] [line-height:inherit]'
export const CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME =
  'inline-block !h-3 !w-3 shrink-0 rounded-full object-cover'
export const CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME =
  `${CARD_MARKDOWN_PREVIEW_CHIP_CLASS_NAME} !items-baseline [&>[data-kg-inline-command-thumbnail]]:self-center max-w-full overflow-hidden`
export const CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME =
  `min-w-0 ${UI_INLINE_CHIP_LABEL_15CH_CLASSNAME} [line-height:inherit]`
export const CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME = 'bg-transparent'
export const CARD_MARKDOWN_PREVIEW_MEDIA_FRAME_CLASS_NAME = 'kg-card-markdown-preview-media-frame'
export const CARD_MARKDOWN_PREVIEW_MEDIA_EMBED_FRAME_CLASS_NAME = 'kg-card-markdown-preview-media-embed-frame'
export const CARD_MARKDOWN_PREVIEW_MEDIA_AUDIO_CLASS_NAME = 'kg-card-markdown-preview-media-audio'
export const CARD_MARKDOWN_PREVIEW_MEDIA_WIDE_AUDIO_CLASS_NAME = 'kg-card-markdown-preview-media-audio kg-card-markdown-preview-media-audio--wide'
export const CARD_MARKDOWN_PREVIEW_MEDIA_ERROR_FRAME_CLASS_NAME = 'kg-card-markdown-preview-media-error-frame'
export const CARD_MARKDOWN_PREVIEW_MEDIA_SHELL_CLASS_NAME = `w-full h-full overflow-hidden relative ${CARD_MARKDOWN_PREVIEW_MEDIA_CHROME_CLASS_NAME}`
export const CARD_MARKDOWN_PREVIEW_CODE_CHROME_CLASS_NAME =
  'bg-[color:var(--kg-code-bg)] text-[color:var(--kg-code-text)]'
export const CARD_MARKDOWN_PREVIEW_CODE_SURFACE_PADDING_CLASS_NAME = 'p-4'
export const CARD_MARKDOWN_PREVIEW_EMBEDDED_SURFACE_CLASS_NAME =
  `min-w-0 max-w-full overflow-y-auto overflow-x-hidden overscroll-contain ${CARD_MARKDOWN_PREVIEW_CODE_CHROME_CLASS_NAME}`
export const CARD_MARKDOWN_PREVIEW_CODE_SURFACE_CLASS_NAME =
  `relative overflow-y-auto overflow-x-hidden ${CARD_MARKDOWN_PREVIEW_CODE_SURFACE_PADDING_CLASS_NAME}`
export const CARD_MARKDOWN_PREVIEW_MERMAID_SURFACE_CLASS_NAME =
  `${CARD_MARKDOWN_PREVIEW_CODE_SURFACE_CLASS_NAME} ${CARD_MARKDOWN_PREVIEW_CODE_CHROME_CLASS_NAME}`

export function hasCardMarkdownPreviewSyntax(raw: string): boolean {
  return CARD_MARKDOWN_STRUCTURAL_PATTERN.test(String(raw || ''))
}

export function readCardMarkdownPreviewMediaLabel(raw: unknown, fallback: string): string {
  const compact = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:image|video|audio|media)\s*:\s*/i, '')
    .trim()
  if (compact && !/^(?:thumbnail|preview|media)$/i.test(compact)) return compact.slice(0, 80)
  return fallback
}

type CardMarkdownPreviewTextBlock = {
  startLine?: unknown
  endLine?: unknown
  title?: unknown
  summary?: unknown
  preview?: {
    kind?: unknown
    ordered?: unknown
    listItems?: unknown
    table?: unknown
    code?: unknown
    callout?: unknown
    blockquote?: unknown
    html?: unknown
  }
}

const splitMarkdownPreviewLines = (raw: unknown): string[] => String(raw || '').split(/\r?\n/g)

const trimBlankMarkdownPreviewLines = (raw: string): string => {
  const lines = splitMarkdownPreviewLines(raw)
  while (lines.length > 0 && !String(lines[0] || '').trim()) lines.shift()
  while (lines.length > 0 && !String(lines[lines.length - 1] || '').trim()) lines.pop()
  return lines.join('\n')
}

const readPositiveLine = (raw: unknown): number | null => {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

const isCardMarkdownPreviewSourceCompatible = (kind: string, raw: string): boolean => {
  const source = String(raw || '').trim()
  if (!source) return false
  if (kind === 'code') return /^\s*(?:```|~~~)/.test(raw) || /^(?: {4}|\t)/.test(raw)
  if (kind === 'table') return /^\s*\|[^\n]*\|/m.test(raw)
  if (kind === 'blockquote' || kind === 'callout') return /^\s*>/m.test(raw)
  if (kind === 'html') return /^\s*</.test(source)
  if (kind === 'list') return /^\s*(?:[-+*]|\d+[.)])\s+/m.test(raw)
  if (kind === 'hr') return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(source)
  return true
}

export function readCardMarkdownPreviewSourceLineRange(args: {
  markdownText?: unknown
  startLine?: unknown
  endLine?: unknown
}): string {
  const markdownText = String(args.markdownText || '')
  if (!markdownText) return ''
  const startLine = readPositiveLine(args.startLine)
  if (startLine == null) return ''
  const endLine = Math.max(startLine, readPositiveLine(args.endLine) ?? startLine)
  const lines = splitMarkdownPreviewLines(markdownText)
  if (startLine > lines.length) return ''
  return trimBlankMarkdownPreviewLines(lines.slice(startLine - 1, endLine).join('\n'))
}

const buildTableMarkdownPreviewText = (table: unknown): string => {
  if (!table || typeof table !== 'object') return ''
  const rec = table as { columns?: unknown; rows?: unknown }
  const columns = Array.isArray(rec.columns) ? rec.columns.map(value => String(value ?? '')) : []
  const rows = Array.isArray(rec.rows)
    ? rec.rows
      .filter((row): row is unknown[] => Array.isArray(row))
      .map(row => row.map(value => String(value ?? '')))
    : []
  const width = Math.max(columns.length, ...rows.map(row => row.length), 0)
  if (width <= 0) return ''
  const paddedColumns = Array.from({ length: width }, (_, index) => columns[index] ?? '')
  const padRow = (row: string[]) => Array.from({ length: width }, (_, index) => row[index] ?? '')
  return serializeMarkdownPipeTable({ columns: paddedColumns, rows: rows.map(padRow) }).join('\n')
}

const buildCodeMarkdownPreviewText = (code: unknown): string => {
  if (!code || typeof code !== 'object') return ''
  const rec = code as { lang?: unknown; lines?: unknown }
  const lang = String(rec.lang || '').replace(/[` \t\r\n]+/g, '').trim()
  const lines: string[] = Array.isArray(rec.lines) ? rec.lines.map(line => String(line ?? '')) : []
  let maxFenceRun = 0
  for (const line of lines) {
    const runs = String(line).match(/`+/g)
    if (!runs) continue
    for (const run of runs) maxFenceRun = Math.max(maxFenceRun, run.length)
  }
  const fence = '`'.repeat(Math.max(3, maxFenceRun + 1))
  return [fence + lang, ...lines, fence].join('\n')
}

const buildBlockquoteMarkdownPreviewText = (blockquote: unknown): string => {
  if (!blockquote || typeof blockquote !== 'object') return ''
  const lines = Array.isArray((blockquote as { lines?: unknown }).lines)
    ? ((blockquote as { lines: unknown[] }).lines).map(line => String(line ?? ''))
    : []
  return lines.map(line => (line ? `> ${line}` : '>')).join('\n')
}

const buildCalloutMarkdownPreviewText = (callout: unknown): string => {
  if (!callout || typeof callout !== 'object') return ''
  const rec = callout as { calloutType?: unknown; title?: unknown }
  const calloutType = String(rec.calloutType || '').trim() || 'note'
  const title = String(rec.title || '').trim()
  return `> [!${calloutType.toUpperCase()}]${title ? ` ${title}` : ''}`
}

const buildListMarkdownPreviewText = (args: { ordered?: unknown; listItems?: unknown }): string => {
  const items = Array.isArray(args.listItems)
    ? args.listItems as Array<{ text?: unknown; task?: unknown; checked?: unknown }>
    : []
  const ordered = args.ordered === true
  return items
    .map((item, index) => {
      const base = ordered ? `${index + 1}.` : '-'
      const text = String(item?.text || '').trim()
      if (item?.task === true) return `${base} ${item.checked === true ? '[x]' : '[ ]'} ${text}`.trim()
      return `${base} ${text}`.trim()
    })
    .join('\n')
}

export function buildCardMarkdownPreviewText(args: {
  block?: CardMarkdownPreviewTextBlock | null
  markdownText?: unknown
}): string {
  const block = args.block || null
  if (!block) return ''
  const preview = block.preview || null
  const kind = String(preview?.kind || '').trim()
  const sourceText = readCardMarkdownPreviewSourceLineRange({
    markdownText: args.markdownText,
    startLine: block.startLine,
    endLine: block.endLine,
  })
  if (sourceText.trim() && isCardMarkdownPreviewSourceCompatible(kind, sourceText)) return sourceText

  const fallback = (() => {
    if (kind === 'table') return buildTableMarkdownPreviewText(preview?.table)
    if (kind === 'code') return buildCodeMarkdownPreviewText(preview?.code)
    if (kind === 'blockquote') return buildBlockquoteMarkdownPreviewText(preview?.blockquote)
    if (kind === 'callout') return buildCalloutMarkdownPreviewText(preview?.callout)
    if (kind === 'list') return buildListMarkdownPreviewText({ ordered: preview?.ordered, listItems: preview?.listItems })
    if (kind === 'hr') return '---'
    if (kind === 'html') {
      const html = preview?.html && typeof preview.html === 'object' ? (preview.html as { raw?: unknown }) : null
      return String(html?.raw || '').trim()
    }
    return ''
  })()
  return fallback.trim() || String(block.summary || '').trim() || String(block.title || '').trim()
}
