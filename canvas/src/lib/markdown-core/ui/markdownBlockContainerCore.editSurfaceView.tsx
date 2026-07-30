import React from 'react'
import {
  FLOATING_MENU_BUTTON_CLASSNAME,
  FLOATING_MENU_BUTTON_DANGER_CLASSNAME,
  FLOATING_MENU_BUTTON_DISABLED_CLASSNAME,
  FLOATING_MENU_DIVIDER_CLASSNAME,
  FLOATING_POPOVER_ACTION_BUTTON_CLASSNAME,
  FLOATING_POPOVER_PANEL_CLASSNAME,
  FLOATING_POPOVER_INPUT_CLASSNAME,
  FLOATING_MENU_LEFT_W220_CLASSNAME,
} from '@/features/markdown-workspace/main/viewer/floatingMenuStyles'
import { MARKDOWN_INLINE_CODE_EDIT_DESCENDANT_CLASSES } from '@/features/markdown/ui/markdownInlineCodeParity'
import {
  MARKDOWN_HTML_EDIT_BLOCK_FLOW_CLASS,
  MARKDOWN_HTML_EDIT_NORMALIZE_CLASS,
  MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS,
  MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_MIN_LINE_CLASS,
} from '@/features/markdown/ui/markdownEditSurfaceLayout'
import { MarkdownInlineSelectionToolbar } from './MarkdownInlineSelectionToolbar'
import { MarkdownBlockContainerCommentPreviewOverlay } from './markdownBlockContainerCore.commentPreviewOverlay'
import { MarkdownBlockContainerInlineMenusOverlay } from './markdownBlockContainerCore.inlineMenusOverlay'
import { MarkdownContentEditableCore } from './MarkdownContentEditableCore'
import type { InlineMediaCommandCandidate } from '@/lib/command-menu/inlineCommandMenuCatalog'
import type { SlashMenuState } from './markdownBlockContainerCore.menuState'
import { computeFloatingMenuPosition } from './markdownBlockContainerCore.interaction'

const MARKDOWN_EDIT_SURFACE_MOBILE_GRAMMAR_QUICK_BAR_TOKENS = [
  { id: 'slash', label: '/', description: 'Open slash commands' },
  { id: 'semantic', label: '#', description: 'Open semantic commands' },
  { id: 'variable', label: '@', description: 'Open variable commands' },
] as const

export const MarkdownBlockContainerEditSurfaceView = (props: {
  editing: boolean
  editable: boolean
  children: React.ReactNode
  hostTag: React.ElementType
  editInlineFlow: boolean
  editPreserveBlockHeight: boolean
  editMinHeightPx: number
  editStaticChildren?: React.ReactNode
  editStaticChildrenMode?: 'flow' | 'overlay' | 'passthrough'
  editLeftRailClassName?: string
  inlineSelectionToolbar: { show: boolean; leftPx: number; topPx: number }
  slashMenu: SlashMenuState
  variableMenu: { show: boolean; leftPx: number; topPx: number; query: string; keyInput: string; valueInput: string; fallbackInput: string; mode: 'ref' | 'create' | 'update' | 'fallback' | 'delete' }
  linkPopover: { show: boolean; leftPx: number; topPx: number; href: string }
  commentPreview: { show: boolean; leftPx: number; topPx: number; text: string }
  inlineSelectionToolbarAnchorRef: React.RefObject<HTMLSpanElement | null>
  slashAnchorRef: React.RefObject<HTMLSpanElement | null>
  variableAnchorRef: React.RefObject<HTMLSpanElement | null>
  linkAnchorRef: React.RefObject<HTMLSpanElement | null>
  commentAnchorRef: React.RefObject<HTMLSpanElement | null>
  toolbarRef: React.RefObject<HTMLElement | null>
  slashMenuRef: React.RefObject<HTMLElement | null>
  variableMenuRef: React.RefObject<HTMLElement | null>
  editDisableRichUi: boolean
  hasCachedSelection: boolean
  holdToolbarInteraction: () => void
  onToolbarInteractionEnd: () => void
  applyTurnInto: (next: string) => void
  applyToggleHeading: (level: 1 | 2 | 3) => void
  applyAlign: (next: string) => void
  applyDraftAction: (action: 'bold' | 'inlineCode' | 'italic' | 'link' | 'strike' | 'heading2' | 'bulletList' | 'numberedList' | 'blockquote') => void
  applyWrap: (left: string, right: string) => void
  applyCreateLinkedWidget?: () => void
  applyComment: () => void
  captureSelectionForToolbarAction?: () => void
  closeCommentPreview: () => void
  applyHighlightColor: (color: string) => void
  applyColor: (color: string) => void
  applyClearFormatting: () => void
  applyChecklist: () => void
  applyDivider: () => void
  handleDuplicate: () => void
  handleDelete: () => void
  selectionActions?: {
    startLine: number
    endLine: number
    currentView: import('grph-shared/ssot/types').SsotSurface
    onShowOnCanvas: (startLine: number, endLine: number) => void
    onShowInViewer: (line: number) => void
    onShowInEditor: (line: number) => void
    onShowInPresentation: (line: number) => void
    onShowInGallery: (line: number) => void
    onShowInGraphDataTable: (line: number) => void
  } | null
  onVariableMenuMouseDownCapture: () => void
  setSlashMenuStable: (next: SlashMenuState) => void
  setVariableMenu: React.Dispatch<React.SetStateAction<{ show: boolean; leftPx: number; topPx: number; query: string; keyInput: string; valueInput: string; fallbackInput: string; mode: 'ref' | 'create' | 'update' | 'fallback' | 'delete' }>>
  variableSuggestions: Array<{ key: string; value?: string | null; source?: string }>
  applyVariableToken: (mode: 'ref' | 'create' | 'update' | 'fallback' | 'delete', forcedKey?: string) => void
  mediaCommandCandidates: InlineMediaCommandCandidate[]
  applyMediaCommandCandidate: (candidate: InlineMediaCommandCandidate) => void
  onLinkSubmit: (event: React.FormEvent) => void
  onLinkHrefChange: (value: string) => void
  onLinkInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onLinkCancel: () => void
  editorRef: React.RefObject<HTMLElement | null>
  editorClassName?: string
  editTypographyMode: 'inherit' | 'none'
  editTypographySnapshot?: React.CSSProperties | null
  editSpacingSnapshot?: React.CSSProperties | null
  editListMode?: 'ordered' | 'unordered'
  editPresentation: 'markdown' | 'html'
  editHtmlRender: 'inline' | 'block'
  editHtmlDisableDefaultBlockFlow: boolean
  onInput: () => void
  onCopy: (event: React.ClipboardEvent<HTMLElement>) => void
  onCut: (event: React.ClipboardEvent<HTMLElement>) => void
  onMouseOverCapture?: (event: React.MouseEvent<HTMLElement>) => void
  onMouseOutCapture?: (event: React.MouseEvent<HTMLElement>) => void
  onFocusCapture?: (event: React.FocusEvent<HTMLElement>) => void
  onBlurCapture?: (event: React.FocusEvent<HTMLElement>) => void
  onBlur: (event: React.FocusEvent<HTMLElement>) => void
  onFocus: () => void
  onMouseDown: (event: React.MouseEvent<HTMLElement>) => void
  onMouseUp: (event: React.MouseEvent<HTMLElement>) => void
  onDoubleClick: (event: React.MouseEvent<HTMLElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}) => {
  if (!(props.editing && props.editable)) return <>{props.children}</>
  const hostInlineFlow = props.hostTag === 'p' || props.hostTag === 'li' || props.hostTag === 'th' || props.hostTag === 'td'
  const hostParagraphFlow = props.hostTag === 'p'
  const hostHeadingFlow =
    props.hostTag === 'h1'
    || props.hostTag === 'h2'
    || props.hostTag === 'h3'
    || props.hostTag === 'h4'
    || props.hostTag === 'h5'
    || props.hostTag === 'h6'
  const hostNormalTextFlow = hostParagraphFlow || hostHeadingFlow
  const effectiveInlineFlow = props.editInlineFlow || hostInlineFlow
  const htmlBlockEditing = props.editPresentation === 'html' && props.editHtmlRender === 'block'
  const htmlInlineEditing = props.editPresentation === 'html' && props.editHtmlRender === 'inline'
  const EditorTag = (
    htmlBlockEditing
      ? 'div'
      : htmlInlineEditing
        ? 'span'
        : ((!effectiveInlineFlow && !hostInlineFlow) ? 'div' : 'span')
  ) as 'div' | 'span'
  const htmlEditNormalizeClassName =
    props.editPresentation === 'html'
      ? [
          MARKDOWN_HTML_EDIT_NORMALIZE_CLASS,
          ...MARKDOWN_INLINE_CODE_EDIT_DESCENDANT_CLASSES,
        ].join(' ')
      : ''
  const htmlEditBlockFlowClassName =
    props.editPresentation === 'html' && props.editHtmlRender === 'block' && !props.editHtmlDisableDefaultBlockFlow
      ? MARKDOWN_HTML_EDIT_BLOCK_FLOW_CLASS
      : ''
  const editPreserveMinHeightStyle =
    props.editPreserveBlockHeight && props.editMinHeightPx > 0 ? { minHeight: `${props.editMinHeightPx}px` } : undefined
  const skipEditWrapper = props.editStaticChildrenMode === 'passthrough' && hostHeadingFlow
  const openMobileGrammarQuickBarMenu = (
    kind: 'slash' | 'semantic' | 'variable',
    anchorElement: HTMLElement,
  ) => {
    const editorRoot = props.editorRef.current
    if (!editorRoot) return
    const { leftPx, topPx } = computeFloatingMenuPosition({
      rangeRect: anchorElement.getBoundingClientRect(),
      root: editorRoot,
      gapPx: 8,
    })
    if (kind === 'variable') {
      props.setSlashMenuStable({ show: false, leftPx: 0, topPx: 0, kind: 'slash', query: '', triggerRange: null })
      props.setVariableMenu(prev => ({
        ...prev,
        show: true,
        leftPx,
        topPx,
        query: '',
        keyInput: '',
        mode: 'ref',
      }))
      return
    }
    props.setVariableMenu(prev => ({
      ...prev,
      show: false,
      leftPx: 0,
      topPx: 0,
      query: '',
      keyInput: '',
    }))
    props.setSlashMenuStable({
      show: true,
      leftPx,
      topPx,
      kind,
      query: '',
      triggerRange: null,
    })
  }
  const surfaceChildren = (
    <>
      {props.editStaticChildren
        ? (props.editStaticChildrenMode === 'passthrough'
          ? props.editStaticChildren
          : (
              <span
                className={props.editStaticChildrenMode === 'overlay'
                  ? 'absolute inset-0 z-20 select-none pointer-events-none'
                  : `pointer-events-none select-none ${effectiveInlineFlow ? 'inline align-baseline' : 'block'}`}
              >
                {props.editStaticChildren}
              </span>
            ))
        : null}
      {props.editLeftRailClassName ? <span aria-hidden className={`pointer-events-none absolute left-0 top-0 bottom-0 w-1 z-20 ${props.editLeftRailClassName}`} /> : null}
      <span ref={props.inlineSelectionToolbarAnchorRef} className="absolute w-px h-px" style={{ left: `${props.inlineSelectionToolbar.leftPx}px`, top: `${props.inlineSelectionToolbar.topPx}px` }} />
      <span ref={props.slashAnchorRef} className="absolute w-px h-px" style={{ left: `${props.slashMenu.leftPx}px`, top: `${props.slashMenu.topPx}px` }} />
      <span ref={props.variableAnchorRef} className="absolute w-px h-px" style={{ left: `${props.variableMenu.leftPx}px`, top: `${props.variableMenu.topPx}px` }} />
      <span ref={props.linkAnchorRef} className="absolute w-px h-px" style={{ left: `${props.linkPopover.leftPx}px`, top: `${props.linkPopover.topPx}px` }} />
      <span ref={props.commentAnchorRef} className="absolute w-px h-px" style={{ left: `${props.commentPreview.leftPx}px`, top: `${props.commentPreview.topPx}px` }} />

      <MarkdownInlineSelectionToolbar
        show={!props.editDisableRichUi && (props.inlineSelectionToolbar.show || props.hasCachedSelection)}
        anchorRef={props.inlineSelectionToolbarAnchorRef}
        toolbarRef={props.toolbarRef}
        holdToolbarInteraction={props.holdToolbarInteraction}
        onToolbarInteractionEnd={props.onToolbarInteractionEnd}
        floatingMenuButtonDangerClassName={FLOATING_MENU_BUTTON_DANGER_CLASSNAME}
        floatingMenuButtonDisabledClassName={FLOATING_MENU_BUTTON_DISABLED_CLASSNAME}
        toolbarMenuClassName={FLOATING_MENU_LEFT_W220_CLASSNAME}
        toolbarMenuButtonClassName={FLOATING_MENU_BUTTON_CLASSNAME}
        toolbarMenuDividerClassName={FLOATING_MENU_DIVIDER_CLASSNAME}
        applyTurnInto={props.applyTurnInto}
        applyToggleHeading={props.applyToggleHeading}
        applyAlign={props.applyAlign}
        captureSelectionForToolbarAction={props.captureSelectionForToolbarAction}
        applyDraftAction={props.applyDraftAction}
        applyWrap={props.applyWrap}
        applyCreateLinkedWidget={props.applyCreateLinkedWidget}
        applyComment={props.applyComment}
        applyHighlightColor={props.applyHighlightColor}
        applyColor={props.applyColor}
        applyClearFormatting={props.applyClearFormatting}
        applyChecklist={props.applyChecklist}
        applyDivider={props.applyDivider}
        openSlashCommandMenu={() => {
          props.setSlashMenuStable({ show: true, leftPx: props.inlineSelectionToolbar.leftPx, topPx: props.inlineSelectionToolbar.topPx, kind: 'slash', query: '' })
          props.setVariableMenu(prev => ({ ...prev, show: false, leftPx: 0, topPx: 0, query: '', keyInput: '' }))
        }}
        openVariableCommandMenu={() => {
          props.setSlashMenuStable({ show: false, leftPx: 0, topPx: 0 })
          props.setVariableMenu(prev => ({ ...prev, show: true, leftPx: props.inlineSelectionToolbar.leftPx, topPx: props.inlineSelectionToolbar.topPx, query: '', keyInput: '', mode: 'ref' }))
        }}
        handleDuplicate={props.handleDuplicate}
        handleDelete={props.handleDelete}
        selectionActions={props.selectionActions}
      />

      <MarkdownBlockContainerCommentPreviewOverlay
        show={props.commentPreview.show}
        anchorRef={props.commentAnchorRef}
        text={props.commentPreview.text}
        onClose={props.closeCommentPreview}
      />

      <MarkdownContentEditableCore
        as={EditorTag}
        editorRef={props.editorRef}
        ariaLabel="Edit markdown block"
        spellCheck={false}
        className={[
          props.editorClassName || `${MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS} ${MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_MIN_LINE_CLASS}`,
          htmlBlockEditing ? 'block' : '',
          htmlEditNormalizeClassName,
          htmlEditBlockFlowClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          ...(props.editTypographyMode === 'inherit'
            ? { font: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit', ...(props.editTypographySnapshot || null) }
            : {}),
          ...(props.editSpacingSnapshot || null),
          ...(props.editListMode
            ? { marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }
            : {}),
          ...(skipEditWrapper ? editPreserveMinHeightStyle : {}),
        }}
        onInput={props.onInput}
        onCopy={props.onCopy}
        onCut={props.onCut}
        onMouseOverCapture={props.onMouseOverCapture}
        onMouseOutCapture={props.onMouseOutCapture}
        onFocusCapture={props.onFocusCapture}
        onBlurCapture={props.onBlurCapture}
        onBlur={props.onBlur}
        onFocus={props.onFocus}
        onMouseDown={props.onMouseDown}
        onMouseUp={props.onMouseUp}
        onDoubleClick={props.onDoubleClick}
        onKeyDown={props.onKeyDown}
      />

      {!props.editDisableRichUi ? (
        <span
          className="mt-2 flex items-center gap-1 border-t pt-2 sm:hidden"
          role="toolbar"
          aria-label="Mobile grammar quick bar"
          data-kg-markdown-mobile-grammar-quick-bar="true"
        >
          {MARKDOWN_EDIT_SURFACE_MOBILE_GRAMMAR_QUICK_BAR_TOKENS.map(entry => (
            <button
              key={entry.id}
              type="button"
              className={`${FLOATING_POPOVER_ACTION_BUTTON_CLASSNAME} min-w-[2.5rem] justify-center`}
              data-kg-markdown-mobile-grammar-quick-bar-token={entry.label}
              aria-label={entry.description}
              title={entry.description}
              onMouseDown={event => {
                event.preventDefault()
                props.holdToolbarInteraction()
                if (entry.id === 'variable') props.onVariableMenuMouseDownCapture()
              }}
              onClick={event => {
                openMobileGrammarQuickBarMenu(entry.id, event.currentTarget)
              }}
            >
              {entry.label}
            </button>
          ))}
        </span>
      ) : null}

      <MarkdownBlockContainerInlineMenusOverlay
        editDisableRichUi={props.editDisableRichUi}
        slashMenu={props.slashMenu}
        variableMenu={props.variableMenu}
        linkPopover={props.linkPopover}
        slashAnchorRef={props.slashAnchorRef}
        variableAnchorRef={props.variableAnchorRef}
        linkAnchorRef={props.linkAnchorRef}
        slashMenuRef={props.slashMenuRef}
        variableMenuRef={props.variableMenuRef}
        onToolbarInteract={props.holdToolbarInteraction}
        onVariableMenuMouseDownCapture={props.onVariableMenuMouseDownCapture}
        setSlashMenuStable={props.setSlashMenuStable}
        applyTurnInto={props.applyTurnInto}
        applyDraftAction={(action) => props.applyDraftAction(action)}
        applyToggleHeading={props.applyToggleHeading}
        applyChecklist={props.applyChecklist}
        applyDivider={props.applyDivider}
        setVariableMenu={props.setVariableMenu}
        variableSuggestions={props.variableSuggestions}
        applyVariableToken={props.applyVariableToken}
        mediaCommandCandidates={props.mediaCommandCandidates}
        applyMediaCommandCandidate={props.applyMediaCommandCandidate}
        floatingMenuLeftW220ClassName={FLOATING_MENU_LEFT_W220_CLASSNAME}
        floatingMenuButtonClassName={FLOATING_MENU_BUTTON_CLASSNAME}
        floatingMenuButtonDangerClassName={FLOATING_MENU_BUTTON_DANGER_CLASSNAME}
        floatingPopoverPanelClassName={FLOATING_POPOVER_PANEL_CLASSNAME}
        floatingPopoverInputClassName={FLOATING_POPOVER_INPUT_CLASSNAME}
        actionButtonClassName={FLOATING_POPOVER_ACTION_BUTTON_CLASSNAME}
        onLinkSubmit={props.onLinkSubmit}
        onLinkHrefChange={props.onLinkHrefChange}
        onLinkInputKeyDown={props.onLinkInputKeyDown}
        onLinkCancel={props.onLinkCancel}
      />
    </>
  )

  if (skipEditWrapper) return surfaceChildren
  return (
    <span
      className={effectiveInlineFlow
        ? (hostInlineFlow
          ? (hostParagraphFlow
            ? (hostHeadingFlow ? 'block w-full min-w-0' : 'relative block w-full min-w-0')
            : (hostHeadingFlow ? 'inline-block w-full min-w-0 align-baseline' : 'relative inline-block w-full min-w-0 align-baseline'))
          : (hostHeadingFlow ? 'inline min-w-0 align-baseline' : 'relative inline min-w-0 align-baseline'))
        : (hostNormalTextFlow
          ? (hostHeadingFlow ? 'block w-full min-w-0' : 'relative block w-full min-w-0')
          : 'relative w-full block min-w-0 flex-1')}
      style={editPreserveMinHeightStyle}
    >
      {surfaceChildren}
    </span>
  )
}
