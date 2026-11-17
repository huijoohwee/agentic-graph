import React from 'react'
import { MarkdownToolbar } from 'agentic-design-system/react/rich-text'
import { getMarkdownCommand, type MarkdownFormatAction } from 'agentic-design-system/markdown'
import { AnchorOverlay } from '@/lib/ui/overlay'
import { MarkdownSelectionActionMenuItems } from './MarkdownSelectionActionMenuItems'
import type { MarkdownInlineSelectionActions } from './markdownInlineSelectionActions'
import { ProvenanceDirectionIcon } from '@/lib/storyboardWidget/ProvenanceDirectionIcon'

export const MarkdownInlineSelectionToolbar = (props: {
  show: boolean
  anchorRef: React.RefObject<HTMLSpanElement | null>
  toolbarRef: React.RefObject<HTMLElement | null>
  holdToolbarInteraction: () => void
  onToolbarInteractionEnd: () => void
  floatingMenuButtonDangerClassName: string
  floatingMenuButtonDisabledClassName: string
  toolbarMenuClassName: string
  toolbarMenuButtonClassName: string
  toolbarMenuDividerClassName: string
  applyTurnInto: (next: string) => void
  applyToggleHeading: (level: 1 | 2 | 3) => void
  applyAlign: (next: string) => void
  captureSelectionForToolbarAction?: () => void
  applyDraftAction: (action: MarkdownFormatAction) => void
  applyWrap: (left: string, right: string) => void
  applyCreateLinkedWidget?: () => void
  applyComment: () => void
  applyHighlightColor: (color: string) => void
  applyColor: (color: string) => void
  applyClearFormatting: () => void
  applyChecklist: () => void
  applyDivider: () => void
  openSlashCommandMenu: () => void
  openVariableCommandMenu: () => void
  handleDuplicate: () => void
  handleDelete: () => void
  selectionActions?: MarkdownInlineSelectionActions & {
    startLine: number
    endLine: number
  } | null
}) => {
  const [moreOpen,setMoreOpen]=React.useState(false)
  const moreRef=React.useRef<HTMLButtonElement>(null)
  if (!props.show) return null
  const run = (id:MarkdownFormatAction,value?:string) => {
    const command = getMarkdownCommand(id)
    if (/^heading[123]$/.test(id)) return props.applyToggleHeading(Number(id.slice(-1)) as 1|2|3)
    if (id === 'slashCommands') return props.openSlashCommandMenu()
    if (id === 'variableCommands') return props.openVariableCommandMenu()
    if (id === 'clearFormatting') return props.applyClearFormatting()
    if (id === 'comment') return props.applyComment()
    if (id === 'colorPalette') { if(value) props.applyColor(value); return }
    if (['bulletList','numberedList','blockquote'].includes(id)) return props.applyTurnInto(id)
    if (command.wrap && !['bold','italic','strike','inlineCode'].includes(id)) return props.applyWrap(...command.wrap)
    props.applyDraftAction(id)
  }
  const begin = () => { props.captureSelectionForToolbarAction?.(); props.holdToolbarInteraction() }
  const productAction = (event:React.MouseEvent<HTMLButtonElement>,action:()=>void) => {
    event.preventDefault(); begin(); setMoreOpen(false); try { action() } finally { props.onToolbarInteractionEnd() }
  }
  return <AnchorOverlay anchorRef={props.anchorRef} open onClose={()=>{}} align="top-center" autoFocus={false} allowOverflowVisible>
    <menu className="agentic-markdown-toolbar agentic-toolbar" ref={props.toolbarRef} aria-label="Inline selection toolbar" data-kg-inline-selection-toolbar="1">
      <MarkdownToolbar onCommand={run} onInteractionStart={begin} onInteractionEnd={props.onToolbarInteractionEnd} />
      <button ref={moreRef} type="button" className="agentic-toolbar-item" aria-label="More" title="More" aria-haspopup="menu" aria-expanded={moreOpen} onPointerDown={event=>{event.preventDefault();begin()}} onClick={()=>setMoreOpen(value=>!value)}>More</button>{moreOpen && <AnchorOverlay anchorRef={moreRef} open onClose={()=>setMoreOpen(false)} align="bottom-right" autoFocus={false}><menu className={props.toolbarMenuClassName} aria-label="More menu">
        {props.selectionActions && <MarkdownSelectionActionMenuItems actions={props.selectionActions}
          buttonClassName={props.toolbarMenuButtonClassName} disabledButtonClassName={props.floatingMenuButtonDisabledClassName}
          dividerClassName={props.toolbarMenuDividerClassName} onRunAction={productAction} />}
        <li><button type="button" onClick={event=>productAction(event,()=>props.applyTurnInto('code'))}>Code block</button></li>
        {(['left','center','right','justify'] as const).map(align=><li key={align}><button type="button" onClick={event=>productAction(event,()=>props.applyAlign(align))}>{align}</button></li>)}
        <li><button type="button" onClick={event=>productAction(event,props.applyChecklist)}>Checklist</button></li>
        <li><button type="button" onClick={event=>productAction(event,props.applyDivider)}>Divider</button></li>
        {props.applyCreateLinkedWidget && <li><button type="button" title="Create linked target widget" aria-label="Create linked widget from selection" data-kg-create-linked-widget="1" onClick={event=>productAction(event,props.applyCreateLinkedWidget!)}><ProvenanceDirectionIcon direction="target" />Create linked widget</button></li>}
        <li><button type="button" onClick={event=>productAction(event,props.handleDuplicate)}>Duplicate</button></li>
        <li><button type="button" className={props.floatingMenuButtonDangerClassName} onClick={event=>productAction(event,props.handleDelete)}>Delete</button></li>
      </menu></AnchorOverlay>}
    </menu>
  </AnchorOverlay>
}
