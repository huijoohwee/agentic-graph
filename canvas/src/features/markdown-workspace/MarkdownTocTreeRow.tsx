import React from 'react'
import { FileText, Folder } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MarkdownTocDropMarkers, MarkdownTocExpandGlyph, MarkdownTocReorderHandle } from '@/features/markdown/ui/MarkdownTocChrome'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_COMPACT_LIST_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

type MarkdownTocTreeRowProps = {
  itemId: string
  text: string
  headingNumber: string
  indent: number
  hasChildren: boolean
  isExpanded: boolean
  isActive: boolean
  isDragging: boolean
  dragState: 'none' | 'top' | 'bottom'
  uiPanelTextFontClass: string
  uiPanelKeyValueTextSizeClass: string
  onClick: () => void
  onDragStart: React.DragEventHandler<HTMLButtonElement>
  onDragEnd: React.DragEventHandler<HTMLButtonElement>
}

export function MarkdownTocTreeRow(props: MarkdownTocTreeRowProps) {
  const {
    itemId,
    text,
    headingNumber,
    indent,
    hasChildren,
    isExpanded,
    isActive,
    isDragging,
    dragState,
    uiPanelTextFontClass,
    uiPanelKeyValueTextSizeClass,
    onClick,
    onDragStart,
    onDragEnd,
  } = props
  const displayText = readMarkdownSigilDisplayText(text)

  return (
    <>
      <MarkdownTocDropMarkers dragState={dragState} />

      <button
        type="button"
        data-toc-id={itemId}
        className={`flex-1 min-w-0 flex items-center gap-1 rounded ${UI_RESPONSIVE_COMPACT_LIST_ROW_CLASSNAME} ${uiPanelKeyValueTextSizeClass} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} ${uiPanelTextFontClass} ${isDragging ? 'opacity-50' : ''} ${uiSelectedRowStateClassName(isActive)}`}
        style={{ paddingLeft: 6 + indent }}
        onClick={onClick}
        aria-label={`Heading ${displayText}`}
        title={displayText}
      >
        {hasChildren ? (
          <MarkdownTocExpandGlyph isExpanded={isExpanded} className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} />
        ) : (
          <span className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" />
        )}
        {hasChildren ? <Folder className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" /> : <FileText className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} aria-hidden="true" />}
        <span className={`shrink-0 tabular-nums ${UI_THEME_TOKENS.text.secondary}`}>{headingNumber}</span>
        <span className="truncate">{renderMarkdownSigilInlineText(text)}</span>
      </button>

      <MarkdownTocReorderHandle
        ariaLabel="Reorder heading"
        title="Reorder heading"
        className={`opacity-100 cursor-grab active:cursor-grabbing w-4 h-4 shrink-0 flex items-center justify-center rounded ${UI_THEME_TOKENS.text.tertiary} ${UI_THEME_TOKENS.button.hoverText}`}
        iconClassName={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    </>
  )
}
