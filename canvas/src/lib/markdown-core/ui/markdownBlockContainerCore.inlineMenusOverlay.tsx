import React from 'react'
import { AnchorOverlay } from '@/lib/ui/overlay'
import { uiToolbarRowScrollListClassName } from '@/features/toolbar/ui/toolbarStyles'
import { preventDefaultMouseDown } from '@/lib/markdown-core/ui/markdownInlineSelectionToolbarInteractions'
import {
  buildAgenticOsDictionaryActionId,
  buildAgenticOsDocActionId,
  getAgenticOsBindingInvocations,
  getAgenticOsDocInvocations,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import {
  buildAgenticOsSemanticInvocationActionMenuItems,
  buildAgenticOsSlashInvocationActionMenuItems,
} from '@/features/agentic-os/agenticOsInlineCommandItems'
import type { SlashMenuState } from './markdownBlockContainerCore.menuState'
import { MarkdownBlockContainerCommandMenu, type MarkdownInlineCommandMenuItem } from './markdownBlockContainerCore.commandMenu'
import {
  INLINE_SLASH_COMMAND_ACTIONS,
  INLINE_VARIABLE_COMMAND_ACTIONS,
  INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID,
  INLINE_MEDIA_VARIABLE_KEY_BY_ACTION_ID,
  type InlineMediaCommandCandidate,
  type InlineSlashCommandId,
  type InlineVariableCommandId,
} from '@/lib/command-menu/inlineCommandMenuCatalog'
import {
  buildInlineCommandActionMenuItem,
  buildInlineCommandMenuItem,
  buildInlineMediaCommandMenuItem,
  buildInlineVariableBrowseMenuItem,
} from '@/lib/command-menu/inlineCommandMenuItems'
import { UI_RESPONSIVE_MARKDOWN_INLINE_MENU_LIST_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type VariableMode = 'ref' | 'create' | 'update' | 'fallback' | 'delete'

const MARKDOWN_INLINE_MENU_GRAMMAR_SIGILS = ['/', '#', '@'] as const

export const MarkdownBlockContainerInlineMenusOverlay = (props: {
  editDisableRichUi: boolean
  slashMenu: SlashMenuState
  variableMenu: {
    show: boolean
    leftPx: number
    topPx: number
    query: string
    keyInput: string
    valueInput: string
    fallbackInput: string
    mode: VariableMode
  }
  linkPopover: { show: boolean; leftPx: number; topPx: number; href: string }
  slashAnchorRef: React.RefObject<HTMLSpanElement | null>
  variableAnchorRef: React.RefObject<HTMLSpanElement | null>
  linkAnchorRef: React.RefObject<HTMLSpanElement | null>
  slashMenuRef: React.RefObject<HTMLElement | null>
  variableMenuRef: React.RefObject<HTMLElement | null>
  onToolbarInteract: () => void
  onVariableMenuMouseDownCapture: () => void
  setSlashMenuStable: (next: SlashMenuState) => void
  applyTurnInto: (next: string, triggerSelection?: { startOffset: number; endOffset: number } | null) => void
  applyDraftAction: (action: 'heading2' | 'bulletList' | 'numberedList' | 'blockquote') => void
  applyToggleHeading: (level: 1 | 2 | 3) => void
  applyChecklist: () => void
  applyDivider: () => void
  setVariableMenu: React.Dispatch<React.SetStateAction<{
    show: boolean
    leftPx: number
    topPx: number
    query: string
    keyInput: string
    valueInput: string
    fallbackInput: string
    mode: VariableMode
  }>>
  variableSuggestions: Array<{ key: string; value?: string | null; source?: string }>
  applyVariableToken: (mode: VariableMode, forcedKey?: string) => void
  mediaCommandCandidates: InlineMediaCommandCandidate[]
  applyMediaCommandCandidate: (candidate: InlineMediaCommandCandidate) => void
  floatingMenuLeftW220ClassName: string
  floatingMenuButtonClassName: string
  floatingMenuButtonDangerClassName: string
  floatingPopoverPanelClassName: string
  floatingPopoverInputClassName: string
  actionButtonClassName: string
  onLinkSubmit: (event: React.FormEvent) => void
  onLinkHrefChange: (value: string) => void
  onLinkInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onLinkCancel: () => void
}) => {
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: MARKDOWN_INLINE_MENU_GRAMMAR_SIGILS })
  const [slashQuery, setSlashQuery] = React.useState('')
  const {
    applyChecklist,
    applyDivider,
    applyDraftAction,
    applyToggleHeading,
    applyTurnInto,
    applyVariableToken,
    applyMediaCommandCandidate,
    setSlashMenuStable,
    setVariableMenu,
    mediaCommandCandidates,
    variableSuggestions,
  } = props
  const slashMenuKind = props.slashMenu.kind === 'semantic' ? 'semantic' : 'slash'
  React.useEffect(() => {
    if (!props.slashMenu.show) {
      setSlashQuery('')
      return
    }
    setSlashQuery(props.slashMenu.query || '')
  }, [props.slashMenu.kind, props.slashMenu.query, props.slashMenu.show])
  const closeSlashMenu = React.useCallback(() => {
    setSlashMenuStable({ show: false, leftPx: 0, topPx: 0 })
    setSlashQuery('')
  }, [setSlashMenuStable])
  const slashCommandItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => {
    void grammarCatalog.version
    const selectAgenticOsAction = (actionId: string) => {
      applyTurnInto(actionId, props.slashMenu.triggerRange || null)
      closeSlashMenu()
    }
    if (slashMenuKind === 'semantic') {
      return buildAgenticOsSemanticInvocationActionMenuItems({ onSelectActionId: selectAgenticOsAction })
    }
    const runById: Record<InlineSlashCommandId, () => void> = {
      heading: () => applyDraftAction('heading2'),
      h1: () => applyToggleHeading(1),
      h2: () => applyToggleHeading(2),
      h3: () => applyToggleHeading(3),
      'bullet-list': () => applyDraftAction('bulletList'),
      'numbered-list': () => applyDraftAction('numberedList'),
      quote: () => applyDraftAction('blockquote'),
      'code-block': () => applyTurnInto('code'),
      image: () => applyTurnInto('image'),
      video: () => applyTurnInto('video'),
      checklist: () => applyChecklist(),
      divider: () => applyDivider(),
    }
    const baseItems = INLINE_SLASH_COMMAND_ACTIONS.map(action => buildInlineCommandActionMenuItem({
      action,
      description: action.id === 'code-block' ? 'Convert this block to fenced code' : action.description,
      onSelect: () => {
        runById[action.id]()
        closeSlashMenu()
      },
    }))
    return [
      ...baseItems,
      ...buildAgenticOsSlashInvocationActionMenuItems({ onSelectActionId: selectAgenticOsAction }),
    ]
  }, [applyChecklist, applyDivider, applyDraftAction, applyToggleHeading, applyTurnInto, closeSlashMenu, grammarCatalog.version, props.slashMenu.triggerRange, slashMenuKind])
  const variableCommandItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => {
    void grammarCatalog.version
    const suggestionItems = variableSuggestions.map(suggestion => buildInlineVariableBrowseMenuItem({
      row: suggestion,
      onSelect: () => setVariableMenu(prev => ({ ...prev, keyInput: suggestion.key, query: suggestion.key, mode: 'ref' })),
    }))
    const mediaCandidateItems = mediaCommandCandidates.map(candidate => buildInlineMediaCommandMenuItem({
      candidate,
      onSelect: () => applyMediaCommandCandidate(candidate),
    }))
    const docItems = getAgenticOsDocInvocations().map(doc => buildInlineCommandMenuItem({
      id: `agentic-os-doc-at-${doc.id}`,
      label: doc.atToken,
      group: 'Agentic OS docs',
      description: doc.summary,
      keywords: [doc.label, doc.slashCommand, doc.hashToken, doc.sourcePath, ...doc.keywords],
      onSelect: () => applyTurnInto(buildAgenticOsDocActionId(doc)),
    }))
    const bindingItems = getAgenticOsBindingInvocations().map(invocation => buildInlineCommandMenuItem({
      id: `agentic-os-binding-${invocation.id}`,
      label: invocation.token,
      group: invocation.group,
      description: invocation.summary,
      keywords: [invocation.label, invocation.sourcePath, ...invocation.keywords],
      onSelect: () => applyTurnInto(buildAgenticOsDictionaryActionId(invocation)),
    }))
    const setModeByActionId: Record<Exclude<InlineVariableCommandId, 'insert-reference' | 'inline-declaration' | 'insert-image' | 'insert-audio' | 'insert-video' | 'image-reference' | 'audio-reference' | 'video-reference'>, () => void> = {
      'browse-variable': () => setVariableMenu(prev => ({ ...prev, mode: 'ref' })),
      'upload-media': () => setVariableMenu(prev => ({ ...prev, mode: 'ref' })),
      'new-variable': () => setVariableMenu(prev => ({ ...prev, mode: 'create' })),
      'edit-variable': () => setVariableMenu(prev => ({ ...prev, mode: 'update' })),
      'fallback-reference': () => setVariableMenu(prev => ({ ...prev, mode: 'fallback' })),
      'delete-variable': () => applyVariableToken('delete'),
    }
    const modeActionItems = INLINE_VARIABLE_COMMAND_ACTIONS
      .filter(action => action.id !== 'insert-reference' && action.id !== 'inline-declaration' && action.id !== 'insert-image' && action.id !== 'insert-audio' && action.id !== 'insert-video' && action.id !== 'image-reference' && action.id !== 'audio-reference' && action.id !== 'video-reference')
      .map(action => buildInlineCommandActionMenuItem({
        action,
        onSelect: setModeByActionId[action.id],
      }))
    const mediaInsertActionItems = (['insert-image', 'insert-audio', 'insert-video'] as const).map(actionId => {
      const action = INLINE_VARIABLE_COMMAND_ACTIONS.find(row => row.id === actionId)!
      const kind = INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID[actionId]
      const fallbackCandidate = mediaCommandCandidates.find(candidate => candidate.kind === kind)
      if (fallbackCandidate) return buildInlineMediaCommandMenuItem({
        candidate: {
          ...fallbackCandidate,
          id: actionId,
          label: action.label || fallbackCandidate.label,
          description: fallbackCandidate.description || action.description || `Insert ${kind}`,
          keywords: [kind, ...action.keywords, ...fallbackCandidate.keywords],
        },
        onSelect: () => fallbackCandidate ? applyMediaCommandCandidate(fallbackCandidate) : applyTurnInto(kind),
      })
      return buildInlineCommandActionMenuItem({
        action,
        keywords: [kind, ...action.keywords],
        onSelect: () => applyTurnInto(kind),
      })
    })
    const mediaActionItems = (['image-reference', 'audio-reference', 'video-reference'] as const).map(actionId => {
      const action = INLINE_VARIABLE_COMMAND_ACTIONS.find(row => row.id === actionId)!
      const key = INLINE_MEDIA_VARIABLE_KEY_BY_ACTION_ID[actionId]
      return buildInlineCommandActionMenuItem({
        action,
        keywords: [key, ...action.keywords],
        onSelect: () => applyVariableToken('ref', key),
      })
    })
    return [
      ...mediaCandidateItems,
      ...mediaInsertActionItems,
      ...bindingItems,
      ...docItems,
      ...suggestionItems,
      ...modeActionItems,
      ...mediaActionItems,
    ]
  }, [applyMediaCommandCandidate, applyTurnInto, applyVariableToken, grammarCatalog.version, mediaCommandCandidates, setVariableMenu, variableSuggestions])
  return (
    <>
      {!props.editDisableRichUi && props.slashMenu.show ? (
        <AnchorOverlay anchorRef={props.slashAnchorRef} open={props.slashMenu.show} align="bottom-left" className={props.floatingMenuLeftW220ClassName}>
          <section ref={props.slashMenuRef} aria-label={slashMenuKind === 'semantic' ? 'Semantic commands' : 'Slash commands'} onMouseDownCapture={props.onToolbarInteract}>
            <MarkdownBlockContainerCommandMenu
              ariaLabel={slashMenuKind === 'semantic' ? 'Semantic commands' : 'Slash commands'}
              items={slashCommandItems}
              query={slashQuery}
              onQueryChange={setSlashQuery}
              onCancel={closeSlashMenu}
              placeholder={slashMenuKind === 'semantic' ? 'Find semantic token' : 'Type a command'}
              inputClassName={props.floatingPopoverInputClassName}
              itemClassName={props.floatingMenuButtonClassName}
              itemDangerClassName={props.floatingMenuButtonDangerClassName}
              itemDisabledClassName={props.floatingMenuButtonClassName}
              emptyLabel="No commands"
              menuClassName={`${UI_RESPONSIVE_MARKDOWN_INLINE_MENU_LIST_CLASSNAME} overflow-y-auto`}
            />
          </section>
        </AnchorOverlay>
      ) : null}
      {!props.editDisableRichUi && props.variableMenu.show ? (
        <AnchorOverlay anchorRef={props.variableAnchorRef} open={props.variableMenu.show} align="bottom-left" className={props.floatingMenuLeftW220ClassName}>
          <section ref={props.variableMenuRef} aria-label="Variable toolbar" onMouseDownCapture={props.onVariableMenuMouseDownCapture}>
            <MarkdownBlockContainerCommandMenu
              ariaLabel="Variable commands"
              items={variableCommandItems}
              query={props.variableMenu.keyInput}
              onQueryChange={(value) => props.setVariableMenu(prev => ({ ...prev, keyInput: value, query: value }))}
              onCancel={() => props.setVariableMenu(prev => ({ ...prev, show: false, query: '', keyInput: '' }))}
              placeholder="Find variable or action"
              inputClassName={props.floatingPopoverInputClassName}
              itemClassName={props.floatingMenuButtonClassName}
              itemDangerClassName={props.floatingMenuButtonDangerClassName}
              itemDisabledClassName={props.floatingMenuButtonClassName}
              emptyLabel="No variable commands"
              menuClassName={`${UI_RESPONSIVE_MARKDOWN_INLINE_MENU_LIST_CLASSNAME} overflow-y-auto`}
            />
            {(props.variableMenu.mode === 'create' || props.variableMenu.mode === 'update') ? (
              <input className={`${props.floatingPopoverInputClassName} mt-2`} placeholder="value" value={props.variableMenu.valueInput} onChange={(event) => props.setVariableMenu(prev => ({ ...prev, valueInput: event.target.value }))} />
            ) : null}
            {props.variableMenu.mode === 'fallback' ? (
              <input className={`${props.floatingPopoverInputClassName} mt-2`} placeholder="fallback key or value" value={props.variableMenu.fallbackInput} onChange={(event) => props.setVariableMenu(prev => ({ ...prev, fallbackInput: event.target.value }))} />
            ) : null}
            <menu className={`${uiToolbarRowScrollListClassName} mt-2 gap-2`}>
              <li className="list-none">
                <button type="button" className={props.floatingMenuButtonClassName} onMouseDown={preventDefaultMouseDown} onClick={() => {
                  const forcedKey = props.variableMenu.mode === 'ref' ? (props.variableSuggestions[0]?.key || props.variableMenu.keyInput || props.variableMenu.query) : undefined
                  props.applyVariableToken(props.variableMenu.mode, forcedKey)
                }}>
                  Apply
                </button>
              </li>
              <li className="list-none">
                <button type="button" className={props.floatingMenuButtonDangerClassName} onMouseDown={preventDefaultMouseDown} onClick={() => props.applyVariableToken('delete')}>
                  Delete
                </button>
              </li>
            </menu>
          </section>
        </AnchorOverlay>
      ) : null}
      {!props.editDisableRichUi && props.linkPopover.show ? (
        <AnchorOverlay anchorRef={props.linkAnchorRef} open={props.linkPopover.show} align="bottom-left" className={props.floatingPopoverPanelClassName}>
          <section onMouseDownCapture={props.onToolbarInteract} aria-label="Edit link">
            <form onSubmit={props.onLinkSubmit}>
              <input
                type="url"
                autoFocus
                placeholder="https://example.com"
                className={props.floatingPopoverInputClassName}
                value={props.linkPopover.href}
                onChange={(event) => props.onLinkHrefChange(event.target.value)}
                onKeyDown={props.onLinkInputKeyDown}
              />
              <menu className={`${uiToolbarRowScrollListClassName} mt-2 gap-2`}>
                <button type="submit" className={props.actionButtonClassName}>Apply Link</button>
                <button type="button" className={props.actionButtonClassName} onClick={props.onLinkCancel}>Cancel</button>
              </menu>
            </form>
          </section>
        </AnchorOverlay>
      ) : null}
    </>
  )
}
