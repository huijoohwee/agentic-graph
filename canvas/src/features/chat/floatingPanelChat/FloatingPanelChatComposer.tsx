import { buildAgenticOsInvocationSourceTitle } from '@/features/agentic-os/agenticOsDocInvocations'
import React from 'react'
import type { PresetSummary } from '../gatewayPresetCatalog'
import { useGraphStore } from '@/hooks/useGraphStore'
import { collectMarkdownVariableBrowseRows, buildMarkdownVariableToken } from '@/features/markdown/ui/markdownVariableReferences'
import {
  buildPromptPresetChatInvocationCatalogEntries,
  resolveChatInvocationCatalogEntries,
  resolveChatInvocationCatalogEntryInsertionText,
  type ChatInvocationCatalogPrefixFilter,
} from '@/features/chat/chatInvocationRegistry'
import { usePromptPresetCatalog } from '@/features/chat/usePromptPresetCatalog'
import { fetchAgenticOsRemoteGrammarCatalog, type AgenticOsRemoteGrammarCatalogEntry, useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { buildInlineMediaEmbed, collectInlineKeywordCommandCandidates, collectInlineMediaCommandCandidates } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { mergeInlineMediaCommandCandidates } from '@/lib/command-menu/inlineMediaCommandCandidateMerge'
import {
  buildInlineCommandMenuItem,
  buildInlineKeywordCommandMenuItem,
  buildInlineMediaCommandMenuItem,
  buildInlineVariableBrowseMenuItem,
} from '@/lib/command-menu/inlineCommandMenuItems'
import { useUploadedMediaInlineCommandCandidates } from '@/lib/command-menu/inlineUploadedMediaCandidates'
import { MarkdownBlockContainerCommandMenu, type MarkdownInlineCommandMenuItem } from '@/lib/markdown-core/ui/markdownBlockContainerCore.commandMenu'
import { AnchorOverlay } from '@/lib/ui/overlay'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { FLOATING_MENU_BUTTON_CLASSNAME, FLOATING_MENU_BUTTON_DISABLED_CLASSNAME, FLOATING_MENU_BUTTON_DANGER_CLASSNAME, FLOATING_POPOVER_INPUT_CLASSNAME } from '@/features/markdown-workspace/main/viewer/floatingMenuStyles'
import { UI_RESPONSIVE_MULTILINE_TEXT_INPUT_EDITOR_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { replaceChatComposerTrigger, resolveChatComposerTrigger, type ChatComposerTrigger } from './chatComposerTrigger'
import { focusMarkdownInlineTextSelectionSoon } from '@/lib/markdown-core/ui/MarkdownInlineTextEditSurface'
import { FloatingPanelChatContentEditableSurface } from './FloatingPanelChatContentEditableSurface'

type FloatingPanelChatComposerProps = {
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  appendFocusRequestKey?: number
  markdownText?: string | null
  isLoading: boolean
  isSubmitDisabled: boolean
  uiPanelTextFontClass: string
  placeholder: string
  responsiveEditorClassName?: string
}

const REMOTE_GRAMMAR_SIGIL_BY_TRIGGER_KIND = {
  slash: '/',
  variable: '@',
  keyword: '#',
} as const

const REMOTE_GRAMMAR_GROUP_BY_KIND = {
  binding: 'Agentic OS binding dictionary',
  command: 'Agentic OS command dictionary',
  semantic: 'Agentic OS semantic dictionary',
} as const

const drawingTokens = {
  slash: ['/canvas.project', 'Project a diagram or sketch onto Canvas'],
  at: ['@canvas', 'Use the active Canvas'],
  hash: ['#canvas', 'Author editable Canvas content'],
} as const

const FLOATING_PANEL_CHAT_GRAMMAR_QUICK_BAR_TOKENS = [
  { id: 'slash', label: '/', name: 'Commands', description: 'Open slash commands' },
  { id: 'binding', label: '@', name: 'Context', description: 'Open bindings and variables' },
  { id: 'keyword', label: '#', name: 'Meaning', description: 'Open runtime invocations' },
] as const

const mergeMenuItems = (
  primaryItems: MarkdownInlineCommandMenuItem[],
  fallbackItems: MarkdownInlineCommandMenuItem[],
): MarkdownInlineCommandMenuItem[] => {
  const seen = new Set<string>()
  const merged: MarkdownInlineCommandMenuItem[] = []
  for (const item of [...primaryItems, ...fallbackItems]) {
    const key = item.label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

const matchesRemoteGrammarTriggerKind = (
  entry: AgenticOsRemoteGrammarCatalogEntry,
  triggerKind: NonNullable<ChatComposerTrigger>['kind'],
): boolean => {
  const expectedSigil = REMOTE_GRAMMAR_SIGIL_BY_TRIGGER_KIND[triggerKind]
  return String(entry.token || '').startsWith(expectedSigil)
}

const resolveRemoteGrammarGroup = (entry: AgenticOsRemoteGrammarCatalogEntry): string => {
  const kind = String(entry.kind || '').toLowerCase()
  return REMOTE_GRAMMAR_GROUP_BY_KIND[kind as keyof typeof REMOTE_GRAMMAR_GROUP_BY_KIND] || 'Agentic OS remote grammar'
}

export function FloatingPanelChatComposer(props: FloatingPanelChatComposerProps) {
  const anchorRef = React.useRef<HTMLElement | null>(null)
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)
  const editorRef = React.useRef<HTMLElement | null>(null)
  const pendingSelectionRef = React.useRef<{ start: number; end: number } | null>(null)
  const [trigger, setTrigger] = React.useState<ChatComposerTrigger | null>(null)
  const quickMenuOpen = React.useRef(false)
  const [query, setQuery] = React.useState('')
  const [remoteGrammarEntries, setRemoteGrammarEntries] = React.useState<AgenticOsRemoteGrammarCatalogEntry[]>([])
  const promptPresets = usePromptPresetCatalog()
  const [canvasPresets, setCanvasPresets] = React.useState<PresetSummary[] | null>(null)
  const [presetError, setPresetError] = React.useState('')
  const isSlashOpen = trigger?.kind === 'slash'
  React.useEffect(() => {
    if (!isSlashOpen || canvasPresets) return
    let current = true
    void import('../gatewayPresetCatalog').then(m => m.listGatewayPresets()).then(result => {
      if (!current) return
      if (result.ok === false) { setPresetError(result.error); return }
      setPresetError('')
      setCanvasPresets(result.presets.filter(p => p.runtimeCommand === '/canvas.project'))
    }).catch(error => { if (current) setPresetError(String(error)) })
    return () => { current = false }
  }, [isSlashOpen, canvasPresets])
  const draftRef = React.useRef({ input: props.input, trigger })
  React.useLayoutEffect(() => {
    draftRef.current = { input: props.input, trigger }
    return () => { draftRef.current = { input: '', trigger: null } }
  }, [props.input, trigger])
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({
    sigils: trigger ? [REMOTE_GRAMMAR_SIGIL_BY_TRIGGER_KIND[trigger.kind]] : [],
  })
  const uploadedMediaItems = useUploadedMediaInlineCommandCandidates()
  const focusComposerSelection = React.useCallback((cursor: number) => {
    const selection = { start: cursor, end: cursor }
    pendingSelectionRef.current = selection
    inputRef.current?.setSelectionRange(cursor, cursor)
    focusMarkdownInlineTextSelectionSoon(editorRef, cursor)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (pendingSelectionRef.current === selection) pendingSelectionRef.current = null
    }))
  }, [])

  const closeMenu = React.useCallback(() => {
    quickMenuOpen.current = false
    setTrigger(null)
    setQuery('')
  }, [])
  const applyReplacement = React.useCallback((replacement: string) => {
    if (!trigger) return
    const next = replaceChatComposerTrigger({ text: props.input, trigger, replacement })
    props.setInput(next.text)
    closeMenu()
    requestAnimationFrame(() => {
      focusComposerSelection(next.cursor)
    })
  }, [closeMenu, focusComposerSelection, props, trigger])
  const buildInvocationCatalogItems = React.useCallback((prefixFilter: ChatInvocationCatalogPrefixFilter): MarkdownInlineCommandMenuItem[] => (
    mergeMenuItems(resolveChatInvocationCatalogEntries(prefixFilter, '').map(entry => buildInlineCommandMenuItem({
      id: `chat-invocation-catalog-${prefixFilter}-${entry.id}`,
      label: entry.token,
      group: entry.group,
      description: entry.summary,
      title: buildAgenticOsInvocationSourceTitle(entry),
      keywords: [entry.label, entry.sourcePath || '', ...entry.keywords].filter(Boolean),
      onSelect: () => applyReplacement(`${entry.token} `),
    })), Object.entries(drawingTokens)
      .filter(([kind]) => prefixFilter === 'all' || kind === prefixFilter)
      .map(([kind, [token, description]]) => buildInlineCommandMenuItem({
        id: 'canvas-drawing-' + kind, label: token, description, group: 'Canvas',
        keywords: ['diagram', 'sketch', 'freeform'], onSelect: () => applyReplacement(token + ' '),
      })))
  ), [applyReplacement, grammarCatalog.version])
  React.useEffect(() => {
    if (!trigger) {
      setRemoteGrammarEntries([])
      return
    }
    const token = `${REMOTE_GRAMMAR_SIGIL_BY_TRIGGER_KIND[trigger.kind]}${query}`
    const abortController = new AbortController()
    setRemoteGrammarEntries([])
    fetchAgenticOsRemoteGrammarCatalog({ query: token, signal: abortController.signal })
      .then(entries => {
        setRemoteGrammarEntries(entries.filter(entry => matchesRemoteGrammarTriggerKind(entry, trigger.kind)))
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setRemoteGrammarEntries([])
      })
    return () => abortController.abort()
  }, [query, trigger])

  React.useEffect(() => {
    if (!props.appendFocusRequestKey) return
    let cancelled = false
    requestAnimationFrame(() => {
      if (cancelled) return
      focusComposerSelection(draftRef.current.input.length)
      closeMenu()
    })
    return () => {
      cancelled = true
    }
  }, [closeMenu, focusComposerSelection, props.appendFocusRequestKey])

  const remoteGrammarItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => {
    if (!trigger) return []
    return remoteGrammarEntries.map(entry => buildInlineCommandMenuItem({
      id: `remote-agentic-os-grammar-${encodeURIComponent(entry.token)}`,
      label: entry.token,
      group: resolveRemoteGrammarGroup(entry),
      description: entry.summary || entry.intent || entry.label || 'Live Agentic OS grammar',
      keywords: [
        entry.label || '',
        entry.sourcePath || '',
        entry.fileName || '',
        ...(Array.isArray(entry.keywords) ? entry.keywords : []),
      ].filter(Boolean),
      onSelect: () => applyReplacement(`${entry.token} `),
    }))
  }, [applyReplacement, remoteGrammarEntries, trigger])

  const slashFallbackItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => buildInvocationCatalogItems('slash'), [buildInvocationCatalogItems])
  const promptPresetItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => (
    buildPromptPresetChatInvocationCatalogEntries(promptPresets).map(entry => buildInlineCommandMenuItem({
      id: `chat-prompt-preset-${entry.id}`,
      label: entry.token,
      group: entry.group,
      description: entry.summary,
      title: buildAgenticOsInvocationSourceTitle(entry),
      keywords: [entry.label, entry.sourcePath || '', ...entry.keywords].filter(Boolean),
      onSelect: () => applyReplacement(resolveChatInvocationCatalogEntryInsertionText(entry)),
    }))
  ), [applyReplacement, promptPresets])
  const canvasPresetItems = React.useMemo(() => (canvasPresets || []).map(preset => buildInlineCommandMenuItem({
    id: 'gateway-' + preset.id, label: preset.slashCommand, group: 'Prompt preset',
    description: preset.description, keywords: [preset.label, preset.runtimeCommand, 'sketch diagram freeform'],
    onSelect: async () => {
      const draft = draftRef.current
      const documentName = useGraphStore.getState().markdownDocumentName
      try {
        const { selectGatewayPreset } = await import('../gatewayPresetCatalog')
        const result = await selectGatewayPreset(preset.id)
        if (draftRef.current !== draft || useGraphStore.getState().markdownDocumentName !== documentName) return
        if (result.ok === false) { setPresetError(result.error); return }
        setPresetError('')
        applyReplacement(result.prompt)
      } catch (error) { if (draftRef.current === draft) setPresetError(String(error)) }
    },
  })), [applyReplacement, canvasPresets])
  const slashItems = React.useMemo(
    () => mergeMenuItems(
      mergeMenuItems(canvasPresetItems, promptPresetItems),
      mergeMenuItems(remoteGrammarItems.filter(item => item.label.startsWith('/')), slashFallbackItems),
    ),
    [canvasPresetItems, promptPresetItems, remoteGrammarItems, slashFallbackItems],
  )
  const variableFallbackItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => {
    const sourceLines = String(props.markdownText || '').split(/\r?\n/)
    const workspaceVariables = collectMarkdownVariableBrowseRows({ sourceLines, draftText: props.input }).slice(0, 40).map(row => buildInlineVariableBrowseMenuItem({
      row,
      group: 'Workspace variables',
      onSelect: () => applyReplacement(buildMarkdownVariableToken({ mode: 'ref', key: row.key })),
    }))
    const mediaItems = mergeInlineMediaCommandCandidates([
      ...uploadedMediaItems,
      ...collectInlineMediaCommandCandidates({ sourceLines, draftText: props.input, limit: 20 }),
    ], 20)
      .map(item => buildInlineMediaCommandMenuItem({
        candidate: item,
        idPrefix: 'media-',
        group: 'FloatingPanel Media',
        onSelect: () => applyReplacement(buildInlineMediaEmbed({
          kind: item.kind,
          url: item.url,
          thumbnailUrl: item.thumbnailUrl,
          label: item.label,
          sourceKey: item.sourceKey,
          selectedText: '',
        })),
      }))
    return [...mediaItems, ...buildInvocationCatalogItems('at'), ...workspaceVariables]
  }, [applyReplacement, buildInvocationCatalogItems, props.input, props.markdownText, uploadedMediaItems])
  const variableItems = React.useMemo(
    () => mergeMenuItems(remoteGrammarItems.filter(item => item.label.startsWith('@')), variableFallbackItems),
    [remoteGrammarItems, variableFallbackItems],
  )
  const keywordFallbackItems = React.useMemo<MarkdownInlineCommandMenuItem[]>(() => {
    const catalogItems = buildInvocationCatalogItems('hash')
    const catalogTokens = new Set(catalogItems.map(item => item.label.toLowerCase()))
    const contextualItems = collectInlineKeywordCommandCandidates({
      draftText: [props.markdownText, props.input].filter(Boolean).join('\n'),
      limit: 20,
    }).filter(candidate => !catalogTokens.has(candidate.token.toLowerCase())).map(candidate => buildInlineKeywordCommandMenuItem({
      candidate,
      label: candidate.token,
      replacement: `${candidate.token} `,
      onSelect: applyReplacement,
    }))
    return [...catalogItems, ...contextualItems]
  }, [applyReplacement, buildInvocationCatalogItems, props.input, props.markdownText])
  const keywordItems = React.useMemo(
    () => mergeMenuItems(remoteGrammarItems.filter(item => item.label.startsWith('#')), keywordFallbackItems),
    [keywordFallbackItems, remoteGrammarItems],
  )
  const items = trigger?.kind === 'slash' ? slashItems : trigger?.kind === 'keyword' ? keywordItems : variableItems
  const ariaLabel = trigger?.kind === 'slash' ? 'Chat slash commands' : trigger?.kind === 'keyword' ? 'Chat runtime invocations' : 'Chat variable commands'
  const insertGrammarQuickBarToken = React.useCallback((token: '/' | '#' | '@') => {
    const input = inputRef.current
    const rawSelectionStart = input?.selectionStart ?? props.input.length
    const rawSelectionEnd = input?.selectionEnd ?? props.input.length
    const needsSpace = rawSelectionStart > 0 && /\S/.test(props.input.charAt(rawSelectionStart - 1))
    const prefix = (needsSpace ? ' ' : '') + token
    const text = props.input.slice(0, rawSelectionStart) + prefix + props.input.slice(rawSelectionEnd)
    const cursor = rawSelectionStart + prefix.length
    quickMenuOpen.current = true
    props.setInput(text)
    setTrigger(resolveChatComposerTrigger(text, cursor))
    setQuery('')
  }, [props.input, props.setInput])

  return (
    <section ref={anchorRef} className={`relative flex flex-col border rounded overflow-hidden ${props.responsiveEditorClassName || UI_RESPONSIVE_MULTILINE_TEXT_INPUT_EDITOR_CLASSNAME} ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.input.bg}`}>
      <section
        className={`flex shrink-0 items-center gap-1 border-b px-2 py-1 ${UI_THEME_TOKENS.panel.border}`}
        aria-label="Chat invocation controls"
        data-kg-chat-grammar-quick-bar="true"
      >
        {FLOATING_PANEL_CHAT_GRAMMAR_QUICK_BAR_TOKENS.map(entry => (
          <button
            key={entry.id}
            type="button"
            data-kg-chat-grammar-quick-bar-token={entry.label}
            className={`App-toolbar__btn min-w-[2.5rem] justify-center text-xs ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg} disabled:opacity-50`}
            aria-label={entry.description}
            title={entry.description}
            disabled={props.isLoading}
            onPointerDown={event => event.preventDefault()}
            onClick={() => insertGrammarQuickBarToken(entry.label)}
          >
            {entry.label} {entry.name}
          </button>
        ))}
      </section>
      {presetError && <p role="alert">{presetError}</p>}
      <FloatingPanelChatContentEditableSurface
        value={props.input}
        onChange={props.setInput}
        inputProxyRef={inputRef}
        editorRef={editorRef}
        ariaLabel={props.placeholder}
        placeholder={props.placeholder}
        disabled={props.isLoading}
        className={`min-h-0 flex-1 overflow-auto bg-transparent px-2 py-1 ${props.uiPanelTextFontClass}`}
        commandMode={trigger}
        onSelectionChange={(selection, value) => {
          if (pendingSelectionRef.current || quickMenuOpen.current) return
          const next = resolveChatComposerTrigger(value, selection.end)
          setTrigger(next)
          setQuery(next?.query || '')
        }}
        onOpenCommandMenuForSigil={(sigil, selection) => {
          const kind = sigil === '/' ? 'slash' : sigil === '@' ? 'variable' : 'keyword'
          setTrigger({ kind, query: '', rangeStart: selection.start, rangeEnd: selection.end })
          setQuery('')
        }}
        onModEnter={() => { if (!props.isSubmitDisabled) editorRef.current?.closest('form')?.requestSubmit() }}
      />
      <AnchorOverlay anchorRef={anchorRef} open={!!trigger} onClose={closeMenu} align="top-left" className={`w-[min(22rem,calc(100vw-1rem))] rounded border p-2 shadow-[var(--kg-shadow-overlay)] ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.panel.border}`}>
        <MarkdownBlockContainerCommandMenu
          ariaLabel={ariaLabel}
          items={items}
          query={query}
          onQueryChange={setQuery}
          onCancel={closeMenu}
          placeholder={trigger?.kind === 'slash' ? 'Find command' : trigger?.kind === 'keyword' ? 'Find runtime or keyword' : 'Find workspace variable'}
          inputClassName={FLOATING_POPOVER_INPUT_CLASSNAME}
          itemClassName={FLOATING_MENU_BUTTON_CLASSNAME}
          itemDisabledClassName={FLOATING_MENU_BUTTON_DISABLED_CLASSNAME}
          itemDangerClassName={FLOATING_MENU_BUTTON_DANGER_CLASSNAME}
          emptyLabel={trigger?.kind === 'slash' ? 'No commands' : trigger?.kind === 'keyword' ? 'No runtime invocations' : 'No workspace variables'}
          selectOnPointerDown={false}
        />
      </AnchorOverlay>
    </section>
  )
}
