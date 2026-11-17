import React from 'react'
import { createPortal } from 'react-dom'
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
import { MarkdownInlineSelectionToolbar } from './MarkdownInlineSelectionToolbar'
import { MarkdownBlockContainerCommentPreviewOverlay } from './markdownBlockContainerCore.commentPreviewOverlay'
import { MarkdownBlockContainerInlineMenusOverlay } from './markdownBlockContainerCore.inlineMenusOverlay'
import type { InlineMediaCommandCandidate } from '@/lib/command-menu/inlineCommandMenuCatalog'
import type { SlashMenuState } from './markdownBlockContainerCore.menuState'

export const MarkdownBlockContainerEditSurfaceView = (props: {
  editing: boolean
  editable: boolean
  children: React.ReactNode
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
}) => {
  const surfaceChildren = (
    <>
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

  const root=props.editorRef.current, rect=root?.getBoundingClientRect()
  return <>{props.children}{props.editing&&props.editable&&root&&rect?createPortal(
    <span style={{position:'fixed',left:rect.left,top:rect.top,width:0,height:0}} data-kg-viewer-tools="true">{surfaceChildren}</span>,root.ownerDocument.body):null}</>
}
