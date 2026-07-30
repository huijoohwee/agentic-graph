import React from 'react'
import type { TokensList, Token } from './MarkdownTokens'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import { addLineRangesToTokens } from '@/features/markdown/ui/markdownPreviewLex'
import MarkdownTokenRenderer from './MarkdownTokenRenderer'
import type { RenderOpts } from './MarkdownRendererTypes'
import { MarkdownBlockContainer } from './MarkdownBlockContainer'
import { renderInlineTokens } from '@/lib/markdown-core/ui/MarkdownInlineRenderer.impl'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { UI_COPY } from '@/lib/config'
import {
  MARKDOWN_BLOCK_GUTTER_CONTROLS_LIST_ROW_ALIGNMENT_CLASS,
  MarkdownBlockDropMarkers,
  MarkdownBlockGutterControls,
  useMarkdownLineBlockDnD,
} from './MarkdownBlockGutter'
import {
  getMarkdownListSurfaceClass,
  MARKDOWN_LIST_ROW_EDITOR_CLASS,
  MARKDOWN_LIST_ROW_GUTTER_GROUP_CLASS,
  MARKDOWN_LIST_ROW_GUTTER_PADDING_CLASS,
  MARKDOWN_LIST_ROW_VIEW_INLINE_CLASS,
  MARKDOWN_LIST_TASK_CHECKBOX_CLASS,
} from './markdownListLayout'
import { MARKDOWN_BLOCK_STACK_SPACING_CLASS, MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS } from './markdownEditSurfaceLayout'

type MarkdownListBlockProps = {
  token: TokenWithLines
  highlightClass: string
  opts: RenderOpts
  baseTextClass: string
  wrapClass: string
  highlightStyle?: React.CSSProperties
  fragmentsEnabled?: boolean
  fragmentStep?: number
  fragmentClassNames?: string[]
  fragmentTags?: string[]
}

function MarkdownListRow(props: {
  item: TokensList['items'][number]
  itemIndex: number
  rowRange: { startLine: number; endLine: number } | undefined
  tokenStartLine: number
  wrapClass: string
  opts: RenderOpts
  rowEditingEnabled: boolean
  rowEditorClassName: string
  stripListLinePrefix: (line: string) => { prefix: string; content: string }
  fragmentsEnabled?: boolean
  fragmentStep?: number
  fragmentClassNames?: string[]
  fragmentTags?: string[]
  iconSizeClass: string
  iconStrokeWidth: number
  rowControlsEnabled: boolean
}) {
  const {
    item,
    itemIndex,
    rowRange,
    tokenStartLine,
    wrapClass,
    opts,
    rowEditingEnabled,
    rowEditorClassName,
    stripListLinePrefix,
    fragmentsEnabled,
    fragmentStep,
    fragmentClassNames,
    fragmentTags,
    iconSizeClass,
    iconStrokeWidth,
    rowControlsEnabled,
  } = props
  const resolvedRowRange = rowRange || {
    startLine: tokenStartLine + itemIndex,
    endLine: tokenStartLine + itemIndex,
  }
  const task = item.task ? (
    <input
      type="checkbox"
      checked={!!item.checked}
      readOnly
      className={MARKDOWN_LIST_TASK_CHECKBOX_CLASS}
    />
  ) : null
  const rowCanInsert = rowControlsEnabled && !!opts.onInsertLineAfter
  const rowCanReorder = rowControlsEnabled && !!opts.onReorderLineBlock
  const rowStartLine = resolvedRowRange.startLine
  const rowEndLine = resolvedRowRange.endLine
  const editRange = rowRange || undefined
  const rowDnd = useMarkdownLineBlockDnD({
    enabled: rowCanReorder,
    targetStartLine: rowStartLine,
    targetEndLine: rowEndLine,
    onReorder: (source, target, position) => opts.onReorderLineBlock?.(source, target, position),
  })
  const rowDefaultLinePrefix = React.useMemo(() => {
    const source = opts.markdownSourceLines
    if (!Array.isArray(source) || source.length === 0) return '  '
    const first = String(source[resolvedRowRange.startLine - 1] || '')
    const marker = first.match(/^(\s*(?:[-+*]\s+(?:\[(?: |x|X)?\]\s+)?|\d+[.)]\s+))/)
    if (marker) return ' '.repeat((marker[1] || '').length)
    const continuation = first.match(/^(\s+)/)
    if (continuation) return continuation[1] || '  '
    return '  '
  }, [opts.markdownSourceLines, resolvedRowRange.startLine])
  const rowClassName = [
    opts.uiPanelTextFontClass,
    wrapClass,
    rowControlsEnabled ? MARKDOWN_LIST_ROW_GUTTER_GROUP_CLASS : '',
    rowControlsEnabled ? MARKDOWN_LIST_ROW_GUTTER_PADDING_CLASS : '',
    rowDnd.isDragging ? 'opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const onlyParagraph = (() => {
    if (!Array.isArray(item.tokens) || item.tokens.length !== 1) return null
    const first = item.tokens[0] as unknown as { type?: string; tokens?: Token[] }
    if (first?.type !== 'paragraph' || !Array.isArray(first.tokens)) return null
    return first.tokens as Token[]
  })()
  const useHtmlInlineRow = !!onlyParagraph
  const nestedBlockEditingEnabled = rowEditingEnabled && !useHtmlInlineRow
  return (
    <li
      data-kg-list-item-index={itemIndex}
      data-kg-list-item-start-line={resolvedRowRange.startLine}
      data-kg-list-item-end-line={resolvedRowRange.endLine}
      className={rowClassName}
      onDragOver={rowCanReorder ? rowDnd.handleDragOver : undefined}
      onDragLeave={rowCanReorder ? rowDnd.handleDragLeave : undefined}
      onDrop={rowCanReorder ? rowDnd.handleDrop : undefined}
    >
      {rowControlsEnabled ? <MarkdownBlockDropMarkers dragState={rowDnd.dragState} /> : null}
      {rowControlsEnabled ? (
        <MarkdownBlockGutterControls
          canInsertLine={rowCanInsert}
          onInsertLine={() => opts.onInsertLineAfter?.(rowEndLine)}
          canReorder={rowCanReorder}
          onDragStart={rowDnd.handleDragStart}
          onDragEnd={rowDnd.handleDragEnd}
          iconSizeClass={iconSizeClass}
          iconStrokeWidth={iconStrokeWidth}
          labelReorder={UI_COPY.markdownBlockReorderLineLabel}
          labelInsert={UI_COPY.markdownBlockInsertLineLabel}
          containerClassName={MARKDOWN_BLOCK_GUTTER_CONTROLS_LIST_ROW_ALIGNMENT_CLASS}
          revealClassName="group-hover/list-row:opacity-100"
        />
      ) : null}
      {task}
      <MarkdownBlockContainer
        as="span"
        className={MARKDOWN_LIST_ROW_VIEW_INLINE_CLASS}
        highlightClass=""
        startLine={rowStartLine}
        endLine={rowEndLine}
        editLineRange={editRange}
        inlineEditable={rowEditingEnabled && !!editRange && useHtmlInlineRow}
        sourceLines={opts.markdownSourceLines}
        onReplaceLineRange={opts.onReplaceLineRange}
        onInlineEditStateChange={opts.onInlineEditStateChange}
        onInlineDraftTextChange={opts.onInlineDraftTextChange}
        forbidCopy={!!opts.forbidCopy}
        editorClassName={rowEditorClassName}
        editPresentation="html"
        editHtmlRender="inline"
        editInlineFlow
        editStripLinePrefix={stripListLinePrefix}
        editDefaultLinePrefix={rowDefaultLinePrefix}
        editTrimEdgeNewlines
      >
        {useHtmlInlineRow ? (
          <span>
            {renderInlineTokens(onlyParagraph, {
              activeDocumentPath: opts.activeDocumentPath,
              uiPanelTextFontClass: opts.uiPanelTextFontClass,
              uiPanelMonospaceTextClass: opts.uiPanelMonospaceTextClass,
              markdownPresentationMode: opts.markdownPresentationMode,
              markdownCardPreviewMode: opts.markdownCardPreviewMode,
              markdownViewerMediaMode: opts.markdownViewerMediaMode,
              markdownVariablePreviewByKey: opts.markdownVariablePreviewByKey,
            })}
          </span>
        ) : (
          <MarkdownTokenRenderer
            tokens={addLineRangesToTokens(item.tokens as unknown as Token[], 0)}
            blockNestingLevel={0}
            activeDocumentPath={opts.activeDocumentPath}
            highlightedLineRange={null}
            markdownWordWrap={opts.markdownWordWrap}
            markdownPresentationMode={opts.markdownPresentationMode}
            uiPanelTextFontClass={opts.uiPanelTextFontClass}
            uiPanelMonospaceTextClass={opts.uiPanelMonospaceTextClass}
            markdownCardPreviewMode={opts.markdownCardPreviewMode}
            markdownViewerMediaMode={opts.markdownViewerMediaMode}
            markdownVariablePreviewByKey={opts.markdownVariablePreviewByKey}
            mermaidFrontmatterConfig={opts.mermaidFrontmatterConfig}
            rootThemeMode={opts.rootThemeMode}
            previewOverlayScope={opts.previewOverlayScope}
            previewOverlayPortalTarget={opts.previewOverlayPortalTarget}
            viewerBlockEditingEnabled={nestedBlockEditingEnabled}
            onReplaceLineRange={nestedBlockEditingEnabled ? opts.onReplaceLineRange : undefined}
            markdownSourceLines={opts.markdownSourceLines}
            markdownParagraphEditStripLinePrefix={stripListLinePrefix}
            markdownParagraphEditDefaultLinePrefix={rowDefaultLinePrefix}
            forbidCopy={!!opts.forbidCopy}
            onInlineEditStateChange={opts.onInlineEditStateChange}
            onInlineDraftTextChange={opts.onInlineDraftTextChange}
            fragmentsEnabled={fragmentsEnabled}
            fragmentStep={fragmentStep}
            fragmentClassNames={fragmentClassNames}
            fragmentTags={fragmentTags}
          />
        )}
      </MarkdownBlockContainer>
    </li>
  )
}

export const MarkdownListBlock = React.memo(function MarkdownListBlock({
  token: t,
  highlightClass,
  opts,
  baseTextClass,
  wrapClass,
  highlightStyle,
  fragmentsEnabled,
  fragmentStep,
  fragmentClassNames,
  fragmentTags,
}: MarkdownListBlockProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)

  const list = t as unknown as TokensList
  const endLine = t.endLine || t.startLine
  const blockControlsAllowed =
    !opts.markdownPresentationMode &&
    !!opts.viewerBlockEditingEnabled &&
    opts.markdownBlockControlsEnabled !== false
  const canInsertLine = blockControlsAllowed && !!opts.onInsertLineAfter && Number.isFinite(endLine)
  const canReorder = blockControlsAllowed && !!opts.onReorderLineBlock && Number.isFinite(t.startLine)
  const gutterEnabled = (canInsertLine || canReorder) && opts.markdownBlockGutterEnabled !== false
  const editLineRange = React.useMemo(() => {
    const src = opts.markdownSourceLines
    if (!Array.isArray(src) || src.length === 0) return null
    let start = Math.max(1, Math.floor(t.startLine || 1))
    let end = Math.max(start, Math.floor(t.endLine || t.startLine || 1))
    while (start <= end && !String(src[start - 1] || '').trim()) start += 1
    while (end >= start && !String(src[end - 1] || '').trim()) end -= 1
    if (start > end) return null
    return { startLine: start, endLine: end }
  }, [opts.markdownSourceLines, t.endLine, t.startLine])
  const resolveEditLineRangeOnOpen = React.useCallback(() => {
    const src = opts.markdownSourceLines
    if (!Array.isArray(src) || src.length === 0 || !editLineRange) return editLineRange
    const isListMarkerLine = (line: string): boolean => {
      const raw = String(line || '')
      if (!raw.trim()) return false
      return /^\s*(?:[-+*]\s+|\d+[.)]\s+)/.test(raw)
    }
    const isContinuationLine = (line: string): boolean => {
      const raw = String(line || '')
      if (!raw.trim()) return false
      if (/^\s*(?:[-+*]\s+|\d+[.)]\s+)/.test(raw)) return false
      if (/^\s+/.test(raw)) return true
      return false
    }
    const isListOrContinuationLine = (line: string): boolean => isListMarkerLine(line) || isContinuationLine(line)
    const isBlank = (line: string): boolean => String(line || '').trim().length === 0
    let start = editLineRange.startLine
    let end = editLineRange.endLine
    while (start > 1) {
      const prev = String(src[start - 2] || '')
      if (isListOrContinuationLine(prev)) {
        start -= 1
        continue
      }
      if (isBlank(prev) && start > 2) {
        const beforePrev = String(src[start - 3] || '')
        if (isListOrContinuationLine(beforePrev) && isListOrContinuationLine(String(src[start - 1] || ''))) {
          start -= 1
          continue
        }
      }
      break
    }
    while (end < src.length) {
      const next = String(src[end] || '')
      if (isListOrContinuationLine(next)) {
        end += 1
        continue
      }
      if (isBlank(next) && end + 1 < src.length) {
        const afterNext = String(src[end + 1] || '')
        if (isListOrContinuationLine(afterNext) && isListOrContinuationLine(String(src[end - 1] || ''))) {
          end += 1
          continue
        }
      }
      break
    }
    return { startLine: start, endLine: end }
  }, [editLineRange, opts.markdownSourceLines])
  const listItemRowRanges = React.useMemo(() => {
    const src = opts.markdownSourceLines
    const baseRange = editLineRange
    if (!Array.isArray(src) || src.length === 0 || !baseRange) return []
    const ranges: Array<{ startLine: number; endLine: number }> = []
    const readListMarkerIndent = (line: string): number | null => {
      const marker = String(line || '').match(/^(\s*)(?:[-+*]\s+|\d+[.)]\s+)/)
      if (!marker) return null
      return String(marker[1] || '').replace(/\t/g, '    ').length
    }
    const baseMarkerIndent = (() => {
      for (let line = baseRange.startLine; line <= baseRange.endLine; line += 1) {
        const indent = readListMarkerIndent(String(src[line - 1] || ''))
        if (indent !== null) return indent
      }
      return null
    })()
    const isListMarkerLine = (line: string): boolean => readListMarkerIndent(line) !== null
    const isRowMarkerLine = (line: string): boolean =>
      baseMarkerIndent !== null && readListMarkerIndent(line) === baseMarkerIndent
    const isBlankLine = (line: string): boolean => String(line || '').trim().length === 0
    const isContinuationLine = (line: string): boolean => {
      const raw = String(line || '')
      if (!raw.trim()) return false
      if (isListMarkerLine(raw)) return false
      return /^\s+/.test(raw)
    }
    let cursor = Math.max(1, baseRange.startLine)
    const endBound = Math.max(cursor, baseRange.endLine)
    while (cursor <= endBound) {
      const line = String(src[cursor - 1] || '')
      if (!isRowMarkerLine(line)) {
        cursor += 1
        continue
      }
      const rowStart = cursor
      let rowEnd = cursor
      let probe = cursor + 1
      while (probe <= endBound) {
        const next = String(src[probe - 1] || '')
        if (isRowMarkerLine(next)) break
        const nestedMarkerIndent = readListMarkerIndent(next)
        if (nestedMarkerIndent !== null && baseMarkerIndent !== null && nestedMarkerIndent > baseMarkerIndent) {
          rowEnd = probe
          probe += 1
          continue
        }
        if (isContinuationLine(next)) {
          rowEnd = probe
          probe += 1
          continue
        }
        if (isBlankLine(next)) {
          const after = String(src[probe] || '')
          if (isContinuationLine(after) || (
            baseMarkerIndent !== null
            && readListMarkerIndent(after) !== null
            && Number(readListMarkerIndent(after)) > baseMarkerIndent
          )) {
            rowEnd = probe + 1
            probe += 2
            continue
          }
        }
        break
      }
      ranges.push({ startLine: rowStart, endLine: rowEnd })
      cursor = Math.max(rowEnd + 1, probe)
    }
    if (ranges.length === 0 && list.items.length > 0) {
      let line = Math.max(1, baseRange.startLine)
      const fallback: Array<{ startLine: number; endLine: number }> = []
      for (let i = 0; i < list.items.length; i += 1) {
        while (line <= endBound && !isRowMarkerLine(String(src[line - 1] || ''))) line += 1
        if (line > endBound) break
        fallback.push({ startLine: line, endLine: line })
        line += 1
      }
      if (fallback.length > 0) return fallback
    }
    return ranges
  }, [editLineRange, list.items.length, opts.markdownSourceLines])
  const ListTag = (list.ordered ? 'ol' : 'ul') as 'ol' | 'ul'
  const listSurfaceClass = getMarkdownListSurfaceClass(!!list.ordered)
  const listReadInnerClassName = [
    listSurfaceClass,
    MARKDOWN_NORMAL_TEXT_READ_SURFACE_BASE_CLASS,
    baseTextClass,
    opts.uiPanelTextFontClass,
  ]
    .filter(Boolean)
    .join(' ')
  const rowEditorClassName = [MARKDOWN_LIST_ROW_EDITOR_CLASS, baseTextClass, opts.uiPanelTextFontClass].filter(Boolean).join(' ')
  const stripListLinePrefix = React.useCallback((line: string) => {
    const markerMatch = line.match(/^(\s*(?:[-+*]\s+(?:\[(?: |x|X)?\]\s+)?|\d+[.)]\s+))([\s\S]*)$/)
    if (markerMatch) return { prefix: markerMatch[1] || '', content: markerMatch[2] || '' }
    const continuationMatch = line.match(/^(\s+)([\s\S]*)$/)
    if (continuationMatch) return { prefix: continuationMatch[1] || '', content: continuationMatch[2] || '' }
    return { prefix: '', content: line }
  }, [])
  const rowEditingEnabled = blockControlsAllowed && !!opts.onReplaceLineRange
  const listNode = React.useMemo(() => (
    <ListTag className={listReadInnerClassName}>
      {list.items.map((item, j) => {
        const rowRange = listItemRowRanges[j]
        return (
          <MarkdownListRow
            key={j}
            item={item}
            itemIndex={j}
            rowRange={rowRange}
            tokenStartLine={t.startLine}
            wrapClass={wrapClass}
            opts={opts}
            rowEditingEnabled={rowEditingEnabled}
            rowEditorClassName={rowEditorClassName}
            stripListLinePrefix={stripListLinePrefix}
            fragmentsEnabled={fragmentsEnabled}
            fragmentStep={fragmentStep}
            fragmentClassNames={fragmentClassNames}
            fragmentTags={fragmentTags}
            iconSizeClass={iconSizeClass}
            iconStrokeWidth={uiIconStrokeWidth}
            rowControlsEnabled={gutterEnabled}
          />
        )
      })}
    </ListTag>
  ), [
    ListTag,
    fragmentClassNames,
    fragmentStep,
    fragmentTags,
    fragmentsEnabled,
    list.items,
    listItemRowRanges,
    listReadInnerClassName,
    opts.activeDocumentPath,
    opts.markdownPresentationMode,
    opts.markdownWordWrap,
    opts.mermaidFrontmatterConfig,
    opts.previewOverlayPortalTarget,
    opts.previewOverlayScope,
    opts.rootThemeMode,
    opts.uiPanelMonospaceTextClass,
    opts.uiPanelTextFontClass,
    gutterEnabled,
    iconSizeClass,
    rowEditingEnabled,
    rowEditorClassName,
    stripListLinePrefix,
    t.startLine,
    uiIconStrokeWidth,
    wrapClass,
  ])
  const listBlockClassName = [MARKDOWN_BLOCK_STACK_SPACING_CLASS, baseTextClass, opts.uiPanelTextFontClass].filter(Boolean).join(' ')
  const listWrapperClassName = [listBlockClassName, 'relative group'].filter(Boolean).join(' ')

  if (!gutterEnabled) {
    return (
      <MarkdownBlockContainer
        as="section"
        className={listBlockClassName}
        highlightClass={highlightClass}
        highlightStyle={highlightStyle}
        startLine={t.startLine}
        endLine={t.endLine}
        inlineEditable={false}
        sourceLines={opts.markdownSourceLines}
        onReplaceLineRange={opts.onReplaceLineRange}
        onInlineEditStateChange={opts.onInlineEditStateChange}
        onInlineDraftTextChange={opts.onInlineDraftTextChange}
        forbidCopy={!!opts.forbidCopy}
      >
        {listNode}
      </MarkdownBlockContainer>
    )
  }

  return (
    <MarkdownBlockContainer
      as="section"
      className={listWrapperClassName}
      highlightClass={highlightClass}
      highlightStyle={highlightStyle}
      startLine={t.startLine}
      endLine={t.endLine}
      inlineEditable={false}
      sourceLines={opts.markdownSourceLines}
      onReplaceLineRange={opts.onReplaceLineRange}
      onInlineEditStateChange={opts.onInlineEditStateChange}
        onInlineDraftTextChange={opts.onInlineDraftTextChange}
      forbidCopy={!!opts.forbidCopy}
    >
      {listNode}
    </MarkdownBlockContainer>
  )
})
