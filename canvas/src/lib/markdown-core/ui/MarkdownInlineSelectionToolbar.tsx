import React from 'react'
import {
  AlignLeft,
  AtSign,
  Bold,
  Code,
  Eraser,
  Heading2,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  MessageSquare,
  MoreHorizontal,
  Palette,
  Quote,
  Strikethrough,
  Subscript,
  Superscript,
  Slash,
  Underline,
} from 'lucide-react'
import { AnchorOverlay } from '@/lib/ui/overlay'
import { FLOATING_ICON_TOOLBAR_PANEL_CLASSNAME, FLOATING_POPOVER_ACTION_BUTTON_CLASSNAME } from '@/features/markdown-workspace/main/viewer/floatingMenuStyles'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  preventDefaultMouseDown,
  preventDefaultPointerDown,
} from './markdownInlineSelectionToolbarInteractions'
import {
  uiToolbarResponsiveRowScrollClassName,
  uiToolbarRowScrollListClassName,
  uiToolbarTouchRowScrollClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import { ProvenanceDirectionIcon } from '@/lib/storyboardWidget/ProvenanceDirectionIcon'
import { useMediaQuery } from '@/lib/ui/useMediaQuery'
import { MarkdownSelectionActionMenuItems } from './MarkdownSelectionActionMenuItems'
import type { MarkdownInlineSelectionActions } from './markdownInlineSelectionActions'

const markdownInlineSelectionToolbarIconClassName = UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME
const markdownInlineSelectionToolbarMenuIconClassName = `${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} mr-1`
const markdownInlineSelectionToolbarClassName = FLOATING_ICON_TOOLBAR_PANEL_CLASSNAME
const markdownInlineSelectionToolbarButtonClassName = FLOATING_POPOVER_ACTION_BUTTON_CLASSNAME

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
  applyDraftAction: (action: 'bold' | 'inlineCode' | 'italic' | 'link' | 'strike') => void
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
  const isTouchToolbarViewport = useMediaQuery('(max-width: 768px), (pointer: coarse)')
  const suppressToolbarMenuClickRef = React.useRef(false)
  const suppressToolbarInteractionEndCountRef = React.useRef(0)
  const triggerButtonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})
  const [openMenuKey, setOpenMenuKey] = React.useState<string | null>(null)
  const toolbarMenuPanelClassName = React.useMemo(
    () =>
      String(props.toolbarMenuClassName || '')
        .split(/\s+/)
        .filter(token => token && token !== 'absolute' && token !== 'left-0' && token !== 'right-0' && token !== 'mt-2' && token !== 'z-40')
        .join(' '),
    [props.toolbarMenuClassName],
  )
  if (!props.show) return null
  const toolbarRowClassName = [
    uiToolbarRowScrollListClassName,
    uiToolbarResponsiveRowScrollClassName,
    isTouchToolbarViewport ? uiToolbarTouchRowScrollClassName : '',
    'gap-1',
  ].filter(Boolean).join(' ')
  const handleToolbarPointerDownCapture = (event: React.PointerEvent<HTMLElement>) => {
    props.captureSelectionForToolbarAction?.()
    preventDefaultPointerDown(event)
    props.holdToolbarInteraction()
  }
  const handleToolbarMouseDownCapture = (event: React.MouseEvent<HTMLElement>) => {
    props.captureSelectionForToolbarAction?.()
    preventDefaultMouseDown(event)
    props.holdToolbarInteraction()
  }
  const handleToolbarInteractionEndCapture = () => {
    if (suppressToolbarInteractionEndCountRef.current > 0) {
      suppressToolbarInteractionEndCountRef.current -= 1
      return
    }
    props.onToolbarInteractionEnd()
  }
  const runMenuAction = (
    event: React.MouseEvent<HTMLButtonElement>,
    action: () => void,
    closeMenu?: () => void,
  ) => {
    event.preventDefault()
    props.captureSelectionForToolbarAction?.()
    props.holdToolbarInteraction()
    closeMenu?.()
    action()
    props.onToolbarInteractionEnd()
  }
  const runToolbarAction = (
    event: React.MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.preventDefault()
    props.captureSelectionForToolbarAction?.()
    props.holdToolbarInteraction()
    action()
    props.onToolbarInteractionEnd()
  }
  const renderToolbarMenu = (args: {
    key: string
    ariaLabel: string
    title?: string
    summary: React.ReactNode
    portalPlacement?: 'bottom-start' | 'bottom-end'
    menu: (close: () => void) => React.ReactNode
  }) => {
    const closeMenu = () => {
      setOpenMenuKey(prev => (prev === args.key ? null : prev))
    }
    const toggleMenu = () => {
      setOpenMenuKey(prev => (prev === args.key ? null : args.key))
    }
    const anchorRef = { current: triggerButtonRefs.current[args.key] } as React.RefObject<HTMLElement>
    return (
      <>
        <button
          type="button"
          ref={el => {
            triggerButtonRefs.current[args.key] = el
          }}
          className={markdownInlineSelectionToolbarButtonClassName}
          aria-label={args.ariaLabel}
          aria-expanded={openMenuKey === args.key}
          title={args.title}
          onPointerDown={(event) => {
            props.captureSelectionForToolbarAction?.()
            preventDefaultPointerDown(event)
            props.holdToolbarInteraction()
            if (event.button === 0) {
              suppressToolbarMenuClickRef.current = true
              suppressToolbarInteractionEndCountRef.current = Math.max(suppressToolbarInteractionEndCountRef.current, 2)
              toggleMenu()
            }
          }}
          onMouseDown={(event) => {
            props.captureSelectionForToolbarAction?.()
            preventDefaultMouseDown(event)
            props.holdToolbarInteraction()
          }}
          onClick={(event) => {
            event.preventDefault()
            props.captureSelectionForToolbarAction?.()
            props.holdToolbarInteraction()
            if (suppressToolbarMenuClickRef.current) {
              suppressToolbarMenuClickRef.current = false
              return
            }
            toggleMenu()
          }}
        >
          {args.summary}
        </button>
        <AnchorOverlay
          anchorRef={anchorRef}
          open={openMenuKey === args.key}
          onClose={() => {
            closeMenu()
            props.onToolbarInteractionEnd()
          }}
          align={args.portalPlacement === 'bottom-end' ? 'bottom-right' : 'bottom-left'}
          className=""
          autoFocus={false}
        >
          <section
            onPointerDownCapture={(event) => {
              props.holdToolbarInteraction()
            }}
            onMouseDownCapture={(event) => {
              props.holdToolbarInteraction()
            }}
            onPointerUpCapture={handleToolbarInteractionEndCapture}
            onMouseUpCapture={handleToolbarInteractionEndCapture}
          >
            {args.menu(closeMenu)}
          </section>
        </AnchorOverlay>
      </>
    )
  }
  const selectionActions = props.selectionActions
  const createLinkedWidget = props.applyCreateLinkedWidget
  return (
    <AnchorOverlay
      anchorRef={props.anchorRef}
      open
      align="top-center"
      className={markdownInlineSelectionToolbarClassName}
      autoFocus={false}
      allowOverflowVisible
    >
      <menu
        ref={props.toolbarRef}
        className={toolbarRowClassName}
        aria-label="Inline selection toolbar"
        data-kg-inline-selection-toolbar="1"
        onPointerDownCapture={handleToolbarPointerDownCapture}
        onMouseDownCapture={handleToolbarMouseDownCapture}
        onPointerUpCapture={handleToolbarInteractionEndCapture}
        onMouseUpCapture={handleToolbarInteractionEndCapture}
      >
        {renderToolbarMenu({
          key: 'heading',
          ariaLabel: 'Heading',
          title: 'Heading',
          summary: <Heading2 className={markdownInlineSelectionToolbarIconClassName} />,
          menu: close => (
            <menu className={toolbarMenuPanelClassName} aria-label="Turn into menu">
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, () => props.applyTurnInto('heading2'), close)}><Heading2 className={markdownInlineSelectionToolbarMenuIconClassName} />H2</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, () => props.applyTurnInto('code'), close)}><Code className={markdownInlineSelectionToolbarMenuIconClassName} />Code block</button></li>
              <li className={props.toolbarMenuDividerClassName} />
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, () => props.applyToggleHeading(1), close)}><Heading2 className={markdownInlineSelectionToolbarMenuIconClassName} />H1</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, () => props.applyToggleHeading(2), close)}><Heading2 className={markdownInlineSelectionToolbarMenuIconClassName} />H2</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, () => props.applyToggleHeading(3), close)}><Heading2 className={markdownInlineSelectionToolbarMenuIconClassName} />H3</button></li>
            </menu>
          ),
        })}
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyDraftAction('bold'))} title="Bold"><Bold className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyDraftAction('italic'))} title="Italic"><Italic className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyDraftAction('strike'))} title="Strikethrough"><Strikethrough className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyDraftAction('inlineCode'))} title="Inline Code"><Code className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyDraftAction('link'))} title="Link"><LinkIcon className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyTurnInto('bulletList'))} title="Bulleted List"><List className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyTurnInto('numberedList'))} title="Numbered List"><ListOrdered className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyTurnInto('blockquote'))} title="Quote"><Quote className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, props.openSlashCommandMenu)} title="Slash commands"><Slash className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, props.openVariableCommandMenu)} title="Variable commands"><AtSign className={markdownInlineSelectionToolbarIconClassName} /></button>
        {renderToolbarMenu({
          key: 'align',
          ariaLabel: 'Align',
          summary: <AlignLeft className={markdownInlineSelectionToolbarIconClassName} />,
          menu: close => (
            <menu className={toolbarMenuPanelClassName} aria-label="Align menu">
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, () => props.applyAlign('left'), close)}>Left</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, () => props.applyAlign('center'), close)}>Center</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, () => props.applyAlign('right'), close)}>Right</button></li>
            </menu>
          ),
        })}
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyWrap('<u>', '</u>'))} title="Underline"><Underline className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyWrap('^', '^'))} title="Superscript"><Superscript className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, () => props.applyWrap('~', '~'))} title="Subscript"><Subscript className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button
          type="button"
          className={markdownInlineSelectionToolbarButtonClassName}
          onClick={(event) => runToolbarAction(event, () => props.applyWrap('$', '$'))}
          title="Math"
          aria-label="Math"
        >
          <span className="text-xs leading-none">∑</span>
        </button>
        {createLinkedWidget ? (
          <button
            type="button"
            className={markdownInlineSelectionToolbarButtonClassName}
            onClick={(event) => runToolbarAction(event, createLinkedWidget)}
            title="Create linked target widget"
            aria-label="Create linked widget from selection"
            data-kg-create-linked-widget="1"
          >
            <ProvenanceDirectionIcon
              direction="target"
              className="text-xs leading-none"
            />
          </button>
        ) : null}
        {renderToolbarMenu({
          key: 'highlight',
          ariaLabel: 'Highlight',
          title: 'Highlight',
          summary: <Highlighter className={markdownInlineSelectionToolbarIconClassName} />,
          menu: close => (
            <menu className={toolbarMenuPanelClassName} aria-label="Highlight menu">
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, () => props.applyWrap('==', '=='), close)}>Default (==)</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} style={{ backgroundColor: '#FEF08A' }} onClick={(event) => runMenuAction(event, () => props.applyHighlightColor('#FEF08A'), close)}>Yellow</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} style={{ backgroundColor: '#BBF7D0' }} onClick={(event) => runMenuAction(event, () => props.applyHighlightColor('#BBF7D0'), close)}>Green</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} style={{ backgroundColor: '#BFDBFE' }} onClick={(event) => runMenuAction(event, () => props.applyHighlightColor('#BFDBFE'), close)}>Blue</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} style={{ backgroundColor: '#FBCFE8' }} onClick={(event) => runMenuAction(event, () => props.applyHighlightColor('#FBCFE8'), close)}>Pink</button></li>
            </menu>
          ),
        })}
        {renderToolbarMenu({
          key: 'text-color',
          ariaLabel: 'Text color',
          title: 'Text color',
          summary: <Palette className={markdownInlineSelectionToolbarIconClassName} />,
          menu: close => (
            <menu className={toolbarMenuPanelClassName} aria-label="Text color menu">
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} style={{ color: '#EF4444' }} onClick={(event) => runMenuAction(event, () => props.applyColor('#EF4444'), close)}>Red</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} style={{ color: '#10B981' }} onClick={(event) => runMenuAction(event, () => props.applyColor('#10B981'), close)}>Green</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} style={{ color: '#3B82F6' }} onClick={(event) => runMenuAction(event, () => props.applyColor('#3B82F6'), close)}>Blue</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} style={{ color: '#6B7280' }} onClick={(event) => runMenuAction(event, () => props.applyColor('#6B7280'), close)}>Gray</button></li>
            </menu>
          ),
        })}
        <button type="button" className={markdownInlineSelectionToolbarButtonClassName} onClick={(event) => runToolbarAction(event, props.applyClearFormatting)} title="Clear formatting"><Eraser className={markdownInlineSelectionToolbarIconClassName} /></button>
        <button
          type="button"
          className={markdownInlineSelectionToolbarButtonClassName}
          onClick={(event) => {
            event.stopPropagation()
            runToolbarAction(event, props.applyComment)
          }}
          title="Comment"
        >
          <MessageSquare className={markdownInlineSelectionToolbarIconClassName} />
        </button>
        {renderToolbarMenu({
          key: 'more',
          ariaLabel: 'More',
          title: 'More',
          portalPlacement: 'bottom-end',
          summary: <MoreHorizontal className={markdownInlineSelectionToolbarIconClassName} />,
          menu: close => (
            <menu className={toolbarMenuPanelClassName} aria-label="More actions">
              {selectionActions ? (
                <>
                  <MarkdownSelectionActionMenuItems
                    actions={selectionActions}
                    buttonClassName={props.toolbarMenuButtonClassName}
                    disabledButtonClassName={props.floatingMenuButtonDisabledClassName}
                    dividerClassName={props.toolbarMenuDividerClassName}
                    onRunAction={(event, action) => runMenuAction(event, action, close)}
                  />
                  <li className={props.toolbarMenuDividerClassName} />
                </>
              ) : null}
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, props.applyChecklist, close)}>Checklist</button></li>
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, props.applyDivider, close)}>Divider</button></li>
              <li className={props.toolbarMenuDividerClassName} />
              <li className="list-none"><button type="button" className={props.toolbarMenuButtonClassName} onClick={(event) => runMenuAction(event, props.handleDuplicate, close)}>Duplicate</button></li>
              <li className="list-none"><button type="button" className={props.floatingMenuButtonDangerClassName} onClick={(event) => runMenuAction(event, props.handleDelete, close)}>Delete</button></li>
            </menu>
          ),
        })}
      </menu>
    </AnchorOverlay>
  )
}
