import React from 'react'
import type { TokensTable, Token } from './MarkdownTokens'
import type { TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import { renderInlineTokens } from '@/lib/markdown-core/ui/MarkdownInlineRenderer.impl'
import type { RenderOpts } from './MarkdownRendererTypes'
import { MarkdownBlockContainer } from './MarkdownBlockContainer'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { UI_COPY } from '@/lib/config'
import { MarkdownDataViewBlock } from './MarkdownDataViewBlock'
import { isMarkdownDataViewCandidate } from './markdownDataViewModel'
import {
  MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS,
  MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS,
  MarkdownBlockDropMarkers,
  MarkdownBlockGutterControls,
  useMarkdownLineBlockDnD,
} from './MarkdownBlockGutter'
import { MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS } from './markdownEditSurfaceLayout'
import {
  CARD_MARKDOWN_PREVIEW_BLOCK_SPACING_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_FRAME_CLASS_NAME,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import { UI_RESPONSIVE_MARKDOWN_TABLE_FRAME_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type MarkdownTableBlockProps = {
  token: TokenWithLines
  highlightClass: string
  opts: RenderOpts
  highlightStyle?: React.CSSProperties
  fragmentsEnabled?: boolean
  fragmentStep?: number
  fragmentClassNames?: string[]
  fragmentTags?: string[]
}

import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

export const MarkdownTableBlock = React.memo(function MarkdownTableBlock({
  token: t,
  highlightClass,
  opts,
  highlightStyle,
  fragmentsEnabled = false,
  fragmentStep = 0,
  fragmentClassNames,
  fragmentTags,
}: MarkdownTableBlockProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)

  const tbl = t as unknown as TokensTable
  const endLine = t.endLine || t.startLine
  const blockControlsAllowed =
    !opts.markdownPresentationMode &&
    !!opts.viewerBlockEditingEnabled &&
    opts.markdownBlockControlsEnabled !== false
  const useEditableDataView = blockControlsAllowed && !!opts.onReplaceLineRange
  const isDataView =
    !opts.markdownPresentationMode &&
    !opts.markdownForcePlainTables &&
    (useEditableDataView || isMarkdownDataViewCandidate(tbl))
  const canInsertLine = blockControlsAllowed && !!opts.onInsertLineAfter && Number.isFinite(endLine)
  const canReorder = blockControlsAllowed && !isDataView && !!opts.onReorderLineBlock && Number.isFinite(t.startLine)
  const gutterEnabled = (canInsertLine || canReorder) && opts.markdownBlockGutterEnabled !== false

  const dnd = useMarkdownLineBlockDnD({
    enabled: canReorder,
    targetStartLine: t.startLine,
    targetEndLine: endLine,
    onReorder: (source, target, position) => opts.onReorderLineBlock?.(source, target, position),
  })
  const cardPreviewMode = opts.markdownCardPreviewMode === true
  const documentTableFrameClassName = `${UI_RESPONSIVE_MARKDOWN_TABLE_FRAME_CLASSNAME} rounded-lg border ${UI_THEME_TOKENS.table.cellBorder} shadow-none`
  const figureClassName = cardPreviewMode ? CARD_MARKDOWN_PREVIEW_FRAME_CLASS_NAME : documentTableFrameClassName
  const blockSpacingClassName = cardPreviewMode ? CARD_MARKDOWN_PREVIEW_BLOCK_SPACING_CLASS_NAME : 'mt-4 mb-4'
  const tableEditorClassName = [
    MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS,
    isDataView ? '' : figureClassName,
    cardPreviewMode ? '[&_table]:w-full' : '[&_table]:min-w-full',
    '[&_table]:border-collapse',
    cardPreviewMode ? '[&_table]:table-fixed' : '[&_table]:table-auto',
    opts.markdownPresentationMode ? '[&_table]:text-lg' : (cardPreviewMode ? '[&_table]:text-xs' : '[&_table]:text-sm'),
    `[&_th]:${UI_THEME_TOKENS.table.headerBg}`,
    `[&_th]:${UI_THEME_TOKENS.table.text}`,
    cardPreviewMode ? `[&_th]:px-2` : `[&_th]:px-4`,
    cardPreviewMode ? `[&_th]:py-1.5` : `[&_th]:py-2`,
    `[&_th]:text-left`,
    `[&_th]:font-semibold`,
    `[&_th]:border-b`,
    cardPreviewMode ? '[&_th]:break-words' : '',
    cardPreviewMode ? '[&_th]:whitespace-normal' : '',
    `[&_th]:${UI_THEME_TOKENS.table.cellBorder}`,
    cardPreviewMode ? `[&_td]:px-2` : `[&_td]:px-4`,
    cardPreviewMode ? `[&_td]:py-1.5` : `[&_td]:py-2`,
    `[&_td]:border-b`,
    cardPreviewMode ? '[&_td]:break-words' : '',
    cardPreviewMode ? '[&_td]:whitespace-normal' : '',
    `[&_td]:${UI_THEME_TOKENS.table.cellBorder}`,
  ]
    .filter(Boolean)
    .join(' ')

  if (!gutterEnabled) {
    const ContainerTag = (isDataView ? 'section' : 'figure') as 'section' | 'figure'
    return (
      <MarkdownBlockContainer
        as={ContainerTag}
        className={`${blockSpacingClassName} ${isDataView ? '' : figureClassName}`}
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
        editorClassName={tableEditorClassName}
        editPresentation="html"
        editHtmlRender="block"
        editHtmlDisableDefaultBlockFlow
      >
        {isDataView ? (
          <MarkdownDataViewBlock
            token={t}
            table={tbl}
            highlightClass={highlightClass}
            highlightStyle={highlightStyle}
            opts={opts}
          />
        ) : (
          <table
            className={[
              cardPreviewMode ? 'w-full table-fixed' : 'min-w-full table-auto',
              'border-collapse',
              opts.markdownPresentationMode ? 'text-lg' : (cardPreviewMode ? 'text-xs' : 'text-sm'),
            ].join(' ')}
          >
            <thead className={`${UI_THEME_TOKENS.table.headerBg} ${UI_THEME_TOKENS.table.text}`}>
              <tr>
                {tbl.header.map((cell, j) => (
                  <th
                    key={j}
                    className={`${cardPreviewMode ? 'px-2 py-1.5 break-words whitespace-normal' : 'px-4 py-2'} text-left font-semibold border-b ${UI_THEME_TOKENS.table.cellBorder} align-top sticky top-0 z-10 ${UI_THEME_TOKENS.table.headerBg}`}
                  >
                    {renderInlineTokens(cell.tokens as unknown as Token[] | undefined, {
                      activeDocumentPath: opts.activeDocumentPath,
                      uiPanelTextFontClass: opts.uiPanelTextFontClass,
                      uiPanelMonospaceTextClass: opts.uiPanelMonospaceTextClass,
                      markdownPresentationMode: opts.markdownPresentationMode,
                      markdownCardPreviewMode: opts.markdownCardPreviewMode,
                      markdownViewerMediaMode: opts.markdownViewerMediaMode,
                      markdownVariablePreviewByKey: opts.markdownVariablePreviewByKey,
                      fragmentOptions:
                        opts.markdownPresentationMode && fragmentsEnabled
                          ? {
                              enabled: true,
                              currentStep: fragmentStep,
                              classNames: fragmentClassNames || [],
                              tags: fragmentTags || [],
                            }
                          : null,
                    })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={UI_THEME_TOKENS.table.text}>
              {tbl.rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className={`odd:${UI_THEME_TOKENS.table.rowBg} even:${UI_THEME_TOKENS.table.rowBgAlt} ${UI_THEME_TOKENS.table.rowHoverHighlight} transition-colors`}
                >
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className={`${cardPreviewMode ? 'px-2 py-1.5 break-words whitespace-normal' : 'px-4 py-2'} border-b ${UI_THEME_TOKENS.table.cellBorder} align-top`}>
                      {renderInlineTokens(cell.tokens as unknown as Token[] | undefined, {
                        activeDocumentPath: opts.activeDocumentPath,
                        uiPanelTextFontClass: opts.uiPanelTextFontClass,
                        uiPanelMonospaceTextClass: opts.uiPanelMonospaceTextClass,
                        markdownPresentationMode: opts.markdownPresentationMode,
                        markdownCardPreviewMode: opts.markdownCardPreviewMode,
                        markdownViewerMediaMode: opts.markdownViewerMediaMode,
                        markdownVariablePreviewByKey: opts.markdownVariablePreviewByKey,
                        fragmentOptions:
                          opts.markdownPresentationMode && fragmentsEnabled
                            ? {
                                enabled: true,
                                currentStep: fragmentStep,
                                classNames: fragmentClassNames || [],
                                tags: fragmentTags || [],
                              }
                            : null,
                      })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </MarkdownBlockContainer>
    )
  }

  const wrapperClassName = [
    'mt-4 mb-4 relative group',
    MARKDOWN_BLOCK_GUTTER_PADDING_LEFT_CLASS,
    MARKDOWN_BLOCK_GUTTER_PADDING_RIGHT_CLASS,
    dnd.isDragging ? 'opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <MarkdownBlockContainer
      as="section"
      className={wrapperClassName}
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
      editorClassName={tableEditorClassName}
      editPresentation="html"
      editHtmlRender="block"
      editHtmlDisableDefaultBlockFlow
      onDragOver={dnd.handleDragOver}
      onDragLeave={dnd.handleDragLeave}
      onDrop={dnd.handleDrop}
    >
      <MarkdownBlockDropMarkers dragState={dnd.dragState} />
      <MarkdownBlockGutterControls
        canInsertLine={canInsertLine}
        onInsertLine={() => opts.onInsertLineAfter?.(endLine)}
        canReorder={canReorder}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
        iconSizeClass={iconSizeClass}
        iconStrokeWidth={uiIconStrokeWidth}
        labelReorder={UI_COPY.markdownBlockReorderLineLabel}
        labelInsert={UI_COPY.markdownBlockInsertLineLabel}
      />
      {isDataView ? (
        <MarkdownDataViewBlock
          token={t}
          table={tbl}
          highlightClass={highlightClass}
          highlightStyle={highlightStyle}
          opts={opts}
        />
      ) : (
        <figure className={figureClassName}>
          <table className={['min-w-full border-collapse table-auto', opts.markdownPresentationMode ? 'text-lg' : 'text-sm'].join(' ')}>
            <thead className={`${UI_THEME_TOKENS.table.headerBg} ${UI_THEME_TOKENS.table.text}`}>
              <tr>
                {tbl.header.map((cell, j) => (
                  <th
                    key={j}
                    className={`px-4 py-2 text-left font-semibold border-b ${UI_THEME_TOKENS.table.cellBorder} align-top sticky top-0 z-10 ${UI_THEME_TOKENS.table.headerBg}`}
                  >
                    {renderInlineTokens(cell.tokens as unknown as Token[] | undefined, {
                      activeDocumentPath: opts.activeDocumentPath,
                      uiPanelTextFontClass: opts.uiPanelTextFontClass,
                      uiPanelMonospaceTextClass: opts.uiPanelMonospaceTextClass,
                      markdownPresentationMode: opts.markdownPresentationMode,
                      markdownCardPreviewMode: opts.markdownCardPreviewMode,
                      markdownViewerMediaMode: opts.markdownViewerMediaMode,
                      markdownVariablePreviewByKey: opts.markdownVariablePreviewByKey,
                      fragmentOptions:
                        opts.markdownPresentationMode && fragmentsEnabled
                          ? {
                              enabled: true,
                              currentStep: fragmentStep,
                              classNames: fragmentClassNames || [],
                              tags: fragmentTags || [],
                            }
                          : null,
                    })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={UI_THEME_TOKENS.table.text}>
              {tbl.rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className={`odd:${UI_THEME_TOKENS.table.rowBg} even:${UI_THEME_TOKENS.table.rowBgAlt} ${UI_THEME_TOKENS.table.rowHoverHighlight} transition-colors`}
                >
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className={`px-4 py-2 border-b ${UI_THEME_TOKENS.table.cellBorder} align-top`}>
                      {renderInlineTokens(cell.tokens as unknown as Token[] | undefined, {
                        activeDocumentPath: opts.activeDocumentPath,
                        uiPanelTextFontClass: opts.uiPanelTextFontClass,
                        uiPanelMonospaceTextClass: opts.uiPanelMonospaceTextClass,
                        markdownPresentationMode: opts.markdownPresentationMode,
                        markdownCardPreviewMode: opts.markdownCardPreviewMode,
                        markdownViewerMediaMode: opts.markdownViewerMediaMode,
                        markdownVariablePreviewByKey: opts.markdownVariablePreviewByKey,
                        fragmentOptions:
                          opts.markdownPresentationMode && fragmentsEnabled
                            ? {
                                enabled: true,
                                currentStep: fragmentStep,
                                classNames: fragmentClassNames || [],
                                tags: fragmentTags || [],
                              }
                            : null,
                      })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
    </MarkdownBlockContainer>
  )
})
