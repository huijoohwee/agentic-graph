import React from 'react'
import type { RichMediaKind } from '@/components/RichMediaPanel.types'
import { CardPreviewInlineMediaPill } from '@/lib/cards/CardPreviewInlineMediaPill'
import {
  collectInlineMediaCommandCandidates,
  type InlineMediaCommandCandidate,
} from '@/lib/command-menu/inlineCommandMenuCatalog'

const RichMediaPanelLazy = React.lazy(() => import('@/components/RichMediaPanel'))

const safeImageSrc = (raw: string): string | null => {
  const value = String(raw || '').trim()
  if (!value) return null
  const lower = value.toLowerCase()
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:image/') ||
    lower.startsWith('blob:') ||
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../')
  ) return value
  return null
}

const readWholeCellMarkdownImage = (raw: string): { alt: string; src: string } | null => {
  const match = /^!\[([^\]\r\n]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)$/.exec(String(raw || '').trim())
  if (!match) return null
  const src = safeImageSrc(match[2] || '')
  if (!src) return null
  return {
    alt: (match[1] || 'Thumbnail').replace(/\\]/g, ']').trim() || 'Thumbnail',
    src,
  }
}

type NestedTableCell = {
  headers: string[]
  rows: string[][]
}

export type SourceLineNestedTableCell =
  | { kind: 'table'; table: NestedTableCell; lineCount: number; sourceLineRange: string; levelDepth: number }
  | { kind: 'continuation'; rowNumber: number; lineCount: number; sourceLineRange: string; levelDepth: number }

const DATA_VIEW_NESTED_TABLE_ROW_LIMIT = 8
const DATA_VIEW_NESTED_TABLE_COLUMN_LIMIT = 6
const NESTED_TABLE_PIPE_ROW_RE = /^\|?.+\|.+\|?$/
const NESTED_TABLE_SEPARATOR_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/

const normalizeNestedTableLine = (raw: string): string => String(raw || '').trim().replace(/\\\|/g, '|')

const readStructuredSourceLevelDepth = (raw: string): number => {
  const match = String(raw || '').trim().match(/^L(\d+)$/i)
  const depth = match ? Number.parseInt(match[1] || '0', 10) : 0
  return Number.isFinite(depth) && depth > 0 ? Math.min(8, depth) : 0
}

const readStructuredSourceIndentDepth = (raw: string): number => {
  const indent = Number.parseInt(String(raw || '').trim(), 10)
  return Number.isFinite(indent) && indent > 0 ? Math.min(8, Math.floor(indent / 2)) : 0
}

const parsePipeTableRow = (raw: string): string[] => {
  const trimmed = normalizeNestedTableLine(raw)
  const body = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return body.split('|').map(cell => cell.trim()).slice(0, DATA_VIEW_NESTED_TABLE_COLUMN_LIMIT)
}

const readWholeCellNestedMarkdownTable = (raw: string): NestedTableCell | null => {
  const lines = String(raw || '').trim().split(/\r?\n/).map(normalizeNestedTableLine).filter(Boolean)
  if (lines.length < 3) return null
  if (!lines[0]?.includes('|') || !lines[1]?.includes('|')) return null
  if (!NESTED_TABLE_SEPARATOR_RE.test(lines[1] || '')) return null

  const headers = parsePipeTableRow(lines[0] || '').filter(Boolean)
  if (!headers.length) return null
  const rows = lines.slice(2, 2 + DATA_VIEW_NESTED_TABLE_ROW_LIMIT)
    .map(parsePipeTableRow)
    .filter(row => row.some(Boolean))
  if (!rows.length) return null
  return { headers, rows }
}

export const buildSourceLineNestedTableCellMap = (args: {
  rows: readonly { id: string; cells: readonly string[] }[]
  contentColumnIndex: number
  lineColumnIndex?: number
  levelColumnIndex?: number
  indentColumnIndex?: number
}): Map<string, SourceLineNestedTableCell> => {
  const result = new Map<string, SourceLineNestedTableCell>()
  if (args.contentColumnIndex < 0) return result
  let rowIndex = 0
  while (rowIndex < args.rows.length - 2) {
    const blockLines: string[] = []
    const firstLine = normalizeNestedTableLine(args.rows[rowIndex]?.cells[args.contentColumnIndex] || '')
    const secondLine = normalizeNestedTableLine(args.rows[rowIndex + 1]?.cells[args.contentColumnIndex] || '')
    if (!NESTED_TABLE_PIPE_ROW_RE.test(firstLine) || !NESTED_TABLE_SEPARATOR_RE.test(secondLine)) {
      rowIndex += 1
      continue
    }
    let cursor = rowIndex
    while (cursor < args.rows.length) {
      const line = normalizeNestedTableLine(args.rows[cursor]?.cells[args.contentColumnIndex] || '')
      if (!NESTED_TABLE_PIPE_ROW_RE.test(line)) break
      blockLines.push(line)
      cursor += 1
    }
    const table = readWholeCellNestedMarkdownTable(blockLines.join('\n'))
    if (!table) {
      rowIndex += 1
      continue
    }
    const lineCount = cursor - rowIndex
    const hasLineColumn = typeof args.lineColumnIndex === 'number' && args.lineColumnIndex >= 0
    const sourceStartLine = hasLineColumn ? String(args.rows[rowIndex]?.cells[args.lineColumnIndex!] || '').trim() : ''
    const sourceEndLine = hasLineColumn ? String(args.rows[cursor - 1]?.cells[args.lineColumnIndex!] || '').trim() : ''
    const sourceLineRange = sourceStartLine && sourceEndLine
      ? sourceStartLine === sourceEndLine ? sourceStartLine : `${sourceStartLine}-${sourceEndLine}`
      : ''
    const hasLevelColumn = typeof args.levelColumnIndex === 'number' && args.levelColumnIndex >= 0
    const levelValue = hasLevelColumn ? String(args.rows[rowIndex]?.cells[args.levelColumnIndex!] || '').trim() : ''
    const hasIndentColumn = typeof args.indentColumnIndex === 'number' && args.indentColumnIndex >= 0
    const levelDepth = levelValue
      ? readStructuredSourceLevelDepth(levelValue)
      : hasIndentColumn
        ? readStructuredSourceIndentDepth(String(args.rows[rowIndex]?.cells[args.indentColumnIndex!] || ''))
        : 0
    result.set(args.rows[rowIndex]!.id, { kind: 'table', table, lineCount, sourceLineRange, levelDepth })
    for (let index = rowIndex + 1; index < cursor; index += 1) {
      result.set(args.rows[index]!.id, { kind: 'continuation', rowNumber: index - rowIndex + 1, lineCount, sourceLineRange, levelDepth })
    }
    rowIndex = cursor
  }
  return result
}

const isInlineHtmlDocument = (raw: string): boolean => {
  const value = String(raw || '').trim().toLowerCase()
  return value.startsWith('<!doctype html') || value.startsWith('<html') || value.includes('<body')
}

const readWholeCellHtmlMediaElement = (raw: string): InlineMediaCommandCandidate | null => {
  const value = String(raw || '').trim()
  const tagMatch = /^<(video|audio)\b/i.exec(value)
  if (!tagMatch) return null
  return collectInlineMediaCommandCandidates({ sourceLines: [value], draftText: value, limit: 1 })[0] || null
}

const readWholeCellInlineMedia = (raw: string): InlineMediaCommandCandidate | null => {
  const value = String(raw || '').trim()
  if (!value) return null
  const htmlElement = readWholeCellHtmlMediaElement(value)
  if (htmlElement) return htmlElement
  const candidates = collectInlineMediaCommandCandidates({ sourceLines: [value], draftText: value, limit: 1 })
  return candidates[0] || null
}

const renderNestedTableCellContent = (raw: string): React.ReactNode => {
  const richContent = renderMarkdownDataViewTableRichCell(raw, { nested: true })
  if (richContent) return richContent
  return raw || '—'
}

const renderNestedTableCell = (table: NestedTableCell): React.ReactNode => (
  <table
    aria-label="Nested table cell"
    data-kg-markdown-data-view-nested-table-cell="1"
    className="w-full min-w-[12rem] border-collapse text-[11px]"
  >
    <thead>
      <tr>
        {table.headers.map((header, index) => (
          <th
            key={`${header}:${index}`}
            scope="col"
            className="border border-[color:var(--kg-border)] bg-[color:var(--kg-muted)] px-2 py-1 text-left font-medium"
          >
            {header}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {table.rows.map((row, rowIndex) => (
        <tr key={`nested-row-${rowIndex}`}>
          {table.headers.map((_, columnIndex) => (
            <td key={`nested-cell-${rowIndex}-${columnIndex}`} className="border border-[color:var(--kg-border)] px-2 py-1 align-top">
              {renderNestedTableCellContent(row[columnIndex] || '')}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
)

const renderSourceLineNestedTableCell = (cell: SourceLineNestedTableCell): React.ReactNode => {
  const offsetStyle = cell.levelDepth > 0
    ? { marginInlineStart: `${Math.min(8, cell.levelDepth) * 1.25}rem` }
    : undefined
  if (cell.kind === 'continuation') {
    return (
      <span
        aria-label={`Nested table continuation row ${cell.rowNumber} of ${cell.lineCount}`}
        className="block max-w-max rounded border border-dashed border-[color:var(--kg-border)] px-2 py-0.5 text-[10px] text-[color:var(--kg-muted-foreground)]"
        data-kg-markdown-data-view-nested-table-continuation="1"
        data-kg-markdown-data-view-nested-source-lines={cell.sourceLineRange}
        data-kg-markdown-data-view-nested-level-depth={String(cell.levelDepth)}
        style={offsetStyle}
      >
        {`Grouped row ${cell.rowNumber}/${cell.lineCount}`}
      </span>
    )
  }
  const columnCount = cell.table.headers.length
  const rowCount = cell.table.rows.length
  const caption = [
    'Markdown table',
    `${columnCount} ${columnCount === 1 ? 'column' : 'columns'}`,
    `${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`,
    cell.sourceLineRange ? `lines ${cell.sourceLineRange}` : '',
  ].filter(Boolean).join(' · ')
  return (
    <figure
      aria-label="Nested source table"
      className="m-0 min-w-[14rem] max-w-[42rem] overflow-auto rounded border border-[color:var(--kg-border)] bg-[color:var(--kg-surface)] p-1"
      data-kg-markdown-data-view-nested-source-table="1"
      data-kg-markdown-data-view-nested-source-lines={String(cell.lineCount)}
      data-kg-markdown-data-view-nested-source-line-range={cell.sourceLineRange}
      data-kg-markdown-data-view-nested-level-depth={String(cell.levelDepth)}
      style={offsetStyle}
    >
      <figcaption className="px-1 pb-1 text-[10px] font-medium text-[color:var(--kg-muted-foreground)]">
        {caption}
      </figcaption>
      {renderNestedTableCell(cell.table)}
    </figure>
  )
}

const renderRichMediaCell = (args: {
  title: string
  url: string
  kind: RichMediaKind
  srcDoc?: string
  poster?: string
  presentation?: 'panel' | 'chip'
}): React.ReactNode => {
  const panelStyle = {
    width: '12rem',
    height: args.kind === 'audio' ? '4.5rem' : '7.25rem',
    boxShadow: 'none',
    ['--kg-media-panel-padding' as never]: '0px',
    ['--kg-media-panel-radius' as never]: '6px',
  } as React.CSSProperties
  const panel = (
    <React.Suspense fallback={<span aria-hidden="true" className="block" style={panelStyle} />}>
      <RichMediaPanelLazy
        title={args.title}
        url={args.url}
        openUrl={args.url}
        srcDoc={args.srcDoc}
        kind={args.kind}
        videoControls
        videoPoster={args.poster}
        interactive={false}
        style={panelStyle}
      />
    </React.Suspense>
  )
  if (args.presentation === 'chip') {
    const thumbnailKind = args.kind === 'audio' || args.kind === 'video' || args.kind === 'image'
      ? args.kind
      : args.kind === 'svg'
        ? 'image'
        : undefined
    const stopCellEditActivation = (event: React.SyntheticEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    return (
      <span
        className="inline-flex max-w-full"
        data-kg-markdown-data-view-rich-media-cell="1"
        data-kg-markdown-data-view-rich-media-mode="chip"
        onMouseDown={stopCellEditActivation}
        onClick={stopCellEditActivation}
      >
        <CardPreviewInlineMediaPill
          label={args.title}
          fallbackLabel="Media"
          fullMedia={panel}
          thumbnailKind={thumbnailKind}
          thumbnailUrl={args.poster || (thumbnailKind === 'image' ? args.url : undefined)}
          toggleEnabled
        >
          <span aria-hidden="true" />
        </CardPreviewInlineMediaPill>
      </span>
    )
  }
  return (
    <figure
      className="m-0 min-w-[12rem]"
      data-kg-markdown-data-view-rich-media-cell="1"
      onClick={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {panel}
    </figure>
  )
}

export const renderMarkdownDataViewTableRichCell = (
  raw: string,
  options: { nested?: boolean; sourceLineNestedTable?: SourceLineNestedTableCell | null } = {},
): React.ReactNode | null => {
  if (options.sourceLineNestedTable) return renderSourceLineNestedTableCell(options.sourceLineNestedTable)
  const nestedTable = options.nested ? null : readWholeCellNestedMarkdownTable(raw)
  if (nestedTable) return renderNestedTableCell(nestedTable)
  const presentation = 'chip'

  const image = readWholeCellMarkdownImage(raw)
  if (image) {
    return renderRichMediaCell({
      title: image.alt,
      url: image.src,
      kind: image.src.toLowerCase().includes('.svg') ? 'svg' : 'image',
      presentation,
    })
  }

  const inlineMedia = readWholeCellInlineMedia(raw)
  if (inlineMedia) {
    return renderRichMediaCell({
      title: inlineMedia.label,
      url: inlineMedia.url,
      kind: inlineMedia.kind,
      poster: inlineMedia.thumbnailUrl,
      presentation,
    })
  }

  if (isInlineHtmlDocument(raw)) {
    return renderRichMediaCell({
      title: 'HTML cell',
      url: '',
      kind: 'iframe',
      srcDoc: String(raw || '').trim(),
      presentation,
    })
  }

  return null
}
