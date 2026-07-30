import React from 'react'
import { createPortal } from 'react-dom'
import { AtSign, Hash, Slash } from 'lucide-react'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { buildMarkdownVariableToken, collectMarkdownVariableBrowseRows } from '@/features/markdown/ui/markdownVariableReferences'
import {
  buildPromptPresetChatInvocationCatalogEntries,
  resolveChatInvocationCatalogEntries,
  resolveChatInvocationCatalogEntryInsertionText,
  type ChatInvocationCatalogPrefixFilter,
} from '@/features/chat/chatInvocationRegistry'
import { usePromptPresetCatalog } from '@/features/chat/usePromptPresetCatalog'
import { preventDefaultMouseDown } from '@/lib/markdown-core/ui/markdownInlineSelectionToolbarInteractions'
import { MarkdownBlockContainerCommandMenu, type MarkdownInlineCommandMenuItem } from '@/lib/markdown-core/ui/markdownBlockContainerCore.commandMenu'
import {
  INLINE_SLASH_COMMAND_ACTIONS,
  INLINE_VARIABLE_COMMAND_ACTIONS,
  INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID,
  INLINE_MEDIA_VARIABLE_KEY_BY_ACTION_ID,
  INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID,
  buildInlineKeywordToken,
  buildInlineMediaEmbed,
  collectInlineKeywordCommandCandidates,
  collectInlineMediaCommandCandidates,
  isInlineVariableKey,
  parseInlineVariableCommandQuery,
  type InlineMediaCommandCandidate,
  type InlineSlashCommandId,
  type InlineVariableCommandId,
} from '@/lib/command-menu/inlineCommandMenuCatalog'
import { mergeInlineMediaCommandCandidates } from '@/lib/command-menu/inlineMediaCommandCandidateMerge'
import {
  applyCommandMenuMediaNameDraftsToInlineCandidates,
  useCommandMenuMediaNameDrafts,
} from '@/lib/command-menu/commandMenuMediaNameSync'
import {
  buildInlineCommandMenuItem,
  buildInlineCommandActionMenuItem,
  buildInlineKeywordCommandMenuItem,
  buildInlineMediaCommandMenuItem,
  buildInlineVariableBrowseMenuItem,
} from '@/lib/command-menu/inlineCommandMenuItems'
import { useUploadedMediaInlineCommandCandidates } from '@/lib/command-menu/inlineUploadedMediaCandidates'
import {
  readUploadedMediaStorageRuntimeUrl,
  readStoredUploadedMediaPanelItems,
  type UploadedMediaPanelItem,
} from '@/lib/storage/uploadedMediaPanelItems'
import { uploadFilesToUploadedMediaPanel } from '@/lib/storage/uploadedMediaPanelUpload'
import { UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { sourceContainsInlineMediaUrl } from '@/lib/command-menu/inlineMediaUrlIdentity'
import { applyCardInlineCommandReplacement, findInlineCommandTokenRange, focusCardInlineTextInputSelectionSoon, insertMarkdownBlockRange, readCardInlineTextInputSelection, replaceCurrentLine, replaceDraftRange } from '@/lib/cards/CardInlineTextCommandMenuUtils'
const CARD_INLINE_TEXT_COMMAND_MENU_ATTRIBUTE = 'data-kg-card-inline-command-menu'
const CARD_INLINE_TEXT_COMMAND_SIGILS = ['/', '#', '@'] as const
export type CardInlineTextCommandMenuMode = 'slash' | 'variable' | 'keyword'
const cardInlineCommandButtonClassName = [
  'inline-flex h-6 w-6 items-center justify-center rounded border',
  UI_THEME_TOKENS.input.bg,
  UI_THEME_TOKENS.input.border,
  UI_THEME_TOKENS.text.secondary,
  'hover:bg-black/5 dark:hover:bg-white/10',
].join(' ')
const cardInlineCommandMenuItemClassName = [
  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs',
  UI_THEME_TOKENS.text.primary,
  'hover:bg-black/5 dark:hover:bg-white/10',
].join(' ')
const cardInlineCommandMenuDangerClassName = [
  cardInlineCommandMenuItemClassName,
  'text-red-600 dark:text-red-300',
].join(' ')
const cardInlineCommandMenuDisabledClassName = [
  cardInlineCommandMenuItemClassName,
  'opacity-50 cursor-not-allowed',
].join(' ')
type CardInlineCommandMenuFrame = {
  left: number
  top: number
  width: number
}
export function CardInlineTextCommandMenus(props: {
  commandMode: CardInlineTextCommandMenuMode | null
  commandQuery: string
  commandSelectionRef: React.MutableRefObject<{ start: number; end: number }>
  commandContextText?: string
  draft: string
  sourceDraft: string
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  menuAnchorRef?: React.RefObject<HTMLElement | null>
  focusSelection?: (start: number, end?: number) => void
  mediaCommandMode?: 'inline' | 'external'
  openCommandMenu: (mode: CardInlineTextCommandMenuMode) => void
  showLaunchers?: boolean
  closeCommandMenu: () => void
  setCommandQuery: (next: string) => void
  setCommandMode: (next: CardInlineTextCommandMenuMode | null) => void
  setDraft: (next: string) => void
  onCommandDraftChange?: (next: string) => void
  onCommandDraftApplied?: (next: string) => void
  onMediaCommandSelect?: (candidate: InlineMediaCommandCandidate) => void
}) {
  const {
    closeCommandMenu,
    commandMode,
    commandQuery,
    commandSelectionRef,
    commandContextText,
    draft,
    sourceDraft,
    focusSelection,
    inputRef,
    menuAnchorRef,
    mediaCommandMode = 'inline',
    onCommandDraftChange,
    onCommandDraftApplied,
    onMediaCommandSelect,
    openCommandMenu,
    setCommandMode,
    setCommandQuery,
    showLaunchers = true,
    setDraft,
  } = props
  const [menuFrame, setMenuFrame] = React.useState<CardInlineCommandMenuFrame | null>(null)
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: CARD_INLINE_TEXT_COMMAND_SIGILS })
  const promptPresets = usePromptPresetCatalog()
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null)
  const uploadObjectUrlsRef = React.useRef<Set<string>>(new Set())
  const [inlineUploadItems, setInlineUploadItems] = React.useState<UploadedMediaPanelItem[]>(readStoredUploadedMediaPanelItems)
  const mediaNameDrafts = useCommandMenuMediaNameDrafts()
  const uploadedMediaCommandCandidates = useUploadedMediaInlineCommandCandidates()
  React.useEffect(() => {
    const uploadObjectUrls = uploadObjectUrlsRef.current
    return () => {
      for (const url of uploadObjectUrls) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          void 0
        }
      }
      uploadObjectUrls.clear()
    }
  }, [])
  React.useLayoutEffect(() => {
    if (!commandMode) {
      setMenuFrame(null)
      return
    }
    const updateFrame = () => {
      const input = inputRef.current
      const anchor = menuAnchorRef?.current || input
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const viewportWidth = window.innerWidth || 0
      const viewportHeight = window.innerHeight || 0
      const gap = 6
      const margin = 8
      const desiredWidth = Math.max(240, rect.width - 16)
      const width = Math.min(desiredWidth, Math.max(240, viewportWidth - margin * 2))
      const left = Math.max(margin, Math.min(rect.left + 8, viewportWidth - width - margin))
      const availableAbove = Math.max(0, rect.top - margin - gap)
      const availableBelow = Math.max(0, viewportHeight - rect.bottom - margin - gap)
      const estimatedHeight = Math.min(360, Math.max(220, Math.max(availableAbove, availableBelow)))
      const opensAbove = availableBelow < 220 && availableAbove > availableBelow
      const top = opensAbove
        ? Math.max(margin, rect.top - gap - estimatedHeight)
        : Math.min(viewportHeight - estimatedHeight - margin, rect.bottom + gap)
      setMenuFrame({ left, top: Math.max(margin, top), width })
    }
    updateFrame()
    window.addEventListener('resize', updateFrame)
    window.addEventListener('scroll', updateFrame, true)
    return () => {
      window.removeEventListener('resize', updateFrame)
      window.removeEventListener('scroll', updateFrame, true)
    }
  }, [commandMode, inputRef, menuAnchorRef])
  const replaceCommandSelection = React.useCallback((replacement: string, options?: { closeAfterApply?: boolean; insertAsBlock?: boolean }) => {
    const text = String(draft || '')
    const sigil = commandMode === 'slash' ? '/' : commandMode === 'variable' ? '@' : '#'
    const next = applyCardInlineCommandReplacement({
      text,
      selection: commandSelectionRef.current,
      sigil,
      query: commandQuery,
      replacement,
      insertAsBlock: options?.insertAsBlock,
    })
    setDraft(next.text)
    onCommandDraftChange?.(next.text)
    focusCardInlineTextInputSelectionSoon(inputRef.current, next.cursor, next.cursor, focusSelection)
    setCommandMode(null)
    setCommandQuery('')
    if (options?.closeAfterApply === true) onCommandDraftApplied?.(next.text)
  }, [commandMode, commandQuery, commandSelectionRef, draft, focusSelection, inputRef, onCommandDraftApplied, onCommandDraftChange, setCommandMode, setCommandQuery, setDraft])
  const skillsCommandsInvocationItems = React.useMemo(() => {
    const buildItems = (prefixFilter: ChatInvocationCatalogPrefixFilter): MarkdownInlineCommandMenuItem[] => {
      const fallbackEntries = resolveChatInvocationCatalogEntries(prefixFilter, '')
      const presetEntries = prefixFilter === 'slash' ? buildPromptPresetChatInvocationCatalogEntries(promptPresets) : []
      const presetTokens = new Set(presetEntries.map(entry => entry.token.toLowerCase()))
      const entries = [...presetEntries, ...fallbackEntries.filter(entry => !presetTokens.has(entry.token.toLowerCase()))]
      return entries.map(entry => buildInlineCommandMenuItem({
        id: `skills-commands-${prefixFilter}-${entry.id}`,
        label: entry.token,
        group: entry.group,
        description: entry.summary,
        keywords: [entry.label, entry.sourcePath || '', ...entry.keywords].filter(Boolean),
        onSelect: () => replaceCommandSelection(resolveChatInvocationCatalogEntryInsertionText(entry), { closeAfterApply: Boolean(entry.promptPresetId), insertAsBlock: Boolean(entry.promptPresetId) }),
      }))
    }
    return { slash: buildItems('slash'), variable: buildItems('at'), keyword: buildItems('hash') }
  }, [grammarCatalog.version, promptPresets, replaceCommandSelection])
  const insertMediaCommand = React.useCallback((candidate: InlineMediaCommandCandidate, options?: { closeAfterApply?: boolean }) => {
    const text = String(draft || '')
    const sourceText = String(sourceDraft || '')
    const shouldRouteToExternalMediaTarget = mediaCommandMode === 'external' && !!candidate.url && typeof onMediaCommandSelect === 'function'
    const duplicateMedia = !!candidate.url && sourceContainsInlineMediaUrl(sourceText, candidate.url)
    if (duplicateMedia) {
      const selection = commandSelectionRef.current
      const tokenRange = findInlineCommandTokenRange({ text, selection, sigil: '@' })
      const tokenText = text.slice(tokenRange.start, tokenRange.end)
      const next = shouldRouteToExternalMediaTarget && tokenText.startsWith('@')
        ? `${text.slice(0, tokenRange.start)}${text.slice(tokenRange.end)}`
        : text
      if (next !== text) {
        setDraft(next)
        onCommandDraftChange?.(next)
      }
      setCommandMode(null)
      setCommandQuery('')
      const focusOffset = next !== text ? tokenRange.start : commandSelectionRef.current.end
      focusCardInlineTextInputSelectionSoon(inputRef.current, focusOffset, focusOffset, focusSelection)
      if (options?.closeAfterApply === true && next !== text) onCommandDraftApplied?.(next)
      // Commit the source-backed chip before reconciling its graph panel/edge.
      // The graph reconciliation may replace the active graph snapshot.
      if (shouldRouteToExternalMediaTarget) onMediaCommandSelect(candidate)
      return
    }
    if (shouldRouteToExternalMediaTarget) {
      const selection = commandSelectionRef.current
      const selected = text.slice(
        Math.max(0, Math.min(text.length, selection.start)),
        Math.max(0, Math.min(text.length, selection.end)),
      )
      const tokenRange = findInlineCommandTokenRange({ text, selection, sigil: '@' })
      const replaceRange = selected && !/^@[A-Za-z0-9_.-]{0,96}$/.test(selected)
        ? { start: selection.end, end: selection.end }
        : tokenRange
      const replacement = buildInlineMediaEmbed({
        kind: candidate.kind,
        url: candidate.url,
        thumbnailUrl: candidate.thumbnailUrl,
        label: candidate.label,
        selectedText: selected,
        sourceKey: candidate.sourceKey,
      })
      const next = insertMarkdownBlockRange({
        text,
        start: replaceRange.start,
        end: replaceRange.end,
        block: replacement,
      })
      setDraft(next.text)
      onCommandDraftChange?.(next.text)
      setCommandMode(null)
      setCommandQuery('')
      focusCardInlineTextInputSelectionSoon(inputRef.current, next.cursor, next.cursor, focusSelection)
      if (options?.closeAfterApply === true) onCommandDraftApplied?.(next.text)
      // Keep the text-owner commit ahead of the graph-owner media mutation so
      // a freshly inserted @ chip cannot be overwritten by a stale snapshot.
      onMediaCommandSelect(candidate)
      return
    }
    if (candidate.url) onMediaCommandSelect?.(candidate)
    const selection = commandSelectionRef.current
    const selected = text.slice(
      Math.max(0, Math.min(text.length, selection.start)),
      Math.max(0, Math.min(text.length, selection.end)),
    )
    const replaceRange = selected && !/^@[A-Za-z0-9_.-]{0,96}$/.test(selected)
      ? { start: selection.end, end: selection.end }
      : findInlineCommandTokenRange({ text, selection, sigil: '@' })
    const replacement = buildInlineMediaEmbed({
      kind: candidate.kind,
      url: candidate.url,
      thumbnailUrl: candidate.thumbnailUrl,
      label: candidate.label,
      selectedText: selected,
      sourceKey: candidate.sourceKey,
    })
    const next = insertMarkdownBlockRange({
      text,
      start: replaceRange.start,
      end: replaceRange.end,
      block: replacement,
    })
    setDraft(next.text)
    onCommandDraftChange?.(next.text)
    focusCardInlineTextInputSelectionSoon(inputRef.current, next.cursor, next.cursor, focusSelection)
    setCommandMode(null)
    setCommandQuery('')
    if (options?.closeAfterApply === true) onCommandDraftApplied?.(next.text)
  }, [commandSelectionRef, draft, focusSelection, inputRef, mediaCommandMode, onCommandDraftApplied, onCommandDraftChange, onMediaCommandSelect, setCommandMode, setCommandQuery, setDraft, sourceDraft])
  const uploadMediaCommand = React.useCallback(async (fileList: FileList | null) => {
    const results = await uploadFilesToUploadedMediaPanel({
      files: Array.from(fileList || []),
      setItems: setInlineUploadItems,
      registerObjectUrl: url => uploadObjectUrlsRef.current.add(url),
    })
    const first = results[0]
    if (!first) {
      setCommandMode(null)
      setCommandQuery('')
      focusCardInlineTextInputSelectionSoon(inputRef.current, commandSelectionRef.current.end, commandSelectionRef.current.end, focusSelection)
      return
    }
    const runtimeUrl = readUploadedMediaStorageRuntimeUrl(first.storage) || first.item.linkUrl
    insertMediaCommand({
      id: `uploaded-${first.item.id}`,
      kind: first.item.kind,
      url: runtimeUrl,
      thumbnailUrl: first.item.kind === 'image' ? runtimeUrl : undefined,
      label: first.item.name,
      sourceKey: first.storage.contentHash,
      description: 'Uploaded media from Cloudflare storage',
      keywords: [first.item.kind, first.item.name, first.storage.contentHash, first.storage.objectKey].filter(Boolean),
    }, { closeAfterApply: true })
  }, [commandSelectionRef, focusSelection, inputRef, insertMediaCommand, setCommandMode, setCommandQuery])
  const slashCommandItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => {
    const prefixById: Partial<Record<InlineSlashCommandId, string>> = {
      h1: '# ',
      h2: '## ',
      h3: '### ',
      'bullet-list': '- ',
      'numbered-list': '1. ',
      quote: '> ',
      checklist: '- [ ] ',
    }
    const baseItems = INLINE_SLASH_COMMAND_ACTIONS
      .filter(action => action.id !== 'heading')
      .map(action => buildInlineCommandActionMenuItem({
        action,
        onSelect: () => {
          const prefix = prefixById[action.id]
          if (prefix) {
            replaceCurrentLine({
              input: inputRef.current,
              draft,
              setDraft,
              onCommandDraftChange,
              prefix,
              selection: commandSelectionRef.current,
              focusSelection,
            })
            closeCommandMenu()
            return
          }
          if (action.id === 'code-block') {
            const selection = commandSelectionRef.current
            const selected = String(draft || '').slice(selection.start, selection.end) || 'code'
            replaceCommandSelection(`\`\`\`\n${selected}\n\`\`\``)
            return
          }
          if (action.id === 'image' || action.id === 'video') {
            const selection = commandSelectionRef.current
            const selected = String(draft || '').slice(selection.start, selection.end)
            insertMediaCommand({
              id: `slash-${action.id}`,
              kind: action.id,
              url: '',
              label: selected,
              description: action.description,
              keywords: [...action.keywords],
            })
            return
          }
          if (action.id === 'divider') {
            const selection = commandSelectionRef.current
            const before = draft.slice(0, selection.start)
            const after = draft.slice(selection.end)
            replaceCommandSelection(`${before && !before.endsWith('\n') ? '\n' : ''}---${after && !after.startsWith('\n') ? '\n' : ''}`)
          }
        },
      }))
    return [...baseItems, ...skillsCommandsInvocationItems.slash]
  }, [closeCommandMenu, commandSelectionRef, draft, focusSelection, inputRef, insertMediaCommand, onCommandDraftChange, replaceCommandSelection, setDraft, skillsCommandsInvocationItems])
  const variableCommandItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => {
    const parsed = parseInlineVariableCommandQuery(commandQuery)
    const queryKey = parsed.key
    const mediaCandidates = applyCommandMenuMediaNameDraftsToInlineCandidates(mergeInlineMediaCommandCandidates([
      ...uploadedMediaCommandCandidates,
      ...collectInlineMediaCommandCandidates({
        draftText: [commandContextText, draft].filter(Boolean).join('\n'),
      }),
    ]), mediaNameDrafts).slice(0, 12)
    const mediaCandidateItems = mediaCandidates
      .filter(candidate => !queryKey || candidate.label.toLowerCase().includes(queryKey.toLowerCase()) || candidate.url.toLowerCase().includes(queryKey.toLowerCase()))
      .map(candidate => buildInlineMediaCommandMenuItem({
        candidate,
        onSelect: () => insertMediaCommand(candidate, { closeAfterApply: true }),
      }))
    const suggestionItems = collectMarkdownVariableBrowseRows({ draftText: draft })
      .filter(row => !queryKey || row.key.toLowerCase().includes(queryKey.toLowerCase()))
      .slice(0, 8)
      .map(row => buildInlineVariableBrowseMenuItem({
        row,
        idPrefix: 'var-',
        onSelect: () => replaceCommandSelection(buildMarkdownVariableToken({ mode: 'ref', key: row.key })),
      }))
    const canRef = isInlineVariableKey(parsed.key)
    const canCreate = parsed.mode === 'create' && canRef && !!parsed.value
    const canFallback = parsed.mode === 'fallback' && canRef && !!parsed.fallback
    const actionById = Object.fromEntries(INLINE_VARIABLE_COMMAND_ACTIONS.map(action => [action.id, action]))
    const insertReference = actionById['insert-reference']
    const inlineDeclaration = actionById['inline-declaration']
    const fallbackReference = actionById['fallback-reference']
    const mediaInsertActions = (['insert-image', 'insert-audio', 'insert-video'] as const).map((actionId: InlineVariableCommandId) => {
      const action = actionById[actionId]
      const kind = INLINE_MEDIA_INSERT_KIND_BY_VARIABLE_ACTION_ID[actionId]
      const fallbackCandidate = mediaCandidates.find(candidate => candidate.kind === kind)
      if (fallbackCandidate) return buildInlineMediaCommandMenuItem({
        candidate: {
          ...fallbackCandidate,
          id: action.id,
          label: action.label,
          description: fallbackCandidate.description || action.description,
          keywords: [kind, ...action.keywords, ...fallbackCandidate.keywords].filter(Boolean) as string[],
        },
        onSelect: () => {
          insertMediaCommand(fallbackCandidate, { closeAfterApply: true })
        },
      })
      return buildInlineCommandActionMenuItem({
        action,
        keywords: [kind, ...action.keywords].filter(Boolean) as string[],
        onSelect: () => {
          insertMediaCommand({
            id: action.id,
            kind,
            url: '',
            label: '',
            description: action.description,
            keywords: [...action.keywords],
          }, { closeAfterApply: false })
        },
      })
    })
    const mediaActions = (['image-reference', 'audio-reference', 'video-reference'] as const).map((actionId: InlineVariableCommandId) => {
      const action = actionById[actionId]
      const key = INLINE_MEDIA_VARIABLE_KEY_BY_ACTION_ID[actionId]
      return buildInlineCommandActionMenuItem({
        action,
        keywords: [key, ...action.keywords],
        onSelect: () => replaceCommandSelection(buildMarkdownVariableToken({ mode: 'ref', key }) || ''),
      })
    })
    const uploadMediaAction = actionById[INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID]
    return [
      buildInlineCommandActionMenuItem({
        action: uploadMediaAction,
        onSelect: () => uploadInputRef.current?.click(),
      }),
      ...mediaCandidateItems,
      ...mediaInsertActions,
      ...skillsCommandsInvocationItems.variable,
      ...suggestionItems,
      buildInlineCommandActionMenuItem({
        action: insertReference,
        keywords: [parsed.key, ...insertReference.keywords],
        disabled: !canRef,
        onSelect: () => {
          const token = buildMarkdownVariableToken({ mode: 'ref', key: parsed.key })
          if (token) replaceCommandSelection(token)
        },
      }),
      buildInlineCommandActionMenuItem({
        action: inlineDeclaration,
        keywords: [parsed.key, ...inlineDeclaration.keywords],
        disabled: !canCreate,
        onSelect: () => {
          const token = buildMarkdownVariableToken({ mode: 'create', key: parsed.key, value: parsed.value })
          if (token) replaceCommandSelection(token)
        },
      }),
      buildInlineCommandActionMenuItem({
        action: fallbackReference,
        keywords: [parsed.key, ...fallbackReference.keywords],
        disabled: !canFallback,
        onSelect: () => {
          const token = buildMarkdownVariableToken({ mode: 'fallback', key: parsed.key, fallback: parsed.fallback })
          if (token) replaceCommandSelection(token)
        },
      }),
      ...mediaActions,
    ]
  }, [commandContextText, commandQuery, draft, insertMediaCommand, mediaNameDrafts, replaceCommandSelection, skillsCommandsInvocationItems, uploadedMediaCommandCandidates])
  const keywordCommandItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => {
    const catalogTokens = new Set(skillsCommandsInvocationItems.keyword.map(item => item.label.toLowerCase()))
    const contextualItems = collectInlineKeywordCommandCandidates({
      draftText: [commandContextText, draft].filter(Boolean).join('\n'),
    }).filter(candidate => !catalogTokens.has(String(candidate.token || '').toLowerCase())).map(candidate => buildInlineKeywordCommandMenuItem({
      candidate,
      replacement: candidate.token || buildInlineKeywordToken(candidate.label),
      onSelect: replaceCommandSelection,
    }))
    return [...skillsCommandsInvocationItems.keyword, ...contextualItems]
  }, [commandContextText, draft, replaceCommandSelection, skillsCommandsInvocationItems])
  const commandMenuConfig = commandMode === 'slash'
    ? {
        ariaLabel: 'Card slash commands',
        items: slashCommandItems,
        placeholder: 'Type a command',
        emptyLabel: 'No commands',
      }
    : commandMode === 'variable'
    ? {
        ariaLabel: 'Card variable commands',
        items: variableCommandItems,
        placeholder: 'Find variable or action',
        emptyLabel: 'No variable commands',
      }
    : commandMode === 'keyword'
    ? {
        ariaLabel: 'Card keyword commands',
        items: keywordCommandItems,
        placeholder: 'Find keyword',
        emptyLabel: 'No keyword commands',
      }
    : null
  const commandMenu = commandMode ? (
    <section
      aria-label={commandMenuConfig?.ariaLabel || 'Card commands'}
      className={`fixed z-[1000] rounded border p-2 shadow-lg ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border}`}
      style={menuFrame ? { left: menuFrame.left, top: menuFrame.top, width: menuFrame.width } : undefined}
      {...{ [CARD_INLINE_TEXT_COMMAND_MENU_ATTRIBUTE]: commandMode }}
      onMouseDown={preventDefaultMouseDown}
    >
      <MarkdownBlockContainerCommandMenu
        ariaLabel={commandMenuConfig?.ariaLabel || 'Card commands'}
        items={commandMenuConfig?.items || []}
        selectOnPointerDown={false}
        query={commandQuery}
        onQueryChange={setCommandQuery}
        onCancel={closeCommandMenu}
        placeholder={commandMenuConfig?.placeholder || 'Find command'}
        inputClassName="w-full bg-transparent text-xs outline-none"
        itemClassName={cardInlineCommandMenuItemClassName}
        itemDangerClassName={cardInlineCommandMenuDangerClassName}
        itemDisabledClassName={cardInlineCommandMenuDisabledClassName}
        emptyLabel={commandMenuConfig?.emptyLabel || 'No commands'}
      />
    </section>
  ) : null
  const commandMenuHost = (menuAnchorRef?.current || inputRef.current)?.ownerDocument?.body || (typeof document !== 'undefined' ? document.body : null)
  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,audio/*,video/*"
        multiple
        className="sr-only"
        aria-label="New Media upload"
        data-kg-inline-media-upload-input="1"
        onChange={event => {
          void uploadMediaCommand(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
      />
      {showLaunchers ? <menu className="absolute right-2 top-2 z-10 m-0 flex list-none gap-1 p-0" aria-label="Card inline command launchers" {...{ [CARD_INLINE_TEXT_COMMAND_MENU_ATTRIBUTE]: '1' }}>
        <li className="list-none">
          <button type="button" className={cardInlineCommandButtonClassName} title="Slash commands" onMouseDown={preventDefaultMouseDown} onClick={() => openCommandMenu('slash')}>
            <Slash className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} strokeWidth={1.8} />
          </button>
        </li>
        <li className="list-none">
          <button type="button" className={cardInlineCommandButtonClassName} title="Variable commands" onMouseDown={preventDefaultMouseDown} onClick={() => openCommandMenu('variable')}>
            <AtSign className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} strokeWidth={1.8} />
          </button>
        </li>
        <li className="list-none">
          <button type="button" className={cardInlineCommandButtonClassName} title="Keyword commands" onMouseDown={preventDefaultMouseDown} onClick={() => openCommandMenu('keyword')}>
            <Hash className={UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} strokeWidth={1.8} />
          </button>
        </li>
      </menu> : null}
      {commandMenu && commandMenuHost ? createPortal(commandMenu, commandMenuHost) : commandMenu}
    </>
  )
}
