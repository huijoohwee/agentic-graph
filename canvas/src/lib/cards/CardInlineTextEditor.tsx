import React from 'react'
import { useWorkspaceDataViewFloatingDensity } from '@/features/markdown-workspace/main/viewer/workspaceDataViewFloatingStore'
import { CardInlineTextEditingSurface } from '@/lib/cards/CardInlineTextEditingSurface'
import { CardInlineTextDisplaySurface } from '@/lib/cards/CardInlineTextDisplaySurface'
import {
  CARD_INLINE_TEXT_COMMAND_MENU_ATTRIBUTE,
  CARD_INLINE_TEXT_COMMAND_ROOT_ATTRIBUTE,
  CARD_INLINE_TEXT_EDITOR_INPUT_ATTRIBUTE,
  EDITOR_PROJECTED_MEDIA_ATTACHMENTS,
  buildCardInlineTextEditorOwnerKey,
  commitOpenCardInlineTextEditorsExcept,
  isElementEventTarget,
  normalizeCardInlineTextDisplayClassName,
  normalizeCommittedCardInlineEditorValue,
  shouldIgnoreInlineEditTarget,
  type CardInlineTextCommandExternalState,
  type CardInlineTextEditorProps,
} from '@/lib/cards/CardInlineTextEditorSupport'
import { CardInlineTextCommandMenus, type CardInlineTextCommandMenuMode } from '@/lib/cards/CardInlineTextCommandMenus'
import { hasCardMarkdownPreviewSyntax, normalizeCardInlineMediaSoftLineBreaks } from '@/lib/cards/cardMarkdownPreviewUtils'
import { useCardInlineTextViewerDraftProjection } from '@/lib/cards/cardInlineTextViewerDraftProjection'
import { CardInlineTextProjectedMediaChip } from '@/lib/cards/CardInlineTextProjectedMediaChip'
import { focusMarkdownInlineTextSelectionSoon } from '@/lib/markdown-core/ui/MarkdownInlineTextEditSurface'
import type { MarkdownContentEditablePoint } from '@/lib/markdown-core/ui/markdownContentEditableSurface'
import { useLiveCardInlineTextDraft, useRegisteredOpenCardInlineTextEditor } from '@/lib/cards/useRegisteredOpenCardInlineTextEditor'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { readDataViewFieldLineClassName, readDataViewMultiLineControlClassName } from '@/lib/ui/dataViewDensity'
import { useCardInlineTextSelectedDisplayCommand } from '@/lib/cards/cardInlineTextSelectedDisplayCommand'
import type { InlineMediaCommandCandidate } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { buildCardInlineTextDisplayMediaCandidateMap, resolveCardInlineTextDisplayProjectionSource } from '@/lib/cards/cardInlineTextDisplayMediaProjection'
import {
  buildCardInlineTextMediaEmbed,
  clearActiveCardInlineTextExternalCommandTarget,
  setActiveCardInlineTextExternalCommandTarget,
  setCardInlineTextExternalCommandElementTarget,
  type CardInlineTextExternalMediaCandidate,
} from '@/lib/cards/cardInlineTextExternalCommands'
import {
  focusCardInlineEditorInputSelectionSoon,
  normalizeCardInlineEditorValue,
  readCardInlineEditorInputSelection,
  replaceCardInlineEditorTextRange,
} from '@/lib/cards/cardInlineTextEditorUtils'
import { readInlineCommandMenuSigilFromInsertedText, readInlineCommandMenuSigilFromKeyEvent } from '@/lib/command-menu/inlineCommandMenuTrigger'
import {
  buildFloatingPanelChatComposerDisplayText,
  buildFloatingPanelChatComposerOverlayParts,
  isFloatingPanelChatComposerProjectedCaretInsideChip,
  mapFloatingPanelChatComposerDisplayIndexToRawIndex,
  mapFloatingPanelChatComposerRawIndexToDisplayIndex,
  readTextareaInvocationMediaReferenceKey,
  readTextareaInvocationProjectionTextClassName,
  resolveFloatingPanelChatComposerRawText,
  type TextareaInvocationProjectedMediaChip,
} from '@/lib/ui/textareaInvocationProjection'
import { cn } from '@/lib/utils'
const normalizeEditorValue = normalizeCardInlineEditorValue
const normalizeCommittedEditorValue = normalizeCommittedCardInlineEditorValue
const readInputSelection = readCardInlineEditorInputSelection
const focusInputSelectionSoon = focusCardInlineEditorInputSelectionSoon
const replaceTextRange = replaceCardInlineEditorTextRange

const toInlineMediaCommandCandidate = (
  candidate: CardInlineTextExternalMediaCandidate,
): InlineMediaCommandCandidate => {
  const sourceKey = String(candidate.sourceKey || '').trim()
  const url = String(candidate.url || '').trim()
  return {
    id: sourceKey ? `card-inline-external:${candidate.kind}:${sourceKey}` : `card-inline-external:${candidate.kind}:${url}`,
    kind: candidate.kind,
    url,
    thumbnailUrl: candidate.thumbnailUrl,
    label: candidate.label,
    sourceKey: sourceKey || undefined,
    description: url || candidate.label,
    keywords: [candidate.kind, candidate.label, sourceKey, url].filter(Boolean) as string[],
  }
}

export { commitActiveCardInlineTextEditor } from '@/lib/cards/CardInlineTextEditorSupport'
export const CardInlineTextEditor = React.memo(function CardInlineTextEditor(props: CardInlineTextEditorProps) {
  const {
    id,
    value,
    displayValue: displayValueProp,
    ariaLabel,
    placeholder,
    canEdit = false,
    editActivation = 'doubleClick',
    editRequestKey = null,
    multiline = false,
    displayLineClamp = 'density',
    displayClassName,
    editorClassName,
    emptyClassName,
    markdownPreview = false,
    markdownPresentationMode = false,
    markdownDocumentPath = '/__card_inline_text_editor/preview.md',
    markdownCommandMenus = true,
    markdownCommandContextText = '',
    mediaCommandMode = 'inline',
    editorSurface = 'viewer',
    inlineChipDensity = 'regular',
    openOnPointerDown = false,
    projectedMediaAttachments = null,
    rows,
    showCommandLaunchers = true,
    stopActivationPropagation = true,
    onCommit,
    onEditingChange,
    onMediaCommandSelect,
  } = props
  const [editing, setEditing] = React.useState(false)
  const { draft, readDraft, updateDraft } = useLiveCardInlineTextDraft(normalizeEditorValue(value))
  const [commandMode, setCommandMode] = React.useState<CardInlineTextCommandMenuMode | null>(null)
  const [commandQuery, setCommandQuery] = React.useState('')
  const [projectedSelectionRange, setProjectedSelectionRange] = React.useState({ start: 0, end: 0 })
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const viewerEditorRef = React.useRef<HTMLElement | null>(null)
  const commandRootRef = React.useRef<HTMLElement | null>(null)
  const displayRef = React.useRef<HTMLElement | null>(null)
  const initialViewerSelectionPointRef = React.useRef<MarkdownContentEditablePoint | null>(null)
  const lastEditRequestKeyRef = React.useRef<string | number | null>(null)
  const lastEditingRef = React.useRef(editing)
  const committedEditValueRef = React.useRef<string | null>(null)
  const commandSelectionRef = React.useRef<{ start: number; end: number }>({ start: 0, end: 0 })
  const externalCommandStateRef = React.useRef<CardInlineTextCommandExternalState>({ canEdit, draft, editing, multiline, onCommit, onMediaCommandSelect, persistCommandDraft: (_nextValue: string) => void 0, value })
  const editorDensity = useWorkspaceDataViewFloatingDensity()
  const useViewerEditSurface = editorSurface === 'viewer'
  const { beginViewerDraft, resolveViewerDraft } = useCardInlineTextViewerDraftProjection(useViewerEditSurface && inlineChipDensity === 'compact')
  const ownerKey = React.useMemo(() => buildCardInlineTextEditorOwnerKey({ id, ariaLabel }), [ariaLabel, id])
  const displaySourceValue = displayValueProp == null ? value : displayValueProp
  const isCommandMenuTarget = React.useCallback((target: EventTarget | null): boolean => {
    if (!isElementEventTarget(target)) return false
    return !!commandRootRef.current?.contains(target) || !!target.closest(`[${CARD_INLINE_TEXT_COMMAND_MENU_ATTRIBUTE}]`)
  }, [])
  React.useEffect(() => {
    if (editing) return
    updateDraft(normalizeEditorValue(value))
  }, [editing, updateDraft, value])
  React.useEffect(() => {
    if (!editing) return
    if (useViewerEditSurface) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    if ('selectionStart' in input && typeof input.value === 'string') {
      const fallbackEnd = input.value.length
      const selection = commandMode ? commandSelectionRef.current : { start: 0, end: fallbackEnd }
      input.setSelectionRange(selection.start, selection.end)
    }
  }, [commandMode, editing, useViewerEditSurface])
  React.useEffect(() => {
    if (editRequestKey == null) {
      lastEditRequestKeyRef.current = null
      return
    }
    if (!canEdit) return
    if (Object.is(lastEditRequestKeyRef.current, editRequestKey)) return
    lastEditRequestKeyRef.current = editRequestKey
    commitOpenCardInlineTextEditorsExcept(ownerKey)
    committedEditValueRef.current = null
    updateDraft(beginViewerDraft(value))
    setEditing(true)
  }, [beginViewerDraft, canEdit, editRequestKey, ownerKey, updateDraft, value])
  React.useEffect(() => {
    if (lastEditingRef.current === editing) return
    lastEditingRef.current = editing
    onEditingChange?.(editing)
  }, [editing, onEditingChange])
  const projectedEditorOverlay = React.useMemo(
    () => multiline
      ? buildFloatingPanelChatComposerOverlayParts(draft, {
        mediaAttachments: EDITOR_PROJECTED_MEDIA_ATTACHMENTS,
        projectInvocationTokens: false,
      })
      : { hasMedia: false, hasOverlay: false, parts: [] },
    [draft, multiline],
  )
  const hasProjectedInvocationOverlay = multiline && projectedEditorOverlay.hasOverlay
  const projectedEditorDisplayValue = React.useMemo(
    () => hasProjectedInvocationOverlay
      ? buildFloatingPanelChatComposerDisplayText(draft, { mediaAttachments: EDITOR_PROJECTED_MEDIA_ATTACHMENTS })
      : draft,
    [draft, hasProjectedInvocationOverlay],
  )
  const readProjectedEditorRawValue = React.useCallback((displayText: string): string => (
    !hasProjectedInvocationOverlay ? displayText : normalizeEditorValue(displayText) === normalizeEditorValue(projectedEditorDisplayValue)
      ? draft
      : resolveFloatingPanelChatComposerRawText(displayText, draft, { mediaAttachments: EDITOR_PROJECTED_MEDIA_ATTACHMENTS })
  ), [draft, hasProjectedInvocationOverlay, projectedEditorDisplayValue])
  const normalizeCommittedValueForSurface = React.useCallback((nextValue: string): string => useViewerEditSurface ? resolveViewerDraft(nextValue) : normalizeCommittedEditorValue(nextValue), [resolveViewerDraft, useViewerEditSurface])
  const commit = React.useCallback((forcedValue?: string) => {
    const inputValue = typeof forcedValue === 'string'
      ? forcedValue
      : useViewerEditSurface
        ? readDraft()
        : inputRef.current?.value
    const rawNext = normalizeEditorValue(inputValue == null ? draft : readProjectedEditorRawValue(inputValue))
    setEditing(false)
    setCommandMode(null)
    setCommandQuery('')
    const next = normalizeCommittedValueForSurface(rawNext)
    if (committedEditValueRef.current === next) return
    committedEditValueRef.current = next
    if (next === normalizeEditorValue(value)) return
    onCommit?.(next)
  }, [draft, normalizeCommittedValueForSurface, onCommit, readDraft, readProjectedEditorRawValue, useViewerEditSurface, value])
  const readOpenEditorValue = React.useCallback((): string | null => {
    if (useViewerEditSurface) return readDraft()
    const inputValue = inputRef.current?.value
    return typeof inputValue === 'string' ? inputValue : null
  }, [readDraft, useViewerEditSurface])
  const getEditorOwnerDocument = React.useCallback(() => (
    commandRootRef.current?.ownerDocument
    || inputRef.current?.ownerDocument
    || viewerEditorRef.current?.ownerDocument
    || (typeof document !== 'undefined' ? document : null)
  ), [])
  useRegisteredOpenCardInlineTextEditor({
    commit,
    editing,
    getOwnerDocument: getEditorOwnerDocument,
    isEditingTarget: isCommandMenuTarget,
    ownerKey,
    readValue: readOpenEditorValue,
  })
  const persistCommandDraft = React.useCallback((nextValue: string) => {
    const next = normalizeCommittedValueForSurface(nextValue)
    const input = inputRef.current
    const displayNext = hasProjectedInvocationOverlay
      ? buildFloatingPanelChatComposerDisplayText(next, { mediaAttachments: EDITOR_PROJECTED_MEDIA_ATTACHMENTS })
      : next
    if (input && input.value !== displayNext) input.value = displayNext
    if (next === normalizeEditorValue(value)) return
    onCommit?.(next)
  }, [hasProjectedInvocationOverlay, normalizeCommittedValueForSurface, onCommit, value])
  externalCommandStateRef.current = {
    canEdit,
    draft,
    editing,
    multiline,
    onCommit,
    onMediaCommandSelect,
    persistCommandDraft,
    value,
  }
  const closeCommandDraft = React.useCallback(() => {
    if (!useViewerEditSurface) setEditing(false)
    setCommandMode(null)
    setCommandQuery('')
  }, [useViewerEditSurface])
  const cancel = React.useCallback(() => {
    updateDraft(normalizeEditorValue(value))
    setEditing(false)
    setCommandMode(null)
    setCommandQuery('')
  }, [updateDraft, value])
  const openEditorFromDisplayEvent = React.useCallback((event: React.MouseEvent<HTMLElement>, options?: { useMarkdownViewerActivation?: boolean }) => {
    if (!canEdit) return false
    if (!options?.useMarkdownViewerActivation && shouldIgnoreInlineEditTarget(event.target)) return false
    event.preventDefault()
    if (stopActivationPropagation) {
      event.stopPropagation()
    }
    initialViewerSelectionPointRef.current = useViewerEditSurface
      ? { x: event.clientX, y: event.clientY }
      : null
    commitOpenCardInlineTextEditorsExcept(ownerKey)
    committedEditValueRef.current = null
    updateDraft(beginViewerDraft(value))
    setEditing(true)
    return true
  }, [beginViewerDraft, canEdit, ownerKey, stopActivationPropagation, updateDraft, useViewerEditSurface, value])
  const displayProjectionSourceValue = resolveCardInlineTextDisplayProjectionSource({ displayValue: displaySourceValue, multiline, projectedMediaAttachments, value })
  const displayMediaCandidateByKey = React.useMemo(
    () => buildCardInlineTextDisplayMediaCandidateMap(displayProjectionSourceValue, multiline ? projectedMediaAttachments : null),
    [displayProjectionSourceValue, multiline, projectedMediaAttachments],
  )
  const renderInlineMediaCandidateChip = React.useCallback(({ value }: { value: string; label: string; className: string }) => {
    const key = readTextareaInvocationMediaReferenceKey(value)
    const chip = key ? displayMediaCandidateByKey.get(key) : null
    if (!chip) return null
    const preservesAuthoredReferencePrefix = value.startsWith('@') && displayProjectionSourceValue.includes(value)
    return preservesAuthoredReferencePrefix ? (
      <>
        @
        <CardInlineTextProjectedMediaChip chip={chip} index={0} />
      </>
    ) : <CardInlineTextProjectedMediaChip chip={chip} index={0} />
  }, [displayMediaCandidateByKey, displayProjectionSourceValue])
  const displayProjectionText = multiline && projectedMediaAttachments?.length
    ? buildFloatingPanelChatComposerDisplayText(displayProjectionSourceValue, { mediaAttachments: projectedMediaAttachments })
    : displaySourceValue
  const displaySurfaceText = inlineChipDensity === 'compact'
    ? normalizeCardInlineMediaSoftLineBreaks(displayProjectionText).trim()
    : displayProjectionText
  const displayText = readMarkdownSigilDisplayText(displaySurfaceText)
  const showPlaceholder = !displayText
  const displayTitle = showPlaceholder
    ? placeholder
    : displayText
  const showMarkdownPreview =
    !showPlaceholder
    && (markdownPreview === true || (markdownPreview === 'auto' && hasCardMarkdownPreviewSyntax(displaySourceValue)))
  const enableMarkdownCommandMenus = markdownCommandMenus !== false && multiline === true
  const densityOwnedDisplayClassName = displayLineClamp === 'density' ? normalizeCardInlineTextDisplayClassName(displayClassName || '', multiline) : displayClassName || ''
  const displayLineClassName = multiline && displayLineClamp === 'density' && !densityOwnedDisplayClassName.includes('overflow-auto') ? readDataViewFieldLineClassName(editorDensity.fieldLineMode) : ''
  const openCommandMenuAtSelection = React.useCallback((mode: CardInlineTextCommandMenuMode, selection: { start: number; end: number }, seedQuery: string = '') => {
    commandSelectionRef.current = selection
    setCommandMode(mode)
    setCommandQuery(seedQuery)
  }, [])
  const openCommandMenu = React.useCallback((mode: CardInlineTextCommandMenuMode, seedQuery: string = '') => {
    openCommandMenuAtSelection(mode, readInputSelection(inputRef.current), seedQuery)
  }, [openCommandMenuAtSelection])
  const openCommandMenuForSigil = React.useCallback((sigil: '/' | '@' | '#') => {
    openCommandMenu(sigil === '/' ? 'slash' : sigil === '@' ? 'variable' : 'keyword')
  }, [openCommandMenu])
  const openCommandMenuForSigilAtSelection = React.useCallback((sigil: '/' | '@' | '#', selection: { start: number; end: number }) => {
    openCommandMenuAtSelection(sigil === '/' ? 'slash' : sigil === '@' ? 'variable' : 'keyword', selection)
  }, [openCommandMenuAtSelection])
  const openDisplayCommandMenuForSigil = React.useCallback((sigil: '/' | '@' | '#') => {
    if (!canEdit || !enableMarkdownCommandMenus) return false
    const nextDraft = beginViewerDraft(value)
    const cursor = buildFloatingPanelChatComposerDisplayText(nextDraft, { mediaAttachments: EDITOR_PROJECTED_MEDIA_ATTACHMENTS }).length
    commitOpenCardInlineTextEditorsExcept(ownerKey)
    updateDraft(nextDraft)
    setEditing(true)
    openCommandMenuForSigilAtSelection(sigil, { start: cursor, end: cursor })
    return true
  }, [beginViewerDraft, canEdit, enableMarkdownCommandMenus, openCommandMenuForSigilAtSelection, ownerKey, updateDraft, value])
  const closeCommandMenu = React.useCallback(() => {
    setCommandMode(null)
    setCommandQuery('')
    if (useViewerEditSurface) {
      focusMarkdownInlineTextSelectionSoon(viewerEditorRef, commandSelectionRef.current.end)
      return
    }
    focusInputSelectionSoon(inputRef.current, commandSelectionRef.current.end)
  }, [useViewerEditSurface])
  const projectedTextareaOverlayTextClassName = React.useMemo(
    () => readTextareaInvocationProjectionTextClassName(cn(
      readDataViewMultiLineControlClassName({
        rowHeightPreset: editorDensity.rowHeightPreset,
        fieldLineMode: editorDensity.fieldLineMode,
      }),
      editorClassName || '',
    )),
    [editorClassName, editorDensity.fieldLineMode, editorDensity.rowHeightPreset],
  )
  const projectedTextareaShellClassName = React.useMemo(
    () => cn('relative min-h-0 w-full', /\bh-full\b/.test(editorClassName || '') ? 'h-full' : ''),
    [editorClassName],
  )
  const hideProjectedCaret = hasProjectedInvocationOverlay && isFloatingPanelChatComposerProjectedCaretInsideChip(
    draft,
    projectedSelectionRange.start,
    projectedSelectionRange.end,
    { mediaAttachments: EDITOR_PROJECTED_MEDIA_ATTACHMENTS, projectInvocationTokens: false },
  )
  const updateProjectedSelectionRange = React.useCallback((input: HTMLInputElement | HTMLTextAreaElement | null, fallbackLength = 0) => {
    setProjectedSelectionRange({
      start: input?.selectionStart ?? fallbackLength,
      end: input?.selectionEnd ?? fallbackLength,
    })
  }, [])
  const setProjectedCommandDraft = React.useCallback((nextValue: string) => {
    updateDraft(readProjectedEditorRawValue(nextValue))
  }, [readProjectedEditorRawValue, updateDraft])
  const persistProjectedCommandDraft = React.useCallback((nextValue: string) => {
    persistCommandDraft(readProjectedEditorRawValue(nextValue))
  }, [persistCommandDraft, readProjectedEditorRawValue])
  const focusViewerCommandSelection = React.useCallback((start: number, end: number = start) => {
    focusMarkdownInlineTextSelectionSoon(viewerEditorRef, start, end)
  }, [])
  const buildExternalCommandTarget = React.useCallback(() => {
    const targetId = id || ariaLabel
    const insertText = (replacement: string) => {
      const latest = externalCommandStateRef.current
      if (!latest.canEdit || latest.multiline !== true) return false
      if (latest.editing && inputRef.current) {
        const input = inputRef.current
        const text = normalizeEditorValue(latest.draft)
        const displaySelection = useViewerEditSurface ? commandSelectionRef.current : readInputSelection(input)
        const selection = hasProjectedInvocationOverlay
          ? {
            start: mapFloatingPanelChatComposerDisplayIndexToRawIndex(text, displaySelection.start, { mediaAttachments: EDITOR_PROJECTED_MEDIA_ATTACHMENTS }),
            end: mapFloatingPanelChatComposerDisplayIndexToRawIndex(text, displaySelection.end, { mediaAttachments: EDITOR_PROJECTED_MEDIA_ATTACHMENTS }),
          }
          : displaySelection
        const lineStartIdx = text.lastIndexOf('\n', Math.max(0, selection.end) - 1) + 1
        const preceding = text.slice(lineStartIdx, Math.max(lineStartIdx, Math.min(text.length, selection.end)))
        const triggerMatch = /[\/#@][A-Za-z0-9_.-]{0,96}$/.exec(preceding)
        const rangeStart = selection.start !== selection.end
          ? selection.start
          : triggerMatch
            ? selection.end - triggerMatch[0].length
            : selection.end
        const { text: next, cursor } = replaceTextRange({
          text,
          start: rangeStart,
          end: selection.start !== selection.end ? selection.end : selection.end,
          replacement,
        })
        updateDraft(next)
        latest.persistCommandDraft(next)
        const nextDisplayCursor = hasProjectedInvocationOverlay
          ? mapFloatingPanelChatComposerRawIndexToDisplayIndex(next, cursor, { mediaAttachments: EDITOR_PROJECTED_MEDIA_ATTACHMENTS })
          : cursor
        if (useViewerEditSurface) focusViewerCommandSelection(nextDisplayCursor)
        else focusInputSelectionSoon(input, nextDisplayCursor)
        return true
      }
      const current = normalizeEditorValue(latest.editing ? latest.draft : latest.value)
      const separator = current ? (current.endsWith('\n') ? '' : '\n') : ''
      const next = normalizeCommittedEditorValue(`${current}${separator}${replacement}`)
      updateDraft(next)
      latest.onCommit?.(next)
      return true
    }
    return {
      id: targetId,
      insertText,
      insertMedia: (candidate: CardInlineTextExternalMediaCandidate) => {
        const replacement = buildCardInlineTextMediaEmbed(candidate)
        const inserted = insertText(replacement)
        if (inserted) externalCommandStateRef.current.onMediaCommandSelect?.(toInlineMediaCommandCandidate(candidate))
        return inserted
      },
    }
  }, [ariaLabel, hasProjectedInvocationOverlay, id, updateDraft, useViewerEditSurface])
  const registerExternalCommandElementTarget = React.useCallback(() => {
    setCardInlineTextExternalCommandElementTarget(displayRef.current, buildExternalCommandTarget())
  }, [buildExternalCommandTarget])
  const activateExternalCommandTarget = React.useCallback(() => {
    const target = buildExternalCommandTarget()
    setActiveCardInlineTextExternalCommandTarget(target)
    setCardInlineTextExternalCommandElementTarget(displayRef.current, target)
  }, [buildExternalCommandTarget])
  React.useEffect(() => {
    return () => {
      setCardInlineTextExternalCommandElementTarget(displayRef.current, null)
      clearActiveCardInlineTextExternalCommandTarget(id || ariaLabel)
    }
  }, [ariaLabel, id])
  React.useEffect(() => {
    if (editing || !canEdit) return
    registerExternalCommandElementTarget()
  }, [canEdit, editing, registerExternalCommandElementTarget, value])
  useCardInlineTextSelectedDisplayCommand({ canEdit, displayRef, editing, enabled: enableMarkdownCommandMenus, onActivate: activateExternalCommandTarget, openCommandMenuForSigil: openDisplayCommandMenuForSigil, stopPropagation: stopActivationPropagation })
  if (editing && canEdit) {
    const commonEditorProps = {
      id,
      value: projectedEditorDisplayValue,
      placeholder,
      spellCheck: true,
      'aria-label': ariaLabel,
      autoComplete: 'off',
      autoCorrect: 'off',
      autoCapitalize: 'off',
      className: editorClassName,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const nextDisplayValue = event.currentTarget.value
        const nextValue = readProjectedEditorRawValue(nextDisplayValue)
        if (enableMarkdownCommandMenus && !commandMode) {
          const selection = readInputSelection(event.currentTarget)
          const insertedIndex = selection.end - 1
          const insertedText = nextDisplayValue.length === projectedEditorDisplayValue.length + 1 && insertedIndex >= 0
            ? nextDisplayValue.slice(insertedIndex, selection.end)
            : ''
          const sigil = readInlineCommandMenuSigilFromInsertedText(insertedText)
          if (sigil) {
            const nextSelection = { start: insertedIndex, end: insertedIndex }
            const cleanedDisplay = `${nextDisplayValue.slice(0, insertedIndex)}${nextDisplayValue.slice(selection.end)}`
            const cleanedRaw = readProjectedEditorRawValue(cleanedDisplay)
            event.currentTarget.value = cleanedDisplay
            updateDraft(cleanedRaw)
            openCommandMenuForSigilAtSelection(sigil, nextSelection)
            focusInputSelectionSoon(event.currentTarget, nextSelection.start)
            return
          }
        }
        updateDraft(nextValue)
        updateProjectedSelectionRange(event.currentTarget, nextDisplayValue.length)
      },
      onBeforeInput: (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!enableMarkdownCommandMenus || commandMode) return
        const nativeEvent = event.nativeEvent as InputEvent
        if (nativeEvent.inputType !== 'insertText') return
        const sigil = readInlineCommandMenuSigilFromInsertedText(nativeEvent.data)
        if (!sigil) return
        event.preventDefault()
        openCommandMenuForSigil(sigil)
      },
      onFocus: () => {
        commitOpenCardInlineTextEditorsExcept(ownerKey)
        activateExternalCommandTarget()
        updateProjectedSelectionRange(inputRef.current, String(inputRef.current?.value || '').length)
      },
      onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const relatedTarget = event.relatedTarget
        if (isCommandMenuTarget(relatedTarget)) return
        if (commandMode) return
        commit()
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          if (commandMode) {
            event.preventDefault()
            closeCommandMenu()
            return
          }
          event.preventDefault()
          cancel()
          return
        }
        const commandSigil = enableMarkdownCommandMenus ? readInlineCommandMenuSigilFromKeyEvent(event.nativeEvent) : null
        if (commandSigil) {
          event.preventDefault()
          openCommandMenuForSigil(commandSigil)
          return
        }
        if (!multiline && event.key === 'Enter') {
          event.preventDefault()
          commit()
          return
        }
        if (multiline && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          commit()
        }
      },
      onSelect: (event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        updateProjectedSelectionRange(event.currentTarget, event.currentTarget.value.length)
      },
      onDoubleClick: (event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        event.stopPropagation()
      },
      [CARD_INLINE_TEXT_EDITOR_INPUT_ATTRIBUTE]: '1',
    }
    return (
      <CardInlineTextEditingSurface
        ariaLabel={ariaLabel}
        cardInlineEditInputAttribute={CARD_INLINE_TEXT_EDITOR_INPUT_ATTRIBUTE}
        closeCommandMenu={closeCommandMenu}
        commandContextText={markdownCommandContextText}
        commandMode={commandMode}
        commandQuery={commandQuery}
        commandRootAttribute={CARD_INLINE_TEXT_COMMAND_ROOT_ATTRIBUTE}
        commandRootRef={commandRootRef}
        commandSelectionRef={commandSelectionRef}
        commonEditorProps={commonEditorProps}
        draft={draft}
        editorClassName={editorClassName}
        editorDensity={editorDensity}
        enableMarkdownCommandMenus={enableMarkdownCommandMenus}
        closeCommandDraft={closeCommandDraft}
        focusViewerCommandSelection={focusViewerCommandSelection}
        hasProjectedInvocationOverlay={hasProjectedInvocationOverlay}
        hideProjectedCaret={hideProjectedCaret}
        inputRef={inputRef}
        inlineChipDensity={inlineChipDensity}
        initialViewerSelectionPointRef={initialViewerSelectionPointRef}
        isCommandMenuTarget={isCommandMenuTarget}
        mediaCommandMode={mediaCommandMode}
        multiline={multiline}
        onCancel={cancel}
        onCommit={commit}
        onCommandDraftChange={persistCommandDraft}
        onMediaCommandSelect={onMediaCommandSelect}
        openCommandMenu={openCommandMenu}
        openCommandMenuForSigilAtSelection={openCommandMenuForSigilAtSelection}
        placeholder={placeholder}
        projectedEditorDisplayValue={projectedEditorDisplayValue}
        projectedEditorOverlay={projectedEditorOverlay}
        projectedMediaAttachments={projectedMediaAttachments}
        projectedSelectionRange={projectedSelectionRange}
        projectedTextareaOverlayTextClassName={projectedTextareaOverlayTextClassName}
        projectedTextareaShellClassName={projectedTextareaShellClassName}
        rows={rows}
        setCommandMode={setCommandMode}
        setCommandQuery={setCommandQuery}
        setDraft={updateDraft}
        setProjectedCommandDraft={setProjectedCommandDraft}
        showCommandLaunchers={showCommandLaunchers}
        useViewerEditSurface={useViewerEditSurface}
        viewerEditorRef={viewerEditorRef}
        persistProjectedCommandDraft={persistProjectedCommandDraft}
      />
    )
  }
  return (
    <CardInlineTextDisplaySurface
      activateExternalCommandTarget={activateExternalCommandTarget}
      ariaLabel={ariaLabel}
      canEdit={canEdit}
      densityOwnedDisplayClassName={densityOwnedDisplayClassName}
      displayLineClassName={displayLineClassName}
      displayRef={displayRef}
      displaySourceValue={displaySourceValue}
      displayText={displayText}
      displayTitle={displayTitle}
      editActivation={editActivation}
      emptyClassName={emptyClassName}
      enableMarkdownCommandMenus={enableMarkdownCommandMenus} externalTextTarget={canEdit && multiline}
      id={id}
      inlineChipDensity={inlineChipDensity}
      markdownPresentationMode={markdownPresentationMode}
      markdownDocumentPath={markdownDocumentPath}
      onOpenEditorFromDisplayEvent={openEditorFromDisplayEvent}
      openDisplayCommandMenuForSigil={openDisplayCommandMenuForSigil}
      openOnPointerDown={openOnPointerDown}
      placeholder={placeholder}
      renderInlineMediaCandidateChip={renderInlineMediaCandidateChip}
      showMarkdownPreview={showMarkdownPreview}
      showPlaceholder={showPlaceholder}
      shouldIgnoreInlineEditTarget={shouldIgnoreInlineEditTarget}
      stopActivationPropagation={stopActivationPropagation}
    />
  )
})
